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
// external-CSS sites entirely (where nothing is inline in the markup).
export async function extractBrandingSignals(
  page: Page,
): Promise<BrandingSignals> {
  const raw = await page.evaluate(() => {
    const toHex = (c: string | null): string | null => {
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
    };
    const firstFamily = (ff: string | null): string | null =>
      ff ? ff.split(",")[0].replace(/["']/g, "").trim() || null : null;

    const bodyCS = getComputedStyle(document.body);
    const h1 = document.querySelector("h1");
    const link = document.querySelector("a[href], button");
    const themeColor =
      document
        .querySelector('meta[name="theme-color"]')
        ?.getAttribute("content") || null;

    // Frequency-count visible colours across a sample of elements.
    const counts: Record<string, number> = {};
    const els = Array.from(document.querySelectorAll("body *")).slice(0, 800);
    for (const el of els) {
      const s = getComputedStyle(el);
      for (const c of [s.backgroundColor, s.color]) {
        const hex = toHex(c);
        if (hex && hex !== "#000000" && hex !== "#ffffff") {
          counts[hex] = (counts[hex] || 0) + 1;
        }
      }
    }
    const top = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => c)
      .slice(0, 6);

    return {
      themeColor: toHex(themeColor),
      bg: toHex(bodyCS.backgroundColor),
      text: toHex(bodyCS.color),
      accent: link ? toHex(getComputedStyle(link).color) : null,
      bodyFont: firstFamily(bodyCS.fontFamily),
      headingFont: h1 ? firstFamily(getComputedStyle(h1).fontFamily) : null,
      topColors: top,
    };
  });

  const accent = [raw.themeColor, raw.accent, ...raw.topColors]
    .filter((c): c is string => !!c && c !== raw.bg && c !== raw.text)
    .filter((c, i, arr) => arr.indexOf(c) === i)
    .slice(0, 6);

  return {
    colors: {
      primary: raw.themeColor || raw.accent || raw.topColors[0] || null,
      background: raw.bg,
      text: raw.text,
      accent,
    },
    fonts: {
      sans: raw.bodyFont,
      serif:
        raw.headingFont && raw.headingFont !== raw.bodyFont
          ? raw.headingFont
          : null,
      mono: null,
    },
  };
}
