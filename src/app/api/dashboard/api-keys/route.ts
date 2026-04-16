import { z } from "zod";

import { db } from "@/lib/db";
import { generateApiKey } from "@/lib/api-key";
import { requireSession } from "@/lib/session-auth";
import { createApiKeySchema } from "@/lib/validators/api-key";
import { ValidationError, toJsonError } from "@/lib/errors";

// GET /api/dashboard/api-keys
// List every API key belonging to the signed-in user. Never leaks the
// SHA-256 hash back to the browser.
export async function GET() {
  try {
    const { userId } = await requireSession();
    const keys = await db.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastUsedAt: true,
        createdAt: true,
        revokedAt: true,
      },
    });
    return Response.json({ success: true, data: keys });
  } catch (err) {
    const { body, status } = toJsonError(err);
    return Response.json(body, { status });
  }
}

// POST /api/dashboard/api-keys
// Create a new key. The plaintext is returned exactly ONCE in this
// response body (used by the dashboard to show a one-time reveal
// modal). After this, only the prefix + hash survive server-side.
export async function POST(req: Request) {
  try {
    const { userId } = await requireSession();
    const body = createApiKeySchema.parse(await req.json());

    const { full, prefix, hash } = generateApiKey();

    const key = await db.apiKey.create({
      data: {
        userId,
        name: body.name,
        prefix,
        hashedKey: hash,
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastUsedAt: true,
        createdAt: true,
        revokedAt: true,
      },
    });

    return Response.json(
      {
        success: true,
        data: {
          ...key,
          // Shown once, never persisted in plaintext — the consumer
          // must store it now or create a new key.
          plaintext: full,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      const { body, status } = toJsonError(new ValidationError(err.issues));
      return Response.json(body, { status });
    }
    const { body, status } = toJsonError(err);
    return Response.json(body, { status });
  }
}
