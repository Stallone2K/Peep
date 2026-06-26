import { debitCredits } from "@/lib/credits";
import { fetchPage } from "@/server/scraper/fetcher";
import { extractLinks } from "@/server/scraper/links";
import { discoverSitemap } from "@/server/crawl/sitemap";
import { normalizeUrl, hasBinaryExtension } from "@/server/crawl/filters";
import type { MapRequestInput } from "@/lib/validators/map";

// Shared /map pipeline used by both the v1 Bearer-authed endpoint
// and the dashboard playground's session-authed wrapper. Flat 1
// credit per call regardless of how many URLs come back — same rule
// Firecrawl ships.

export type MapServiceResult = {
  links: string[];
};

export async function performMapForUser({
  userId,
  input,
}: {
  userId: string;
  input: MapRequestInput;
}): Promise<MapServiceResult> {
  // Charge up-front. If the sitemap + shallow fetch both fail, the
  // caller still "used" the quota — matches Firecrawl's behaviour.
  await debitCredits(userId, 1, { reason: "map", refType: "MapCall" });

  const rootUrl = new URL(input.url);
  const rootOrigin = rootUrl.origin;
  const rootHost = rootUrl.hostname.toLowerCase();
  const collected = new Set<string>();

  const add = (raw: string) => {
    if (collected.size >= input.limit) return;
    const normalized = normalizeUrl(raw, {
      ignoreQueryParameters: input.ignoreQueryParameters,
    });
    if (!normalized) return;

    try {
      const u = new URL(normalized);
      const host = u.hostname.toLowerCase();
      if (input.includeSubdomains) {
        if (!hostIsSameRegistrable(host, rootHost)) return;
      } else {
        if (host !== rootHost) return;
      }
      if (hasBinaryExtension(normalized)) return;

      if (input.search) {
        const needle = input.search.toLowerCase();
        const haystack = (u.pathname + u.search).toLowerCase();
        if (!haystack.includes(needle)) return;
      }
    } catch {
      return;
    }

    collected.add(normalized);
  };

  if (input.sitemap !== "skip") {
    const discovery = await discoverSitemap(input.url);
    for (const u of discovery.urls) {
      add(u);
      if (collected.size >= input.limit) break;
    }
  }

  if (input.sitemap !== "only" && collected.size < input.limit) {
    try {
      const fetched = await fetchPage(rootOrigin, { timeoutMs: 15_000 });
      if (fetched.statusCode < 400) {
        const links = extractLinks(fetched.bodyText, fetched.finalUrl);
        for (const link of links) {
          add(link);
          if (collected.size >= input.limit) break;
        }
      }
    } catch {
      /* sitemap may already have given us plenty */
    }
    add(input.url); // ensure root itself is present
  }

  // Subdomain discovery via certificate-transparency logs (crt.sh — free,
  // keyless). The sitemap + homepage rarely link to other subdomains, so
  // without this `includeSubdomains` finds almost none. Each discovered
  // subdomain is surfaced as its root URL.
  if (input.includeSubdomains && collected.size < input.limit) {
    const registrable = rootHost.split(".").slice(-2).join(".");
    const subs = await discoverSubdomains(registrable);
    for (const host of subs) {
      add(`https://${host}/`);
      if (collected.size >= input.limit) break;
    }
  }

  return { links: Array.from(collected) };
}

// Query crt.sh for every hostname that's ever had a TLS cert issued under the
// registrable domain. Returns bare subdomain hosts (wildcards/garbage dropped).
async function discoverSubdomains(registrable: string): Promise<string[]> {
  const url = `https://crt.sh/?q=${encodeURIComponent("%." + registrable)}&output=json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "PeepBot/1.0", accept: "application/json" },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{ name_value?: string }>;
    const hosts = new Set<string>();
    for (const row of data) {
      for (const name of (row.name_value ?? "").split("\n")) {
        const h = name.trim().toLowerCase().replace(/^\*\./, "");
        if (!h || h.includes("*") || h.includes(" ") || h.includes("@")) continue;
        if (h === registrable || h.endsWith("." + registrable)) hosts.add(h);
      }
    }
    return Array.from(hosts);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// Minimal eTLD+1 comparator — matches server/crawl/filters so /map
// and /crawl agree on "same site".
function hostIsSameRegistrable(a: string, b: string): boolean {
  const parts = (h: string) => h.split(".").slice(-2).join(".");
  return parts(a) === parts(b);
}
