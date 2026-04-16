import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { InsufficientCreditsError } from "@/lib/errors";

// Ledger row metadata accompanying any balance change. `refType`/`refId`
// are optional pointers at the thing that caused the delta (ScrapeJob,
// Stripe invoice, etc.) so the dashboard can link rows to their source.
type LedgerMeta = {
  reason: string;
  refType?: string;
  refId?: string;
};

// Conditionally decrement the user's credit balance and insert a ledger
// row — both or neither, inside a single $transaction. The update's
// `where` clause enforces balance >= amount at the SQL level, so there
// is no read-modify-write race even under heavy concurrency.
export async function debitCredits(
  userId: string,
  amount: number,
  meta: LedgerMeta,
): Promise<void> {
  if (amount <= 0) throw new Error("debitCredits requires a positive amount");

  try {
    await db.$transaction([
      db.user.update({
        where: { id: userId, creditBalance: { gte: amount } },
        data: { creditBalance: { decrement: amount } },
      }),
      db.creditLedger.create({
        data: {
          userId,
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
      // P2025 = "An operation failed because it depends on one or more
      // records that were required but not found." Fires either when
      // the user doesn't exist or when the balance guard failed. We
      // treat both as insufficient credits from the caller's point of
      // view — there is no legitimate path where an authenticated user
      // wouldn't exist.
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

  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: { creditBalance: { increment: amount } },
    }),
    db.creditLedger.create({
      data: {
        userId,
        delta: amount,
        reason: meta.reason,
        refType: meta.refType,
        refId: meta.refId,
      },
    }),
  ]);
}

// Reverse a prior debit. Semantically the same as grantCredits but
// carries a distinct reason so the ledger can distinguish refunds from
// fresh grants.
export function refundCredits(
  userId: string,
  amount: number,
  meta: LedgerMeta,
): Promise<void> {
  return grantCredits(userId, amount, { ...meta, reason: meta.reason });
}

// Cheap read for dashboard pages + pre-flight checks. The debit path
// does NOT rely on this — it uses the atomic update guard above.
export async function getCreditBalance(userId: string): Promise<number> {
  const row = await db.user.findUnique({
    where: { id: userId },
    select: { creditBalance: true },
  });
  return row?.creditBalance ?? 0;
}
