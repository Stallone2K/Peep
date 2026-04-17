import { Worker, Job } from "bullmq";

import { db } from "@/lib/db";
import { getRedisConnection } from "@/lib/queue";
import { runScrapeWithStrategy } from "@/server/scraper/strategy";
import { uploadScreenshot, isR2Configured, getR2SignedUrl } from "@/lib/r2";
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

      // Mark RUNNING
      await db.scrapeJob.update({
        where: { id: scrapeJobId },
        data: { status: "RUNNING", startedAt: new Date() },
      });

      try {
        const result = await runScrapeWithStrategy(input);

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
