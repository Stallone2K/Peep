#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { callPeep, startMaybeWait, type PeepResponse } from "./client.js";

// Render a Peep API response as MCP tool output: pretty JSON plus a
// one-line credit footer so the agent (and user) sees the Peep Card
// spend. `isError` flips the tool result to an error for non-2xx.
function result(r: PeepResponse) {
  const footer =
    r.credits.remaining !== null
      ? `\n\n— Peep Card: used ${r.credits.used ?? "?"}, remaining ${r.credits.remaining}`
      : "";
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(r.json, null, 2) + footer,
      },
    ],
    isError: !r.ok,
  };
}

const server = new McpServer({ name: "peep", version: "0.1.0" });

// ── Scrape ─────────────────────────────────────────────────────
server.tool(
  "peep_scrape",
  "Scrape a single URL into clean markdown, structured JSON, links, images, or a screenshot. Pass a YouTube URL for full video intelligence.",
  {
    url: z.string().describe("The absolute URL to scrape."),
    formats: z
      .array(z.string())
      .optional()
      .describe('Output formats, e.g. ["markdown", "links", "json", "screenshot"].'),
    onlyMainContent: z.boolean().optional(),
    waitFor: z.number().optional().describe("Milliseconds to wait for content to settle."),
    prompt: z.string().optional().describe('Natural-language extraction prompt (use with formats ["json"]).'),
    schema: z.record(z.any()).optional().describe("JSON schema for structured extraction."),
    proxy: z.string().optional().describe('Set to "stealth" to route through the anti-bot stack.'),
  },
  async (args) => result(await callPeep("POST", "/api/v1/scrape", args)),
);

// ── Crawl ──────────────────────────────────────────────────────
server.tool(
  "peep_crawl",
  "Crawl an entire site from a root URL, discovering and scraping pages. Returns the scraped pages once the crawl completes.",
  {
    url: z.string().describe("Root URL to crawl from."),
    limit: z.number().optional().describe("Maximum pages to scrape."),
    maxDiscoveryDepth: z.number().optional(),
    includePaths: z.array(z.string()).optional(),
    excludePaths: z.array(z.string()).optional(),
    prompt: z.string().optional().describe("Describe what to crawl; path filters are inferred."),
    wait: z.boolean().optional().describe("Block until the crawl finishes (default true)."),
  },
  async ({ wait, ...body }) =>
    result(await startMaybeWait("/api/v1/crawl", body, "/api/v1/crawl", wait ?? true)),
);

// ── Map ────────────────────────────────────────────────────────
server.tool(
  "peep_map",
  "Quickly discover URLs on a domain (sitemap + subdomains + link scan). Fast and flat 1 credit.",
  {
    url: z.string().describe("The site to map."),
    search: z.string().optional().describe("Only return URLs whose path matches this term."),
    limit: z.number().optional(),
    includeSubdomains: z.boolean().optional(),
  },
  async (args) => result(await callPeep("POST", "/api/v1/map", args)),
);

// ── Search ─────────────────────────────────────────────────────
server.tool(
  "peep_search",
  "Search the web, news, or images — optionally scraping each result in the same call.",
  {
    query: z.string().describe("The search query."),
    limit: z.number().optional(),
    sources: z.array(z.enum(["web", "news", "images"])).optional(),
    lang: z.string().optional(),
    country: z.string().optional(),
  },
  async (args) => result(await callPeep("POST", "/api/v1/search", args)),
);

// ── Batch Scrape ───────────────────────────────────────────────
server.tool(
  "peep_batch_scrape",
  "Scrape many URLs in parallel under one job. Returns all results once the batch completes.",
  {
    urls: z.array(z.string()).describe("The URLs to scrape."),
    formats: z.array(z.string()).optional(),
    wait: z.boolean().optional().describe("Block until the batch finishes (default true)."),
  },
  async ({ urls, formats, wait }) =>
    result(
      await startMaybeWait(
        "/api/v1/batch/scrape",
        { urls, scrapeOptions: formats ? { formats } : undefined },
        "/api/v1/batch/scrape",
        wait ?? true,
      ),
    ),
);

// ── Extract ────────────────────────────────────────────────────
server.tool(
  "peep_extract",
  "AI structured extraction across one or many URLs, conforming to a schema or prompt.",
  {
    urls: z.array(z.string()).describe("URLs to extract from."),
    prompt: z.string().optional().describe("Natural-language description of what to extract."),
    schema: z.record(z.any()).optional().describe("JSON schema the output must conform to."),
    enableWebSearch: z.boolean().optional(),
    wait: z.boolean().optional().describe("Block until extraction finishes (default true)."),
  },
  async ({ wait, ...body }) =>
    result(await startMaybeWait("/api/v1/extract", body, "/api/v1/extract", wait ?? true)),
);

// ── Agent ──────────────────────────────────────────────────────
server.tool(
  "peep_agent",
  "Autonomous lead/data harvester: turns a plain-language goal into a structured dataset by planning, searching, scraping, and de-duplicating.",
  {
    prompt: z.string().describe("What to harvest, in natural language."),
    maxSources: z.number().optional().describe("How many sources to discover and scrape."),
    targetRecords: z.number().optional(),
    schema: z.record(z.any()).optional().describe("Shape of each record."),
    wait: z.boolean().optional().describe("Block until the run finishes (default true)."),
  },
  async ({ wait, ...body }) =>
    result(await startMaybeWait("/api/v1/agent", body, "/api/v1/agent", wait ?? true)),
);

// ── YouTube ────────────────────────────────────────────────────
server.tool(
  "peep_youtube",
  "Full YouTube video intelligence — metadata, SEO, A/B titles, thumbnails, description, transcript, and comments. (Routes through Scrape.)",
  {
    url: z.string().describe("The YouTube video URL."),
  },
  async ({ url }) =>
    result(await callPeep("POST", "/api/v1/scrape", { url, formats: ["markdown"] })),
);

// ── Credits ────────────────────────────────────────────────────
server.tool(
  "peep_credits",
  "Check your Peep Card balance, plan tier, and recent credit ledger. Free.",
  {},
  async () => result(await callPeep("GET", "/api/v1/credits")),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is safe — stdout is reserved for the MCP protocol.
  console.error("Peep MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
