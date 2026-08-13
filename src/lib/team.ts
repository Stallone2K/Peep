import { randomBytes } from "node:crypto";
import type { TeamRole, PlanTier } from "@prisma/client";

import { db } from "@/lib/db";

// Resolve the caller's active team. For now (one personal team per user after
// backfill) this is defaultTeamId, else the user's earliest membership. A team
// switcher will later set an explicit active-team cookie.
export async function resolveActiveTeam(
  userId: string,
): Promise<{ teamId: string; role: TeamRole } | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { defaultTeamId: true },
  });
  if (user?.defaultTeamId) {
    const m = await db.teamMember.findFirst({
      where: { teamId: user.defaultTeamId, userId },
      select: { teamId: true, role: true },
    });
    if (m) return m;
  }
  const m = await db.teamMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { teamId: true, role: true },
  });
  return m ?? null;
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "team"
  );
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  while (await db.team.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${base}-${randomBytes(2).toString("hex")}`;
  }
  return slug;
}

// Create a personal team for a (new) user, make them OWNER, and set it as their
// default. Used on signup so every account is team-scoped from day one.
export async function createPersonalTeam(user: {
  id: string;
  name?: string | null;
  email?: string | null;
  planTier?: PlanTier;
  creditBalance?: number;
}): Promise<string> {
  const slug = await uniqueSlug(
    slugify(user.name || user.email?.split("@")[0] || "team"),
  );
  const team = await db.team.create({
    data: {
      name: user.name || "Personal",
      slug,
      ...(user.planTier ? { planTier: user.planTier } : {}),
      ...(user.creditBalance != null ? { creditBalance: user.creditBalance } : {}),
      members: { create: { userId: user.id, role: "OWNER" } },
    },
    select: { id: true },
  });
  await db.user.update({
    where: { id: user.id },
    data: { defaultTeamId: team.id },
  });
  return team.id;
}
