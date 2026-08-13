import type { PlanTier } from "@prisma/client";

import { db } from "@/lib/db";
import { extractBearer, verifyApiKey } from "@/lib/api-key";
import { resolveActiveTeam } from "@/lib/team";
import { InvalidApiKeyError } from "@/lib/errors";

// Pulls a Bearer token off the Authorization header, verifies it against the
// ApiKey table, and returns the owning userId + apiKeyId + the key's teamId +
// the team's planTier (the active Peep Card). teamId scopes all data + credits.
export async function requireApiKey(req: Request): Promise<{
  userId: string;
  apiKeyId: string;
  teamId: string;
  planTier: PlanTier;
}> {
  const raw = extractBearer(req.headers.get("authorization"));
  if (!raw) throw new InvalidApiKeyError();
  const { userId, apiKeyId, teamId } = await verifyApiKey(raw);

  // Prefer the key's own team; fall back to the user's active team for keys
  // created before the multi-tenancy backfill.
  const resolvedTeamId =
    teamId ?? (await resolveActiveTeam(userId))?.teamId ?? null;
  if (!resolvedTeamId) throw new InvalidApiKeyError();

  const team = await db.team.findUnique({
    where: { id: resolvedTeamId },
    select: { planTier: true },
  });

  return {
    userId,
    apiKeyId,
    teamId: resolvedTeamId,
    planTier: team?.planTier ?? "FREE",
  };
}
