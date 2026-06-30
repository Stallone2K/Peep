// Ordered docs navigation. Drives the sidebar, the [slug] static
// params, and prev/next links. The Introduction lives at the /docs
// index (empty slug); every other page is /docs/<slug>.

export type DocNavItem = { title: string; slug: string };
export type DocNavGroup = { title: string; items: DocNavItem[] };

export const DOCS_NAV: DocNavGroup[] = [
  {
    title: "Getting Started",
    items: [
      { title: "Introduction", slug: "" },
      { title: "Authentication", slug: "authentication" },
      { title: "Credits & the Peep Card", slug: "credits" },
      { title: "Rate Limits", slug: "rate-limits" },
      { title: "Idempotency", slug: "idempotency" },
      { title: "Errors", slug: "errors" },
    ],
  },
  {
    title: "Endpoints",
    items: [
      { title: "Scrape", slug: "scrape" },
      { title: "Crawl", slug: "crawl" },
      { title: "Map", slug: "map" },
      { title: "Search", slug: "search" },
      { title: "Batch Scrape", slug: "batch-scrape" },
      { title: "Extract", slug: "extract" },
      { title: "Agent", slug: "agent" },
      { title: "YouTube", slug: "youtube" },
    ],
  },
  {
    title: "Integrations",
    items: [
      { title: "SDKs", slug: "sdks" },
      { title: "MCP Server", slug: "mcp" },
    ],
  },
];

// Flat ordered list — used for prev/next + static params.
export const DOCS_FLAT: DocNavItem[] = DOCS_NAV.flatMap((g) => g.items);

export function docHref(slug: string): string {
  return slug ? `/docs/${slug}` : "/docs";
}
