// Changelog feed — the single source of truth for /changelog and the
// dashboard "What's New" indicator. Newest first.

export type ChangelogEntry = {
  date: string; // YYYY-MM-DD
  title: string;
  tags: Array<"New" | "Improved" | "Fixed" | "Security">;
  items: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-07-01",
    title: "Account settings + one-click sign out",
    tags: ["New"],
    items: [
      "A structured Settings modal — manage your profile, active devices, and account from anywhere.",
      "Sign out (and log out other devices) directly from the sidebar.",
    ],
  },
  {
    date: "2026-07-01",
    title: "SDKs, MCP server & public API docs",
    tags: ["New"],
    items: [
      "Official Node (@shownomore/peep-sdk) and Python (peep-sdk) SDKs, published to npm and PyPI.",
      "MCP server (@shownomore/peep-mcp) — drive Peep from Claude, Cursor, and any MCP client.",
      "Public API docs at /docs with cURL / Node / Python / MCP examples for every endpoint.",
      "GET /v1/credits and X-Peep-Credits-* response headers for transparent usage.",
    ],
  },
  {
    date: "2026-06-30",
    title: "Exhaustive YouTube comments + replies",
    tags: ["Improved"],
    items: [
      "Async YouTube scrapes now harvest every top-level comment and fully-expanded reply threads.",
      "Reply fetching is parallelized; sync scrapes stay fast and bounded.",
    ],
  },
  {
    date: "2026-06-30",
    title: "Agent: reliability + chat interface",
    tags: ["Improved", "Fixed"],
    items: [
      "The Agent is now an LLM-style chat — describe a task and watch it plan, search, and harvest.",
      "Fixed runs terminating early when the free-tier planner call was slow.",
    ],
  },
  {
    date: "2026-06-29",
    title: "Run detail viewer",
    tags: ["New"],
    items: [
      "Open any recent run to see exactly what was scraped — markdown, screenshot, links, images, and JSON.",
      "Crawls show every discovered page, each drillable to its own content.",
    ],
  },
];

export const LATEST_CHANGELOG_AT =
  CHANGELOG[0]?.date ?? new Date(0).toISOString().slice(0, 10);
