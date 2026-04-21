import { z } from "zod";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/session-auth";
import { ValidationError, toJsonError } from "@/lib/errors";
import { searchRequestSchema } from "@/lib/validators/search";
import { performSearchForUser } from "@/server/search-service";

// POST /api/dashboard/playground/search
// Session-authed mirror of /api/v1/search. Same pipeline, same
// credit / cache rules — just without requiring a Bearer token.
export async function POST(req: Request) {
  try {
    const { userId } = await requireSession();

    const rawBody = await req.json().catch(() => {
      throw new ValidationError({ reason: "Invalid JSON body" });
    });
    const input = searchRequestSchema.parse(rawBody);

    const apiKey = await db.apiKey.findFirst({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    const { results, creditsUsed, cached } = await performSearchForUser({
      userId,
      apiKeyId: apiKey?.id ?? null,
      input: { ...input, integration: input.integration ?? "playground" },
    });

    return Response.json({
      success: true,
      data: results,
      creditsUsed,
      cached,
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
