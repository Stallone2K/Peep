import { z } from "zod";

import { urlSchema, boundedString } from "@/lib/validators/common";

// Firecrawl-parity scrape request. Keeps the Phase 3 surface to what
// the HTTP-only path can actually honour — JS-only params (actions,
// stealth proxy escalation, screenshots beyond a placeholder) parse
// fine so clients written against Phase 4 don't break, but Phase 3's
// worker will return a typed `unavailable` hint for formats that need
// a rendered browser.

// ─── Format objects ───────────────────────────────────────────────
// Only the non-JS formats land fully in Phase 3. JS-dependent formats
// (json/summary/branding/changeTracking/audio/attributes/query) are
// parsed but rejected at runtime with a clear error until Phase 5
// (AI) / Phase 4 (rendering) wire them.

const markdownFormat = z.object({ type: z.literal("markdown") });
const htmlFormat = z.object({ type: z.literal("html") });
const rawHtmlFormat = z.object({ type: z.literal("rawHtml") });
const linksFormat = z.object({ type: z.literal("links") });
const imagesFormat = z.object({ type: z.literal("images") });

const screenshotFormat = z.object({
  type: z.literal("screenshot"),
  fullPage: z.boolean().default(false),
  quality: z.number().min(1).max(100).optional(),
  viewport: z
    .object({
      width: z.number().int().positive().max(7680),
      height: z.number().int().positive().max(4320),
    })
    .optional(),
});

// Deferred (Phase 5) formats — parsed for forward-compat, rejected at
// runtime. Kept permissive so we can ship the Phase 3 validator today
// and tighten the contract when the feature lands.
const jsonFormat = z.object({
  type: z.literal("json"),
  schema: z.any().optional(),
  prompt: boundedString(1, 10_000).optional(),
});
const summaryFormat = z.object({ type: z.literal("summary") });
const brandingFormat = z.object({ type: z.literal("branding") });
// `audio` transcribes the page's audio track (YouTube / any
// yt-dlp-supported site / a direct audio-or-video file) to text via
// the pluggable whisper engine (see server/scraper/audio.ts).
// `language` is an optional ISO-639-1 hint that skips auto-detect;
// `timestamps` (default true) controls whether per-segment start/end
// times are returned alongside the flat transcript.
//
// Status: "Coming Soon" — fully implemented but gated behind
// AUDIO_FORMAT_ENABLED. While off, the format is accepted (no 422) but
// returns a coming-soon hint and is NOT charged. Flip the flag to ship.
const audioFormat = z.object({
  type: z.literal("audio"),
  language: z.string().min(2).max(10).optional(),
  timestamps: z.boolean().default(true),
});
// NOTE: the `query` format was REMOVED (PARITY 🔴): it was accepted AND
// billed +4 credits but had no runtime handler. Re-add to this union
// (plus the surcharge in scrape-service computeCredits) only together
// with a real producer in strategy.ts.
const attributesFormat = z.object({
  type: z.literal("attributes"),
  selectors: z.array(
    z.object({ selector: z.string(), attribute: z.string() }),
  ),
});
const changeTrackingFormat = z.object({
  type: z.literal("changeTracking"),
  prompt: z.string().optional(),
  schema: z.any().optional(),
  modes: z.array(z.enum(["json", "git-diff"])).default([]),
  tag: z.string().nullable().default(null),
});

const formatObject = z.union([
  markdownFormat,
  htmlFormat,
  rawHtmlFormat,
  linksFormat,
  imagesFormat,
  screenshotFormat,
  jsonFormat,
  summaryFormat,
  brandingFormat,
  audioFormat,
  attributesFormat,
  changeTrackingFormat,
]);

