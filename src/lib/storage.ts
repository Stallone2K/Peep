import { createHmac } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, dirname, normalize } from "node:path";
import { gzipSync } from "node:zlib";

// VPS-local artifact storage — replaces Cloudflare R2. Screenshots and raw
// HTML are written under ARTIFACTS_DIR on local disk and served back through
// the signed `/api/files/<key>` route. Mirrors Daftar's src/lib/storage.ts
// (disk write + HMAC-signed expiring URL). Export names match the old r2.ts so
// the scrape pipeline swaps over with just an import change.

const ARTIFACTS_ROOT =
  process.env.ARTIFACTS_DIR || join(process.cwd(), "artifacts");

const SIGNING_SECRET =
  process.env.WEBHOOK_SIGNING_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  "peep-dev-secret";

async function writeArtifact(key: string, body: Buffer): Promise<string> {
  const abs = join(ARTIFACTS_ROOT, key);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, body);
  return key;
}

// Save a screenshot buffer. Returns the storage key (also stored in
// ScrapeResult.screenshotR2Key — now a disk path, not an R2 key).
export async function uploadScreenshot(
  jobId: string,
  buf: Buffer,
  opts: { format?: "jpeg" | "png" } = {},
): Promise<string> {
  const ext = opts.format === "png" ? "png" : "jpg";
  return writeArtifact(`screenshots/${jobId}.${ext}`, buf);
}

// Save gzipped raw HTML. Returns the storage key.
export async function uploadRawHtml(
  jobId: string,
  html: string,
): Promise<string> {
  const compressed = gzipSync(Buffer.from(html, "utf-8"));
  return writeArtifact(`html/${jobId}.html.gz`, compressed);
}

// Local disk is always available. Kept named `isR2Configured` so the existing
// scrape pipeline call sites work unchanged — local storage means screenshots
// now persist to disk + a signed URL instead of inlining base64.
export function isR2Configured(): boolean {
  return true;
}

// Build a signed, expiring URL served by GET /api/files/<key>.
export async function getR2SignedUrl(
  key: string,
  ttlSeconds = 3600,
): Promise<string> {
  const base = process.env.NEXTAUTH_URL || "http://localhost:3000";
  return `${base}/api/files/${key}?token=${signKey(key, ttlSeconds)}`;
}

export function signKey(key: string, ttlSeconds: number): string {
  const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `${expiry.toString(16)}.${hmac(key, expiry)}`;
}

export function verifyKeyToken(key: string, token: string): boolean {
  try {
    const [expHex, sig] = token.split(".");
    if (!expHex || !sig) return false;
    const expiry = parseInt(expHex, 16);
    if (Math.floor(Date.now() / 1000) > expiry) return false;
    return sig === hmac(key, expiry);
  } catch {
    return false;
  }
}

function hmac(key: string, expiry: number): string {
  return createHmac("sha256", SIGNING_SECRET)
    .update(`${key}:${expiry}`)
    .digest("hex");
}

export type StoredArtifact = {
  body: Buffer;
  contentType: string;
  gzip: boolean;
};

// Read an artifact off disk for the serving route. Rejects path traversal and
// anything resolving outside ARTIFACTS_ROOT.
export async function readArtifact(
  key: string,
): Promise<StoredArtifact | null> {
  if (key.includes("..")) return null;
  const abs = normalize(join(ARTIFACTS_ROOT, key));
  if (!abs.startsWith(normalize(ARTIFACTS_ROOT))) return null;
  try {
    const body = await readFile(abs);
    return { body, contentType: contentTypeOf(key), gzip: key.endsWith(".gz") };
  } catch {
    return null;
  }
}

function contentTypeOf(key: string): string {
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".jpg") || key.endsWith(".jpeg")) return "image/jpeg";
  if (key.endsWith(".html.gz") || key.endsWith(".html"))
    return "text/html; charset=utf-8";
  return "application/octet-stream";
}

export function getArtifactsRoot(): string {
  return ARTIFACTS_ROOT;
}
