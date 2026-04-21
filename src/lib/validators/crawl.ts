import { z } from "zod";

import { urlSchema, cursorSchema, boundedString } from "@/lib/validators/common";
import { scrapeRequestSchema } from "@/lib/validators/scrape";

// Crawl request — Firecrawl parity. `includePaths`/`excludePaths` are
// regexes (strings, compiled later), NOT globs — this matches the
// upstream contract. Everything else is straightforward scope knobs.
//
// `scrapeOptions` piggybacks on the scrape validator so child jobs
// honour the same formats / onlyMainContent / timeouts.

export const crawlRequestSchema = z.object({
  url: urlSchema,

  // Natural-language description of what to crawl. If present, Gemini
  // translates it into includePaths / excludePaths / limit etc. The
  // translation is merged UNDER the user's explicit fields so
  // caller-specified values always win.
  prompt: boundedString(1, 2_000).optional(),

  // Scope
  limit: z.number().int().positive().max(50_000).default(10_000),
  maxDiscoveryDepth: z.number().int().positive().max(10).optional(),

  // Path regex filters
  includePaths: z.array(z.string().max(2_000)).max(50).optional(),
  excludePaths: z.array(z.string().max(2_000)).max(50).optional(),
  regexOnFullURL: z.boolean().default(false),

  // Origin rules
  crawlEntireDomain: z.boolean().default(false),
  allowSubdomains: z.boolean().default(false),
  allowExternalLinks: z.boolean().default(false),

  // Normalization
  ignoreQueryParameters: z.boolean().default(false),
  // Firecrawl-parity: collapse query-param variants / trailing-slash
  // duplicates on the dedup side even if we keep them in the fetched
  // URL. Default true, matching upstream.
  deduplicateSimilarURLs: z.boolean().default(true),

  // Robots.txt behaviour — mirrors Firecrawl's crawl-level toggles.
  // `ignoreRobotsTxt` translates into `respectRobotsTxt: false` on
  // every child scrape; the route boundary still gates this to paid
  // tiers. `robotsUserAgent` overrides the default PeepBot UA.
  ignoreRobotsTxt: z.boolean().default(false),
  robotsUserAgent: z.string().max(200).optional(),

  // Pacing
  delay: z.number().nonnegative().max(60).default(0),
  maxConcurrency: z.number().int().positive().max(50).default(5),

  // File handling
  allowBinaryFormats: z.boolean().default(false),

  // Sitemap handling: include = try sitemap + BFS, skip = BFS only,
  // only = sitemap only (no BFS expansion from links).
  sitemap: z.enum(["include", "skip", "only"]).default("include"),

  // Child scrape options — reuse the existing scrape validator. These
  // apply to every fetched URL. We strip `url` because it's redundant
  // at the crawl level.
  scrapeOptions: scrapeRequestSchema.omit({ url: true }).partial().optional(),

  // Integration tag for analytics (§11.18)
  integration: z.string().max(64).optional(),

  // Optional webhook URL (Phase 6B wires the emitter)
  webhook: z
    .object({
      url: urlSchema,
      secret: z.string().max(200).optional(),
      events: z
        .array(
          z.enum([
            "crawl.started",
            "crawl.page",
            "crawl.completed",
            "crawl.failed",
          ]),
        )
        .optional(),
    })
    .optional(),
});

export type CrawlRequestInput = z.infer<typeof crawlRequestSchema>;

// GET /api/v1/crawl/:id paginates via a Postgres cursor (ScrapeJob.id
// is a cuid, which sorts lexicographically in creation order — safe to
// use as an opaque cursor token).
export const crawlStatusQuerySchema = z.object({
  next: cursorSchema,
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export type CrawlStatusQueryInput = z.infer<typeof crawlStatusQuerySchema>;
