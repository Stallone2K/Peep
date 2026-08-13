import { randomUUID, createHmac } from "node:crypto";

import { webhookQueue } from "@/lib/queue";
import { assertSafeUrl } from "@/server/scraper/ssrf";

// Webhook targets must be https (set WEBHOOK_ALLOW_HTTP=true to relax
// for local receivers) and must not resolve to private address space —
// a webhook pointed at 169.254.169.254 / an internal service is a
// server-side request the attacker controls, carrying scraped data.
export function webhookRequiresHttps(): boolean {
  return process.env.WEBHOOK_ALLOW_HTTP !== "true";
}

// Webhook emitter — enqueues a delivery onto the `webhook` BullMQ
// queue. The worker signs + POSTs the body; BullMQ handles retries
// (5 attempts, exponential backoff per queue config).
//
// Why a queue: webhook receivers go down, are slow, or rate-limit us.
// Anything synchronous inline inside the crawl/batch worker would
// stall the hot path. The queue decouples delivery from completion.

export type WebhookEvent =
  // Crawl lifecycle
  | "crawl.started"
  | "crawl.page"
  | "crawl.completed"
  | "crawl.failed"
  // Batch lifecycle
  | "batch.page"
  | "batch.completed"
  | "batch.failed"
  // Extract lifecycle (Phase 5 — forward-compat)
  | "extract.completed"
  | "extract.failed";

export type WebhookPayload = {
  deliveryId: string; // unique per delivery; receivers should dedupe on this
  event: WebhookEvent;
  createdAt: string; // ISO timestamp
  data: Record<string, unknown>;
};

export type WebhookDelivery = {
  url: string;
  secret: string | null; // falls back to WEBHOOK_SIGNING_SECRET
  payload: WebhookPayload;
  userId: string;
  refType?: "CrawlJob" | "BatchJob" | "ExtractJob";
  refId?: string;
};

// Enqueue a webhook. Safe to call fire-and-forget from inside worker
// code — no throw on Redis hiccup, the error is logged and the event
// is dropped. Callers should keep their own completion markers in the
// DB so a lost webhook isn't a lost record.
export async function emitWebhook({
  url,
  secret,
  event,
  data,
  userId,
  refType,
  refId,
}: {
  url: string;
  secret?: string | null;
  event: WebhookEvent;
  data: Record<string, unknown>;
  userId: string;
  refType?: "CrawlJob" | "BatchJob" | "ExtractJob";
  refId?: string;
}): Promise<void> {
  // SSRF check at enqueue time (H1). The worker re-validates at
  // delivery time too — DNS can change between the two.
  try {
    await assertSafeUrl(url, { requireHttps: webhookRequiresHttps() });
  } catch (err) {
    console.error("[webhook] unsafe delivery URL — dropped", {
      event,
      url,
      err: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  const deliveryId = randomUUID();
  const payload: WebhookPayload = {
    deliveryId,
    event,
    createdAt: new Date().toISOString(),
    data,
  };

  const delivery: WebhookDelivery = {
    url,
    secret: secret ?? null,
    payload,
    userId,
    refType,
    refId,
  };

  try {
    await webhookQueue().add(`webhook-${deliveryId}`, delivery);
  } catch (err) {
    console.error("[webhook] enqueue failed", {
      event,
      url,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

// HMAC-SHA256 signature. We sign `<timestamp>.<body>` so replay
// attackers can't reuse an old signed body — the timestamp is part of
// the signed payload and the receiver is expected to reject stale
// deltas (5-minute window is a reasonable default).
export function signWebhook(
  body: string,
  timestamp: string,
  secret: string,
): string {
  const mac = createHmac("sha256", secret);
  mac.update(`${timestamp}.${body}`);
  return `sha256=${mac.digest("hex")}`;
}

// Resolve the signing secret for a delivery. Per-webhook secrets win
// over the global WEBHOOK_SIGNING_SECRET fallback. Returns null when
// neither is configured — callers must then omit the Peep-Signature
// header entirely rather than signing with a placeholder (Stripe-
// style: no secret → no signature, receiver either accepts unsigned
// deliveries or rejects them, but never fails HMAC verification on a
// dummy).
export function resolveSecret(delivery: WebhookDelivery): string | null {
  return delivery.secret ?? process.env.WEBHOOK_SIGNING_SECRET ?? null;
}
