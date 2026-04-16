import { createHash } from "node:crypto";

import { db } from "@/lib/db";
import type { ScrapeRequestInput } from "@/lib/validators/scrape";

// Stable cache key computed from the URL + every option that can
// change the output. `waitFor`, `timeout`, and the cache-control
// options themselves (maxAge / minAge / storeInCache) do NOT belong in
// the key — they affect WHEN/WHETHER we hit cache, not what was
// produced.
//
// The key doubles as a dedup hint across users: two people scraping
// the same URL with the same options share hot-path cache reads.
export function cacheKey(input: ScrapeRequestInput): string {
  const normalized = {
    url: input.url.toLowerCase(),
    formats: [...input.formats].sort(),
    onlyMainContent: input.onlyMainContent,
    onlyCleanContent: input.onlyCleanContent,
    includeTags: input.includeTags ?? null,
    excludeTags: input.excludeTags ?? null,
    mobile: input.mobile ?? false,
    country: input.country ?? "us-generic",
    languages: input.languages ?? null,
    blockAds: input.blockAds ?? true,
    removeBase64Images: input.removeBase64Images ?? true,
    proxy: input.proxy ?? "auto",
    // actions go here too once Phase 4 wires them
    actions: input.actions ?? null,
    headers: input.headers ?? null,
  };
  return createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
}

// Returns the most recent cache hit for this key that satisfies the
// caller's maxAge/minAge constraints, or null.
export async function readCache({
  key,
  maxAgeMs,
  minAgeMs,
}: {
  key: string;
  maxAgeMs?: number;
  minAgeMs?: number;
}) {
  // maxAgeMs undefined means no upper bound — we serve the most recent
  // cached entry of any age. Firecrawl parity: when maxAge is missing
  // the request always runs fresh. So require maxAgeMs to opt in.
  if (maxAgeMs === undefined) return null;

  const now = Date.now();
  const minAge = minAgeMs ?? 0;
  const oldestAllowed = new Date(now - maxAgeMs);
  const newestAllowed = new Date(now - minAge);

  return db.scrapeResult.findFirst({
    where: {
      cacheKey: key,
      createdAt: { gte: oldestAllowed, lte: newestAllowed },
    },
    orderBy: { createdAt: "desc" },
  });
}
