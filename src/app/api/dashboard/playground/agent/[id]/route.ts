import { db } from "@/lib/db";
import { requireSession } from "@/lib/session-auth";
import { NotFoundError, toJsonError } from "@/lib/errors";
import { readAgentProgress } from "@/server/agent-service";

// GET /api/dashboard/playground/agent/:id — status + live progress (Redis
// step trace) + final records (DB).
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireSession();
    const { id } = await ctx.params;

    const job = await db.extractJob.findFirst({
      where: { id, userId, integration: "agent" },
      select: {
        status: true,
        prompt: true,
        result: true,
        error: true,
        creditsUsed: true,
      },
    });
    if (!job) throw new NotFoundError("Agent job");

    const progress = await readAgentProgress(id);

    return Response.json({
      success: true,
      status: job.status.toLowerCase(),
      task: job.prompt,
      creditsUsed: job.creditsUsed,
      error: job.error,
      result: job.result,
      progress,
    });
  } catch (err) {
    const { body, status } = toJsonError(err);
    return Response.json(body, { status });
  }
}
