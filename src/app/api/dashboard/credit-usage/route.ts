import { db } from "@/lib/db";
import { requireSession } from "@/lib/session-auth";
import { toJsonError } from "@/lib/errors";
import { PLAN_SPEC } from "@/lib/plans";

// GET /api/dashboard/credit-usage
// Live snapshot for the Overview + Usage widgets.
// Returns: current balance, plan-tier, spent/granted in the last 30
// days (rolling window starting 30d ago from now).
export async function GET() {
  try {
    const { teamId } = await requireSession();

    const since = new Date();
    since.setDate(since.getDate() - 30);

    const [team, ledger30d] = await Promise.all([
      db.team.findUnique({
        where: { id: teamId },
        select: { creditBalance: true, planTier: true },
      }),
      db.creditLedger.findMany({
        where: { teamId, createdAt: { gte: since } },
        select: { delta: true },
      }),
    ]);

    if (!team) {
      return Response.json(
        { success: false, error: { code: "NOT_FOUND", message: "Team not found" } },
        { status: 404 },
      );
    }

    const spent = ledger30d
      .filter((r) => r.delta < 0)
      .reduce((acc, r) => acc + Math.abs(r.delta), 0);
    const granted = ledger30d
      .filter((r) => r.delta > 0)
      .reduce((acc, r) => acc + r.delta, 0);

    return Response.json({
      success: true,
      data: {
        balance: team.creditBalance,
        planTier: team.planTier,
        plan: PLAN_SPEC[team.planTier],
        last30Days: {
          spent,
          granted,
          netChange: granted - spent,
        },
      },
    });
  } catch (err) {
    const { body, status } = toJsonError(err);
    return Response.json(body, { status });
  }
}
