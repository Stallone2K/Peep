import { requireSession } from "@/lib/session-auth";
import { toJsonError, ValidationError } from "@/lib/errors";
import {
  saveYouTubeSession,
  getYouTubeSession,
  clearYouTubeSession,
} from "@/server/youtube/session";

// GET — is a YouTube session connected?
export async function GET() {
  try {
    const { userId } = await requireSession();
    const s = await getYouTubeSession(userId);
    return Response.json({ success: true, connected: !!s, count: s?.length ?? 0 });
  } catch (err) {
    const { body, status } = toJsonError(err);
    return Response.json(body, { status });
  }
}

// POST { cookies } — save the user's YouTube cookies (header string or
// cookies.txt). Stored encrypted.
export async function POST(req: Request) {
  try {
    const { userId } = await requireSession();
    const { cookies } = (await req.json().catch(() => ({}))) as {
      cookies?: string;
    };
    if (typeof cookies !== "string" || !cookies.trim()) {
      throw new ValidationError({ reason: "cookies string required" });
    }
    const count = await saveYouTubeSession(userId, cookies);
    return Response.json({ success: true, count });
  } catch (err) {
    const { body, status } = toJsonError(err);
    return Response.json(body, { status });
  }
}

// DELETE — disconnect.
export async function DELETE() {
  try {
    const { userId } = await requireSession();
    await clearYouTubeSession(userId);
    return Response.json({ success: true });
  } catch (err) {
    const { body, status } = toJsonError(err);
    return Response.json(body, { status });
  }
}
