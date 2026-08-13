import { fetchPage } from "@/server/scraper/fetcher";
import {
  extractReadable,
  extractMetadata,
  sanitizeHtml,
} from "@/server/scraper/readability";
import { htmlToMarkdown } from "@/server/scraper/turndown";
import { extractImages, extractLinks } from "@/server/scraper/links";
import type { ScrapeRequestInput } from "@/lib/validators/scrape";

export type ScrapeOutput = {
  markdown?: string;
  html?: string;
  rawHtml?: string;
  links?: string[];
  images?: string[];
  screenshot?: null; // Phase 4 wires the real capture
  screenshotUnavailable?: string;
  // JS-requiring / AI formats (parsed but rejected in Phase 3)
  jsonUnavailable?: string;
  summaryUnavailable?: string;
  brandingUnavailable?: string;
  attributesUnavailable?: string;
  changeTrackingUnavailable?: string;
  metadata: Record<string, unknown>;
  pageStatus: number;
  durationMs: number;
};

type DeferredFormat =
  | "screenshot"
  | "json"
  | "summary"
  | "branding"
  | "attributes"
  | "changeTracking";

const REQUIRES_JS: DeferredFormat[] = [
  "screenshot",
  "json",
  "summary",
  "branding",
  "attributes",
  "changeTracking",
];

export async function runScrape(
  input: ScrapeRequestInput,
): Promise<ScrapeOutput> {
  const start = Date.now();

  const fetched = await fetchPage(input.url, {
    timeoutMs: input.timeout,
    headers: input.headers,
    skipTlsVerification: input.skipTlsVerification,
    languages: input.languages,
    country: input.country,
  });

  const baseUrl = fetched.finalUrl;
  const html = fetched.bodyText;
  const statusCode = fetched.statusCode;

  const wantedTypes = new Set(input.formats.map((f) => f.type));
  const output: ScrapeOutput = {
    metadata: extractMetadata(html, baseUrl, statusCode),
    pageStatus: statusCode,
    durationMs: Date.now() - start,
  };

  const readable = extractReadable(html, baseUrl);

  // ─── markdown ───────────────────────────────────────────────
  if (wantedTypes.has("markdown")) {
    const sourceHtml =
      input.onlyMainContent && readable
        ? readable.content
        : sanitizeHtml(html, {
            includeTags: input.includeTags,
            excludeTags: input.excludeTags,
            onlyMainContent: input.onlyMainContent,
            onlyCleanContent: input.onlyCleanContent,
            removeBase64Images: input.removeBase64Images,
          });
    output.markdown = htmlToMarkdown(sourceHtml);
  }

  // ─── html (sanitized) ───────────────────────────────────────
  if (wantedTypes.has("html")) {
    output.html =
      input.onlyMainContent && readable
        ? readable.content
        : sanitizeHtml(html, {
            includeTags: input.includeTags,
            excludeTags: input.excludeTags,
            onlyMainContent: input.onlyMainContent,
            onlyCleanContent: input.onlyCleanContent,
            removeBase64Images: input.removeBase64Images,
          });
  }

  // ─── rawHtml (untouched) ────────────────────────────────────
  if (wantedTypes.has("rawHtml")) {
    output.rawHtml = html;
  }

  // ─── links ──────────────────────────────────────────────────
  if (wantedTypes.has("links")) {
    output.links = extractLinks(html, baseUrl);
  }

  // ─── images ─────────────────────────────────────────────────
  if (wantedTypes.has("images")) {
    output.images = extractImages(html, baseUrl);
  }

  // ─── Formats that need a rendered browser or an LLM ─────────
  // We parse them so forward-compatible clients don't 422, but we
  // set an explicit "unavailable" flag instead of producing
  // wrong-looking data. Phase 4 wires screenshot; Phase 5 wires JSON
  // extraction and friends.
  for (const t of REQUIRES_JS) {
    if (!wantedTypes.has(t)) continue;
    const msg = REQUIRES_JS.includes(t)
      ? "Requires JS rendering — available in Phase 4 (proxy:stealth) or Phase 5 (AI formats)."
      : "Not yet implemented.";
    switch (t) {
      case "screenshot":
        output.screenshot = null;
        output.screenshotUnavailable = msg;
        break;
      case "json":
        output.jsonUnavailable = msg;
        break;
      case "summary":
        output.summaryUnavailable = msg;
        break;
      case "branding":
        output.brandingUnavailable = msg;
        break;
      case "attributes":
        output.attributesUnavailable = msg;
        break;
      case "changeTracking":
        output.changeTrackingUnavailable = msg;
        break;
    }
  }

  // Merge Readability bits into metadata when useful.
  if (readable) {
    output.metadata = {
      ...output.metadata,
      readabilityTitle: readable.title,
      byline: readable.byline,
      excerpt: readable.excerpt,
      lang: readable.lang,
      readableLength: readable.length,
    };
  }

  output.durationMs = Date.now() - start;
  return output;
}
