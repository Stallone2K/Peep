import { z } from "zod";

import {
  webhookUrlSchema,
  boundedString,
} from "@/lib/validators/common";

// /api/v1/extract request schema. Mirrors Firecrawl v2 extractOptions
// (see §11.8 in PLAN.md). Either `urls` or `prompt` must be present —
// enforced in the refine below.

const urlPatternSchema = z
  .string()
  .refine((v) => {
    // Accept either a plain URL or a wildcard pattern like
    // "https://example.com/*". We don't validate the wildcard
    // against the base URL schema since `*` isn't a valid URL char.
    if (v.includes("*")) {
      const withoutStar = v.replace(/\*/g, "x");
      try {
        new URL(withoutStar);
        return true;
      } catch {
        return false;
      }
    }
    try {
      new URL(v);
      return /^https?:\/\//i.test(v);
    } catch {
      return false;
    }
  }, "Must be a valid http(s) URL, optionally with a * wildcard");

export const extractRequestSchema = z
  .object({
    urls: z.array(urlPatternSchema).max(10).optional(),
    prompt: boundedString(1, 10_000).optional(),
    systemPrompt: boundedString(1, 10_000).optional(),
    schema: z.any().optional(),

    // NOTE: the wildcard-crawl options `limit` / `ignoreSitemap` /
    // `includeSubdomains` / `allowExternalLinks` and `enableWebSearch`
    // were REMOVED (PARITY 🔴 dead-params): wildcard URL expansion +
    // web-search augmentation aren't implemented (resolveUrls just
    // strips the trailing `/*`), so they were parsed and ignored.
    // Re-add each together with the feature that consumes it.

    // Per-URL scrape options (optional)
    scrapeOptions: z.record(z.string(), z.any()).optional(),

    // Analytics tag
    integration: z.string().max(64).optional(),

    // Async mode
    async: z.boolean().default(false),

    // Optional webhook — fires extract.completed / extract.failed when
    // the async job finishes (emitted by runExtractJob).
    webhook: z
      .object({
        url: webhookUrlSchema,
        secret: z.string().max(200).optional(),
        events: z
          .array(z.enum(["extract.completed", "extract.failed"]))
          .optional(),
      })
      .optional(),

    // Return source URLs next to each field
    showSources: z.boolean().default(false),
    urlTrace: z.boolean().default(false),
    ignoreInvalidURLs: z.boolean().default(true),
  })
  .refine((v) => !!(v.urls?.length || v.prompt), {
    message: "Either 'urls' or 'prompt' is required",
  });

export type ExtractRequestInput = z.infer<typeof extractRequestSchema>;
