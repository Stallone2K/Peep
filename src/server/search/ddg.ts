import { parseHTML } from "linkedom";

import type {
  SearchOptions,
  SearchProvider,
  SearchResult,
  SearchSource,
} from "@/server/search/provider";

// DuckDuckGo HTML-endpoint adapter. Keyless, no account, no card —
// the tradeoff is we're parsing HTML, not hitting a real API, so the
// selectors can shift underneath us at any time. Good fit for dev +
// private alpha; swap to Brave / Serper when traffic matters.
//
// We POST to html.duckduckgo.com/html/ because the GET variant is
// more aggressively bot-challenged. Results come back as a plain
// HTML listing; each link is wrapped in DDG's /l/?uddg=<target>
// redirect, so we unwrap before handing back to callers.
//
// Sources: DDG's HTML endpoint is web-search-only. If the caller
// asks for `news` or `images`, we silently fall back to `web` rather
// than failing — Phase 7B's interface doesn't require all three.

const DDG_ENDPOINT = "https://html.duckduckgo.com/html/";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 10_000;

export class DuckDuckGoSearchProvider implements SearchProvider {
  readonly name = "duckduckgo";

  // Keyless — always "configured".
  isConfigured(): boolean {
    return true;
  }

  async search(opts: SearchOptions): Promise<SearchResult[]> {
    // DDG HTML only returns web results — collapse news/images into
    // web so callers don't get an empty array for those sources.
    if (!opts.sources.some((s: SearchSource) => s === "web")) {
      return [];
    }

    const form = new URLSearchParams({ q: opts.query });
    if (opts.country) form.set("kl", `${opts.country.toLowerCase()}-${opts.country.toLowerCase()}`);
    if (opts.freshness) {
      // DDG's time-filter codes — d/w/m/y, same as Google's qdr
      const map: Record<string, string> = {
        hour: "d", // DDG has no "hour" bucket; closest is day
        day: "d",
        week: "w",
        month: "m",
        year: "y",
      };
      const code = map[opts.freshness];
      if (code) form.set("df", code);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let html: string;
    try {
      const res = await fetch(DDG_ENDPOINT, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "user-agent": USER_AGENT,
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": opts.lang
            ? `${opts.lang},en;q=0.9`
            : "en-US,en;q=0.9",
          referer: "https://duckduckgo.com/",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      });
      if (!res.ok) {
        throw new Error(`DuckDuckGo returned ${res.status}`);
      }
      html = await res.text();
    } finally {
      clearTimeout(timer);
    }

    return parseDdgHtml(html, opts.limit);
  }
}

function parseDdgHtml(html: string, limit: number): SearchResult[] {
  const { document } = parseHTML(html);
  const out: SearchResult[] = [];

  const nodes = document.querySelectorAll<HTMLElement>(
    "div.result.results_links, div.result.web-result, div.result.results_links_deep",
  );
  for (const node of Array.from(nodes)) {
    if (out.length >= limit) break;

    const titleAnchor = node.querySelector<HTMLAnchorElement>("a.result__a");
    const snippetEl = node.querySelector<HTMLElement>(".result__snippet");
    if (!titleAnchor) continue;

    const rawHref = titleAnchor.getAttribute("href") ?? "";
    const url = unwrapDdgRedirect(rawHref);
    if (!url) continue;

    const title = titleAnchor.textContent?.trim();
    if (!title) continue;

    out.push({
      url,
      title,
      description: snippetEl?.textContent?.trim() || undefined,
      source: "web",
    });
  }

  return out;
}

// DDG wraps every outbound link as `//duckduckgo.com/l/?uddg=<URL-encoded-target>&rut=...`.
// Strip that wrapper so downstream scrape enrichment hits the real page.
function unwrapDdgRedirect(href: string): string | null {
  if (!href) return null;

  // Some result links come back already-absolute (ads, internal
  // boxes) — skip those, we only want organic outbound.
  try {
    const resolved = href.startsWith("//") ? `https:${href}` : href;
    const u = new URL(resolved, "https://duckduckgo.com");

    if (u.hostname === "duckduckgo.com" && u.pathname.startsWith("/l/")) {
      const target = u.searchParams.get("uddg");
      if (!target) return null;
      const decoded = decodeURIComponent(target);
      // Validate it parses as http(s)
      const tu = new URL(decoded);
      if (tu.protocol !== "http:" && tu.protocol !== "https:") return null;
      return tu.toString();
    }

    // Organic direct URL (rare but possible)
    if (u.protocol === "http:" || u.protocol === "https:") {
      if (u.hostname === "duckduckgo.com") return null;
      return u.toString();
    }
  } catch {
    /* malformed href */
  }
  return null;
}
