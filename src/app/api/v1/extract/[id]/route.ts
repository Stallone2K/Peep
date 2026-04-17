import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/api-auth";
import { NotFoundError, toJsonError } from "@/lib/errors";

// GET /api/v1/extract/:id
// Status + result lookup. Returns 404 for wrong-owner (enumeration
// protection — same pattern as /scrape/:id).
export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireApiKey(req);
    const { id } = await context.params;

    const job = await db.extractJob.findFirst({
      where: { id, userId },
    });
    if (!job) throw new NotFoundError("Extract job");

    return Response.json({
      success: true,
      data: {
        jobId: job.id,
        status: job.status.toLowerCase(),
        urls: job.urls,
        creditsUsed: job.creditsUsed,
        error: job.error ?? null,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        createdAt: job.createdAt,
        result: job.result ?? null,
        tokensUsed: job.tokensUsed ?? null,
      },
    });
  } catch (err) {
    const { body, status } = toJsonError(err);
    return Response.json(body, { status });
  }
}
