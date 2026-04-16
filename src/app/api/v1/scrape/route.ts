import { z } from "zod";

import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/api-auth";
import { debitCredits, refundCredits } from "@/lib/credits";
import {
  bodyHash,
  lookupIdempotent,
  storeIdempotent,
} from "@/lib/idempotency";
import { cacheKey, readCache } from "@/lib/scrape-cache";
import {
  InternalError,
  ValidationError,
  toJsonError,
} from "@/lib/errors";
import { scrapeRequestSchema } from "@/lib/validators/scrape";
import type { ScrapeRequestInput } from "@/lib/validators/scrape";
import { runScrape } from "@/server/scraper/formats";

// Flat cost per scrape for the Phase 3 HTTP path. Firecrawl parity
// is 1 credit for a plain markdown scrape; JSON/stealth/audio bonuses
// land in later phases.
const BASE_CREDITS = 1;

// POST /api/v1/scrape
export async function POST(req: Request) {
  try {
    const { userId, apiKeyId } = await requireApiKey(req);

    const rawBody = await req.json().catch(() => {
      throw new ValidationError({ reason: "Invalid JSON body" });
    });
    const input = scrapeRequestSchema.parse(rawBody);

    // ─── Idempotency-Key (optional) ───────────────────────────────
    const idempotencyKey = req.headers.get("idempotency-key");
    if (idempotencyKey) {
      const hit = await lookupIdempotent({
        userId,
        key: idempotencyKey,
        hash: bodyHash(rawBody),
      });
      if (hit && "conflict" in hit) {
        throw new ValidationError({
          reason: "Idempotency key reused with a different body",
        });
      }
      if (hit) {
        return Response.json(hit.body, { status: hit.status });
      }
    }

    // ─── Cache check (before we debit credits so cache hits are
    //     cheap to serve, but we still bill 1 credit per Firecrawl
    //     parity) ─────────────────────────────────────────────────
    const key = cacheKey(input);
    const cached = await readCache({
      key,
      maxAgeMs: input.maxAge,
      minAgeMs: input.minAge,
    });

    // ─── Debit credits atomically — rollback on scrape failure ───
    await debitCredits(userId, BASE_CREDITS, {
      reason: cached ? "scrape_cache_hit" : "scrape",
      refType: "ScrapeJob",
    });

    // ─── Create the ScrapeJob row ─────────────────────────────────
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
      const result = cached
        ? await serveFromCache(job.id, key, cached, input)
        : await performScrape(job.id, key, input);

      const responseBody = {
        success: true as const,
        data: result.output,
        jobId: job.id,
        creditsUsed: BASE_CREDITS,
        cached: result.cached,
      };

      if (idempotencyKey) {
        await storeIdempotent({
          userId,
          key: idempotencyKey,
          hash: bodyHash(rawBody),
          statusCode: 200,
          responseBody,
        });
      }

      return Response.json(responseBody);
    } catch (err) {
      // Refund the credit — the caller didn't receive useful work.
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
      throw err;
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      const { body, status } = toJsonError(new ValidationError(err.issues));
      return Response.json(body, { status });
    }
    const { body, status } = toJsonError(err);
    return Response.json(body, { status });
  }
}

// Runs the HTTP-only scrape pipeline and writes the result row.
async function performScrape(
  jobId: string,
  cacheKey: string,
  input: ScrapeRequestInput,
) {
  const out = await runScrape(input);

  const shouldStore = input.storeInCache !== false;

  await db.$transaction([
    db.scrapeResult.create({
      data: {
        jobId,
        cacheKey: shouldStore ? cacheKey : null,
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
      where: { id: jobId },
      data: { status: "DONE", completedAt: new Date() },
    }),
  ]);

  return {
    cached: false,
    output: {
      ...out,
      metadata: { ...out.metadata, cached: false },
    },
  };
}

// Serves from cache — copies the cached result under the new jobId so
// the user still has a per-request ScrapeJob → ScrapeResult link.
async function serveFromCache(
  jobId: string,
  key: string,
  cached: Awaited<ReturnType<typeof readCache>>,
  _input: ScrapeRequestInput,
) {
  if (!cached) throw new InternalError("cache miss after lookup");

  await db.$transaction([
    db.scrapeResult.create({
      data: {
        jobId,
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
      where: { id: jobId },
      data: { status: "DONE", completedAt: new Date() },
    }),
  ]);

  return {
    cached: true,
    output: {
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
