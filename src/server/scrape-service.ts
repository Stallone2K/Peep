import { db } from "@/lib/db";
import { debitCredits, refundCredits } from "@/lib/credits";
import { cacheKey, readCache } from "@/lib/scrape-cache";
import { InternalError } from "@/lib/errors";
import type { ScrapeRequestInput } from "@/lib/validators/scrape";
import { runScrape } from "@/server/scraper/formats";

// Flat cost per Phase 3 scrape. Upgrades arrive with json/stealth/
// audio bonuses in later phases.
const BASE_CREDITS = 1;

export type ScrapeServiceResult = {
  success: true;
  jobId: string;
  creditsUsed: number;
  cached: boolean;
  data: Record<string, unknown>;
};

// Shared core of the scrape pipeline — reused by the Bearer-auth
// /api/v1/scrape endpoint and the session-auth /api/dashboard/
// playground/scrape endpoint. Takes userId + apiKeyId explicitly so
// the caller decides how auth works; everything downstream is the
// same.
export async function performScrapeForUser({
  userId,
  apiKeyId,
  input,
}: {
  userId: string;
  apiKeyId: string | null;
  input: ScrapeRequestInput;
}): Promise<ScrapeServiceResult> {
  const key = cacheKey(input);
  const cached = await readCache({
    key,
    maxAgeMs: input.maxAge,
    minAgeMs: input.minAge,
  });

  await debitCredits(userId, BASE_CREDITS, {
    reason: cached ? "scrape_cache_hit" : "scrape",
    refType: "ScrapeJob",
  });

  const job = await db.scrapeJob.create({
    data: {
      userId,
      apiKeyId,
      url: input.url,
      options: input as never,
      status: "RUNNING",
      startedAt: new Date(),
      creditsUsed: BASE_CREDITS,
      integration: input.integration,
    },
  });

  try {
    const shouldStore = input.storeInCache !== false;

    if (cached) {
      await db.$transaction([
        db.scrapeResult.create({
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
        }),
        db.scrapeJob.update({
          where: { id: job.id },
          data: { status: "DONE", completedAt: new Date() },
        }),
      ]);

      return {
        success: true,
        jobId: job.id,
        creditsUsed: BASE_CREDITS,
        cached: true,
        data: {
          markdown: cached.markdown ?? undefined,
          html: cached.html ?? undefined,
          rawHtml: cached.rawHtml ?? undefined,
          links: cached.links,
          images: cached.images,
          pageStatus: cached.pageStatus ?? undefined,
          durationMs: cached.durationMs ?? undefined,
          metadata: { ...(cached.metadata as object), cached: true },
        },
      };
    }

    const out = await runScrape(input);

    await db.$transaction([
      db.scrapeResult.create({
        data: {
          jobId: job.id,
          cacheKey: shouldStore ? key : null,
          markdown: out.markdown,
          html: out.html,
          rawHtml: out.rawHtml,
          links: out.links ?? [],
          images: out.images ?? [],
          metadata: out.metadata as never,
          pageStatus: out.pageStatus,
          durationMs: out.durationMs,
          fromCache: false,
        },
      }),
      db.scrapeJob.update({
        where: { id: job.id },
        data: { status: "DONE", completedAt: new Date() },
      }),
    ]);

    return {
      success: true,
      jobId: job.id,
      creditsUsed: BASE_CREDITS,
      cached: false,
      data: { ...out, metadata: { ...out.metadata, cached: false } },
    };
  } catch (err) {
    // Refund + mark FAILED. Best-effort so a rollback failure doesn't
    // mask the original error.
    await refundCredits(userId, BASE_CREDITS, {
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
    if (err instanceof Error) throw err;
    throw new InternalError(String(err));
  }
}
