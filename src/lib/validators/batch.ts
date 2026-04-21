import { z } from "zod";

import { urlSchema, cursorSchema } from "@/lib/validators/common";
import { scrapeRequestSchema } from "@/lib/validators/scrape";

// POST /api/v1/batch/scrape — fires N scrape children in parallel.
// Shape mirrors Firecrawl's v1 batch API so SDK callers migrate 1:1.
// Credits are debited per child (the scrape worker handles surcharges
// when it runs), with one "batch.completed" webhook at the end.

// `urls` accepts loose strings when ignoreInvalidURLs is true so the
// filtering logic at the route boundary can drop bad entries instead
// of 422-ing the whole request. Strict URL validation kicks in at
// runtime after that filter.
const looseUrlList = z.array(z.string().max(2_000)).min(1).max(1_000);

export const batchScrapeRequestSchema = z.object({
  urls: looseUrlList,

  // Applied to every child scrape. We strip `url` since it's the per-
  // entry element, not a batch-level parameter.
  scrapeOptions: scrapeRequestSchema.omit({ url: true }).partial().optional(),

  integration: z.string().max(64).optional(),

  // Firecrawl-parity additions (§11.11). `appendToId` points at an
  // existing BatchJob for the same user; children are added to that
  // job's tally instead of creating a new one. `ignoreInvalidURLs`
  // (default true) filters non-http(s) / malformed URLs before
  // enqueue rather than 422-ing. `maxConcurrency` is stored on the
  // BatchJob but not yet enforced at the worker level — BullMQ
  // scales per-queue, not per-batch; a future follow-on can add a
  // per-batch semaphore if needed.
  appendToId: z.string().cuid().optional(),
  ignoreInvalidURLs: z.boolean().default(true),
  maxConcurrency: z.number().int().positive().max(100).optional(),

  webhook: z
    .object({
      url: urlSchema,
      secret: z.string().max(200).optional(),
      events: z
        .array(z.enum(["batch.page", "batch.completed", "batch.failed"]))
        .optional(),
    })
    .optional(),
});

export type BatchScrapeRequestInput = z.infer<typeof batchScrapeRequestSchema>;

export const batchStatusQuerySchema = z.object({
  next: cursorSchema,
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export type BatchStatusQueryInput = z.infer<typeof batchStatusQuerySchema>;
