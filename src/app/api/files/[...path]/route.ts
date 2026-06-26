import { readArtifact, verifyKeyToken } from "@/lib/storage";

// GET /api/files/<key>?token=... — serves a stored artifact (screenshot, raw
// HTML) off local disk after verifying the HMAC token. Replaces R2 signed
// URLs. Runs in the Node.js runtime (fs) and is dynamic by default (reads the
// request) — no route segment configs (cacheComponents rejects them).
export async function GET(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path } = await ctx.params;
  const key = path.join("/");
  const token = new URL(req.url).searchParams.get("token") ?? "";

  if (!verifyKeyToken(key, token)) {
    return new Response("Forbidden", { status: 403 });
  }

  const file = await readArtifact(key);
  if (!file) return new Response("Not Found", { status: 404 });

  const headers: Record<string, string> = {
    "content-type": file.contentType,
    "cache-control": "private, max-age=3600",
  };
  if (file.gzip) headers["content-encoding"] = "gzip";

  return new Response(new Uint8Array(file.body), { headers });
}
