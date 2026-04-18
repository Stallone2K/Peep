import type {
  Freshness,
  SearchOptions,
  SearchProvider,
  SearchResult,
  SearchSource,
} from "@/server/search/provider";

// Brave Search API adapter. Brave's REST endpoints are per-source
// (`/res/v1/web/search`, `/news/search`, `/images/search`), so when
// the caller asks for multiple sources we fan out in parallel and
// merge the results server-side.
//
// Auth: X-Subscription-Token header from BRAVE_SEARCH_API_KEY.
// Free tier: 1 QPS, 2k queries/month — enough for dev; upgrade for
// production traffic.

const BRAVE_BASE = "https://api.search.brave.com/res/v1";
const FETCH_TIMEOUT_MS = 10_000;

export class BraveSearchProvider implements SearchProvider {
  readonly name = "brave";

  isConfigured(): boolean {
    return !!process.env.BRAVE_SEARCH_API_KEY;
  }

  async search(opts: SearchOptions): Promise<SearchResult[]> {
    if (!this.isConfigured()) {
      throw new Error(
        "Search provider not configured (BRAVE_SEARCH_API_KEY missing)",
      );
    }

    // Brave's per-source `count` maxes at 20. If the caller wants
    // N results and asked for multiple sources, we divide evenly so
    // we don't overspend the monthly quota on a single call.
    const perSource = Math.min(
      Math.max(Math.ceil(opts.limit / opts.sources.length), 1),
      20,
    );

    const batches = await Promise.all(
      opts.sources.map((source) =>
        this.fetchSource(source, { ...opts, limit: perSource }),
      ),
    );
    // Merge and cap at the requested total; preserve source order so
    // web results show before news etc., matching Firecrawl's shape.
    const merged = batches.flat().slice(0, opts.limit);
    return merged;
  }

  private async fetchSource(
    source: SearchSource,
    opts: SearchOptions,
  ): Promise<SearchResult[]> {
    const url = new URL(`${BRAVE_BASE}/${source}/search`);
    url.searchParams.set("q", opts.query);
    url.searchParams.set("count", String(opts.limit));
    if (opts.country) url.searchParams.set("country", opts.country);
    if (opts.lang) url.searchParams.set("search_lang", opts.lang);
    const freshness = freshnessToBrave(opts.freshness);
    if (freshness) url.searchParams.set("freshness", freshness);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url.toString(), {
        signal: controller.signal,
        headers: {
          "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY!,
          Accept: "application/json",
          "Accept-Encoding": "gzip",
        },
      });

      if (!res.ok) {
        throw new Error(
          `Brave ${source} search returned ${res.status}: ${await res.text().catch(() => "")}`,
        );
      }

      const data = (await res.json()) as unknown;
      return parseBraveResponse(data, source);
    } finally {
      clearTimeout(timer);
    }
  }
}

function freshnessToBrave(f: Freshness | undefined): string | undefined {
  switch (f) {
    case "hour":
    case "day":
      return "pd";
    case "week":
      return "pw";
    case "month":
      return "pm";
    case "year":
      return "py";
    default:
      return undefined;
  }
}

// Brave's web and news responses differ in nesting — web wraps its
// list under `web.results`, news exposes `results` directly, and
// images nests thumbnails differently. Normalise all three into our
// neutral SearchResult shape.
function parseBraveResponse(raw: unknown, source: SearchSource): SearchResult[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as Record<string, unknown>;
  const out: SearchResult[] = [];

  if (source === "web") {
    const web = r.web as { results?: unknown[] } | undefined;
    const list = Array.isArray(web?.results) ? web!.results : [];
    for (const item of list) {
      const entry = item as Record<string, unknown>;
      const url = entry.url as string | undefined;
      const title = entry.title as string | undefined;
      if (!url || !title) continue;
      out.push({
        url,
        title,
        description: entry.description as string | undefined,
        source: "web",
        age: entry.age as string | undefined,
      });
    }
    return out;
  }

  if (source === "news") {
    const list = Array.isArray(r.results) ? r.results : [];
    for (const item of list) {
      const entry = item as Record<string, unknown>;
      const url = entry.url as string | undefined;
      const title = entry.title as string | undefined;
      if (!url || !title) continue;
      out.push({
        url,
        title,
        description: entry.description as string | undefined,
        source: "news",
        age: entry.age as string | undefined,
        publishedAt: entry.page_age as string | undefined,
      });
    }
    return out;
  }

  // images
  const list = Array.isArray(r.results) ? r.results : [];
  for (const item of list) {
    const entry = item as Record<string, unknown>;
    const url = entry.url as string | undefined;
    const title = entry.title as string | undefined;
    if (!url || !title) continue;
    const thumb = entry.thumbnail as { src?: string } | undefined;
    const props = entry.properties as { url?: string } | undefined;
    out.push({
      url,
      title,
      source: "images",
      thumbnail: thumb?.src,
      imageUrl: props?.url,
    });
  }
  return out;
}