// Accept both `"markdown"` and `{type:"markdown"}` shorthand, like
// Firecrawl does.
const formatsField = z
  .array(z.union([z.string(), z.record(z.string(), z.any())]))
  .optional()
  .default([{ type: "markdown" }])
  .transform((arr) =>
    arr.map((f) => (typeof f === "string" ? { type: f } : f)),
  )
  .pipe(
    z
      .array(formatObject)
      .refine(
        (x) => x.filter((f) => f.type === "screenshot").length <= 1,
        "You may only specify one screenshot format",
      )
      .refine((x) => {
        const ct = x.find((f) => f.type === "changeTracking");
        if (!ct) return true;
        return x.some((f) => f.type === "markdown");
      }, "changeTracking format requires markdown to also be in formats"),
  );

// ─── Actions (parsed but rejected in Phase 3) ─────────────────────
const actionObject = z.object({
  type: z.enum([
    "wait",
    "click",
    "screenshot",
    "write",
    "press",
    "scroll",
    "scrape",
    "executeJavascript",
    "pdf",
  ]),
  // Action-specific fields — loose for Phase 3 since we don't run them.
  selector: z.string().optional(),
  milliseconds: z.number().int().positive().optional(),
  all: z.boolean().optional(),
  text: z.string().optional(),
  key: z.string().optional(),
  direction: z.enum(["up", "down"]).optional(),
  script: z.string().optional(),
  fullPage: z.boolean().optional(),
  quality: z.number().optional(),
  viewport: z.object({ width: z.number(), height: z.number() }).optional(),
  landscape: z.boolean().optional(),
  scale: z.number().optional(),
  format: z.string().optional(),
});

// ─── Full scrape request ──────────────────────────────────────────

export const scrapeRequestSchema = z.object({
  url: urlSchema,
  formats: formatsField,

  headers: z.record(z.string(), z.string()).optional(),
  includeTags: z.array(z.string()).optional(),
  excludeTags: z.array(z.string()).optional(),
  onlyMainContent: z.boolean().default(true),
  onlyCleanContent: z.boolean().default(false),
  timeout: z.number().int().positive().min(1000).default(30_000),
  waitFor: z.number().int().nonnegative().max(60_000).default(0),
  mobile: z.boolean().default(false),
  skipTlsVerification: z.boolean().optional(),
  removeBase64Images: z.boolean().default(true),
  fastMode: z.boolean().default(false),
  blockAds: z.boolean().default(true),

  // Parsed for forward-compat. Phase 3 is HTTP-only, so non-"basic"
  // proxy choices are honoured as "pass through" — no stealth yet.
  proxy: z.enum(["basic", "stealth", "enhanced", "auto"]).default("auto"),

  // Location — Firecrawl v2 accepts a nested object; we keep the flat
  // `country`/`languages` for backward compat with early SDK callers
  // and flatten the nested shape into them at the route boundary.
  country: z.string().optional(),
  languages: z.array(z.string()).optional(),
  location: z
    .object({
      country: z.string().optional(),
      languages: z.array(z.string()).optional(),
    })
    .optional(),

  // Actions — Phase 4 only. Parsed for forward-compat.
  actions: z.array(actionObject).max(50).optional(),

  // Top-level extract shorthand (Phase 5 forward-compat). Equivalent to
  // formats:[{type:"json", schema, prompt}] but mirrors Firecrawl's v1
  // shape for SDK callers that expect a top-level `extract` field.
  extract: z
    .object({
      schema: z.any().optional(),
      prompt: boundedString(1, 10_000).optional(),
      systemPrompt: boundedString(1, 10_000).optional(),
    })
    .optional(),

  // Cache control (Phase 3 MVP)
  maxAge: z.number().int().nonnegative().optional(),
  minAge: z.number().int().nonnegative().optional(),
  storeInCache: z.boolean().default(true),

  // Async mode + webhook for async callers
  async: z.boolean().default(false),

  // Analytics tag (§11.18) — optional, e.g. "langchain" / "cli"
  integration: z.string().max(64).optional(),

  // Phase 7 — skip robots.txt honoring. Default true (PeepBot honours
  // robots.txt). Setting this to false is gated to paid plans at the
  // route layer and logged in CreditLedger as `robots_override` so we
  // have an audit trail for compliance.
  respectRobotsTxt: z.boolean().default(true),
});

export type ScrapeRequestInput = z.infer<typeof scrapeRequestSchema>;
