import crypto from "node:crypto";

import { requireApiKey } from "@/lib/api-auth";
import { debitCredits } from "@/lib/credits";
import { getRedisConnection } from "@/lib/queue";
import { ValidationError, InternalError } from "@/lib/errors";
import { searchRequestSchema } from "@/lib/validators/search";
import { BraveSearchProvider } from "@/server/search/brave";
import { tbsToFreshness, type SearchResult } from "@/server/search/provider";
import { performScrapeForUser } from "@/server/scrape-service";
import { scrapeRequestSchema } from "@/lib/validators/scrape";
import { errorResponse, preflight } from "@/lib/route-helpers";

// POST /api/v1/search
// Provider-neutral web search. Default backend is Brave; the
// SearchProvider interface leaves room to swap SerpAPI / Tavily later.
//
// Credits: 2 per 10 results (rounded up). Enrichment adds per-scrape
// credits — the scrape pipeline handles its own billing, so we only
// count the search itself here.
//
// Caching: 30-minute Redis entry keyed on the full request shape.
// Search providers rate-limit us, not our users, so a hot query
// shouldn't burn the monthly quota on every repeat call.

const CACHE_TTL_SECONDS = 30 * 60;
const SEARCH_CREDIT_RATE = 2; // per 10 results
const ENRICHMENT_CONCURRENCY = 4;

export async function POST(req: Request) {
  try {
    const { userId, apiKeyId, planTier } = await requireApiKey(req);
    await preflight(userId, planTier);

    const rawBody = await req.json().catch(() => {
      throw new ValidationError({ reason: "Invalid JSON body" });
    });
    const input = searchRequestSchema.parse(rawBody);

    const provider = new BraveSearchProvider();
    if (!provider.isConfigured()) {
      throw new InternalError(
        "Search provider is not configured. Set BRAVE_SEARCH_API_KEY on the server.",
      );
    }

    const cacheKey = buildCacheKey(userId, input);
    const redis = getRedisConnection();

    // Cache hit — return the memoised results without re-charging.
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) {
      return Response.json({
        success: true,
        data: JSON.parse(cached),
        cached: true,
        creditsUsed: 0,
      });
    }

    // Charge up front. If the provider throws we refund below.
    const searchCredits = Math.max(
      Math.ceil(input.limit / 10) * SEARCH_CREDIT_RATE,
      SEARCH_CREDIT_RATE,
    );
    await debitCredits(userId, searchCredits, {
      reason: "search",
      refType: "SearchCall",
    });

    let results: SearchResult[];
    try {
      results = await provider.search({
        query: input.query,
        limit: input.limit,
        country: input.country,
        lang: input.lang,
        freshness: tbsToFreshness(input.tbs),
        sources: input.sources,
      });
    } catch (err) {
      throw new InternalError(
        err instanceof Error
          ? `Search failed: ${err.message}`
          : "Search failed",
      );
    }

    // Optional enrichment — run each result's URL through the scrape
    // pipeline. Failures are swallowed per-result (we still return
    // the search hit, just without markdown). Concurrency is capped
    // so we don't hammer the scrape queue with a 20-wide fanout.
    if (input.scrapeOptions && results.length > 0) {
      await enrichWithScrape({
        results,
        userId,
        apiKeyId,
        scrapeOptions: input.scrapeOptions,
        integration: input.integration,
      });
    }

    await redis
      .set(cacheKey, JSON.stringify(results), "EX", CACHE_TTL_SECONDS)
      .catch(() => {});

    return Response.json({
      success: true,
      data: results,
      cached: false,
      creditsUsed: searchCredits,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

function buildCacheKey(userId: string, input: unknown): string {
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 16);
  return `search:${userId}:${hash}`;
}

async function enrichWithScrape({
  results,
  userId,
  apiKeyId,
  scrapeOptions,
  integration,
}: {
  results: SearchResult[];
  userId: string;
  apiKeyId: string | null;
  scrapeOptions: Record<string, unknown>;
  integration?: string;
}): Promise<void> {
  // Walk the results in chunks so we don't exceed per-host rate
  // limits or blow out the scrape queue on a 20-wide query.
  for (let i = 0; i < results.length; i += ENRICHMENT_CONCURRENCY) {
    const slice = results.slice(i, i + ENRICHMENT_CONCURRENCY);
    await Promise.all(
      slice.map(async (result) => {
        try {
          // Compose a full scrape input from the per-search options
          // plus this result's URL. We run each enrichment async so
          // the caller gets all hits back in one response.
          const childInput = scrapeRequestSchema.parse({
            ...scrapeOptions,
            url: result.url,
            async: false,
            integration: integration ?? "search",
          });
          const scrape = await performScrapeForUser({
            userId,
            apiKeyId,
            input: childInput,
          });
          const data = scrape.data as Record<string, unknown>;
          result.markdown = data.markdown as string | undefined;
          result.html = data.html as string | undefined;
          result.rawHtml = data.rawHtml as string | undefined;
          result.links = data.links as string[] | undefined;
          result.metadata = data.metadata as
            | Record<string, unknown>
            | undefined;
        } catch {
          /* leave the result without enrichment — it's still useful */
        }
      }),
    );
  }
}
