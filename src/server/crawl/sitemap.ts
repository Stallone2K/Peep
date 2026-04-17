import { XMLParser } from "fast-xml-parser";
import robotsParser from "robots-parser";

import { fetchPage } from "@/server/scraper/fetcher";

// Sitemap discovery — fetches /sitemap.xml + /sitemap_index.xml and
// follows any sitemaps advertised in /robots.txt. Handles both the
// <urlset> and <sitemapindex> root types (Google sitemaps.org protocol)
// and silently degrades on 404 / malformed XML — a missing sitemap is
// expected for a big share of sites.

const MAX_SITEMAP_DEPTH = 3; // sitemapindex → sitemapindex → urlset
const MAX_URLS_PER_CRAWL = 50_000; // hard cap to guard against sitemap bombs

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
});

export type SitemapDiscoveryResult = {
  urls: string[];
  sources: string[]; // which sitemap URLs we actually read from
  robotsTxtSitemaps: string[];
};

export async function discoverSitemap(
  siteUrl: string,
): Promise<SitemapDiscoveryResult> {
  const origin = new URL(siteUrl).origin;
  const seen = new Set<string>();
  const found = new Set<string>();
  const sources: string[] = [];

  // 1) robots.txt — grab any Sitemap: entries
  const robotsTxtSitemaps = await readRobotsSitemaps(origin);

  // 2) seed with default locations + robots.txt entries
  const seeds = [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    ...robotsTxtSitemaps,
  ];

  for (const seed of seeds) {
    await walkSitemap(seed, seen, found, sources, 0);
    if (found.size >= MAX_URLS_PER_CRAWL) break;
  }

  return {
    urls: Array.from(found).slice(0, MAX_URLS_PER_CRAWL),
    sources,
    robotsTxtSitemaps,
  };
}

async function walkSitemap(
  sitemapUrl: string,
  seen: Set<string>,
  found: Set<string>,
  sources: string[],
  depth: number,
): Promise<void> {
  if (depth > MAX_SITEMAP_DEPTH) return;
  if (seen.has(sitemapUrl)) return;
  seen.add(sitemapUrl);
  if (found.size >= MAX_URLS_PER_CRAWL) return;

  let body: string;
  try {
    const res = await fetchPage(sitemapUrl, { timeoutMs: 15_000 });
    if (res.statusCode >= 400) return;
    body = res.bodyText;
  } catch {
    return;
  }

  let parsed: unknown;
  try {
    parsed = xml.parse(body);
  } catch {
    return;
  }

  const root = parsed as Record<string, unknown>;

  // <sitemapindex> → recurse
  const indexNode = root.sitemapindex as
    | { sitemap?: unknown }
    | undefined;
  if (indexNode?.sitemap) {
    sources.push(sitemapUrl);
    const children = asArray(indexNode.sitemap);
    for (const child of children) {
      const loc = extractLoc(child);
      if (loc) await walkSitemap(loc, seen, found, sources, depth + 1);
      if (found.size >= MAX_URLS_PER_CRAWL) return;
    }
    return;
  }

  // <urlset> → collect leaf URLs
  const urlsetNode = root.urlset as { url?: unknown } | undefined;
  if (urlsetNode?.url) {
    sources.push(sitemapUrl);
    const entries = asArray(urlsetNode.url);
    for (const entry of entries) {
      const loc = extractLoc(entry);
      if (loc) found.add(loc);
      if (found.size >= MAX_URLS_PER_CRAWL) return;
    }
  }
}

async function readRobotsSitemaps(origin: string): Promise<string[]> {
  const robotsUrl = `${origin}/robots.txt`;
  try {
    const res = await fetchPage(robotsUrl, { timeoutMs: 10_000 });
    if (res.statusCode >= 400) return [];
    const parser = robotsParser(robotsUrl, res.bodyText);
    return parser.getSitemaps();
  } catch {
    return [];
  }
}

function extractLoc(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  const locField = (node as Record<string, unknown>).loc;
  if (typeof locField === "string") return locField.trim();
  if (
    locField &&
    typeof locField === "object" &&
    "#text" in (locField as Record<string, unknown>)
  ) {
    const txt = (locField as Record<string, unknown>)["#text"];
    return typeof txt === "string" ? txt.trim() : null;
  }
  return null;
}

function asArray<T>(v: T | T[]): T[] {
  return Array.isArray(v) ? v : [v];
}
