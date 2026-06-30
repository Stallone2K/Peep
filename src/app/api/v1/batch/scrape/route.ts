import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/api-auth";
import { scrapeQueue } from "@/lib/queue";
import { batchScrapeRequestSchema } from "@/lib/validators/batch";
import {
  bodyHash,
  lookupIdempotent,
  storeIdempotent,
} from "@/lib/idempotency";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { ScrapeJobData } from "@/workers/scrape.worker";
import type { ScrapeRequestInput } from "@/lib/validators/scrape";
import { scrapeRequestSchema } from "@/lib/validators/scrape";
import { errorResponse, preflight, successJson } from "@/lib/route-helpers";

// POST /api/v1/batch/scrape
// Parallel scrape of N URLs. Creates a BatchJob + N ScrapeJob
// children, enqueues each onto the `scrape` queue, returns
// { jobId, url, total }. Credits are debited by the scrape worker
// per child — creating the batch is free (parity with /crawl).
export async function POST(req: Request) {
  try {
    const { userId, apiKeyId, planTier } = await requireApiKey(req);
    await preflight(userId, planTier);

    const rawBody = await req.json().catch(() => {
      throw new ValidationError({ reason: "Invalid JSON body" });
    });

    // Idempotency-Key (optional) — same 24h shield as the scrape
    // route. Matters more here because a double-submitted batch
    // against a large URL list is expensive.
    const idempotencyKey = req.headers.get("idempotency-key");
    if (idempotencyKey) {
      const hit = await lookupIdempotent({
        userId,
        key: idempotencyKey,
        hash: bodyHash(rawBody),
      });
      if (hit && "conflict" in hit) {
        throw new ValidationError({
          reason: "Idempotency key reused with a different body",
        });
      }
      if (hit) return Response.json(hit.body, { status: hit.status });
    }

    const input = batchScrapeRequestSchema.parse(rawBody);

    // Partition URLs into valid / invalid. `ignoreInvalidURLs` (default
    // true, Firecrawl parity) drops malformed entries rather than
    // 422-ing the whole call; `false` surfaces them as a hard error.
    const partitioned = partitionUrls(input.urls);
    if (!input.ignoreInvalidURLs && partitioned.invalid.length > 0) {
      throw new ValidationError({
        reason: "One or more URLs are invalid",
        invalid: partitioned.invalid,
      });
    }
    if (partitioned.valid.length === 0) {
      throw new ValidationError({
        reason: "No valid URLs supplied",
        invalid: partitioned.invalid,
      });
    }

    // Either append to an existing batch or spin up a new one.
    let batchJob = input.appendToId
      ? await db.batchJob.findFirst({
          where: { id: input.appendToId, userId },
        })
      : null;
    if (input.appendToId && !batchJob) {
      throw new NotFoundError("Batch job");
    }
    if (!batchJob) {
      batchJob = await db.batchJob.create({
        data: {
          userId,
          apiKeyId,
          total: partitioned.valid.length,
          options: input as never,
          status: "QUEUED",
          webhookUrl: input.webhook?.url ?? null,
          webhookSecret: input.webhook?.secret ?? null,
          integration: input.integration,
        },
      });
    } else {
      // Appending — bump the total count atomically so the scrape
      // worker's rollUpBatch still fires batch.completed correctly
      // once every child (old + new) finishes.
      batchJob = await db.batchJob.update({
        where: { id: batchJob.id },
        data: { total: { increment: partitioned.valid.length } },
      });
    }

    // Build child defaults once from the scrape options on this batch.
    const childOptionsDefaults = scrapeRequestSchema.parse({
      url: partitioned.valid[0],
      ...(input.scrapeOptions ?? {}),
    });

    const childrenData = partitioned.valid.map((url) => ({
      userId,
      apiKeyId,
      batchJobId: batchJob!.id,
      url,
      options: { ...childOptionsDefaults, url } as never,
      status: "QUEUED" as const,
      creditsUsed: 1,
      integration: input.integration,
    }));

    await db.scrapeJob.createMany({ data: childrenData });

    // Only enqueue the children we just inserted — filter by URL list
    // so a large existing batch doesn't re-enqueue its old children.
    const created = await db.scrapeJob.findMany({
      where: {
        batchJobId: batchJob.id,
        url: { in: partitioned.valid },
        status: "QUEUED",
      },
      select: { id: true, url: true },
    });

    for (const child of created) {
      const jobData: ScrapeJobData = {
        scrapeJobId: child.id,
        input: { ...childOptionsDefaults, url: child.url } as ScrapeRequestInput,
      };
      await scrapeQueue().add(`scrape-${child.id}`, jobData, {
        jobId: child.id,
      });
    }

    const origin = new URL(req.url).origin;
    const responseBody = {
      success: true as const,
      jobId: batchJob.id,
      url: `${origin}/api/v1/batch/scrape/${batchJob.id}`,
      total: batchJob.total,
      added: partitioned.valid.length,
      invalidURLs:
        partitioned.invalid.length > 0 ? partitioned.invalid : undefined,
    };

    if (idempotencyKey) {
      await storeIdempotent({
        userId,
        key: idempotencyKey,
        hash: bodyHash(rawBody),
        statusCode: 200,
        responseBody,
      });
    }

    // Batch creation is free — children debit 1 credit each as they
    // run — so no creditsUsed header here; just surface the balance.
    return await successJson(responseBody, { userId });
  } catch (err) {
    return errorResponse(err);
  }
}

function partitionUrls(urls: string[]): {
  valid: string[];
  invalid: string[];
} {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const raw of urls) {
    try {
      const u = new URL(raw);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        invalid.push(raw);
        continue;
      }
      const host = u.hostname.toLowerCase();
      if (
        host === "localhost" ||
        host === "0.0.0.0" ||
        host === "::1" ||
        host.endsWith(".localhost")
      ) {
        invalid.push(raw);
        continue;
      }
      valid.push(raw);
    } catch {
      invalid.push(raw);
    }
  }
  return { valid, invalid };
}
