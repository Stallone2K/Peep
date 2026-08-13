import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { db } from "@/lib/db";
import { InvalidApiKeyError } from "@/lib/errors";

// Key format: `peep_live_<43 url-safe base64 chars>` (32 random bytes).
// 32 bytes ≈ 256 bits of entropy — collision-resistant and CSPRNG-safe.
const KEY_PREFIX = "peep_live_";
const RANDOM_BYTES = 32;

// How many characters of the random segment we keep in `prefix` for UI
// display. The full prefix column stored in the DB is
// `peep_live_XXXXXXXX` (18 chars total).
const PREFIX_RANDOM_LEN = 8;

export type GeneratedKey = {
  full: string;
  prefix: string;
  hash: string;
};

export function generateApiKey(): GeneratedKey {
  const randomSegment = randomBytes(RANDOM_BYTES).toString("base64url");
  const full = `${KEY_PREFIX}${randomSegment}`;
  const prefix = `${KEY_PREFIX}${randomSegment.slice(0, PREFIX_RANDOM_LEN)}`;
  const hash = hashApiKey(full);
  return { full, prefix, hash };
}

export function hashApiKey(full: string): string {
  return createHash("sha256").update(full).digest("hex");
}

// Pull the Bearer token out of an Authorization header and reject
// anything that doesn't match the expected shape *without* hitting the DB.
export function extractBearer(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1]!.trim();
  if (!token.startsWith(KEY_PREFIX)) return null;
  return token;
}

// Constant-time comparison of two hex-encoded SHA-256 hashes.
// Both inputs are fixed-length (64 chars) so length mismatches are not
// possible under normal usage — still guard against programmer error.
export function safeCompareHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

// Verify a raw API key string against the ApiKey table. Returns the
// owning user + key id, bumps lastUsedAt in the background. Throws
// InvalidApiKeyError on any failure path so callers don't have to
// distinguish between "missing", "revoked", and "unknown".
export async function verifyApiKey(raw: string): Promise<{
  userId: string;
  apiKeyId: string;
  teamId: string | null;
}> {
  if (!raw.startsWith(KEY_PREFIX)) throw new InvalidApiKeyError();

  const hashed = hashApiKey(raw);
  const record = await db.apiKey.findFirst({
    where: { hashedKey: hashed },
    select: {
      id: true,
      userId: true,
      teamId: true,
      hashedKey: true,
      revokedAt: true,
    },
  });
  if (!record) throw new InvalidApiKeyError();
  if (record.revokedAt) throw new InvalidApiKeyError();

  // Redundant constant-time check in case two keys ever share a hash
  // (statistically impossible with 256-bit entropy, but cheap to keep).
  if (!safeCompareHex(record.hashedKey, hashed)) throw new InvalidApiKeyError();

  // Fire-and-forget lastUsedAt bump. Failure here must not reject the
  // request — at worst we drop a usage-tracking write, never auth.
  void db.apiKey
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { userId: record.userId, apiKeyId: record.id, teamId: record.teamId };
}
