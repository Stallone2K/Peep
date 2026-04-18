import { getRedisConnection } from "@/lib/queue";

// Per-host "last-known-good" strategy cache. 24h sliding Redis
// window. The escalation ladder (http → pw:basic → pw:stealth) is
// expensive — we don't want to re-run the climb on every scrape for
// a host that consistently needs stealth. Caching the winning
// strategy lets the next scrape for the same eTLD jump straight to
// the correct tier.
//
// Stored values are strings because Prisma isn't in the hot path
// here and we want the reads to stay O(1). Unknown values are
// treated as "no hint" and fall back to the full ladder.

export type StrategyHint = "http" | "playwright" | "proxy-playwright";

const TTL_SECONDS = 24 * 60 * 60;

function keyFor(host: string): string {
  return `strategy:${host.toLowerCase().replace(/^www\./, "")}`;
}

export async function getStrategyHint(
  host: string,
): Promise<StrategyHint | null> {
  try {
    const raw = await getRedisConnection().get(keyFor(host));
    if (raw === "http" || raw === "playwright" || raw === "proxy-playwright") {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}

export async function recordStrategySuccess(
  host: string,
  hint: StrategyHint,
): Promise<void> {
  try {
    await getRedisConnection().set(keyFor(host), hint, "EX", TTL_SECONDS);
  } catch {
    /* best-effort */
  }
}
