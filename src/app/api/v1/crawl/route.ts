import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/api-auth";
import { crawlQueue } from "@/lib/queue";
import { crawlRequestSchema } from "@/lib/validators/crawl";
import { isAIConfigured } from "@/server/ai/client";
import { promptToCrawlConfig } from "@/server/ai/crawl-prompt";
import {
  bodyHash,
  lookupIdempotent,
  storeIdempotent,
} from "@/lib/idempotency";
import type { CrawlJobData } from "@/workers/crawl.worker";
import { ValidationError } from "@/lib/errors";
import {
  canOverrideRobots,
  errorResponse,
  preflight,
  successJson,
} from "@/lib/route-helpers";

// POST /api/v1/crawl
// Creates a CrawlJob row, enqueues into the `crawl` queue, returns
// `{ jobId, url: "/api/v1/crawl/:id" }`. Crawl itself only charges on
// each child scrape as it runs — creating the crawl is free (parity
// with Firecrawl, which lets callers plan before spending).
export async function POST(req: Request) {
  try {
    const { userId, apiKeyId, planTier } = await requireApiKey(req);
    await preflight(userId, planTier);

    const rawBody = await req.json().catch(() => {
      throw new ValidationError({ reason: "Invalid JSON body" });
    });

    // Idempotency-Key (optional) — 24h Postgres-backed dedup. Shields
    // the caller from accidental double-submit of an expensive crawl.
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
      if (hit) return Response.json(hit.body, { status: hit.status });
    }

    let input = crawlRequestSchema.parse(rawBody);

    // Paid-tier gate for ignoreRobotsTxt — same rule as scrape's
    // respectRobotsTxt override. Lower tiers silently coerce back
    // rather than 403-ing on a misconfigured SDK call.
    if (input.ignoreRobotsTxt && !canOverrideRobots(planTier)) {
      input.ignoreRobotsTxt = false;
    }

    // NL-prompted crawl: translate the prompt into config fields via
    // Gemini, then merge UNDER the explicit fields so caller-supplied
    // values always win. Silently no-op if AI isn't configured — the
    // crawl still runs with whatever fields the caller sent.
    let aiSuggested:
      | {
          includePaths?: string[];
          excludePaths?: string[];
          limit?: number;
          crawlEntireDomain?: boolean;
          allowSubdomains?: boolean;
          regexOnFullURL?: boolean;
        }
      | null = null;
    if (input.prompt && isAIConfigured()) {
      try {
        aiSuggested = await promptToCrawlConfig({
          rootUrl: input.url,
          prompt: input.prompt,
        });
        const rawFields = rawBody as Record<string, unknown>;
        input = {
          ...input,
          includePaths:
            rawFields.includePaths !== undefined
              ? input.includePaths
              : (aiSuggested.includePaths ?? input.includePaths),
          excludePaths:
            rawFields.excludePaths !== undefined
              ? input.excludePaths
              : (aiSuggested.excludePaths ?? input.excludePaths),
          limit:
            rawFields.limit !== undefined
              ? input.limit
              : (aiSuggested.limit ?? input.limit),
          crawlEntireDomain:
            rawFields.crawlEntireDomain !== undefined
              ? input.crawlEntireDomain
              : (aiSuggested.crawlEntireDomain ?? input.crawlEntireDomain),
          allowSubdomains:
            rawFields.allowSubdomains !== undefined
              ? input.allowSubdomains
              : (aiSuggested.allowSubdomains ?? input.allowSubdomains),
          regexOnFullURL:
            rawFields.regexOnFullURL !== undefined
              ? input.regexOnFullURL
              : (aiSuggested.regexOnFullURL ?? input.regexOnFullURL),
        };
      } catch (err) {
        console.error("[crawl] prompt translation failed, ignoring", err);
      }
    }

    const crawlJob = await db.crawlJob.create({
      data: {
        userId,
        rootUrl: input.url,
        options: { ...input, apiKeyId, aiSuggested } as never,
        status: "QUEUED",
      },
    });

    const jobData: CrawlJobData = {
      crawlJobId: crawlJob.id,
      input,
    };
    await crawlQueue().add(`crawl-${crawlJob.id}`, jobData, {
      jobId: crawlJob.id,
    });

    const origin = new URL(req.url).origin;
    const responseBody = {
      success: true as const,
      jobId: crawlJob.id,
      url: `${origin}/api/v1/crawl/${crawlJob.id}`,
      streamUrl: `${origin}/api/v1/crawl/${crawlJob.id}/stream`,
      ...(aiSuggested ? { aiSuggested } : {}),
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

    // Crawl creation is free — each child page debits 1 credit as the
    // crawl runs — so surface the balance without a creditsUsed header.
    return await successJson(responseBody, { userId });
  } catch (err) {
    return errorResponse(err);
  }
}
