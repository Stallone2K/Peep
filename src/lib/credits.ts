import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { InsufficientCreditsError } from "@/lib/errors";
import { resolveActiveTeam } from "@/lib/team";

// Ledger row metadata accompanying any balance change. `refType`/`refId`
// are optional pointers at the thing that caused the delta (ScrapeJob,
// invoice, etc.) so the dashboard can link rows to their source.
type LedgerMeta = {
  reason: string;
  refType?: string;
  refId?: string;
};

// The Peep Card is TEAM-owned: balance lives on Team.creditBalance and every
// ledger row is scoped by teamId (plus the acting userId, kept for audit). The
// public signatures still take `userId` so no caller had to change — we resolve
// the user's active team here.
async function teamFor(userId: string): Promise<string> {
  const t = await resolveActiveTeam(userId);
  if (!t) throw new InsufficientCreditsError();
  return t.teamId;
}

// Conditionally decrement the team balance and insert a ledger row — both or
// neither, inside a single $transaction. The update's `where` clause enforces
// balance >= amount at the SQL level, so there is no read-modify-write race.
export async function debitCredits(
  userId: string,
  amount: number,
  meta: LedgerMeta,
): Promise<void> {
  if (amount <= 0) throw new Error("debitCredits requires a positive amount");
  const teamId = await teamFor(userId);

  try {
    await db.$transaction([
      db.team.update({
        where: { id: teamId, creditBalance: { gte: amount } },
        data: { creditBalance: { decrement: amount } },
      }),
      db.creditLedger.create({
        data: {
          userId,
          teamId,
          delta: -amount,
          reason: meta.reason,
          refType: meta.refType,
          refId: meta.refId,
        },
      }),
    ]);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      // P2025 = required record not found — fires when the balance guard
      // (creditBalance >= amount) fails. Surface as insufficient credits.
      throw new InsufficientCreditsError();
    }
    throw err;
  }
}

// Positive credit movement — signups, plan renewals, refunds, top-ups.
export async function grantCredits(
  userId: string,
  amount: number,
  meta: LedgerMeta,
): Promise<void> {
  if (amount <= 0) throw new Error("grantCredits requires a positive amount");
  const teamId = await teamFor(userId);

  await db.$transaction([
    db.team.update({
      where: { id: teamId },
      data: { creditBalance: { increment: amount } },
    }),
    db.creditLedger.create({
      data: {
        userId,
        teamId,
        delta: amount,
        reason: meta.reason,
        refType: meta.refType,
        refId: meta.refId,
      },
    }),
  ]);
}

// Reverse a prior debit. Semantically the same as grantCredits but carries a
// distinct reason so the ledger can distinguish refunds from fresh grants.
export function refundCredits(
  userId: string,
  amount: number,
  meta: LedgerMeta,
): Promise<void> {
  return grantCredits(userId, amount, { ...meta, reason: meta.reason });
}

// Cheap read for dashboard pages + pre-flight checks. Reads the team balance.
export async function getCreditBalance(userId: string): Promise<number> {
  const t = await resolveActiveTeam(userId);
  if (!t) return 0;
  const row = await db.team.findUnique({
    where: { id: t.teamId },
    select: { creditBalance: true },
  });
  return row?.creditBalance ?? 0;
}
