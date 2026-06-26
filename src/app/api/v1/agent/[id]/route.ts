import { requireApiKey } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { errorResponse } from "@/lib/route-helpers";

// GET /api/v1/agent/:id — status + harvested records.
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireApiKey(req);
    const { id } = await ctx.params;

    const job = await db.extractJob.findFirst({
      where: { id, userId, integration: "agent" },
    });
    if (!job) throw new NotFoundError("Agent job");

    return Response.json({
      success: true,
      jobId: job.id,
      status: job.status.toLowerCase(),
      task: job.prompt,
      creditsUsed: job.creditsUsed,
      error: job.error,
      result: job.result,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
