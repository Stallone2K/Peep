import { db } from "@/lib/db";
import { debitCredits, refundCredits } from "@/lib/credits";
import { cacheKey, readCache } from "@/lib/scrape-cache";
import { scrapeQueue } from "@/lib/queue";
import { getRedisConnection } from "@/lib/queue";
import { ApiError, InternalError } from "@/lib/errors";
import type { ScrapeRequestInput } from "@/lib/validators/scrape";
import { runScrapeWithStrategy, type ScrapeResult } from "@/server/scraper/strategy";
import { applyChangeTracking } from "@/server/scraper/change-tracking";
import { STEALTH_CREDIT_BONUS } from "@/server/proxy/providers";
import { signedScreenshotUrl } from "@/lib/storage";
import type { ScrapeJobData } from "@/workers/scrape.worker";

const BASE_CREDITS = 1;

// Firecrawl billing rules (PLAN §11.12): json or changeTracking-json
// format → 5 credits (replaces base). Other surcharges (audio/query
// +4, stealth-proxy-used +4) are added to the charge by the worker
// after the scrape completes. For the Phase 5 inline path we compute
// the json surcharge upfront based on requested formats.
function computeCredits(input: ScrapeRequestInput): number {
  const hasJson = input.formats.some((f) => f.type === "json");
  const changeTrackingFmt = input.formats.find(
    (f) => f.type === "changeTracking",
  ) as { modes?: string[] } | undefined;
  const hasJsonChangeTracking = changeTrackingFmt?.modes?.includes("json");

  if (hasJson || hasJsonChangeTracking) return 5;

  let credits = BASE_CREDITS;
  if (input.formats.some((f) => f.type === "query")) credits += 4;
  if (input.formats.some((f) => f.type === "audio")) credits += 4;
  if (input.formats.some((f) => f.type === "summary")) credits += 2;
  if (input.formats.some((f) => f.type === "branding")) credits += 2;
  return credits;
}

export type ScrapeServiceResult = {
  success: true;
  jobId: string;
  creditsUsed: number;
  cached: boolean;
  data: Record<string, unknown>;
};

