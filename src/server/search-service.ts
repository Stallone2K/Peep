import crypto from "node:crypto";

import { debitCredits } from "@/lib/credits";
import { getRedisConnection } from "@/lib/queue";
import { InternalError } from "@/lib/errors";
import { resolveSearchProvider } from "@/server/search";
import {
  tbsToFreshness,
  type SearchResult,
} from "@/server/search/provider";
import { performScrapeForUser } from "@/server/scrape-service";
import { scrapeRequestSchema } from "@/lib/validators/scrape";
import type { SearchRequestInput } from "@/lib/validators/search";

// Shared /search pipeline — used by both the v1 Bearer-authed route
// and the dashboard playground wrapper. Handles provider selection,
// 30-min Redis cache, credit debit, and optional scrape enrichment.

const CACHE_TTL_SECONDS = 30 * 60;
const SEARCH_CREDIT_RATE = 2; // credits per 10 results
const ENRICHMENT_CONCURRENCY = 4;

export type SearchServiceResult = {
  results: SearchResult[];
  creditsUsed: number;
  cached: boolean;
};

export async function performSearchForUser({
  userId,
  apiKeyId,
  input,
}: {
  userId: string;
  apiKeyId: string | null;
  input: SearchRequestInput;
}): Promise<SearchServiceResult> {
  const provider = resolveSearchProvider();
  if (!provider.isConfigured()) {
    throw new InternalError(
      `Search provider ${provider.name} is not configured.`,
    );
  }

  const cacheKey = buildCacheKey(userId, input);
  const redis = getRedisConnection();

  // Cache hit — return the memoised results without re-charging.
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) {
    return {
      results: JSON.parse(cached) as SearchResult[],
      creditsUsed: 0,
      cached: true,
    };
  }

  // Charge up front — matches Firecrawl (a failed provider still
  // burns the quota once we've committed to the call).
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
      err instanceof Error ? `Search failed: ${err.message}` : "Search failed",
    );
  }

  // Optional enrichment — run each result's URL through the scrape
  // pipeline. Failures are swallowed per-result (we still return the
  // search hit, just without markdown).
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

  return { results, creditsUsed: searchCredits, cached: false };
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
  for (let i = 0; i < results.length; i += ENRICHMENT_CONCURRENCY) {
    const slice = results.slice(i, i + ENRICHMENT_CONCURRENCY);
    await Promise.all(
      slice.map(async (result) => {
        try {
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
          result.images = data.images as string[] | undefined;
          result.attributes = data.attributes as unknown[] | undefined;
          result.metadata = data.metadata as
            | Record<string, unknown>
            | undefined;
        } catch {
          /* leave the result unenriched — still useful */
        }
      }),
    );
  }
}
