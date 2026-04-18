import { z } from "zod";

import { requireSession } from "@/lib/session-auth";
import { ValidationError, toJsonError } from "@/lib/errors";
import { mapRequestSchema } from "@/lib/validators/map";
import { performMapForUser } from "@/server/map-service";

// POST /api/dashboard/playground/map
// Session-authed mirror of /api/v1/map. Lets the Map playground run
// without asking the user to paste their Bearer key — same pipeline,
// same 1-credit debit, same ScrapeJob-style attribution.
export async function POST(req: Request) {
  try {
    const { userId } = await requireSession();

    const rawBody = await req.json().catch(() => {
      throw new ValidationError({ reason: "Invalid JSON body" });
    });
    const input = mapRequestSchema.parse(rawBody);

    const { links } = await performMapForUser({ userId, input });
    return Response.json({ success: true, links });
  } catch (err) {
    if (err instanceof z.ZodError) {
      const { body, status } = toJsonError(new ValidationError(err.issues));
      return Response.json(body, { status });
    }
    const { body, status } = toJsonError(err);
    return Response.json(body, { status });
  }
}
