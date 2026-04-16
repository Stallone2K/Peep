import { z } from "zod";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/session-auth";
import { ValidationError, toJsonError } from "@/lib/errors";
import { scrapeRequestSchema } from "@/lib/validators/scrape";
import { performScrapeForUser } from "@/server/scrape-service";

// POST /api/dashboard/playground/scrape
// Session-authed wrapper around the same scrape pipeline as
// /api/v1/scrape. Uses the user's most recent active API key for
// attribution (so Activity Logs + dashboard widgets see the call),
// but does NOT require the caller to paste a Bearer token.
export async function POST(req: Request) {
  try {
    const { userId } = await requireSession();

    const rawBody = await req.json().catch(() => {
      throw new ValidationError({ reason: "Invalid JSON body" });
    });
    const input = scrapeRequestSchema.parse(rawBody);

    // Best-effort attribution. Playground calls work fine without a
    // key — apiKeyId stays null.
    const apiKey = await db.apiKey.findFirst({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    const result = await performScrapeForUser({
      userId,
      apiKeyId: apiKey?.id ?? null,
      input: { ...input, integration: input.integration ?? "playground" },
    });

    return Response.json({
      success: true,
      data: result.data,
      jobId: result.jobId,
      creditsUsed: result.creditsUsed,
      cached: result.cached,
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
