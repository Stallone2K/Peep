import { Worker, Job } from "bullmq";

import { db } from "@/lib/db";
import { getRedisConnection } from "@/lib/queue";
import { runScrapeWithStrategy } from "@/server/scraper/strategy";
import { applyChangeTracking } from "@/server/scraper/change-tracking";
import { debitCredits } from "@/lib/credits";
import { STEALTH_CREDIT_BONUS } from "@/server/proxy/providers";
import { uploadScreenshot, isR2Configured, getR2SignedUrl } from "@/lib/r2";
import { emitWebhook } from "@/lib/webhooks";
import type { ScrapeRequestInput } from "@/lib/validators/scrape";

const CONCURRENCY = Number(process.env.CONCURRENCY ?? "3");

export type ScrapeJobData = {
  scrapeJobId: string;
  input: ScrapeRequestInput;
};

export function startScrapeWorker() {
  const worker = new Worker<ScrapeJobData>(
    "scrape",
    async (job: Job<ScrapeJobData>) => {
      const { scrapeJobId, input } = job.data;

      // Mark RUNNING — also grab userId for the changeTracking scope.
      const jobRow = await db.scrapeJob.update({
        where: { id: scrapeJobId },
        data: { status: "RUNNING", startedAt: new Date() },
        select: { userId: true },
      });

      try {
        const result = await runScrapeWithStrategy(input);

        // Phase 7C — user-scoped changeTracking snapshots, applied
        // after strategy returns but before persisting ScrapeResult.
        const changeTracking = await applyChangeTracking({
          userId: jobRow.userId,
          input,
          currentMarkdown: result.markdown ?? null,
        });
        if (changeTracking) result.changeTracking = changeTracking;

        // Phase 7C — stealth-proxy surcharge. Billed only when the
        // strategy actually escalated to the stealth tier (§11.12).
        if (result.proxyUsed === "stealth") {
          await debitCredits(jobRow.userId, STEALTH_CREDIT_BONUS, {
            reason: "stealth_proxy_used",
            refType: "ScrapeJob",
            refId: scrapeJobId,
          }).catch((err) => {
            console.error("[scrape-worker] stealth surcharge debit failed", err);
          });
          await db.scrapeJob
            .update({
              where: { id: scrapeJobId },
              data: { creditsUsed: { increment: STEALTH_CREDIT_BONUS } },
            })
            .catch(() => {});
        }

        // Upload screenshot to R2 if we got one from Playwright AND
        // it's not already a signed URL (strategy.ts may have uploaded it)
        let screenshotR2Key: string | undefined;
        if (
          result.screenshot &&
          !result.screenshot.startsWith("http") &&
          !result.screenshot.startsWith("data:") &&
          isR2Configured()
        ) {
          screenshotR2Key = await uploadScreenshot(
            scrapeJobId,
            Buffer.from(result.screenshot, "base64"),
          );
        }

        // Write result + mark DONE
        await db.$transaction([
          db.scrapeResult.create({
            data: {
              jobId: scrapeJobId,
              markdown: result.markdown,
              html: result.html,
              rawHtml: result.rawHtml,
              links: result.links ?? [],
              images: result.images ?? [],
              screenshotR2Key: screenshotR2Key ?? null,
              metadata: {
                ...result.metadata,
                engineUsed: result.engineUsed,
                proxyUsed: result.proxyUsed,
                actionResults: result.actionResults,
                changeTracking: result.changeTracking,
              } as never,
              pageStatus: result.pageStatus,
              durationMs: result.durationMs,
              fromCache: false,
            },
          }),
          db.scrapeJob.update({
            where: { id: scrapeJobId },
            data: { status: "DONE", completedAt: new Date() },
          }),
        ]);

        // Notify sync-mode callers waiting on this job (via Redis pub/sub)
        const redis = getRedisConnection();
        await redis.publish(
          `scrape:done:${scrapeJobId}`,
          JSON.stringify({ jobId: scrapeJobId, status: "DONE" }),
        );

        // Roll-up into parent BatchJob (if any) + fire webhooks.
        await rollUpBatch(scrapeJobId, "DONE").catch((err) => {
          console.error("[scrape-worker] batch roll-up failed", err);
        });

        return { success: true, jobId: scrapeJobId };
      } catch (err) {
        // Mark FAILED
        await db.scrapeJob
          .update({
            where: { id: scrapeJobId },
            data: {
              status: "FAILED",
              error: err instanceof Error ? err.message : String(err),
              completedAt: new Date(),
            },
          })
          .catch(() => {});

        // Notify sync-mode callers
        const redis = getRedisConnection();
        await redis
          .publish(
            `scrape:done:${scrapeJobId}`,
            JSON.stringify({
              jobId: scrapeJobId,
              status: "FAILED",
              error: err instanceof Error ? err.message : String(err),
            }),
          )
          .catch(() => {});

        // Roll-up into parent BatchJob on failure too.
        await rollUpBatch(scrapeJobId, "FAILED").catch(() => {});

        throw err; // BullMQ retry logic kicks in
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: CONCURRENCY,
    },
  );

  worker.on("failed", (job, err) => {
    console.error(`[scrape-worker] Job ${job?.id} failed:`, err.message);
  });

  worker.on("completed", (job) => {
    console.log(`[scrape-worker] Job ${job.id} completed`);
  });

  console.log(
    `[scrape-worker] Started with concurrency=${CONCURRENCY}`,
  );

  return worker;
}

// Post-completion: if this scrape was part of a batch, bump the parent
// counter and (when the last child lands) mark the BatchJob DONE +
// fire the batch.completed webhook. Race-safe because `increment` is
// atomic at the DB level and only one UPDATE will observe
// `completed + failed === total`.
async function rollUpBatch(
  scrapeJobId: string,
  outcome: "DONE" | "FAILED",
): Promise<void> {
  const child = await db.scrapeJob.findUnique({
    where: { id: scrapeJobId },
    select: { batchJobId: true, userId: true, url: true },
  });
  if (!child?.batchJobId) return;

  const counter = outcome === "DONE" ? "completed" : "failed";
  const updated = await db.batchJob.update({
    where: { id: child.batchJobId },
    data: { [counter]: { increment: 1 } },
    select: {
      id: true,
      total: true,
      completed: true,
      failed: true,
      status: true,
      webhookUrl: true,
      webhookSecret: true,
      userId: true,
    },
  });

  // Per-page webhook (best effort — caller opted in at batch creation).
  if (updated.webhookUrl) {
    await emitWebhook({
      url: updated.webhookUrl,
      secret: updated.webhookSecret,
      event: "batch.page",
      userId: updated.userId,
      refType: "BatchJob",
      refId: updated.id,
      data: {
        batchJobId: updated.id,
        scrapeJobId,
        url: child.url,
        status: outcome.toLowerCase(),
        completed: updated.completed,
        failed: updated.failed,
        total: updated.total,
      },
    });
  }

  const finished = updated.completed + updated.failed;
  if (
    finished >= updated.total &&
    updated.status !== "DONE" &&
    updated.status !== "CANCELLED"
  ) {
    // Guard the terminal transition with updateMany so we only fire
    // the completion webhook from the winning worker (and gracefully
    // no-op if the batch was cancelled in flight).
    const { count } = await db.batchJob.updateMany({
      where: {
        id: updated.id,
        status: { notIn: ["DONE", "CANCELLED"] },
      },
      data: { status: "DONE", completedAt: new Date() },
    });
    if (count === 0) return;

    if (updated.webhookUrl) {
      const allFailed =
        updated.failed === updated.total && updated.completed === 0;
      await emitWebhook({
        url: updated.webhookUrl,
        secret: updated.webhookSecret,
        event: allFailed ? "batch.failed" : "batch.completed",
        userId: updated.userId,
        refType: "BatchJob",
        refId: updated.id,
        data: {
          batchJobId: updated.id,
          total: updated.total,
          completed: updated.completed,
          failed: updated.failed,
        },
      });
    }
  }
}
