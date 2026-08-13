import { z } from "zod";
import { cookies } from "next/headers";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/session-auth";
import { ValidationError } from "@/lib/errors";
import { errorResponse } from "@/lib/route-helpers";

// Current NextAuth (database-strategy) session-token cookie — dev is
// unprefixed, prod (https) gets the __Secure- prefix.
async function currentSessionToken(): Promise<string | null> {
  const c = await cookies();
  return (
    c.get("authjs.session-token")?.value ??
    c.get("__Secure-authjs.session-token")?.value ??
    null
  );
}

// GET /api/dashboard/account — profile + connected providers + active sessions.
export async function GET() {
  try {
    const { userId, teamId } = await requireSession();
    const [user, team, accounts, sessions] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true, image: true, createdAt: true },
      }),
      db.team.findUnique({
        where: { id: teamId },
        select: { planTier: true, creditBalance: true },
      }),
      db.account.findMany({ where: { userId }, select: { provider: true } }),
      db.session.findMany({
        where: { userId },
        select: { sessionToken: true, expires: true },
        orderBy: { expires: "desc" },
      }),
    ]);
    const cur = await currentSessionToken();
    return Response.json({
      success: true,
      user: user
        ? {
            ...user,
            planTier: team?.planTier ?? "FREE",
            creditBalance: team?.creditBalance ?? 0,
          }
        : null,
      providers: accounts.map((a) => a.provider),
      sessions: sessions.map((s) => ({
        id: s.sessionToken.slice(-10),
        expires: s.expires.toISOString(),
        current: s.sessionToken === cur,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  image: z.string().url().max(2000).nullable().optional(),
});

// PATCH /api/dashboard/account — update display name / avatar.
export async function PATCH(req: Request) {
  try {
    const { userId } = await requireSession();
    const raw = await req.json().catch(() => {
      throw new ValidationError({ reason: "Invalid JSON body" });
    });
    const data = patchSchema.parse(raw);
    const user = await db.user.update({
      where: { id: userId },
      data,
      select: { name: true, image: true },
    });
    return Response.json({ success: true, user });
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/dashboard/account — permanently delete the account. Cascades to
// sessions, accounts, api keys, jobs, ledger (onDelete: Cascade in schema).
export async function DELETE() {
  try {
    const { userId } = await requireSession();
    await db.user.delete({ where: { id: userId } });
    return Response.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}
