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
    const { userId, teamId } = await requireSession();

    const [team, runningCount] = await Promise.all([
      db.team.findUnique({
        where: { id: teamId },
        select: { planTier: true },
      }),
      // Job rows aren't teamId-stamped on write yet (deferred pass) — count by
      // user so the number stays accurate until data scoping lands.
      db.scrapeJob.count({
        where: { userId, status: "RUNNING" },
      }),
    ]);

    const cap = team ? concurrencyCap(team.planTier) : 2;
    const plan = team ? PLAN_SPEC[team.planTier] : PLAN_SPEC.FREE;

    return Response.json({
      success: true,
      data: {
        active: runningCount,
        cap,
        planTier: team?.planTier ?? "FREE",
        planName: plan.name,
      },
    });
  } catch (err) {
    const { body, status } = toJsonError(err);
    return Response.json(body, { status });
  }
}
