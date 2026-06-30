import { requireApiKey } from "@/lib/api-auth";
import {
  bodyHash,
  lookupIdempotent,
  storeIdempotent,
} from "@/lib/idempotency";
import { ValidationError } from "@/lib/errors";
import { scrapeRequestSchema } from "@/lib/validators/scrape";
import { performScrapeForUser } from "@/server/scrape-service";
import {
  canOverrideRobots,
  errorResponse,
  preflight,
  successJson,
} from "@/lib/route-helpers";

// POST /api/v1/scrape — Bearer-authed public endpoint.
export async function POST(req: Request) {
  try {
    const { userId, apiKeyId, planTier } = await requireApiKey(req);
    await preflight(userId, planTier);

    const rawBody = await req.json().catch(() => {
      throw new ValidationError({ reason: "Invalid JSON body" });
    });
    const input = scrapeRequestSchema.parse(rawBody);

    // Paid-tier gate for robots.txt bypass — silently coerce back to
    // true for FREE/HOBBY so devs don't get surprise 403s.
    if (input.respectRobotsTxt === false && !canOverrideRobots(planTier)) {
      input.respectRobotsTxt = true;
    }

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

    return await successJson(responseBody, {
      userId,
      creditsUsed: result.creditsUsed,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
