import { Worker, Job } from "bullmq";
import { fetch as undiciFetch } from "undici";

import { getRedisConnection } from "@/lib/queue";
import {
  resolveSecret,
  signWebhook,
  webhookRequiresHttps,
  type WebhookDelivery,
} from "@/lib/webhooks";
import {
  assertSafeUrl,
  createPinnedDispatcher,
} from "@/server/scraper/ssrf";

const CONCURRENCY = Number(process.env.WEBHOOK_CONCURRENCY ?? "4");
const DELIVERY_TIMEOUT_MS = 10_000;

// Webhook delivery worker. Runs one HTTP POST per job with the signed
// body + Peep-* headers. Throws on 5xx / network errors so BullMQ's
// retry policy (5 attempts, exponential backoff) kicks in. 4xx (other
// than 408/429) is a terminal failure — the receiver has rejected the
// payload shape and retrying won't help.

export function startWebhookWorker() {
  const worker = new Worker<WebhookDelivery>(
    "webhook",
    async (job: Job<WebhookDelivery>) => {
      const delivery = job.data;
      const body = JSON.stringify(delivery.payload);
      const timestamp = delivery.payload.createdAt;
      const secret = resolveSecret(delivery);

      const headers: Record<string, string> = {
        "content-type": "application/json",
        "user-agent": "Peep-Webhooks/1.0",
        "peep-event": delivery.payload.event,
        "peep-delivery-id": delivery.payload.deliveryId,
        "peep-timestamp": timestamp,
      };
      if (secret) {
        headers["peep-signature"] = signWebhook(body, timestamp, secret);
      }

      // SSRF re-check at delivery time (H1) — enqueue-time validation
      // doesn't survive a DNS flip. Pin the socket to the IP that
      // passed, and never follow redirects (a redirect to an internal
      // host is the classic bypass). Terminal failure — retrying a
      // private target won't make it public.
      let safe;
      try {
        safe = await assertSafeUrl(delivery.url, {
          requireHttps: webhookRequiresHttps(),
        });
      } catch (err) {
        console.warn("[webhook] unsafe delivery URL — dropped", {
          url: delivery.url,
          err: err instanceof Error ? err.message : String(err),
        });
        return { delivered: false, status: 0 };
      }

      const dispatcher = createPinnedDispatcher(safe.address, safe.family);
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        DELIVERY_TIMEOUT_MS,
      );
      try {
        const res = await undiciFetch(delivery.url, {
          method: "POST",
          redirect: "manual",
          signal: controller.signal,
          headers,
          body,
          dispatcher,
        });

        if (res.status >= 300 && res.status < 400) {
          // Receiver tried to redirect us — treat as rejection.
          console.warn("[webhook] receiver redirected delivery — dropped", {
            url: delivery.url,
            status: res.status,
          });
          return { delivered: false, status: res.status };
        }

        if (res.status >= 500 || res.status === 408 || res.status === 429) {
          throw new Error(
            `Webhook delivery returned ${res.status} — will retry`,
          );
        }
        if (!res.ok) {
          // 4xx: receiver rejected us. Don't retry — log and drop.
          console.warn("[webhook] receiver rejected delivery", {
            url: delivery.url,
            event: delivery.payload.event,
            status: res.status,
          });
          return { delivered: false, status: res.status };
        }

        return { delivered: true, status: res.status };
      } finally {
        clearTimeout(timer);
        await dispatcher.close().catch(() => {});
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: CONCURRENCY,
    },
  );

  worker.on("failed", (job, err) => {
    console.error(
      `[webhook-worker] Job ${job?.id} failed (attempt ${job?.attemptsMade}):`,
      err.message,
    );
  });

  worker.on("completed", (job) => {
    console.log(
      `[webhook-worker] ${job.data.payload.event} → ${job.data.url} delivered`,
    );
  });

  console.log(`[webhook-worker] Started with concurrency=${CONCURRENCY}`);
  return worker;
}
