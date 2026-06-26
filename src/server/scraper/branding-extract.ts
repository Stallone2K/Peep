import type { Page } from "playwright";

export type BrandingSignals = {
  colors: {
    primary: string | null;
    background: string | null;
    text: string | null;
    accent: string[];
  };
  fonts: { sans: string | null; serif: string | null; mono: string | null };
};

// Pull REAL brand colours + fonts from the rendered page via computed styles.
// Far more accurate than inferring from HTML text, which misses Tailwind /
// external-CSS sites entirely.
//
// IMPORTANT: the page.evaluate callback must contain NO named inner functions.
// tsx/esbuild injects a `__name(...)` helper around named functions/const
// arrows; when Playwright serialises the callback into the browser that helper
// is undefined → "ReferenceError: __name is not defined". So the callback only
// gathers raw computed-style strings, and all parsing happens here in Node.
export async function extractBrandingSignals(
  page: Page,
): Promise<BrandingSignals> {
  const raw = await page.evaluate(() => {
    const bodyCS = getComputedStyle(document.body);
    const h1 = document.querySelector("h1");
    const link = document.querySelector("a[href], button");
    const themeColor =
      document
        .querySelector('meta[name="theme-color"]')
        ?.getAttribute("content") || null;

    const counts: Record<string, number> = {};
    const els = Array.from(document.querySelectorAll("body *")).slice(0, 800);
    for (const el of els) {
      const s = getComputedStyle(el);
      if (s.backgroundColor)
        counts[s.backgroundColor] = (counts[s.backgroundColor] || 0) + 1;
      if (s.color) counts[s.color] = (counts[s.color] || 0) + 1;
    }
    const top = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map((e) => e[0])
      .slice(0, 16);

    return {
      themeColor,
      bg: bodyCS.backgroundColor,
      text: bodyCS.color,
      accent: link ? getComputedStyle(link).color : null,
      bodyFont: bodyCS.fontFamily,
      headingFont: h1 ? getComputedStyle(h1).fontFamily : null,
      topColors: top,
    };
  });

  const themeHex = toHex(raw.themeColor);
  const bg = toHex(raw.bg);
  const text = toHex(raw.text);
  const accentSeed = toHex(raw.accent);
  const topHex = raw.topColors
    .map(toHex)
    .filter((c): c is string => !!c && c !== "#000000" && c !== "#ffffff");

  const accent = [themeHex, accentSeed, ...topHex]
    .filter((c): c is string => !!c && c !== bg && c !== text)
    .filter((c, i, arr) => arr.indexOf(c) === i)
    .slice(0, 6);

  const bodyFont = firstFamily(raw.bodyFont);
  const headingFont = firstFamily(raw.headingFont);

  return {
    colors: {
      primary: themeHex || accentSeed || topHex[0] || null,
      background: bg,
      text,
      accent,
    },
    fonts: {
      sans: bodyFont,
      serif: headingFont && headingFont !== bodyFont ? headingFont : null,
      mono: null,
    },
  };
}

// ─── Node-side parsing helpers (kept OUT of page.evaluate) ───────────
function toHex(c: string | null): string | null {
  if (!c) return null;
  if (c.startsWith("#")) return c.toLowerCase();
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(",").map((x) => parseFloat(x.trim()));
  const [r, g, b, a] = parts;
  if (a === 0) return null; // fully transparent
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function firstFamily(ff: string | null): string | null {
  if (!ff) return null;
  return ff.split(",")[0].replace(/["']/g, "").trim() || null;
}
