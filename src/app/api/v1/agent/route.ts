import { requireApiKey } from "@/lib/api-auth";
import { ValidationError } from "@/lib/errors";
import { agentRequestSchema } from "@/lib/validators/agent";
import { startAgentJob } from "@/server/agent-service";
import { errorResponse, preflight, successJson } from "@/lib/route-helpers";

// POST /api/v1/agent — start a lead/data harvesting run. Async; poll
// GET /api/v1/agent/:id for status + the record table.
export async function POST(req: Request) {
  try {
    const { userId, apiKeyId, planTier } = await requireApiKey(req);
    await preflight(userId, planTier);

    const rawBody = await req.json().catch(() => {
      throw new ValidationError({ reason: "Invalid JSON body" });
    });
    const input = agentRequestSchema.parse(rawBody);

    const { jobId, creditsReserved } = await startAgentJob({
      userId,
      apiKeyId,
      input,
    });

    return await successJson(
      {
        success: true,
        jobId,
        url: `/api/v1/agent/${jobId}`,
        creditsReserved,
      },
      { userId, creditsUsed: creditsReserved },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
