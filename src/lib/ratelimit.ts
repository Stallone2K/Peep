import type { PlanTier } from "@prisma/client";

import { getRedisConnection } from "@/lib/queue";
import { PLAN_SPEC } from "@/lib/plans";
import { RateLimitError } from "@/lib/errors";

// Sliding-window rate limiter backed by ioredis sorted sets. One
// ZSET per bucket, entries are timestamps; we trim + count atomically
// via MULTI so two concurrent callers can't both squeak past the cap.
//
// Buckets:
//   rl:user:<userId>       — per-user plan-tier window (default 60s)
//   rl:host:<eTLD+1>       — per-host polite 1 rps ceiling
//   rl:host:conc:<eTLD+1>  — in-flight concurrency via INCR/DECR with TTL
//
// We pick sliding windows over token buckets because the error
// surface is easier to explain ("you sent N requests in the last
// 60s") and the math for Retry-After is straightforward.

const WINDOW_USER_SECONDS = 60;
const WINDOW_HOST_SECONDS = 1;
const HOST_CONCURRENCY_TTL_SECONDS = 90; // safety net if a worker crashes
const DEFAULT_HOST_RATE_PER_SEC = 1;
const DEFAULT_HOST_CONCURRENCY = 2;

export type RateLimitOutcome = {
  ok: true;
} | {
  ok: false;
  retryAfterSec: number;
};

// Check-and-increment — atomically adds `now` to the window and
// returns the post-insert count. If the count exceeds the cap, the
// caller should treat the request as denied and also remove its own
// entry; we keep it in for tracking since exiting over-cap clients
// is expected behaviour.
async function slidingWindowCheck(
  key: string,
  windowSeconds: number,
  max: number,
): Promise<{ count: number; oldestMs: number }> {
  const redis = getRedisConnection();
  const now = Date.now();
  const member = `${now}-${Math.random().toString(36).slice(2, 8)}`;
  const cutoff = now - windowSeconds * 1000;

  // Atomic: drop expired entries, add this request, count, set TTL.
  const pipeline = redis.multi();
  pipeline.zremrangebyscore(key, 0, cutoff);
  pipeline.zadd(key, now, member);
  pipeline.zcard(key);
  pipeline.zrange(key, 0, 0, "WITHSCORES");
  pipeline.expire(key, windowSeconds + 5);
  const results = await pipeline.exec();
  if (!results) return { count: 0, oldestMs: now };

  const count = (results[2]?.[1] as number) ?? 0;
  const oldestRange = (results[3]?.[1] as string[]) ?? [];
  const oldestMs = oldestRange[1] ? Number(oldestRange[1]) : now;
  return { count, oldestMs };
}

function retryAfterFromOldest(
  oldestMs: number,
  windowSeconds: number,
): number {
  const expiresAtMs = oldestMs + windowSeconds * 1000;
  const retrySec = Math.ceil((expiresAtMs - Date.now()) / 1000);
  return Math.max(retrySec, 1);
}

// Per-user rate limit — plan-tier dependent (FREE 10/min,
// HOBBY 60/min, ...). Enterprise bypasses the check entirely.
export async function checkUserRateLimit(
  userId: string,
  plan: PlanTier,
): Promise<RateLimitOutcome> {
  const limit = PLAN_SPEC[plan].requestsPerMinute;
  if (limit === "custom") return { ok: true };

  const key = `rl:user:${userId}`;
  const { count, oldestMs } = await slidingWindowCheck(
    key,
    WINDOW_USER_SECONDS,
    limit,
  );

  if (count <= limit) return { ok: true };
  return {
    ok: false,
    retryAfterSec: retryAfterFromOldest(oldestMs, WINDOW_USER_SECONDS),
  };
}

// Polite per-host ceiling — 1 req/sec by default so we don't hammer
// small origins. Callers can pass a plan-adjusted rate if a paid
// tier opts in to higher host throughput.
export async function checkHostRateLimit(
  host: string,
  perSec: number = DEFAULT_HOST_RATE_PER_SEC,
): Promise<RateLimitOutcome> {
  const key = `rl:host:${normalizeHost(host)}`;
  const { count, oldestMs } = await slidingWindowCheck(
    key,
    WINDOW_HOST_SECONDS,
    perSec,
  );
  if (count <= perSec) return { ok: true };
  return {
    ok: false,
    retryAfterSec: retryAfterFromOldest(oldestMs, WINDOW_HOST_SECONDS),
  };
}

// Bounded in-flight concurrency per host — caller must release the
// slot when the scrape finishes. TTL guarantees a crashed worker
// doesn't leak a permanent in-flight count.
export async function acquireHostSlot(
  host: string,
  max: number = DEFAULT_HOST_CONCURRENCY,
): Promise<RateLimitOutcome> {
  const redis = getRedisConnection();
  const key = `rl:host:conc:${normalizeHost(host)}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, HOST_CONCURRENCY_TTL_SECONDS);
  if (count <= max) return { ok: true };

  // Over cap — back the counter off and tell the caller to retry.
  await redis.decr(key).catch(() => {});
  return { ok: false, retryAfterSec: 1 };
}

export async function releaseHostSlot(host: string): Promise<void> {
  const redis = getRedisConnection();
  const key = `rl:host:conc:${normalizeHost(host)}`;
  const next = await redis.decr(key).catch(() => 0);
  if (next < 0) await redis.del(key).catch(() => {}); // stay non-negative
}

function normalizeHost(raw: string): string {
  return raw.toLowerCase().replace(/^www\./, "");
}

// Convenience helper used at the top of every mutating route handler.
// Throws RateLimitError (→ 429 with retryAfterSec in body) on user
// bucket overflow. Host buckets live in the scrape pipeline, not at
// the HTTP boundary — a single API call may target many hosts and
// they each police themselves.
export async function enforceUserRateLimit(
  userId: string,
  plan: PlanTier,
): Promise<void> {
  const res = await checkUserRateLimit(userId, plan);
  if (!res.ok) throw new RateLimitError(res.retryAfterSec);
}
