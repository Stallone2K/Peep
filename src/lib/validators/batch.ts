import { z } from "zod";

import { urlSchema, cursorSchema } from "@/lib/validators/common";
import { scrapeRequestSchema } from "@/lib/validators/scrape";

// POST /api/v1/batch/scrape — fires N scrape children in parallel.
// Shape mirrors Firecrawl's v1 batch API so SDK callers migrate 1:1.
// Credits are debited per child (the scrape worker handles surcharges
// when it runs), with one "batch.completed" webhook at the end.

export const batchScrapeRequestSchema = z.object({
  urls: z.array(urlSchema).min(1).max(1_000),

  // Applied to every child scrape. We strip `url` since it's the per-
  // entry element, not a batch-level parameter.
  scrapeOptions: scrapeRequestSchema.omit({ url: true }).partial().optional(),

  integration: z.string().max(64).optional(),

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
