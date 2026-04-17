import { z } from "zod";

import { urlSchema } from "@/lib/validators/common";

// /api/v1/map — synchronous URL discovery. Combines sitemap + a
// shallow BFS from the homepage. No child scrape jobs are created; the
// only product is a list of URLs.

export const mapRequestSchema = z.object({
  url: urlSchema,

  // Fuzzy path filter — only keep URLs whose pathname contains this
  // string (case-insensitive substring match).
  search: z.string().max(200).optional(),

  // Up to 50k URLs per call, default 5k.
  limit: z.number().int().positive().max(50_000).default(5_000),

  // Default: same registrable domain (www.example.com + example.com
  // collapse to one). Set true to include *.example.com too.
  includeSubdomains: z.boolean().default(false),

  // Sitemap handling — same semantics as /crawl. Default includes.
  sitemap: z.enum(["include", "skip", "only"]).default("include"),

  // Whether to ignore the query string when deduping URLs.
  ignoreQueryParameters: z.boolean().default(true),
});

export type MapRequestInput = z.infer<typeof mapRequestSchema>;
