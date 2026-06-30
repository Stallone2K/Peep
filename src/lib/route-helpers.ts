import { z } from "zod";
import type { PlanTier } from "@prisma/client";

import { enforceUserRateLimit } from "@/lib/ratelimit";
import { getCreditBalance } from "@/lib/credits";
import { ValidationError, toJsonError } from "@/lib/errors";

// Shared response + pre-flight helpers used by /api/v1/* mutating
// routes. Centralizes rate limiting, the zod → ValidationError shape,
// and the Retry-After header plumbing so each route can stay narrow.

export async function preflight(
  userId: string,
  plan: PlanTier,
): Promise<void> {
  await enforceUserRateLimit(userId, plan);
}

// Render an error caught by a route handler into a Response, applying
// any headers (Retry-After on 429, etc.) surfaced by toJsonError.
export function errorResponse(err: unknown): Response {
  const mapped =
    err instanceof z.ZodError
      ? toJsonError(new ValidationError(err.issues))
      : toJsonError(err);
  return Response.json(mapped.body, {
    status: mapped.status,
    ...(mapped.headers ? { headers: mapped.headers } : {}),
  });
}

// Build a JSON success Response carrying the Peep Card credit headers.
// `X-Peep-Credits-Remaining` is read fresh from the balance (so it
// reflects any debit just performed); `X-Peep-Credits-Used` is set
// when the caller knows the spend (sync debits) or reservation (async
// jobs). One indexed lookup — cheap enough for every v1 response, and
// it lets SDKs/CLIs surface remaining balance without a second call.
export async function successJson(
  body: Record<string, unknown>,
  opts: { userId: string; creditsUsed?: number; status?: number },
): Promise<Response> {
  const remaining = await getCreditBalance(opts.userId);
  const headers: Record<string, string> = {
    "X-Peep-Credits-Remaining": String(remaining),
  };
  if (opts.creditsUsed !== undefined) {
    headers["X-Peep-Credits-Used"] = String(opts.creditsUsed);
  }
  return Response.json(body, { status: opts.status ?? 200, headers });
}

// FREE / HOBBY plans can't bypass robots.txt — the override is a
// paid-tier affordance. Silently coerce the flag back to true so an
// accidental `false` in a dev payload doesn't get the caller a
// surprise 403; they can upgrade if they actually need it.
const OVERRIDE_ALLOWED_TIERS: PlanTier[] = [
  "STANDARD",
  "GROWTH",
  "SCALE",
  "ENTERPRISE",
];

export function canOverrideRobots(plan: PlanTier): boolean {
  return OVERRIDE_ALLOWED_TIERS.includes(plan);
}
