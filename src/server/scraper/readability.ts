import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";

export type ReadabilityOutput = {
  title: string | null;
  byline: string | null;
  excerpt: string | null;
  content: string; // Readability-cleaned HTML (main content)
  textContent: string;
  length: number;
  lang: string | null;
  siteName: string | null;
};

// Parse a page through Mozilla's Readability on top of linkedom
// (linkedom is ~10x faster than jsdom for pure parse; Readability
// needs a DOM-ish Document, linkedom's satisfies it). Returns null
// when Readability fails (typical on doc index pages, checkout flows,
// etc.) — callers should fall back to serving the original HTML.
export function extractReadable(
  html: string,
  baseUrl: string,
): ReadabilityOutput | null {
  const { document } = parseHTML(html);

  // Readability expects a `documentURI` for resolving relative URLs.
  // linkedom doesn't set it by default.
  Object.defineProperty(document, "documentURI", {
    value: baseUrl,
    configurable: true,
  });
  Object.defineProperty(document, "location", {
    value: new URL(baseUrl),
    configurable: true,
  });

  try {
    const reader = new Readability(document as unknown as Document, {
      keepClasses: false,
    });
    const parsed = reader.parse();
    if (!parsed) return null;
    return {
      title: parsed.title ?? null,
      byline: parsed.byline ?? null,
      excerpt: parsed.excerpt ?? null,
      content: parsed.content ?? "",
      textContent: parsed.textContent ?? "",
      length: parsed.length ?? 0,
      lang: parsed.lang ?? null,
      siteName: parsed.siteName ?? null,
    };
  } catch {
    return null;
  }
}

// Extract metadata (title, description, OG tags, lang) straight off
// the raw DOM — doesn't require Readability to succeed. Used
// alongside or instead of readability output.
export function extractMetadata(
  html: string,
  finalUrl: string,
  statusCode: number,
): Record<string, unknown> {
  const { document } = parseHTML(html);
  const getMeta = (selector: string) =>
    document
      .querySelector(selector)
      ?.getAttribute("content")
      ?.trim() || undefined;

  return {
    url: finalUrl,
    statusCode,
    title: document.querySelector("title")?.textContent?.trim() || undefined,
    description:
      getMeta('meta[name="description"]') ||
      getMeta('meta[property="og:description"]'),
    language: document.documentElement?.getAttribute("lang") || undefined,
    keywords: getMeta('meta[name="keywords"]'),
    ogTitle: getMeta('meta[property="og:title"]'),
    ogDescription: getMeta('meta[property="og:description"]'),
    ogImage: getMeta('meta[property="og:image"]'),
    ogType: getMeta('meta[property="og:type"]'),
    siteName: getMeta('meta[property="og:site_name"]'),
  };
}

// Sanitize HTML by re-parsing and stripping elements the caller
// asked to remove. Also optionally strips chrome nodes (nav, footer,
// aside, script, style) when `onlyMainContent` is on AND Readability
// failed — gives something reasonable to ship as `html` format.
export function sanitizeHtml(
  html: string,
  opts: {
    includeTags?: string[];
    excludeTags?: string[];
    onlyMainContent?: boolean;
    onlyCleanContent?: boolean;
    removeBase64Images?: boolean;
  },
): string {
  const { document } = parseHTML(html);

  // Strip scripts and styles always — they shouldn't travel to the
  // caller regardless of tag filters.
  document.querySelectorAll("script, style, noscript").forEach((el) => el.remove());

  if (opts.onlyMainContent) {
    document.querySelectorAll("nav, footer, aside").forEach((el) => el.remove());
  }

  if (opts.onlyCleanContent) {
    // Stricter — also strip ads, overlays, cookie banners, skip
    // links. Common selectors only; not exhaustive.
    const chrome = [
      "header",
      "nav",
      "footer",
      "aside",
      ".ad",
      "[class*=cookie]",
      "[id*=cookie]",
      "[aria-label*=advert]",
      "[role=banner]",
      "[role=contentinfo]",
    ];
    document.querySelectorAll(chrome.join(",")).forEach((el) => el.remove());
  }

  if (opts.removeBase64Images) {
    document
      .querySelectorAll('img[src^="data:"]')
      .forEach((el) => el.remove());
  }

  if (opts.excludeTags?.length) {
    for (const sel of opts.excludeTags) {
      document.querySelectorAll(sel).forEach((el) => el.remove());
    }
  }

  if (opts.includeTags?.length) {
    // When includeTags is set, only keep elements matching those
    // selectors. We build a new root and clone matches into it.
    const keep: Element[] = [];
    for (const sel of opts.includeTags) {
      document.querySelectorAll(sel).forEach((el) => keep.push(el));
    }
    return keep.map((el) => el.outerHTML).join("\n");
  }

  // Prefer body.innerHTML for a full document. But a FRAGMENT (e.g.
  // Readability's `.content`, a bare `<div>…`) parses with an empty
  // <body> in linkedom — `??` won't catch that since innerHTML is ""
  // not null — so fall back to serializing the whole document. Without
  // this, sanitizing readable content would return an empty string.
  const bodyHtml = document.body?.innerHTML ?? "";
  return bodyHtml.trim() ? bodyHtml : document.toString();
}
