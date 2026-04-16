import { db } from "@/lib/db";
import { requireSession } from "@/lib/session-auth";
import { NotFoundError, toJsonError } from "@/lib/errors";

// DELETE /api/dashboard/api-keys/:id
// Soft-revoke. Sets revokedAt rather than deleting the row so the
// audit trail (who had which key, when) survives.
//
// Returns 404 (not 403) when a user tries to revoke another user's
// key — enumeration protection: the caller can't distinguish "this id
// doesn't exist" from "exists but isn't yours".
export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireSession();
    const { id } = await context.params;

    // updateMany returns a count — zero means either the row doesn't
    // exist OR it belongs to a different user. Treat both as 404.
    const result = await db.apiKey.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (result.count === 0) {
      // Could also mean "already revoked" — still return 404 to keep
      // the response identical for callers.
      throw new NotFoundError("API key");
    }

    return Response.json({ success: true });
  } catch (err) {
    const { body, status } = toJsonError(err);
    return Response.json(body, { status });
  }
}