// Shared scrape pipeline. Reused by:
// - POST /api/v1/scrape (Bearer-auth)
// - POST /api/dashboard/playground/scrape (session-auth)
//
// Phase 4 adds two modes:
// - `inline: true` — runs synchronously in the request handler (Phase 3 legacy, still works)
// - `inline: false` — enqueues to BullMQ, waits for worker completion via Redis pub/sub
export async function performScrapeForUser({
  userId,
  apiKeyId,
  input,
  async: asyncMode = false,
}: {
  userId: string;
  apiKeyId: string | null;
  input: ScrapeRequestInput;
  async?: boolean;
}): Promise<ScrapeServiceResult> {
  // Normalize nested `location: {country, languages}` into the flat
  // fields the rest of the pipeline reads. Caller-supplied flat
  // fields win on conflict.
  if (input.location) {
    input = {
      ...input,
      country: input.country ?? input.location.country,
      languages: input.languages ?? input.location.languages,
    };
  }

  const key = cacheKey(input);
  const cached = await readCache({
    key,
    maxAgeMs: input.maxAge,
    minAgeMs: input.minAge,
  });

  const creditsToCharge = computeCredits(input);
  await debitCredits(userId, creditsToCharge, {
    reason: cached ? "scrape_cache_hit" : "scrape",
    refType: "ScrapeJob",
  });

  const job = await db.scrapeJob.create({
    data: {
      userId,
      apiKeyId,
      url: input.url,
      options: input as never,
      status: cached ? "DONE" : "QUEUED",
      startedAt: cached ? new Date() : undefined,
      completedAt: cached ? new Date() : undefined,
      creditsUsed: creditsToCharge,
      integration: input.integration,
    },
  });

  // ─── Cache hit path ─────────────────────────────────────────
  if (cached) {
    await db.scrapeResult.create({
      data: {
        jobId: job.id,
        cacheKey: key,
        markdown: cached.markdown,
        html: cached.html,
        rawHtml: cached.rawHtml,
        htmlR2Key: cached.htmlR2Key,
        screenshotR2Key: cached.screenshotR2Key,
        links: cached.links,
        images: cached.images,
        metadata: cached.metadata as never,
        pageStatus: cached.pageStatus,
        durationMs: cached.durationMs,
        fromCache: true,
      },
    });

    return {
      success: true,
      jobId: job.id,
      creditsUsed: creditsToCharge,
      cached: true,
      data: {
        markdown: cached.markdown ?? undefined,
        html: cached.html ?? undefined,
        rawHtml: cached.rawHtml ?? undefined,
        links: cached.links,
        images: cached.images,
        screenshot: signedScreenshotUrl(cached.screenshotR2Key),
        pageStatus: cached.pageStatus ?? undefined,
        durationMs: cached.durationMs ?? undefined,
        metadata: { ...(cached.metadata as object), cached: true },
      },
    };
  }

  // ─── Decide: inline or queued ───────────────────────────────
  // Even with REDIS_URL set, we only use the queue if at least one
  // worker is actively listening on `scrape`. This makes `yarn dev`
  // (without `yarn worker`) Just Work — the API route runs the scrape
  // inline instead of enqueuing into a void and timing out after 35s.
  let useQueue = false;
  if (isQueueAvailable()) {
    try {
      useQueue = (await scrapeQueue().getWorkersCount()) > 0;
    } catch {
      // Redis unreachable → inline fallback
      useQueue = false;
    }
  }

  if (useQueue) {
    // Enqueue the job for the worker to pick up
    const jobData: ScrapeJobData = {
      scrapeJobId: job.id,
      input,
    };
    try {
      await scrapeQueue().add(`scrape-${job.id}`, jobData, {
        jobId: job.id,
      });
    } catch {
      // Enqueue failed (Redis hiccup) — fall back to inline rather
      // than burning the user's credit on a job that never runs.
      return runInline({
        jobId: job.id,
        userId,
        cacheKeyStr: key,
        input,
        creditsCharged: creditsToCharge,
      });
    }

    // Async mode — return immediately with jobId for polling
    if (asyncMode || input.async) {
      return {
        success: true,
        jobId: job.id,
        creditsUsed: creditsToCharge,
        cached: false,
        data: { status: "queued", message: "Job enqueued. Poll GET /api/v1/scrape/:id for status." },
      };
    }

    // Sync mode — wait for worker via Redis pub/sub. Refund credits +
    // mark the ScrapeJob FAILED if the wait errors out, so a stuck
    // queue doesn't silently debit the caller.
    try {
      return await waitForJobCompletion(job.id, input.timeout);
    } catch (err) {
      await refundCredits(userId, creditsToCharge, {
        reason: "refund_failed_scrape",
        refType: "ScrapeJob",
        refId: job.id,
      }).catch(() => {});
      await db.scrapeJob
        .update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            error: err instanceof Error ? err.message : String(err),
            completedAt: new Date(),
          },
        })
        .catch(() => {});
      throw err;
    }
  }

  // ─── Inline fallback (no Redis / worker) ────────────────────
  return runInline({
    jobId: job.id,
    userId,
    cacheKeyStr: key,
    input,
    creditsCharged: creditsToCharge,
  });
}

// Wait for a job to complete by subscribing to a Redis channel.
// The worker publishes to `scrape:done:<jobId>` on completion.
async function waitForJobCompletion(
  jobId: string,
  timeoutMs: number,
): Promise<ScrapeServiceResult> {
  const redis = getRedisConnection().duplicate();

  return new Promise<ScrapeServiceResult>(async (resolve, reject) => {
    const timer = setTimeout(async () => {
      await redis.unsubscribe().catch(() => {});
      redis.disconnect();
      // Fall back to polling the DB
      const jobRow = await db.scrapeJob.findUnique({
        where: { id: jobId },
        include: { result: true },
      });
      if (jobRow?.status === "DONE" && jobRow.result) {
        resolve(formatDbResult(jobRow, jobRow.result));
      } else {
        reject(new InternalError("Scrape timed out waiting for worker"));
      }
    }, Math.min(timeoutMs + 5000, 65_000));

    await redis.subscribe(`scrape:done:${jobId}`);
    redis.on("message", async (_channel: string, message: string) => {
      clearTimeout(timer);
      await redis.unsubscribe().catch(() => {});
      redis.disconnect();

      const msg = JSON.parse(message);
      if (msg.status === "FAILED") {
        reject(new InternalError(msg.error || "Scrape failed in worker"));
        return;
      }

      // Fetch the result from DB
      const jobRow = await db.scrapeJob.findUnique({
        where: { id: jobId },
        include: { result: true },
      });
      if (jobRow?.result) {
        resolve(formatDbResult(jobRow, jobRow.result));
      } else {
        reject(new InternalError("Job completed but result not found"));
      }
    });
  });
}

