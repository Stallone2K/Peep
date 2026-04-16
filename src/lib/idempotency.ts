import { createHash } from "node:crypto";

import { db } from "@/lib/db";

// 24h idempotency window, matching the Firecrawl upstream default.
const TTL_MS = 24 * 60 * 60 * 1000;

// Hash the full request body so two repeats with the same header but
// different bodies don't collide. We key on (userId, idempotencyKey)
// and additionally verify bodyHash matches — if the body differs the
// caller gets a 422, which signals a client bug.
export function bodyHash(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

export type IdempotencyHit = {
  status: number;
  body: unknown;
};

// Look up a prior response for (userId, key). Returns the cached
// response if the body hash matches, `{ conflict: true }` if the key
// was reused with a different body, or null if this is a fresh call.
export async function lookupIdempotent({
  userId,
  key,
  hash,
}: {
  userId: string;
  key: string;
  hash: string;
}): Promise<IdempotencyHit | { conflict: true } | null> {
  const existing = await db.idempotencyRecord.findUnique({
    where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
  });

  if (!existing) return null;
  if (existing.expiresAt.getTime() < Date.now()) {
    // Stale — remove it so the next insert below succeeds.
    await db.idempotencyRecord.delete({ where: { id: existing.id } });
    return null;
  }
  if (existing.bodyHash !== hash) return { conflict: true };

  return {
    status: existing.statusCode,
    body: existing.responseBody,
  };
}

export async function storeIdempotent({
  userId,
  key,
  hash,
  statusCode,
  responseBody,
}: {
  userId: string;
  key: string;
  hash: string;
  statusCode: number;
  responseBody: unknown;
}): Promise<void> {
  const expiresAt = new Date(Date.now() + TTL_MS);
  await db.idempotencyRecord.upsert({
    where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
    create: {
      userId,
      idempotencyKey: key,
      bodyHash: hash,
      statusCode,
      responseBody: responseBody as never,
      expiresAt,
    },
    update: {
      bodyHash: hash,
      statusCode,
      responseBody: responseBody as never,
      expiresAt,
    },
  });
}
