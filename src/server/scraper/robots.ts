import robotsParser from "robots-parser";

import { getRedisConnection } from "@/lib/queue";
import { fetchPage } from "@/server/scraper/fetcher";

// robots.txt honoring. We fetch once per host per 24h, cache the raw
// body in Redis so dev + worker processes share the same view, and
// evaluate `isAllowed` with a Peep-branded UA against the parsed tree.
//
// Design notes:
// - A missing or 5xx robots.txt is treated as "allow all" (RFC-compliant
//   fallback; aggressive interpretations would block too many sites).
// - A literal "Disallow: /" with a matching User-agent IS honoured
//   unless the caller explicitly passed `respectRobotsTxt: false`.
// - We cache BOTH positive fetches and the "absent" outcome so a site
//   without robots.txt doesn't re-fetch every request.

const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24h
const FETCH_TIMEOUT_MS = 10_000;
const MISSING_SENTINEL = "\0missing\0";

export const PEEP_USER_AGENT = "PeepBot/1.0 (+https://peep.dev/bot)";

export type RobotsDecision = {
  allowed: boolean;
  source: "robots.txt" | "default-allow" | "bypassed";
  matchedUserAgent?: string;
};

export async function isAllowedByRobots(
  url: string,
  opts: { userAgent?: string; bypass?: boolean } = {},
): Promise<RobotsDecision> {
  if (opts.bypass) return { allowed: true, source: "bypassed" };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // malformed URL — let the fetcher/SSRF layer reject it, don't
    // block on an unparseable input here.
    return { allowed: true, source: "default-allow" };
  }

  const host = parsed.hostname.toLowerCase();
  const raw = await loadRobotsTxt(host, parsed.origin);
  if (raw === null) return { allowed: true, source: "default-allow" };

  const robotsUrl = `${parsed.origin}/robots.txt`;
  const parser = robotsParser(robotsUrl, raw);
  const ua = opts.userAgent ?? PEEP_USER_AGENT;
  const allowed = parser.isAllowed(url, ua) ?? true;
  return {
    allowed,
    source: "robots.txt",
    matchedUserAgent: ua,
  };
}

async function loadRobotsTxt(
  host: string,
  origin: string,
): Promise<string | null> {
  const redis = getRedisConnection();
  const cacheKey = `robots:${host}`;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached === MISSING_SENTINEL) return null;
  if (cached !== null) return cached;

  // Cache miss — fetch, cache, return. On network error we cache the
  // MISSING sentinel so we don't thrash on a host that's down.
  try {
    const res = await fetchPage(`${origin}/robots.txt`, {
      timeoutMs: FETCH_TIMEOUT_MS,
    });
    if (res.statusCode >= 200 && res.statusCode < 300 && res.bodyText) {
      await redis
        .set(cacheKey, res.bodyText, "EX", CACHE_TTL_SECONDS)
        .catch(() => {});
      return res.bodyText;
    }
  } catch {
    /* fall through to missing-cache */
  }

  await redis
    .set(cacheKey, MISSING_SENTINEL, "EX", CACHE_TTL_SECONDS)
    .catch(() => {});
  return null;
}
