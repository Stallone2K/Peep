import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 is S3-compatible. The endpoint is derived from the
// account ID: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (_client) return _client;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 credentials missing (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)");
  }
  _client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return _client;
}

function bucket(): string {
  return process.env.R2_BUCKET || "peep";
}

// Upload a screenshot buffer. Returns the R2 key.
export async function uploadScreenshot(
  jobId: string,
  buf: Buffer,
  opts: { format?: "jpeg" | "png" } = {},
): Promise<string> {
  const ext = opts.format === "png" ? "png" : "jpg";
  const contentType = opts.format === "png" ? "image/png" : "image/jpeg";
  const key = `screenshots/${jobId}.${ext}`;

  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: buf,
      ContentType: contentType,
    }),
  );
  return key;
}

// Upload gzipped raw HTML. Returns the R2 key.
export async function uploadRawHtml(
  jobId: string,
  html: string,
): Promise<string> {
  const key = `html/${jobId}.html.gz`;
  const { gzipSync } = await import("node:zlib");
  const compressed = gzipSync(Buffer.from(html, "utf-8"));

  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: compressed,
      ContentType: "text/html",
      ContentEncoding: "gzip",
    }),
  );
  return key;
}

// Generate a short-lived signed URL for reading a stored object.
export async function getR2SignedUrl(
  key: string,
  ttlSeconds = 3600,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucket(),
    Key: key,
  });
  return getSignedUrl(getClient(), command, { expiresIn: ttlSeconds });
}

// Check if R2 credentials are configured. Used by the scrape service
// to decide whether to upload to R2 or fall back to Postgres bytea.
export function isR2Configured(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY
  );
}
