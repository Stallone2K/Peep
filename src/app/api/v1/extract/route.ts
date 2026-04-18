import { requireApiKey } from "@/lib/api-auth";
import { ValidationError } from "@/lib/errors";
import { extractRequestSchema } from "@/lib/validators/extract";
import { startExtractJob } from "@/server/extract-service";
import { errorResponse, preflight } from "@/lib/route-helpers";

// POST /api/v1/extract
// Bearer-authed. Enqueues an extract job (scrape-then-extract pipeline).
// Returns { jobId, url } for async polling via GET /api/v1/extract/:id.
export async function POST(req: Request) {
  try {
    const { userId, apiKeyId, planTier } = await requireApiKey(req);
    await preflight(userId, planTier);

    const rawBody = await req.json().catch(() => {
      throw new ValidationError({ reason: "Invalid JSON body" });
    });
    const input = extractRequestSchema.parse(rawBody);

    const { jobId, creditsReserved } = await startExtractJob({
      userId,
      apiKeyId,
      input,
    });

    return Response.json({
      success: true,
      jobId,
      url: `/api/v1/extract/${jobId}`,
      creditsReserved,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
