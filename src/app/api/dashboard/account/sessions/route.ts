import { cookies } from "next/headers";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/session-auth";
import { errorResponse } from "@/lib/route-helpers";

async function currentSessionToken(): Promise<string | null> {
  const c = await cookies();
  return (
    c.get("authjs.session-token")?.value ??
    c.get("__Secure-authjs.session-token")?.value ??
    null
  );
}

// DELETE /api/dashboard/account/sessions — revoke every OTHER session
// (log out all other devices), keeping the caller's current one.
export async function DELETE() {
  try {
    const { userId } = await requireSession();
    const cur = await currentSessionToken();
    const { count } = await db.session.deleteMany({
      where: { userId, NOT: { sessionToken: cur ?? "__none__" } },
    });
    return Response.json({ success: true, revoked: count });
  } catch (err) {
    return errorResponse(err);
  }
}
