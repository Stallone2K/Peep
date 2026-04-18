// Search-provider abstraction. /api/v1/search is provider-agnostic:
// we default to Brave (cheap, first-class API, clean shape) but the
// interface is deliberately narrow so SerpAPI / Tavily / You.com can
// slot in later without touching the route.

export type SearchSource = "web" | "news" | "images";

export type SearchResult = {
  url: string;
  title: string;
  description?: string;
  source: SearchSource;

  // News-specific
  age?: string;
  publishedAt?: string;

  // Image-specific
  thumbnail?: string;
  imageUrl?: string;

  // Enrichment — populated if the route forwarded `scrapeOptions`
  markdown?: string;
  html?: string;
  rawHtml?: string;
  links?: string[];
  metadata?: Record<string, unknown>;
};

// Firecrawl-style freshness filter. Translates to Brave's `freshness`
// or Google's `tbs=qdr:*` depending on the underlying provider.
export type Freshness = "hour" | "day" | "week" | "month" | "year";

export type SearchOptions = {
  query: string;
  limit: number;
  country?: string; // ISO 3166-1 alpha-2, e.g. "us"
  lang?: string; // e.g. "en"
  freshness?: Freshness;
  sources: SearchSource[];
};

export interface SearchProvider {
  readonly name: string;
  isConfigured(): boolean;
  search(opts: SearchOptions): Promise<SearchResult[]>;
}

// Translate Firecrawl's tbs parameter (`qdr:h|d|w|m|y`) into our
// provider-neutral Freshness enum. Returns undefined if the tbs
// string is unknown — caller treats that as "no time filter".
export function tbsToFreshness(tbs: string | undefined): Freshness | undefined {
  if (!tbs) return undefined;
  const match = tbs.match(/qdr:([hdwmy])/i);
  if (!match) return undefined;
  const token = match[1]!.toLowerCase();
  if (token === "h") return "hour";
  if (token === "d") return "day";
  if (token === "w") return "week";
  if (token === "m") return "month";
  if (token === "y") return "year";
  return undefined;
}
