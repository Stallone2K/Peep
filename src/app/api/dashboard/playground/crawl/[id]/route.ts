import { db } from "@/lib/db";
import { requireSession } from "@/lib/session-auth";
import { NotFoundError, toJsonError } from "@/lib/errors";

// GET /api/dashboard/playground/crawl/:id
// Session-authed crawl status for the playground's live progress
// panel. Mirrors /api/v1/crawl/:id but skips pagination — the
// playground just needs status + running totals + the last few
// completed pages to render a live feed.
export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireSession();
    const { id } = await context.params;

    const crawl = await db.crawlJob.findFirst({
      where: { id, userId },
    });
    if (!crawl) throw new NotFoundError("Crawl job");

    // Latest 25 finished children for the feed; the playground renders
    // them as they arrive in DB order (cuid ≈ time-sorted).
    const children = await db.scrapeJob.findMany({
      where: {
        crawlJobId: id,
        status: { in: ["DONE", "FAILED"] },
      },
      orderBy: { id: "desc" },
      take: 25,
      select: {
        id: true,
        url: true,
        status: true,
        error: true,
        completedAt: true,
        result: { select: { metadata: true } },
      },
    });

    const [completedCount, failedCount, creditsAgg] = await Promise.all([
      db.scrapeJob.count({
        where: { crawlJobId: id, status: { in: ["DONE", "FAILED"] } },
      }),
      db.scrapeJob.count({
        where: { crawlJobId: id, status: "FAILED" },
      }),
      db.scrapeJob.aggregate({
        where: { crawlJobId: id },
        _sum: { creditsUsed: true },
      }),
    ]);

    return Response.json({
      success: true,
      status: crawl.status.toLowerCase(),
      rootUrl: crawl.rootUrl,
      total: crawl.totalDiscovered,
      completed: completedCount,
      failed: failedCount,
      creditsUsed: creditsAgg._sum.creditsUsed ?? 0,
      recent: children.map((c) => ({
        jobId: c.id,
        url: c.url,
        status: c.status.toLowerCase(),
        error: c.error,
        completedAt: c.completedAt,
        title:
          ((c.result?.metadata as Record<string, unknown> | null)
            ?.title as string | undefined) ?? null,
      })),
      createdAt: crawl.createdAt,
      completedAt: crawl.completedAt,
    });
  } catch (err) {
    const { body, status } = toJsonError(err);
    return Response.json(body, { status });
  }
}

// DELETE /api/dashboard/playground/crawl/:id — cancel
export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireSession();
    const { id } = await context.params;

    const crawl = await db.crawlJob.findFirst({
      where: { id, userId },
    });
    if (!crawl) throw new NotFoundError("Crawl job");

    if (crawl.status === "DONE" || crawl.status === "CANCELLED") {
      return Response.json({
        success: true,
        status: crawl.status.toLowerCase(),
      });
    }

    await db.crawlJob.update({
      where: { id },
      data: { status: "CANCELLED", completedAt: new Date() },
    });

    return Response.json({ success: true, status: "cancelled" });
  } catch (err) {
    const { body, status } = toJsonError(err);
    return Response.json(body, { status });
  }
}
