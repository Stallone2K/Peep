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
  const seen = new Set<string>();

  for (const img of Array.from(document.querySelectorAll("img[src]"))) {
    const src = img.getAttribute("src");
    if (!src) continue;
    if (src.startsWith("data:")) continue;
    try {
      seen.add(new URL(src, base).toString());
    } catch {
      // Invalid URL — skip.
    }
  }
  // Also honour srcset entries — pick the first URL per entry.
  for (const img of Array.from(document.querySelectorAll("img[srcset]"))) {
    const srcset = img.getAttribute("srcset");
    if (!srcset) continue;
    for (const entry of srcset.split(",")) {
      const url = entry.trim().split(/\s+/)[0];
      if (!url || url.startsWith("data:")) continue;
      try {
        seen.add(new URL(url, base).toString());
      } catch {
        // skip
      }
    }
  }

  return [...seen];
}
