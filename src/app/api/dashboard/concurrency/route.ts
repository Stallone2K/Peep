import { db } from "@/lib/db";
import { requireSession } from "@/lib/session-auth";
import { concurrencyCap, PLAN_SPEC } from "@/lib/plans";
import { toJsonError } from "@/lib/errors";

// GET /api/dashboard/concurrency
// Live concurrency snapshot for the Overview widget. In Phase 4 the
// "active" count would come from Redis (counting in-flight Playwright
// contexts for this user). For now we count RUNNING ScrapeJob rows.
export async function GET() {
  try {
    const { userId } = await requireSession();

    const [user, runningCount] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: { planTier: true },
      }),
      db.scrapeJob.count({
        where: { userId, status: "RUNNING" },
      }),
    ]);

    const cap = user ? concurrencyCap(user.planTier) : 2;
    const plan = user ? PLAN_SPEC[user.planTier] : PLAN_SPEC.FREE;

    return Response.json({
      success: true,
      data: {
        active: runningCount,
        cap,
        planTier: user?.planTier ?? "FREE",
        planName: plan.name,
      },
    });
  } catch (err) {
    const { body, status } = toJsonError(err);
    return Response.json(body, { status });
  }
}
