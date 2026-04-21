import { z } from "zod";

import { boundedString } from "@/lib/validators/common";
import { scrapeRequestSchema } from "@/lib/validators/scrape";

// POST /api/v1/search — Firecrawl-parity surface. `tbs` passes through
// Google's `qdr:*` syntax (translated to Brave's `freshness` internally).
// `scrapeOptions` enriches the top results — each one goes through the
// normal scrape pipeline (robots.txt, credits, AI formats) and the
// markdown/html/metadata get attached to the result.

export const searchRequestSchema = z.object({
  query: boundedString(1, 500),

  limit: z.number().int().positive().max(20).default(10),

  // Locale
  country: z.string().length(2).optional(),
  lang: z.string().max(10).optional(),
  // Free-form location — Firecrawl's search validator accepts a
  // plain-text locale hint ("San Francisco, CA"). We accept it for
  // shape parity; providers that can act on it (Brave's
  // `search_region`, SerpAPI's `location`) will consume it later.
  location: z.string().max(200).optional(),

  // Firecrawl pass-through — mirrors Google's "time-based search"
  // string (qdr:h / qdr:d / qdr:w / qdr:m / qdr:y).
  tbs: z.string().max(64).optional(),

  // Source-side filter expression — Brave's `result_filter` etc.
  // Accepted for forward-compat; the DDG fallback ignores it.
  filter: z.string().max(500).optional(),

  sources: z
    .array(z.enum(["web", "news", "images"]))
    .min(1)
    .max(3)
    .default(["web"]),

  // Optional enrichment — when set, each result URL runs through the
  // scrape pipeline and the output is merged into the result.
  scrapeOptions: scrapeRequestSchema.omit({ url: true }).partial().optional(),

  // Per-request provider timeout (ms). Falls back to provider default.
  timeout: z.number().int().positive().max(120_000).optional(),

  // When true + scrapeOptions is set, enrichment runs in the
  // background and the response returns immediately with the search
  // hits. Currently accepted for API parity but always runs sync —
  // wiring the async path is a post-launch follow-on.
  asyncScraping: z.boolean().default(false),

  integration: z.string().max(64).optional(),
});

export type SearchRequestInput = z.infer<typeof searchRequestSchema>;
