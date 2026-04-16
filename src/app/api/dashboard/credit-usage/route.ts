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
    const { userId } = await requireSession();

    const since = new Date();
    since.setDate(since.getDate() - 30);

    const [user, ledger30d] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: { creditBalance: true, planTier: true },
      }),
      db.creditLedger.findMany({
        where: { userId, createdAt: { gte: since } },
        select: { delta: true },
      }),
    ]);

    if (!user) {
      return Response.json(
        { success: false, error: { code: "NOT_FOUND", message: "User not found" } },
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
        balance: user.creditBalance,
        planTier: user.planTier,
        plan: PLAN_SPEC[user.planTier],
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
