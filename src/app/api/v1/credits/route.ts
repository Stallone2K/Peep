import { requireApiKey } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { errorResponse, successJson } from "@/lib/route-helpers";

// GET /api/v1/credits — Bearer-authed read of the caller's Peep Card.
// Returns the live balance, plan tier, and the most recent ledger
// entries (debits + grants) so SDKs/CLIs can show spend history and
// catch a low balance before a job 402s. Free — never debits.
export async function GET(req: Request) {
  try {
    const { userId, teamId, planTier } = await requireApiKey(req);

    const [team, recentLedger] = await Promise.all([
      db.team.findUnique({
        where: { id: teamId },
        select: { creditBalance: true },
      }),
      db.creditLedger.findMany({
        where: { teamId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          delta: true,
          reason: true,
          refType: true,
          refId: true,
          createdAt: true,
        },
      }),
    ]);

    return await successJson(
      {
        success: true,
        balance: team?.creditBalance ?? 0,
        plan: planTier,
        recentLedger,
      },
      { userId },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
