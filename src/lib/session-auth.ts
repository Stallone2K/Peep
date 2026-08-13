import type { TeamRole } from "@prisma/client";

import { auth } from "@/lib/auth";
import { resolveActiveTeam, createPersonalTeam } from "@/lib/team";
import { UnauthorizedError } from "@/lib/errors";

// Helper for dashboard API routes (/api/dashboard/*) that runs inside a NextAuth
// session (cookie-based), not a Bearer token. Returns the userId plus the active
// teamId + role (data + credits are team-scoped). Lazily creates a personal team
// if the user somehow has none, so no session is ever team-less.
export async function requireSession(): Promise<{
  userId: string;
  teamId: string;
  role: TeamRole;
}> {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  const userId = session.user.id;

  const active = await resolveActiveTeam(userId);
  if (active) return { userId, teamId: active.teamId, role: active.role };

  const teamId = await createPersonalTeam({
    id: userId,
    name: session.user.name,
    email: session.user.email,
  });
  return { userId, teamId, role: "OWNER" };
}
