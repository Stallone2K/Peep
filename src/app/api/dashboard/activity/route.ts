import { db } from "@/lib/db";
import { requireSession } from "@/lib/session-auth";
import { toJsonError } from "@/lib/errors";

// GET /api/dashboard/activity?limit=50&status=DONE
// Recent scrape (later: crawl/extract) jobs for the Activity Logs page.
// Lightweight projection — no result payloads, just metadata suitable
// for a dashboard table.
export async function GET(req: Request) {
  try {
    const { userId } = await requireSession();
    const url = new URL(req.url);
    const limitParam = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(limitParam)
      ? Math.min(200, Math.max(1, Math.floor(limitParam)))
      : 50;
    const statusParam = url.searchParams.get("status")?.toUpperCase();

    const jobs = await db.scrapeJob.findMany({
      where: {
        userId,
        ...(statusParam &&
        ["QUEUED", "RUNNING", "DONE", "FAILED", "CANCELLED"].includes(
          statusParam,
        )
          ? { status: statusParam as never }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        url: true,
        status: true,
        creditsUsed: true,
        error: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        integration: true,
        apiKey: { select: { id: true, name: true, prefix: true } },
      },
    });

    return Response.json({
      success: true,
      data: jobs.map((j) => ({
        ...j,
        type: "scrape" as const,
        durationMs:
          j.completedAt && j.startedAt
            ? j.completedAt.getTime() - j.startedAt.getTime()
            : null,
      })),
    });
  } catch (err) {
    const { body, status } = toJsonError(err);
    return Response.json(body, { status });
  }
}
