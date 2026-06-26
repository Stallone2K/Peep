import { parseHTML } from "linkedom";

export function extractLinks(html: string, baseUrl: string): string[] {
  const { document } = parseHTML(html);
  const base = new URL(baseUrl);
  const seen = new Set<string>();

  for (const a of Array.from(document.querySelectorAll("a[href]"))) {
    const href = a.getAttribute("href");
    if (!href) continue;
    // Skip fragments, javascript:, mailto:, tel:, data:
    if (/^(#|javascript:|mailto:|tel:|data:)/i.test(href)) continue;
    try {
      const resolved = new URL(href, base).toString();
      // Strip fragment — two links to the same page with different
      // fragments are the same URL for crawling purposes.
      const noFragment = resolved.split("#")[0]!;
      seen.add(noFragment);
    } catch {
      // Invalid URL — skip.
    }
  }

  return [...seen];
}

export function extractImages(html: string, baseUrl: string): string[] {
  const { document } = parseHTML(html);
  const base = new URL(baseUrl);
  // Map a normalized "same image" key → the first concrete URL we kept, so
  // responsive variants (Next.js `/_next/image?...&w=640|1080`, `src` +
  // `srcset` of one element) collapse to a single image.
  const byKey = new Map<string, string>();

  const consider = (raw: string | null | undefined) => {
    if (!raw || raw.startsWith("data:")) return;
    try {
      const u = new URL(raw, base);
      const key = imageDedupKey(u);
      if (!byKey.has(key)) byKey.set(key, u.toString());
    } catch {
      // Invalid URL — skip.
    }
  };

  for (const img of Array.from(document.querySelectorAll("img[src]"))) {
    consider(img.getAttribute("src"));
  }
  for (const img of Array.from(document.querySelectorAll("img[srcset]"))) {
    const srcset = img.getAttribute("srcset");
    if (!srcset) continue;
    for (const entry of srcset.split(",")) {
      consider(entry.trim().split(/\s+/)[0]);
    }
  }

  return [...byKey.values()];
}

// Collapse responsive / CDN-resized variants of the same image to one key.
const RESIZE_PARAMS = ["w", "width", "h", "height", "q", "quality", "dpr", "s", "size", "fit"];

function imageDedupKey(u: URL): string {
  // Next.js (and similar) image optimizers wrap the real image in a `url`
  // query param — dedupe on that so every width collapses together.
  if (u.pathname.endsWith("/_next/image") || u.pathname.endsWith("/image")) {
    const inner = u.searchParams.get("url");
    if (inner) return inner.toLowerCase();
  }
  // Otherwise strip common resize params so `?w=640` and `?w=1080` match.
  const params = new URLSearchParams(u.search);
  for (const p of RESIZE_PARAMS) params.delete(p);
  const q = params.toString();
  return `${u.origin}${u.pathname}${q ? `?${q}` : ""}`.toLowerCase();
}
