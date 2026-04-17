import { z } from "zod";

import { requireApiKey } from "@/lib/api-auth";
import { ValidationError, toJsonError } from "@/lib/errors";
import { extractRequestSchema } from "@/lib/validators/extract";
import { startExtractJob } from "@/server/extract-service";

// POST /api/v1/extract
// Bearer-authed. Enqueues an extract job (scrape-then-extract pipeline).
// Returns { jobId, url } for async polling via GET /api/v1/extract/:id.
export async function POST(req: Request) {
  try {
    const { userId, apiKeyId } = await requireApiKey(req);

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
    if (err instanceof z.ZodError) {
      const { body, status } = toJsonError(new ValidationError(err.issues));
      return Response.json(body, { status });
    }
    const { body, status } = toJsonError(err);
    return Response.json(body, { status });
  }
}
