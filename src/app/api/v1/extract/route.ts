import { requireApiKey } from "@/lib/api-auth";
import { ValidationError } from "@/lib/errors";
import { extractRequestSchema } from "@/lib/validators/extract";
import {
  bodyHash,
  lookupIdempotent,
  storeIdempotent,
} from "@/lib/idempotency";
import { startExtractJob } from "@/server/extract-service";
import { errorResponse, preflight, successJson } from "@/lib/route-helpers";

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

    // Idempotency-Key (optional) — shield against accidental double-
    // submit of expensive multi-URL extract jobs.
    const idempotencyKey = req.headers.get("idempotency-key");
    if (idempotencyKey) {
      const hit = await lookupIdempotent({
        userId,
        key: idempotencyKey,
        hash: bodyHash(rawBody),
      });
      if (hit && "conflict" in hit) {
        throw new ValidationError({
          reason: "Idempotency key reused with a different body",
        });
      }
      if (hit) return Response.json(hit.body, { status: hit.status });
    }

    const input = extractRequestSchema.parse(rawBody);

    const { jobId, creditsReserved } = await startExtractJob({
      userId,
      apiKeyId,
      input,
    });

    const responseBody = {
      success: true as const,
      jobId,
      url: `/api/v1/extract/${jobId}`,
      creditsReserved,
    };

    if (idempotencyKey) {
      await storeIdempotent({
        userId,
        key: idempotencyKey,
        hash: bodyHash(rawBody),
        statusCode: 200,
        responseBody,
      });
    }

    return await successJson(responseBody, {
      userId,
      creditsUsed: creditsReserved,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
