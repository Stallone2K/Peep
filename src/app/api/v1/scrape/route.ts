import { z } from "zod";

import { requireApiKey } from "@/lib/api-auth";
import {
  bodyHash,
  lookupIdempotent,
  storeIdempotent,
} from "@/lib/idempotency";
import { ValidationError, toJsonError } from "@/lib/errors";
import { scrapeRequestSchema } from "@/lib/validators/scrape";
import { performScrapeForUser } from "@/server/scrape-service";

// POST /api/v1/scrape — Bearer-authed public endpoint.
export async function POST(req: Request) {
  try {
    const { userId, apiKeyId } = await requireApiKey(req);

    const rawBody = await req.json().catch(() => {
      throw new ValidationError({ reason: "Invalid JSON body" });
    });
    const input = scrapeRequestSchema.parse(rawBody);

    // Idempotency-Key (optional) — 24h Postgres-backed dedup
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

    const result = await performScrapeForUser({
      userId,
      apiKeyId,
      input,
    });

    const responseBody = {
      success: true as const,
      data: result.data,
      jobId: result.jobId,
      creditsUsed: result.creditsUsed,
      cached: result.cached,
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

    return Response.json(responseBody);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const { body, status } = toJsonError(new ValidationError(err.issues));
      return Response.json(body, { status });
    }
    const { body, status } = toJsonError(err);
    return Response.json(body, { status });
  }
}
