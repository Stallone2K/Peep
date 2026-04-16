import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/api-auth";
import { NotFoundError, toJsonError } from "@/lib/errors";

// GET /api/v1/scrape/:id
// Status + result lookup for async scrape callers. Returns 404 when
// the id doesn't exist OR belongs to a different user (enumeration
// protection — same pattern as DELETE /api-keys/[id]).
export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireApiKey(_req);
    const { id } = await context.params;

    const job = await db.scrapeJob.findFirst({
      where: { id, userId },
      include: { result: true },
    });
    if (!job) throw new NotFoundError("Scrape job");

    return Response.json({
      success: true,
      data: {
        jobId: job.id,
        status: job.status.toLowerCase(),
        url: job.url,
        creditsUsed: job.creditsUsed,
        error: job.error ?? null,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        createdAt: job.createdAt,
        result: job.result
          ? {
              markdown: job.result.markdown,
              html: job.result.html,
              rawHtml: job.result.rawHtml,
              links: job.result.links,
              images: job.result.images,
              metadata: job.result.metadata,
              pageStatus: job.result.pageStatus,
              durationMs: job.result.durationMs,
              fromCache: job.result.fromCache,
            }
          : null,
      },
    });
  } catch (err) {
    const { body, status } = toJsonError(err);
    return Response.json(body, { status });
  }
}
