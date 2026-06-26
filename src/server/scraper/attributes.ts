import { parseHTML } from "linkedom";

export type AttributeSelector = { selector: string; attribute: string };

export type AttributeResult = {
  selector: string;
  attribute: string;
  values: string[];
};

// `attributes` format (Firecrawl parity) — deterministic CSS-selector →
// attribute extraction. For each {selector, attribute} pair, returns every
// matching element's attribute value (in document order, nulls dropped). No
// AI, no network — pure DOM, so it's cheap and fully reproducible.
export function extractAttributes(
  html: string,
  selectors: AttributeSelector[],
): AttributeResult[] {
  const { document } = parseHTML(html);

  return selectors.map(({ selector, attribute }) => {
    const values: string[] = [];
    let nodes: ArrayLike<Element> = [];
    try {
      nodes = document.querySelectorAll(selector);
    } catch {
      // Invalid CSS selector — return an empty match set rather than throwing
      // so one bad selector doesn't fail the whole scrape.
      return { selector, attribute, values };
    }
    for (const el of Array.from(nodes)) {
      const v = el.getAttribute(attribute);
      if (v !== null && v !== undefined) values.push(v);
    }
    return { selector, attribute, values };
  });
}
