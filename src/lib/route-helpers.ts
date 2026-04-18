import { z } from "zod";
import type { PlanTier } from "@prisma/client";

import { enforceUserRateLimit } from "@/lib/ratelimit";
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
