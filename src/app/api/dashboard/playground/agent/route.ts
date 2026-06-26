import { z } from "zod";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/session-auth";
import { ValidationError, toJsonError } from "@/lib/errors";
import { agentRequestSchema } from "@/lib/validators/agent";
import { startAgentJob } from "@/server/agent-service";

// POST /api/dashboard/playground/agent — session-authed agent run.
export async function POST(req: Request) {
  try {
    const { userId } = await requireSession();

    const rawBody = await req.json().catch(() => {
      throw new ValidationError({ reason: "Invalid JSON body" });
    });
    const input = agentRequestSchema.parse(rawBody);

    const apiKey = await db.apiKey.findFirst({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    const { jobId, creditsReserved } = await startAgentJob({
      userId,
      apiKeyId: apiKey?.id ?? null,
      input: { ...input, integration: input.integration ?? "playground" },
    });

    return Response.json({ success: true, jobId, creditsReserved });
  } catch (err) {
    if (err instanceof z.ZodError) {
      const { body, status } = toJsonError(new ValidationError(err.issues));
      return Response.json(body, { status });
    }
    const { body, status } = toJsonError(err);
    return Response.json(body, { status });
  }
}
