import { z } from "zod";

import { requireApiKey } from "@/lib/api-auth";
import { debitCredits } from "@/lib/credits";
import { fetchPage } from "@/server/scraper/fetcher";
import { extractLinks } from "@/server/scraper/links";
import { discoverSitemap } from "@/server/crawl/sitemap";
import { normalizeUrl, hasBinaryExtension } from "@/server/crawl/filters";
import { mapRequestSchema } from "@/lib/validators/map";
import { ValidationError, toJsonError } from "@/lib/errors";

// POST /api/v1/map — synchronous URL discovery.
// Combines sitemap (sitemap.xml + robots.txt Sitemap: entries) with a
// shallow crawl (homepage → same-origin anchor hrefs). Never spins up
// BullMQ — runs entirely in the request handler for low latency. Flat
// 1 credit per call regardless of how many URLs come back.
export async function POST(req: Request) {
  try {
    const { userId } = await requireApiKey(req);

    const rawBody = await req.json().catch(() => {
      throw new ValidationError({ reason: "Invalid JSON body" });
    });
    const input = mapRequestSchema.parse(rawBody);

    // Charge up-front (1 credit). If the sitemap + shallow fetch both
    // fail, the caller still "used" the quota — same as Firecrawl.
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

    // 1) Sitemap
    if (input.sitemap !== "skip") {
      const discovery = await discoverSitemap(input.url);
      for (const u of discovery.urls) {
        add(u);
        if (collected.size >= input.limit) break;
      }
    }

    // 2) Shallow BFS from homepage (1 level)
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
        /* ignore — sitemap may already have given us plenty */
      }
      add(input.url); // ensure root itself is present
    }

    return Response.json({
      success: true,
      links: Array.from(collected),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      const { body, status } = toJsonError(new ValidationError(err.issues));
      return Response.json(body, { status });
    }
    const { body, status } = toJsonError(err);
    return Response.json(body, { status });
  }
}

// Very small eTLD+1 comparator — enough for common cases. Mirrors the
// crawl filter's behaviour so /map and /crawl agree on what's "the
// same site".
function hostIsSameRegistrable(a: string, b: string): boolean {
  const parts = (h: string) => h.split(".").slice(-2).join(".");
  return parts(a) === parts(b);
}
