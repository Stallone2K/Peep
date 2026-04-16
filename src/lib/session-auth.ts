import { auth } from "@/lib/auth";
import { UnauthorizedError } from "@/lib/errors";

// Helper for dashboard API routes (/api/dashboard/*) that runs inside
// a NextAuth session (cookie-based), not a Bearer token. Throws
// UnauthorizedError so the route handler's catch can turn it into a
// canonical JSON error.
export async function requireSession(): Promise<{ userId: string }> {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  return { userId: session.user.id };
}
