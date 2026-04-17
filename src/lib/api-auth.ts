import type { PlanTier } from "@prisma/client";

import { db } from "@/lib/db";
import { extractBearer, verifyApiKey } from "@/lib/api-key";
import { InvalidApiKeyError } from "@/lib/errors";

// Pulls a Bearer token off the Authorization header, verifies it
// against the ApiKey table, and returns the owning userId + apiKeyId +
// planTier. The planTier is needed downstream for concurrency caps
// (Phase 4) and rate limiting (Phase 7).
export async function requireApiKey(req: Request): Promise<{
  userId: string;
  apiKeyId: string;
  planTier: PlanTier;
}> {
  const raw = extractBearer(req.headers.get("authorization"));
  if (!raw) throw new InvalidApiKeyError();
  const { userId, apiKeyId } = await verifyApiKey(raw);

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { planTier: true },
  });
  if (!user) throw new InvalidApiKeyError();

  return { userId, apiKeyId, planTier: user.planTier };
}
