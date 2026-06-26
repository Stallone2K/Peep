import { db } from "@/lib/db";
import { requireSession } from "@/lib/session-auth";
import { NotFoundError, toJsonError } from "@/lib/errors";

// GET /api/dashboard/playground/crawl/:id/page/:jobId
// Full scraped content of one crawled page, for the per-page viewer in the
// crawl playground. Verifies the page belongs to this crawl + user.
export async function GET(
  req: Request,
  context: { params: Promise<{ id: string; jobId: string }> },
) {
  try {
    const { userId } = await requireSession();
    const { id, jobId } = await context.params;

    const job = await db.scrapeJob.findFirst({
      where: { id: jobId, crawlJobId: id, userId },
      select: {
        url: true,
        result: {
          select: {
            markdown: true,
            html: true,
            links: true,
            metadata: true,
          },
        },
      },
    });
    if (!job) throw new NotFoundError("Page");

    const meta = (job.result?.metadata ?? {}) as Record<string, unknown>;
    return Response.json({
      success: true,
      url: job.url,
      markdown: job.result?.markdown ?? null,
      html: job.result?.html ?? null,
      links: job.result?.links ?? [],
      json: meta.json ?? null,
      metadata: meta,
    });
  } catch (err) {
    const { body, status } = toJsonError(err);
    return Response.json(body, { status });
  }
}
