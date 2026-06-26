import type { Page } from "playwright";

export type TypeStyle = {
  size: string;
  weight: string;
  lineHeight: string;
  family: string;
};

export type BrandingSignals = {
  colors: {
    primary: string | null;
    background: string | null;
    text: string | null;
    accent: string[];
  };
  fonts: { sans: string | null; serif: string | null; mono: string | null };
  // Frontend-dev-facing design system extracted from the rendered page.
  design: {
    cssVariables: Record<string, string>; // real design tokens from :root
    typeScale: Record<string, TypeStyle>; // h1..h4 / p / button / a
    radii: string[]; // border-radius scale (most common first)
    shadows: string[]; // box-shadow scale
    consistency: { colors: number; fonts: number; radii: number };
  };
};

// Pull the REAL design system off the rendered page via computed styles +
// stylesheets. Accurate where text-inference fails (Tailwind / external CSS).
//
// IMPORTANT: the page.evaluate callback must contain NO named inner functions
// (named consts / declarations). tsx/esbuild wraps those with a `__name(...)`
// helper that doesn't exist in the browser → "ReferenceError: __name is not
// defined". So the callback only gathers raw strings; parsing happens in Node.
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

    // Sample elements once for colours / radii / shadows / fonts.
    const colorCounts: Record<string, number> = {};
    const radiusCounts: Record<string, number> = {};
    const shadowCounts: Record<string, number> = {};
    const fontSet: Record<string, boolean> = {};
    const els = Array.from(document.querySelectorAll("body *")).slice(0, 1000);
    for (const el of els) {
      const s = getComputedStyle(el);
      if (s.backgroundColor)
        colorCounts[s.backgroundColor] =
          (colorCounts[s.backgroundColor] || 0) + 1;
      if (s.color) colorCounts[s.color] = (colorCounts[s.color] || 0) + 1;
      if (s.borderRadius && s.borderRadius !== "0px")
        radiusCounts[s.borderRadius] = (radiusCounts[s.borderRadius] || 0) + 1;
      if (s.boxShadow && s.boxShadow !== "none")
        shadowCounts[s.boxShadow] = (shadowCounts[s.boxShadow] || 0) + 1;
      if (s.fontFamily)
        fontSet[s.fontFamily.split(",")[0].replace(/['"]/g, "").trim()] = true;
    }
    const topColors = Object.entries(colorCounts)
      .sort((a, b) => b[1] - a[1])
      .map((e) => e[0])
      .slice(0, 16);
    const topRadii = Object.entries(radiusCounts)
      .sort((a, b) => b[1] - a[1])
      .map((e) => e[0])
      .slice(0, 8);
    const topShadows = Object.entries(shadowCounts)
      .sort((a, b) => b[1] - a[1])
      .map((e) => e[0])
      .slice(0, 4);

    // CSS custom properties from :root / html (the real design tokens).
    const cssVars: Record<string, string> = {};
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList | null = null;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // cross-origin sheet — not readable
      }
      if (!rules) continue;
      for (const rule of Array.from(rules)) {
        const r = rule as CSSStyleRule;
        if (
          r.selectorText === ":root" ||
          r.selectorText === "html" ||
          r.selectorText === ":host"
        ) {
          const st = r.style;
          for (let i = 0; i < st.length; i++) {
            const prop = st[i];
            if (prop && prop.startsWith("--"))
              cssVars[prop] = st.getPropertyValue(prop).trim();
          }
        }
      }
    }

    // Type scale — computed font metrics for the key text elements.
    const typeScale: Record<
      string,
      { size: string; weight: string; lineHeight: string; family: string }
    > = {};
    for (const sel of ["h1", "h2", "h3", "h4", "p", "button", "a"]) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const s = getComputedStyle(el);
      typeScale[sel] = {
        size: s.fontSize,
        weight: s.fontWeight,
        lineHeight: s.lineHeight,
        family: s.fontFamily.split(",")[0].replace(/['"]/g, "").trim(),
      };
    }

    return {
      themeColor,
      bg: bodyCS.backgroundColor,
      text: bodyCS.color,
      accent: link ? getComputedStyle(link).color : null,
      bodyFont: bodyCS.fontFamily,
      headingFont: h1 ? getComputedStyle(h1).fontFamily : null,
      topColors,
      topRadii,
      topShadows,
      cssVars,
      typeScale,
      fontCount: Object.keys(fontSet).length,
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
    design: {
      cssVariables: raw.cssVars,
      typeScale: raw.typeScale,
      radii: raw.topRadii,
      shadows: raw.topShadows,
      consistency: {
        colors: topHex.length,
        fonts: raw.fontCount,
        radii: raw.topRadii.length,
      },
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
  if (a === 0) return null;
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
