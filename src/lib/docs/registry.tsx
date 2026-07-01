import Link from "next/link";

import { CodeTabs, type CodeSample } from "@/components/marketing/code-tabs";
import {
  Callout,
  Code,
  EndpointHeader,
  H2,
  H3,
  P,
  ParamTable,
  UL,
} from "@/components/docs/doc-ui";
import { apiSamples, DOCS_API_BASE } from "@/lib/docs/samples";

export type DocEntry = {
  title: string;
  description: string;
  Body: () => React.ReactNode;
};

const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="text-orange-400 underline-offset-4 hover:underline">
    {children}
  </Link>
);

// CodeTabs with the docs' vertical rhythm so consecutive code blocks
// (e.g. install + usage) don't butt up against each other.
const Snippet = ({ samples }: { samples: CodeSample[] }) => (
  <div className="my-5">
    <CodeTabs samples={samples} />
  </div>
);

// Shared scrapeOptions note reused by crawl / batch / search.
const ScrapeOptionsNote = () => (
  <P>
    Accepts the same options object as <A href="/docs/scrape">Scrape</A> (
    <Code>formats</Code>, <Code>onlyMainContent</Code>, <Code>waitFor</Code>,{" "}
    <Code>actions</Code>, and so on), applied to every page.
  </P>
);

