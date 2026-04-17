import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/api-auth";
import { NotFoundError, toJsonError } from "@/lib/errors";

// GET /api/v1/crawl/:id/errors
// Returns the per-URL failures for this crawl. Useful when a caller
// wants to retry just the failed subset or diagnose a problematic
// path/domain.
export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireApiKey(req);
    const { id } = await context.params;

    const crawl = await db.crawlJob.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!crawl) throw new NotFoundError("Crawl job");

    const failed = await db.scrapeJob.findMany({
      where: { crawlJobId: id, status: "FAILED" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        url: true,
        error: true,
        createdAt: true,
        completedAt: true,
      },
    });

    return Response.json({
      success: true,
      errors: failed.map((r) => ({
        jobId: r.id,
        url: r.url,
        errorCode: "SCRAPE_FAILED",
        message: r.error ?? "Unknown error",
        scrapedAt: r.completedAt ?? r.createdAt,
      })),
    });
  } catch (err) {
    const { body, status } = toJsonError(err);
    return Response.json(body, { status });
  }
}