function formatDbResult(
  job: { id: string; creditsUsed: number },
  result: NonNullable<Awaited<ReturnType<typeof db.scrapeResult.findFirst>>>,
): ScrapeServiceResult {
  // AI formats (json/summary/branding) + changeTracking are stashed in the
  // metadata JSON by the worker — lift them back to the top level so the
  // queue path returns the same shape as the inline path.
  const meta = (result.metadata ?? {}) as Record<string, unknown>;
  return {
    success: true,
    jobId: job.id,
    creditsUsed: job.creditsUsed,
    cached: result.fromCache,
    data: {
      markdown: result.markdown ?? undefined,
      html: result.html ?? undefined,
      rawHtml: result.rawHtml ?? undefined,
      links: result.links,
      images: result.images,
      screenshot: signedScreenshotUrl(result.screenshotR2Key),
      json: meta.json ?? undefined,
      summary: meta.summary ?? undefined,
      branding: meta.branding ?? undefined,
      youtube: meta.youtube ?? undefined,
      changeTracking: meta.changeTracking ?? undefined,
      pageStatus: result.pageStatus ?? undefined,
      durationMs: result.durationMs ?? undefined,
      metadata: {
        ...meta,
        cached: result.fromCache,
      },
    },
  };
}

// Inline execution (Phase 3 legacy — no queue, runs in route handler).
// Still used when REDIS_URL is not configured or for the playground.
async function runInline({
  jobId,
  userId,
  cacheKeyStr,
  input,
  creditsCharged,
}: {
  jobId: string;
  userId: string;
  cacheKeyStr: string;
  input: ScrapeRequestInput;
  creditsCharged: number;
}): Promise<ScrapeServiceResult> {
  await db.scrapeJob.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  try {
    const out = await runScrapeWithStrategy(input);

    // Phase 7C — changeTracking snapshots are user-scoped so the
    // strategy layer can't know about them. Apply after the scrape
    // returns but before we persist the ScrapeResult.
    const changeTracking = await applyChangeTracking({
      userId,
      input,
      currentMarkdown: out.markdown ?? null,
    });
    if (changeTracking) out.changeTracking = changeTracking;

    // Phase 7C — stealth-used surcharge (+4 credits per §11.12).
    // Only billed when the strategy actually escalated to the
    // stealth tier; basic Playwright runs don't trigger it.
    let stealthSurcharge = 0;
    if (out.proxyUsed === "stealth") {
      stealthSurcharge = STEALTH_CREDIT_BONUS;
      await debitCredits(userId, stealthSurcharge, {
        reason: "stealth_proxy_used",
        refType: "ScrapeJob",
        refId: jobId,
      }).catch(() => {});
      await db.scrapeJob
        .update({
          where: { id: jobId },
          data: { creditsUsed: creditsCharged + stealthSurcharge },
        })
        .catch(() => {});
    }

    const shouldStore = input.storeInCache !== false;

    await db.$transaction([
      db.scrapeResult.create({
        data: {
          jobId,
          cacheKey: shouldStore ? cacheKeyStr : null,
          markdown: out.markdown,
          html: out.html,
          rawHtml: out.rawHtml,
          links: out.links ?? [],
          images: out.images ?? [],
          screenshotR2Key: out.screenshot ?? null,
          metadata: {
            ...out.metadata,
            engineUsed: out.engineUsed,
            proxyUsed: out.proxyUsed,
            json: out.json,
            summary: out.summary,
            branding: out.branding,
            changeTracking: out.changeTracking,
          } as never,
          pageStatus: out.pageStatus,
          durationMs: out.durationMs,
          fromCache: false,
        },
      }),
      db.scrapeJob.update({
        where: { id: jobId },
        data: { status: "DONE", completedAt: new Date() },
      }),
    ]);

    return {
      success: true,
      jobId,
      creditsUsed: creditsCharged + stealthSurcharge,
      cached: false,
      data: {
        ...out,
        screenshot: signedScreenshotUrl(out.screenshot),
        metadata: { ...out.metadata, cached: false, engineUsed: out.engineUsed },
      },
    };
  } catch (err) {
    // Refund the user's credits on failure
    await refundCredits(userId, creditsCharged, {
      reason: "refund_failed_scrape",
      refType: "ScrapeJob",
      refId: jobId,
    }).catch(() => {});
    await db.scrapeJob
      .update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          error: err instanceof Error ? err.message : String(err),
          completedAt: new Date(),
        },
      })
      .catch(() => {});
    // Re-throw as an ApiError so the route handler surfaces a real
    // message (undici/playwright errors otherwise bucket into the
    // generic "Something went wrong." catch-all in toJsonError).
    if (err instanceof ApiError) throw err;
    throw new InternalError(
      err instanceof Error ? `Scrape failed: ${err.message}` : "Scrape failed",
    );
  }
}

// Check if the BullMQ queue is available (Redis configured + connectable).
function isQueueAvailable(): boolean {
  return !!process.env.REDIS_URL;
}