export const DOCS: Record<string, DocEntry> = {
  // ── Introduction ──────────────────────────────────────────────
  "": {
    title: "Introduction",
    description: "The Peep API — scrape, crawl, search, and extract the web.",
    Body: () => (
      <>
        <P>
          Peep is an AI-native web scraping API. Point it at a URL and get back
          clean Markdown, structured JSON, links, images, screenshots, or a
          full-site crawl — built to power agents, RAG pipelines, and data
          products. Every endpoint is a single authenticated HTTP call.
        </P>
        <Callout type="tip" title="500 Free Credits">
          Every account starts with 500 credits on your{" "}
          <A href="/docs/credits">Peep Card</A> — the same balance powers the
          dashboard, the API, and the MCP server.
        </Callout>
        <H2>Base URL</H2>
        <P>All requests go to:</P>
        <Snippet
          samples={[
            { label: "Base URL", language: "text", code: `${DOCS_API_BASE}/api/v1` },
          ]}
        />
        <H2>Quickstart</H2>
        <P>
          Grab an API key from your{" "}
          <A href="/dashboard/api-keys">dashboard</A>, then scrape your first
          page:
        </P>
        <Snippet
          samples={apiSamples({
            method: "POST",
            path: "/api/v1/scrape",
            body: { url: "https://example.com", formats: ["markdown"] },
            mcpTool: "peep_scrape",
          })}
        />
        <H2>Endpoints At A Glance</H2>
        <UL>
          <li>
            <A href="/docs/scrape">Scrape</A> — one URL → markdown / json / links
            / screenshot / YouTube
          </li>
          <li>
            <A href="/docs/crawl">Crawl</A> — discover and scrape an entire site
          </li>
          <li>
            <A href="/docs/map">Map</A> — fast URL discovery for a domain
          </li>
          <li>
            <A href="/docs/search">Search</A> — web / news / image search with
            optional scraping
          </li>
          <li>
            <A href="/docs/batch-scrape">Batch Scrape</A> — many URLs in parallel
          </li>
          <li>
            <A href="/docs/extract">Extract</A> — AI structured extraction across
            URLs
          </li>
          <li>
            <A href="/docs/agent">Agent</A> — autonomous lead / data harvesting
          </li>
        </UL>
      </>
    ),
  },

  // ── Authentication ────────────────────────────────────────────
  authentication: {
    title: "Authentication",
    description: "Authenticate requests with a Bearer API key.",
    Body: () => (
      <>
        <P>
          Peep authenticates every request with a secret API key passed as a
          Bearer token. Create and revoke keys in your{" "}
          <A href="/dashboard/api-keys">developer dashboard</A>. Keys are shown
          once at creation and look like <Code>peep_live_•••</Code>.
        </P>
        <Snippet
          samples={[
            {
              label: "Header",
              language: "text",
              code: "Authorization: Bearer peep_live_xxx",
            },
          ]}
        />
        <Callout type="warning" title="Keep Keys Secret">
          Treat your key like a password. Never ship it in client-side code or a
          public repo — call Peep from your backend. A leaked key can spend your
          Peep Card balance.
        </Callout>
        <H2>Example</H2>
        <Snippet
          samples={apiSamples({
            method: "POST",
            path: "/api/v1/scrape",
            body: { url: "https://example.com" },
          })}
        />
        <P>
          An invalid or missing key returns <Code>401</Code> with code{" "}
          <Code>INVALID_API_KEY</Code> — see <A href="/docs/errors">Errors</A>.
        </P>
      </>
    ),
  },

  // ── Credits & the Peep Card ──────────────────────────────────
  credits: {
    title: "Credits & the Peep Card",
    description: "How credits are priced, shared, and tracked.",
    Body: () => (
      <>
        <P>
          Usage is billed in credits from your <strong>Peep Card</strong> — a
          single balance that powers everything: the dashboard playground, the
          REST API, and the <A href="/docs/mcp">MCP server</A> all draw from the
          same pool. New accounts start with <strong>500 credits</strong>.
        </P>
        <H2>Costs By Endpoint</H2>
        <ParamTable
          params={[
            { name: "Scrape", type: "1 + add-ons", description: "1 base; +4 for AI (json / changeTracking); +4 if a stealth proxy is used." },
            { name: "Crawl", type: "1 / page", description: "Charged per page scraped as the crawl runs. Creating the crawl is free." },
            { name: "Map", type: "1", description: "Flat, regardless of how many URLs are returned." },
            { name: "Search", type: "2 / 10 results", description: "Two credits per ten results requested." },
            { name: "Batch Scrape", type: "1 / URL", description: "Charged per child URL as it runs." },
            { name: "Extract", type: "5 / URL", description: "AI structured extraction per URL." },
            { name: "Agent", type: "maxSources + 4", description: "Sources harvested plus a planning overhead." },
            { name: "Credits", type: "0", description: "Reading your balance is always free." },
          ]}
        />
        <H2>Tracking Spend</H2>
        <P>
          Every response includes a <Code>creditsUsed</Code> (or{" "}
          <Code>creditsReserved</Code>) field, plus response headers:
        </P>
        <UL>
          <li>
            <Code>X-Peep-Credits-Used</Code> — credits spent (or reserved) by
            this request
          </li>
          <li>
            <Code>X-Peep-Credits-Remaining</Code> — your live Peep Card balance
          </li>
        </UL>
        <H2>Check Your Balance</H2>
        <EndpointHeader method="GET" path="/api/v1/credits" credits="Free" />
        <P>
          Returns your balance, plan tier, and recent ledger entries (debits and
          grants).
        </P>
        <Snippet
          samples={apiSamples({
            method: "GET",
            path: "/api/v1/credits",
            mcpTool: "peep_credits",
            mcpArgs: {},
          })}
        />
        <Callout type="note" title="Running Out">
          When your balance can't cover a request, Peep returns{" "}
          <Code>402</Code> with code <Code>INSUFFICIENT_CREDITS</Code>. Failed
          jobs are refunded automatically.
        </Callout>
      </>
    ),
  },

  // ── Rate Limits ───────────────────────────────────────────────
  "rate-limits": {
    title: "Rate Limits",
    description: "Per-user and per-host request limits.",
    Body: () => (
      <>
        <P>
          Requests are rate limited per account (and politely throttled
          per-target-host so Peep stays a good web citizen). Limits scale with
          your plan tier.
        </P>
        <P>
          When you exceed a limit, Peep returns <Code>429</Code> with code{" "}
          <Code>RATE_LIMITED</Code> and a <Code>Retry-After</Code> header (in
          seconds). Back off for that duration, then retry.
        </P>
        <Callout type="tip" title="Smooth It Out">
          For large jobs prefer <A href="/docs/crawl">Crawl</A> or{" "}
          <A href="/docs/batch-scrape">Batch Scrape</A> over many parallel{" "}
          <A href="/docs/scrape">Scrape</A> calls — Peep handles the
          concurrency and host throttling for you.
        </Callout>
      </>
    ),
  },

  // ── Idempotency ───────────────────────────────────────────────
  idempotency: {
    title: "Idempotency",
    description: "Safely retry requests without duplicating work.",
    Body: () => (
      <>
        <P>
          Mutating endpoints (<Code>scrape</Code>, <Code>crawl</Code>,{" "}
          <Code>batch/scrape</Code>, <Code>extract</Code>) accept an optional{" "}
          <Code>Idempotency-Key</Code> header. Send the same key with the same
          body within 24 hours and Peep returns the original response instead of
          starting a new job — so a network retry never double-charges your Peep
          Card.
        </P>
        <Snippet
          samples={[
            {
              label: "Header",
              language: "text",
              code: "Idempotency-Key: 9f8c2b1a-7e3d-4a21-9c6f-1b2d3e4f5a6b",
            },
          ]}
        />
        <Callout type="warning" title="Same Key, Different Body">
          Reusing a key with a <em>different</em> request body returns a{" "}
          <Code>422</Code> validation error. Generate a fresh UUID per logical
          operation.
        </Callout>
      </>
    ),
  },

  // ── Errors ────────────────────────────────────────────────────
  errors: {
    title: "Errors",
    description: "Error envelope and status codes.",
    Body: () => (
      <>
        <P>
          Errors return a non-2xx status and a consistent JSON envelope:
        </P>
        <Snippet
          samples={[
            {
              label: "Error",
              language: "json",
              code: `{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_CREDITS",
    "message": "Not enough credits to complete this request."
  }
}`,
            },
          ]}
        />
        <H2>Status Codes</H2>
        <ParamTable
          params={[
            { name: "400 / 422", type: "VALIDATION_ERROR", description: "The request body failed validation. The error includes the offending fields." },
            { name: "401", type: "INVALID_API_KEY", description: "Missing, malformed, or revoked API key." },
            { name: "402", type: "INSUFFICIENT_CREDITS", description: "Your Peep Card can't cover the request. Top up or wait for a refund." },
            { name: "403", type: "FORBIDDEN", description: "The key lacks access to a paid-tier feature (e.g. robots.txt bypass)." },
            { name: "404", type: "NOT_FOUND", description: "No job or resource with that id." },
            { name: "429", type: "RATE_LIMITED", description: "Too many requests. Honor the Retry-After header." },
            { name: "500", type: "INTERNAL_ERROR", description: "Something went wrong on our side. Safe to retry." },
          ]}
        />
      </>
    ),
  },

  // ── Scrape ────────────────────────────────────────────────────
  scrape: {
    title: "Scrape",
    description: "Scrape a single URL into markdown, JSON, links, or a screenshot.",
    Body: () => (
      <>
        <EndpointHeader method="POST" path="/api/v1/scrape" credits="1 + add-ons" />
        <P>
          Scrape one URL and get back the formats you ask for. Peep
          automatically escalates from a fast HTTP fetch to a stealth browser
          when a page needs JavaScript or trips anti-bot defenses — you just get
          clean output. Pass a YouTube URL to get full video intelligence (see{" "}
          <A href="/docs/youtube">YouTube</A>).
        </P>
        <H2>Request</H2>
        <ParamTable
          params={[
            { name: "url", type: "string", required: true, description: "The absolute URL to scrape." },
            { name: "formats", type: "string[]", description: <>Any of <Code>markdown</Code>, <Code>html</Code>, <Code>rawHtml</Code>, <Code>links</Code>, <Code>images</Code>, <Code>screenshot</Code>, <Code>json</Code>, <Code>changeTracking</Code>.</>, default: '["markdown"]' },
            { name: "onlyMainContent", type: "boolean", description: "Strip nav, footers, and boilerplate, keeping the main article.", default: "true" },
            { name: "includeTags / excludeTags", type: "string[]", description: "CSS selectors to force-keep or force-drop." },
            { name: "waitFor", type: "number", description: "Milliseconds to wait for content to settle before capturing." },
            { name: "actions", type: "object[]", description: "Browser actions to run before scraping (click, type, scroll, wait, screenshot…)." },
            { name: "schema / prompt", type: "object / string", description: <>With <Code>formats: ["json"]</Code>, extract structured data via a JSON schema or natural-language prompt (+4 credits).</> },
            { name: "proxy", type: "string", description: <>Set to <Code>stealth</Code> to route through the anti-bot stack (+4 credits).</> },
            { name: "respectRobotsTxt", type: "boolean", description: "Honor robots.txt. Bypass is a paid-tier feature.", default: "true" },
          ]}
        />
        <H2>Example</H2>
        <Snippet
          samples={apiSamples({
            method: "POST",
            path: "/api/v1/scrape",
            body: {
              url: "https://example.com",
              formats: ["markdown", "links"],
              onlyMainContent: true,
            },
            mcpTool: "peep_scrape",
          })}
        />
        <H2>Response</H2>
        <Snippet
          samples={[
            {
              label: "200 OK",
              language: "json",
              code: `{
  "success": true,
  "data": {
    "markdown": "# Example Domain\\n\\nThis domain is for use in…",
    "links": ["https://www.iana.org/domains/example"],
    "metadata": { "title": "Example Domain", "statusCode": 200 }
  },
  "creditsUsed": 1,
  "cached": false
}`,
            },
          ]}
        />
      </>
    ),
  },

  // ── Crawl ─────────────────────────────────────────────────────
  crawl: {
    title: "Crawl",
    description: "Discover and scrape an entire site, then poll for results.",
    Body: () => (
      <>
        <EndpointHeader method="POST" path="/api/v1/crawl" credits="1 / page" />
        <P>
          Crawl starts at a root URL, discovers pages (sitemap + link graph), and
          scrapes each one. It runs asynchronously: you get a <Code>jobId</Code>,
          then poll the status endpoint or stream live progress over SSE.
          Creating a crawl is free — you're charged 1 credit per page as it runs.
        </P>
        <H2>Request</H2>
        <ParamTable
          params={[
            { name: "url", type: "string", required: true, description: "Root URL to crawl from." },
            { name: "limit", type: "number", description: "Maximum pages to scrape." },
            { name: "maxDiscoveryDepth", type: "number", description: "How many link-hops deep to discover from the root." },
            { name: "includePaths / excludePaths", type: "string[]", description: "Regex path filters to scope the crawl." },
            { name: "crawlEntireDomain", type: "boolean", description: "Follow links beyond the starting path across the whole domain.", default: "false" },
            { name: "allowSubdomains", type: "boolean", description: "Include subdomains of the root host.", default: "false" },
            { name: "prompt", type: "string", description: "Describe what to crawl in natural language; Peep infers the path filters." },
            { name: "scrapeOptions", type: "object", description: "Per-page scrape options (see Scrape)." },
            { name: "webhook", type: "object", description: "Receive page.scraped / completed events at your URL." },
          ]}
        />
        <H2>Start A Crawl</H2>
        <Snippet
          samples={apiSamples({
            method: "POST",
            path: "/api/v1/crawl",
            body: { url: "https://example.com", limit: 50, scrapeOptions: { formats: ["markdown"] } },
            mcpTool: "peep_crawl",
          })}
        />
        <H2>Check Status</H2>
        <EndpointHeader method="GET" path="/api/v1/crawl/{jobId}" credits="Free" />
        <ScrapeOptionsNote />
        <P>
          Returns <Code>status</Code>, <Code>completed</Code>/<Code>total</Code>{" "}
          counts, and the scraped <Code>data</Code> array. For live updates,
          stream <Code>GET /api/v1/crawl/{"{jobId}"}/stream</Code> (SSE) or fetch
          failures from <Code>/api/v1/crawl/{"{jobId}"}/errors</Code>.
        </P>
      </>
    ),
  },

  // ── Map ───────────────────────────────────────────────────────
  map: {
    title: "Map",
    description: "Quickly discover URLs on a domain.",
    Body: () => (
      <>
        <EndpointHeader method="POST" path="/api/v1/map" credits="1" />
        <P>
          Map returns a list of URLs for a site — fast. It combines{" "}
          <Code>sitemap.xml</Code>, robots.txt sitemap entries, certificate
          transparency subdomains, and a shallow link scan. Synchronous and flat
          1 credit.
        </P>
        <H2>Request</H2>
        <ParamTable
          params={[
            { name: "url", type: "string", required: true, description: "The site to map." },
            { name: "search", type: "string", description: "Only return URLs whose path matches this term." },
            { name: "limit", type: "number", description: "Cap the number of URLs returned." },
            { name: "includeSubdomains", type: "boolean", description: "Include discovered subdomains.", default: "false" },
            { name: "sitemap", type: "string", description: <>Set to <Code>only</Code> to restrict to sitemap entries, or <Code>skip</Code> to ignore sitemaps.</> },
          ]}
        />
        <H2>Example</H2>
        <Snippet
          samples={apiSamples({
            method: "POST",
            path: "/api/v1/map",
            body: { url: "https://example.com", limit: 100 },
            mcpTool: "peep_map",
          })}
        />
      </>
    ),
  },

  // ── Search ────────────────────────────────────────────────────
  search: {
    title: "Search",
    description: "Search the web, news, or images — optionally scraping results.",
    Body: () => (
      <>
        <EndpointHeader method="POST" path="/api/v1/search" credits="2 / 10 results" />
        <P>
          Run a web, news, or image search and optionally scrape each result in
          one call — ideal for grounding agents in fresh sources.
        </P>
        <H2>Request</H2>
        <ParamTable
          params={[
            { name: "query", type: "string", required: true, description: "The search query." },
            { name: "limit", type: "number", description: "Number of results to return.", default: "5" },
            { name: "sources", type: "string[]", description: <>Any of <Code>web</Code>, <Code>news</Code>, <Code>images</Code>.</>, default: '["web"]' },
            { name: "lang / country", type: "string", description: "Localize results, e.g. \"en\" / \"us\"." },
            { name: "scrapeOptions", type: "object", description: "If set, each result is scraped with these options (see Scrape)." },
          ]}
        />
        <H2>Example</H2>
        <Snippet
          samples={apiSamples({
            method: "POST",
            path: "/api/v1/search",
            body: { query: "best web scraping api", limit: 10, sources: ["web"] },
            mcpTool: "peep_search",
          })}
        />
      </>
    ),
  },

  // ── Batch Scrape ──────────────────────────────────────────────
  "batch-scrape": {
    title: "Batch Scrape",
    description: "Scrape many URLs in parallel under one job.",
    Body: () => (
      <>
        <EndpointHeader method="POST" path="/api/v1/batch/scrape" credits="1 / URL" />
        <P>
          Submit a list of URLs and Peep scrapes them in parallel, rolling the
          results up under one job. Asynchronous — poll the job for progress.
        </P>
        <H2>Request</H2>
        <ParamTable
          params={[
            { name: "urls", type: "string[]", required: true, description: "The URLs to scrape." },
            { name: "scrapeOptions", type: "object", description: "Applied to every URL (see Scrape)." },
            { name: "ignoreInvalidURLs", type: "boolean", description: "Drop malformed URLs instead of failing the whole batch.", default: "true" },
            { name: "appendToId", type: "string", description: "Append these URLs to an existing batch job." },
            { name: "webhook", type: "object", description: "Receive per-URL and completion events." },
          ]}
        />
        <H2>Example</H2>
        <Snippet
          samples={apiSamples({
            method: "POST",
            path: "/api/v1/batch/scrape",
            body: {
              urls: ["https://example.com/a", "https://example.com/b"],
              scrapeOptions: { formats: ["markdown"] },
            },
            mcpTool: "peep_batch_scrape",
          })}
        />
        <P>
          Poll <Code>GET /api/v1/batch/scrape/{"{jobId}"}</Code> for status and
          the rolled-up results.
        </P>
      </>
    ),
  },

  // ── Extract ───────────────────────────────────────────────────
  extract: {
    title: "Extract",
    description: "AI structured extraction across one or many URLs.",
    Body: () => (
      <>
        <EndpointHeader method="POST" path="/api/v1/extract" credits="5 / URL" />
        <P>
          Give Peep a set of URLs plus a schema or prompt, and it scrapes them
          and returns structured data conforming to your shape. Runs
          asynchronously; poll for the result.
        </P>
        <H2>Request</H2>
        <ParamTable
          params={[
            { name: "urls", type: "string[]", required: true, description: "URLs to extract from. Supports wildcard paths." },
            { name: "prompt", type: "string", description: "Natural-language description of what to extract." },
            { name: "schema", type: "object", description: "A JSON schema the output must conform to." },
            { name: "enableWebSearch", type: "boolean", description: "Let the extractor follow the web for missing details.", default: "false" },
            { name: "showSources", type: "boolean", description: "Include the source URLs each value came from.", default: "false" },
          ]}
        />
        <H2>Example</H2>
        <Snippet
          samples={apiSamples({
            method: "POST",
            path: "/api/v1/extract",
            body: {
              urls: ["https://example.com"],
              prompt: "Extract the company name and pricing tiers.",
              schema: { type: "object", properties: { name: { type: "string" } } },
            },
            mcpTool: "peep_extract",
          })}
        />
        <P>
          Poll <Code>GET /api/v1/extract/{"{jobId}"}</Code> for the structured
          result.
        </P>
      </>
    ),
  },

  // ── Agent ─────────────────────────────────────────────────────
  agent: {
    title: "Agent",
    description: "Autonomous lead and data harvesting from a single prompt.",
    Body: () => (
      <>
        <EndpointHeader method="POST" path="/api/v1/agent" credits="maxSources + 4" />
        <P>
          The Agent turns a plain-language goal into a structured dataset. It
          plans a search strategy, discovers sources, scrapes them, and
          aggregates and de-duplicates the records — e.g. "find flats for rent
          in Vivek Vihar with phone numbers and photos." Runs asynchronously.
        </P>
        <H2>Request</H2>
        <ParamTable
          params={[
            { name: "prompt", type: "string", required: true, description: "What to harvest, in natural language." },
            { name: "maxSources", type: "number", description: "How many sources to discover and scrape." },
            { name: "targetRecords", type: "number", description: "Stop once this many records are collected." },
            { name: "schema", type: "object", description: "Shape of each record (fields you want on every row)." },
            { name: "urls", type: "string[]", description: "Seed URLs to start from instead of (or alongside) search." },
            { name: "lang / country", type: "string", description: "Localize discovery." },
          ]}
        />
        <H2>Example</H2>
        <Snippet
          samples={apiSamples({
            method: "POST",
            path: "/api/v1/agent",
            body: {
              prompt: "Find flats for rent in Vivek Vihar with phone numbers and photos",
              maxSources: 10,
            },
            mcpTool: "peep_agent",
          })}
        />
        <P>
          Poll <Code>GET /api/v1/agent/{"{jobId}"}</Code> for live progress steps
          and the record table as it fills in.
        </P>
      </>
    ),
  },

  // ── YouTube ───────────────────────────────────────────────────
  youtube: {
    title: "YouTube",
    description: "Full video intelligence via the Scrape endpoint.",
    Body: () => (
      <>
        <P>
          YouTube is built into <A href="/docs/scrape">Scrape</A> — there's no
          separate endpoint. Pass any YouTube video URL to{" "}
          <Code>/api/v1/scrape</Code> and Peep returns a rich{" "}
          <Code>youtube</Code> object alongside the usual markdown.
        </P>
        <H2>What You Get</H2>
        <UL>
          <li>Metadata — title, channel, views, likes, publish date, duration</li>
          <li>SEO — tags, category, full description with links</li>
          <li>A/B title history and all thumbnail resolutions</li>
          <li>Transcript (when available)</li>
          <li>Comments — paginated, up to thousands per video</li>
        </UL>
        <H2>Example</H2>
        <Snippet
          samples={apiSamples({
            method: "POST",
            path: "/api/v1/scrape",
            body: {
              url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
              formats: ["markdown"],
            },
            mcpTool: "peep_youtube",
            mcpArgs: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
          })}
        />
        <Callout type="note" title="Transcripts & Full Comments">
          YouTube gates transcripts and the full comment set behind a logged-in
          session. Connect your YouTube cookies in{" "}
          <A href="/dashboard/settings">Settings</A> (stored encrypted) to unlock
          them for your own scrapes.
        </Callout>
      </>
    ),
  },

  // ── SDKs ──────────────────────────────────────────────────────
  sdks: {
    title: "SDKs",
    description: "Official Node.js and Python clients for the Peep API.",
    Body: () => (
      <>
        <P>
          Skip the boilerplate with a typed client. Both SDKs wrap every
          endpoint, surface your <A href="/docs/credits">Peep Card</A> balance
          after each call, and provide <Code>*AndWait</Code> helpers that poll
          async jobs to completion.
        </P>
        <H2>Node.js</H2>
        <P>
          Install with any package manager — they all resolve from the npm
          registry:
        </P>
        <Snippet
          samples={[
            { label: "npm", language: "bash", code: "npm install @shownomore/peep-sdk" },
            { label: "yarn", language: "bash", code: "yarn add @shownomore/peep-sdk" },
            { label: "pnpm", language: "bash", code: "pnpm add @shownomore/peep-sdk" },
            { label: "bun", language: "bash", code: "bun add @shownomore/peep-sdk" },
          ]}
        />
        <Snippet
          samples={[
            {
              label: "Usage",
              language: "javascript",
              code: `import { Peep } from "@shownomore/peep-sdk";

const peep = new Peep({ apiKey: process.env.PEEP_API_KEY });

const res = await peep.scrape("https://example.com", {
  formats: ["markdown"],
});
console.log(res.data.markdown);
console.log(peep.lastCredits); // { used: 1, remaining: 499 }

// Async jobs — poll to completion automatically
const crawl = await peep.crawlAndWait("https://example.com", { limit: 50 });`,
            },
          ]}
        />
        <H2>Python</H2>
        <P>Install from PyPI with pip, Poetry, or uv:</P>
        <Snippet
          samples={[
            { label: "pip", language: "bash", code: "pip install peep-sdk" },
            { label: "Poetry", language: "bash", code: "poetry add peep-sdk" },
            { label: "uv", language: "bash", code: "uv add peep-sdk" },
          ]}
        />
        <Snippet
          samples={[
            {
              label: "Usage",
              language: "python",
              code: `import os
from peep import Peep

peep = Peep(api_key=os.environ["PEEP_API_KEY"])

res = peep.scrape("https://example.com", formats=["markdown"])
print(res["data"]["markdown"])
print(peep.last_credits)  # {"used": 1, "remaining": 499}

# Async jobs — poll to completion automatically
crawl = peep.crawl_and_wait("https://example.com", limit=50)`,
            },
          ]}
        />
        <Callout type="note" title="Errors & Credits">
          Non-2xx responses raise a typed error (<Code>PeepError</Code>) with a{" "}
          <Code>code</Code> and <Code>status</Code>. After every call, the
          client exposes the credits used and remaining from the response
          headers.
        </Callout>
      </>
    ),
  },

  // ── MCP Server ────────────────────────────────────────────────
  mcp: {
    title: "MCP Server",
    description: "Use Peep from Claude, Cursor, and any MCP client.",
    Body: () => (
      <>
        <P>
          The Peep MCP server exposes every endpoint as a tool, so agents in
          Claude, Cursor, VS Code, and any MCP-compatible client can scrape,
          crawl, search, and extract directly. It's a thin wrapper over the REST
          API and draws from the same <A href="/docs/credits">Peep Card</A>{" "}
          balance.
        </P>
        <H2>Install</H2>
        <P>
          Add Peep to your MCP client config, supplying your API key via the{" "}
          <Code>PEEP_API_KEY</Code> environment variable:
        </P>
        <Snippet
          samples={[
            {
              label: "claude_desktop_config.json",
              language: "json",
              code: `{
  "mcpServers": {
    "peep": {
      "command": "npx",
      "args": ["-y", "@shownomore/peep-mcp"],
      "env": { "PEEP_API_KEY": "peep_live_xxx" }
    }
  }
}`,
            },
            {
              label: "CLI",
              language: "bash",
              code: `claude mcp add peep -e PEEP_API_KEY=peep_live_xxx -- npx -y @shownomore/peep-mcp`,
            },
          ]}
        />
        <H2>Tools</H2>
        <ParamTable
          params={[
            { name: "peep_scrape", type: "tool", description: "Scrape a single URL (incl. YouTube)." },
            { name: "peep_crawl", type: "tool", description: "Crawl a site and return the pages." },
            { name: "peep_map", type: "tool", description: "Discover URLs on a domain." },
            { name: "peep_search", type: "tool", description: "Web / news / image search." },
            { name: "peep_extract", type: "tool", description: "AI structured extraction." },
            { name: "peep_agent", type: "tool", description: "Autonomous lead / data harvesting." },
            { name: "peep_credits", type: "tool", description: "Check your Peep Card balance." },
          ]}
        />
        <Callout type="tip" title="Just Ask">
          Once configured, you can say "scrape example.com to markdown" in
          natural language and the client picks <Code>peep_scrape</Code> for you.
        </Callout>
      </>
    ),
  },
};
