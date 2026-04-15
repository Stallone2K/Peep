# Peep — Implementation Plan

## Context

**Peep** is a Firecrawl-style API: one URL in → clean markdown + structured JSON out, with AI-native extraction (Claude). Target the generic public web; walled gardens (IG/X/TikTok/LinkedIn) are explicitly out of scope for v1.

The repo at [/](./) is a **bare** `create-next-app` scaffold:
- Next.js **16.2.3** (not 14/15 — see breaking-changes section), React 19.2.4, Tailwind v4 (CSS-first via [postcss.config.mjs](postcss.config.mjs)), TypeScript, Yarn, Node 25
- Only [src/app/layout.tsx](src/app/layout.tsx), [src/app/page.tsx](src/app/page.tsx), [src/app/globals.css](src/app/globals.css), [public/](public/) exist
- No `.git`, no `prisma/`, no `auth.ts`, no `components.json`, no `.env*`
- The default layout already wires `--font-geist-sans/mono` and `min-h-full` body — keep it

This plan: 8 phases, ~6 weeks of work, hosted as a **two-process system** (Next.js app + worker) sharing Postgres + Redis.

> ⚠️ **Next.js 16 gotchas baked into the plan** (don't write Next 14 code):
> - `params` and `searchParams` are **Promises** — must `await` them everywhere (route handlers, pages, `generateMetadata`)
> - `cookies()` and `headers()` are **async** — `await headers()`
> - **No fetch caching by default** — opt in with `'use cache'` directive (requires `cacheComponents: true` in [next.config.ts](next.config.ts))
> - Old route-segment configs (`export const dynamic`, `revalidate`, `fetchCache`) **are ignored** when Cache Components is on — use `'use cache'` + `cacheLife()` instead
> - Route handlers are **dynamic by default**, even GET
> - Cache Components requires Node runtime (no edge)

---

## 1. Architecture

```
                              ┌─────────────────────────────────┐
                              │  Browser (dashboard / docs)     │
                              └───────────────┬─────────────────┘
                                              │ HTTPS (session cookie)
                                              ▼
  ┌──────────────────┐   Bearer API key   ┌────────────────────────────┐
  │ Customer's app   │ ─────────────────► │  Next.js 16 (Vercel)       │
  └──────────────────┘                    │  - /api/v1/* (API)         │
                                          │  - /dashboard (RSC)        │
                                          │  - NextAuth v5             │
                                          └─────┬────────────┬─────────┘
                                                │            │
                            enqueue job (BullMQ)│            │ read jobs/results
                                                ▼            ▼
                                      ┌─────────────────┐  ┌──────────────────┐
                                      │ Upstash Redis   │  │ Neon Postgres    │
                                      │ (queue + lock)  │  │ (Prisma)         │
                                      └────────┬────────┘  └────────┬─────────┘
                                               │                    ▲
                                       pull job│                    │ write result
                                               ▼                    │
                                      ┌─────────────────────────────┴──────────┐
                                      │ Worker process (Fly.io, Node + tsx)    │
                                      │  - Playwright (chromium, stealth)      │
                                      │  - Readability + Turndown (md)         │
                                      │  - Claude SDK (extraction)             │
                                      │  - Cloudflare R2 (screenshots/raw HTML)│
                                      └─────────────┬───────────┬──────────────┘
                                                    │           │
                                                    ▼           ▼
                                          ┌──────────────┐  ┌──────────────┐
                                          │ Anthropic    │  │ Bright Data  │
                                          │ Claude API   │  │ (proxy, opt) │
                                          └──────────────┘  └──────────────┘
```

### Data flow: `POST /api/v1/scrape` (sync mode)

1. Edge → [src/app/api/v1/scrape/route.ts](src/app/api/v1/scrape/route.ts) parses Bearer key from `Authorization` header.
2. `verifyApiKey()` (constant-time hash compare against `ApiKey.hashedKey`) → returns userId.
3. `creditCheck()` debits credits in a Prisma transaction (rollback on failure).
4. Zod-validate body against `ScrapeRequestSchema` ([src/lib/validators/scrape.ts](src/lib/validators/scrape.ts)).
5. `enqueueScrape({ userId, url, options })` → BullMQ adds job to `scrape` queue, returns jobId.
6. **Sync mode** (default): route awaits a Postgres `LISTEN/NOTIFY` or short-poll on `ScrapeJob.status` with a 60s timeout. **Async mode** (`?async=true`): return `{ jobId }` immediately, client polls `GET /api/v1/scrape/:id` or receives webhook.
7. Worker pulls job → launches Playwright (or HTTP-only fast path if `formats: ['markdown']` and `js: false`) → renders → captures HTML + screenshot → Readability + Turndown → optionally Claude extract → writes `ScrapeResult` row + R2 upload.
8. Route handler reads completed result, returns it.

---

## 2. Hosting decision (Playwright)

| Option | Pros | Cons | Cost @ 10k scrapes/mo |
|---|---|---|---|
| **(a) Self-hosted on Fly.io** | Full control, cheapest, can run stealth plugins, no per-request fee | Ops burden (Chromium updates, OOM monitoring, IP reputation) | **~$25/mo**: 1×`shared-cpu-2x` 2GB worker ($15) + Upstash Redis free tier ($0) + Neon free tier ($0) + small egress (~$5) |
| (b) Browserless.io | Zero ops, scales instantly, includes some stealth | Per-session pricing adds up, vendor lock, no custom Chromium flags | **~$50/mo** (Cloud Starter, 1k units bundle ≈ 10k short scrapes); jumps to ~$200/mo near limits |
| (c) Bright Data Scraping Browser | Best for Cloudflare/Datadome bypass, residential IPs included | $8-15/GB bandwidth — a single rendered page (~2MB w/ images) ≈ $0.02-0.03 | **~$200-300/mo** at 10k scrapes; truly punitive at 100k |

### Recommendation: **(a) self-hosted Fly.io worker**, with **(c) Bright Data as opt-in fallback**

- Default tier uses self-hosted Playwright. ~95% of public web works fine.
- When the worker detects a hard block (Cloudflare interstitial HTML, repeated 403/429, Datadome challenge), it **retries via Bright Data** if the user's plan allows it (charge extra credits). Implemented in [src/server/scraper/browser.ts](src/server/scraper/browser.ts) as a strategy pattern.
- Don't pay Bright Data prices for sites that don't need it.

**Worker deployment**: `fly.toml` at repo root, `Dockerfile.worker` builds Node + Chromium image, entry `node --import tsx src/workers/index.ts`. Start with 1 machine, autoscale by queue depth (Fly machines start cold in ~3s — acceptable).

**Don't** put Playwright on Vercel. Vercel functions cap at 50MB and have no persistent process; Chromium binaries alone are >100MB.

---

## 3. Prisma schema draft

Path: [prisma/schema.prisma](prisma/schema.prisma). Postgres provider; `DATABASE_URL` works for both Neon and self-hosted (Neon's pooler URL goes in `DATABASE_URL`, direct URL in `DIRECT_URL` for migrations).

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
generator client { provider = "prisma-client-js" }

// ─── NextAuth v5 (PrismaAdapter shape) ─────────────────────────────
model User {
  id            String     @id @default(cuid())
  email         String     @unique
  name          String?
  image         String?
  emailVerified DateTime?
  planTier      PlanTier   @default(FREE)
  creditBalance Int        @default(500)         // free-tier seed
  createdAt     DateTime   @default(now())
  accounts      Account[]
  sessions      Session[]
  apiKeys       ApiKey[]
  scrapeJobs   ScrapeJob[]
  crawlJobs    CrawlJob[]
  ledger       CreditLedger[]
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String   // "google" | "github"
  providerAccountId String
  refresh_token     String?  @db.Text
  access_token      String?  @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?  @db.Text
  session_state     String?
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
  @@index([userId])
}

model Session {
  sessionToken String   @id
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime
  @@unique([identifier, token])
}

// ─── App tables ────────────────────────────────────────────────────
enum PlanTier { FREE HOBBY PRO ENTERPRISE }
enum JobStatus { QUEUED RUNNING DONE FAILED CANCELLED }
enum CrawlStatus { QUEUED RUNNING DONE FAILED CANCELLED }

model ApiKey {
  id          String    @id @default(cuid())
  userId      String
  name        String
  prefix      String    @unique               // "pk_live_8chars" — shown in dashboard
  hashedKey   String                          // SHA-256 of full key (we never store plaintext)
  lastUsedAt  DateTime?
  createdAt   DateTime  @default(now())
  revokedAt   DateTime?
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  scrapeJobs  ScrapeJob[]
  @@index([userId])
  @@index([hashedKey])
}

model ScrapeJob {
  id           String     @id @default(cuid())
  userId       String
  apiKeyId     String?
  crawlJobId   String?                         // set if produced by a crawl
  url          String
  options      Json                            // ScrapeOptions verbatim
  status       JobStatus  @default(QUEUED)
  creditsUsed  Int        @default(1)
  error        String?
  startedAt    DateTime?
  completedAt  DateTime?
  createdAt    DateTime   @default(now())
  user         User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  apiKey       ApiKey?    @relation(fields: [apiKeyId], references: [id], onDelete: SetNull)
  crawlJob     CrawlJob?  @relation(fields: [crawlJobId], references: [id], onDelete: Cascade)
  result       ScrapeResult?
  @@index([userId, createdAt(sort: Desc)])
  @@index([status])
  @@index([crawlJobId])
}

model ScrapeResult {
  jobId        String   @id                    // 1:1 with ScrapeJob
  markdown     String?  @db.Text
  htmlR2Key    String?                         // R2 key to raw HTML (gzip)
  screenshotR2Key String?
  metadata     Json?                           // title, description, og, lang, statusCode
  extracted    Json?                           // LLM-extracted structured data
  links        String[]                        // discovered URLs
  pageStatus   Int?
  durationMs   Int?
  createdAt    DateTime @default(now())
  job          ScrapeJob @relation(fields: [jobId], references: [id], onDelete: Cascade)
}

model CrawlJob {
  id            String      @id @default(cuid())
  userId        String
  rootUrl       String
  options       Json                           // limit, includePaths, excludePaths, maxDepth
  status        CrawlStatus @default(QUEUED)
  totalDiscovered Int       @default(0)
  totalCompleted  Int       @default(0)
  createdAt     DateTime    @default(now())
  completedAt   DateTime?
  user          User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  jobs          ScrapeJob[]
  @@index([userId, createdAt(sort: Desc)])
  @@index([status])
}

model CreditLedger {
  id        String   @id @default(cuid())
  userId    String
  delta     Int                               // +grant / -spend
  reason    String                            // "scrape", "topup", "monthly_grant"
  refType   String?                           // "ScrapeJob" | "CrawlJob" | "Stripe"
  refId     String?
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, createdAt(sort: Desc)])
}
```

---

## 4. API routes

All `/api/v1/*` use **Bearer API key** auth. All `/api/dashboard/*` use **NextAuth session**. Validation via Zod schemas under [src/lib/validators/](src/lib/validators/). Errors return `{ success: false, error: { code, message } }` with proper status codes.

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| POST | `/api/v1/scrape` | Bearer | `{ url, formats?: ['markdown'\|'html'\|'screenshot'\|'links'\|'extract'], onlyMainContent?, includeTags?, excludeTags?, waitFor?, timeout?, mobile?, js?, extract?: { schema?, prompt?, systemPrompt? }, async?: boolean, webhook? }` | `{ success, data: { markdown?, html?, screenshot?, links?, extract?, metadata }, jobId, creditsUsed }` (or `{ jobId }` if `async`) |
| GET | `/api/v1/scrape/:id` | Bearer | – | Same data shape; status indicates progress |
| POST | `/api/v1/crawl` | Bearer | `{ url, limit?, maxDepth?, includePaths?, excludePaths?, allowExternalLinks?, scrapeOptions?, webhook? }` | `{ success, jobId, url: "/api/v1/crawl/:id" }` |
| GET | `/api/v1/crawl/:id` | Bearer | `?next=cursor` | `{ status, total, completed, creditsUsed, next?, data: ScrapeResult[] }` |
| DELETE | `/api/v1/crawl/:id` | Bearer | – | `{ success, status: "cancelled" }` |
| POST | `/api/v1/map` | Bearer | `{ url, search?, limit?, includeSubdomains? }` | `{ success, links: string[] }` |
| POST | `/api/v1/extract` | Bearer | `{ urls: string[], schema?, prompt?, systemPrompt?, enableWebSearch? }` | `{ success, data, jobId }` |
| GET | `/api/v1/usage` | Bearer | – | `{ creditsBalance, creditsUsedThisPeriod, periodStart, periodEnd }` |
| POST | `/api/auth/[...nextauth]` | – | NextAuth handlers | – |
| GET | `/api/dashboard/jobs` | Session | `?status&cursor&limit` | Paginated `ScrapeJob[]` |
| GET | `/api/dashboard/jobs/:id` | Session | – | `ScrapeJob + ScrapeResult` |
| GET | `/api/dashboard/api-keys` | Session | – | `ApiKey[]` (no `hashedKey`) |
| POST | `/api/dashboard/api-keys` | Session | `{ name }` | `{ key }` (plaintext, **shown once**) |
| DELETE | `/api/dashboard/api-keys/:id` | Session | – | `{ success }` |
| GET | `/api/dashboard/usage` | Session | `?from&to` | Aggregated CreditLedger |

> Every route handler must `await context.params` (Next 16). API v1 routes MUST set `'use cache'` to `false` (don't apply) — they're inherently dynamic.

---

## 5. Directory structure

```
src/
├── app/
│   ├── (marketing)/                        # route group, no URL segment
│   │   ├── layout.tsx                      # marketing nav + footer
│   │   ├── page.tsx                        # landing (hero, demo, pricing teaser)
│   │   ├── pricing/page.tsx
│   │   └── docs/[[...slug]]/page.tsx       # MDX-driven docs
│   ├── (dashboard)/
│   │   ├── layout.tsx                      # auth gate + sidebar
│   │   ├── dashboard/page.tsx              # overview
│   │   ├── dashboard/playground/page.tsx   # interactive scrape tester
│   │   ├── dashboard/jobs/page.tsx
│   │   ├── dashboard/jobs/[id]/page.tsx
│   │   ├── dashboard/api-keys/page.tsx
│   │   └── dashboard/usage/page.tsx
│   ├── (auth)/
│   │   ├── sign-in/page.tsx
│   │   └── sign-out/page.tsx
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts
│   │   ├── v1/
│   │   │   ├── scrape/route.ts
│   │   │   ├── scrape/[id]/route.ts
│   │   │   ├── crawl/route.ts
│   │   │   ├── crawl/[id]/route.ts
│   │   │   ├── map/route.ts
│   │   │   ├── extract/route.ts
│   │   │   └── usage/route.ts
│   │   └── dashboard/
│   │       ├── jobs/route.ts
│   │       ├── jobs/[id]/route.ts
│   │       ├── api-keys/route.ts
│   │       ├── api-keys/[id]/route.ts
│   │       └── usage/route.ts
│   ├── layout.tsx                          # already exists — keep, add ThemeProvider
│   ├── globals.css                         # extend with shadcn tokens
│   └── favicon.ico
├── components/
│   ├── ui/                                 # shadcn primitives
│   ├── marketing/                          # Hero, Features, CodeBlock, PricingTable
│   ├── dashboard/                          # JobsTable, ApiKeyDialog, UsageChart, Playground
│   └── theme-provider.tsx                  # next-themes (forced 'dark' for v1)
├── lib/
│   ├── db.ts                               # singleton PrismaClient
│   ├── auth.ts                             # NextAuth v5 config + handlers
│   ├── api-key.ts                          # generate, hash (sha256), verify
│   ├── credits.ts                          # debit/refund (transactional)
│   ├── ratelimit.ts                        # per-user + per-host (Upstash sliding window)
│   ├── queue.ts                            # BullMQ producer
│   ├── r2.ts                               # S3 client → Cloudflare R2
│   ├── errors.ts                           # API error helpers
│   ├── validators/                         # zod
│   │   ├── scrape.ts
│   │   ├── crawl.ts
│   │   ├── map.ts
│   │   └── extract.ts
│   └── utils.ts                            # cn(), etc.
├── server/                                 # imported by both API routes AND workers
│   ├── scraper/
│   │   ├── browser.ts                      # Playwright lifecycle, page pool
│   │   ├── fetcher.ts                      # http-only fast path (undici + Readability)
│   │   ├── readability.ts                  # @mozilla/readability adapter
│   │   ├── turndown.ts                     # html → markdown
│   │   ├── screenshot.ts
│   │   ├── links.ts                        # extract + normalize <a href>
│   │   ├── stealth.ts                      # playwright-extra-plugin-stealth setup
│   │   └── strategy.ts                     # decide: http | playwright | proxy-playwright
│   ├── ai/
│   │   ├── claude.ts                       # Anthropic SDK singleton
│   │   ├── extract.ts                      # schema-based extraction
│   │   ├── infer-schema.ts                 # schema-free mode
│   │   └── prompts.ts                      # system prompts (cached)
│   ├── crawl/
│   │   ├── frontier.ts                     # BFS frontier with dedup
│   │   ├── sitemap.ts                      # /sitemap.xml + /robots.txt parsing
│   │   └── filters.ts                      # include/exclude path matching
│   └── proxy/
│       └── brightdata.ts                   # opt-in proxy provider
├── workers/
│   ├── index.ts                            # entry: starts all workers, wires signals
│   ├── scrape.worker.ts                    # BullMQ Worker for "scrape" queue
│   ├── crawl.worker.ts                     # BullMQ Worker for "crawl" queue
│   └── extract.worker.ts                   # BullMQ Worker for "extract" queue
├── types/
│   ├── api.ts                              # shared API request/response types
│   └── next-auth.d.ts                      # session augmentation
└── middleware.ts                           # /dashboard auth gate, CORS for /api/v1
```

`tsconfig.json` already has `@/*` → `./src/*`. Workers compile under the same tsconfig — they're invoked with `tsx` in dev and Docker-built for prod. **Do not** introduce a separate worker package — sharing `src/server/*` and `src/lib/db.ts` between API routes and workers is the whole point.

---

## 6. Feature inventory — Firecrawl parity matrix

Every feature Firecrawl advertises, grouped by domain. Each row is marked **MVP** (ship with v1), **Fast-follow** (within 2 weeks of GA), or **Defer** (post-GA / enterprise-only). This list drives the phase plan below.

### 6.1 Core endpoints

| Endpoint | Verb(s) | Tier | Notes |
|---|---|---|---|
| `/v1/scrape` | POST | **MVP** | Single URL → markdown + optional formats |
| `/v1/crawl` | POST, GET, DELETE | **MVP** | BFS crawler with filters; `GET /v1/crawl/:id` status + `GET /v1/crawl/:id/errors` |
| `/v1/map` | POST | **MVP** | Sitemap-first URL discovery |
| `/v1/extract` | POST, GET | **MVP** | Schema/prompt extraction, multi-URL, wildcard (`example.com/*`) |
| `/v1/batch/scrape` | POST, GET | **MVP** | Batch multiple URLs in one job, poll for results |
| `/v1/search` | POST | **Fast-follow** | Search web + optional scrape of results (web / news / images) |
| `/v1/browser` (sessions) | POST, GET, DELETE | **Defer** | Managed persistent browser contexts for multi-step workflows |
| `/v1/deep-research` | POST | **Defer** | Agentic research over a topic (Firecrawl's `FIRE-1`) |
| `/v1/usage` | GET | **MVP** | Credit balance + current-period usage |

### 6.2 Scrape output formats

| Format | Tier | Credit delta | Notes |
|---|---|---|---|
| `markdown` | **MVP** | 0 | Readability + Turndown |
| `html` | **MVP** | 0 | Cleaned/sanitized HTML |
| `rawHtml` | **MVP** | 0 | Pre-processing HTML (post-render if JS on) |
| `links` | **MVP** | 0 | Deduped absolute URLs |
| `screenshot` | **MVP** | 0 | PNG/JPEG, `fullPage`, `quality`, `viewport` options |
| `images` | **MVP** | 0 | All `<img>` src URLs resolved |
| `json` (schema extract) | **MVP** | +4 | Same pipeline as `/extract` but inline |
| `summary` | **Fast-follow** | +2 | Condensed overview via Claude |
| `branding` | **Fast-follow** | +2 | Colors, fonts, typography, UI tokens — useful for design tools |
| `changeTracking` | **Fast-follow** | +0 / +5 (json mode) | Diff vs previous snapshot |
| `audio` (YouTube etc.) | **Defer** | +4 | MP3 extraction via yt-dlp or similar |

### 6.3 Scrape parameters

| Parameter | Tier | Notes |
|---|---|---|
| `url` | **MVP** | required |
| `formats[]` | **MVP** | see §6.2 |
| `onlyMainContent` | **MVP** | strip nav/footer/ads via Readability |
| `includeTags[]` / `excludeTags[]` | **MVP** | CSS selector allow/blocklist |
| `waitFor` | **MVP** | CSS selector OR ms |
| `timeout` | **MVP** | per-request, default 30s |
| `mobile` | **MVP** | mobile viewport + UA |
| `skipTlsVerification` | **MVP** | for self-signed certs |
| `blockAds` | **MVP** | uBlock list on the Playwright context |
| `removeBase64Images` | **MVP** | strip data URIs pre-markdown |
| `fastMode` | **Fast-follow** | HTTP-only path, no JS rendering, no screenshot |
| `country` (ISO alpha-2) | **Fast-follow** | proxy/Geo-IP pinning |
| `languages[]` | **Fast-follow** | `Accept-Language` priority |
| `proxy: "basic" \| "stealth" \| "auto"` | **Fast-follow** | basic free, stealth +4 credits |
| `maxAge` (cache freshness ms, default 172800000 = 2d) | **MVP** | cached results still cost 1 credit |
| `minAge` | **Fast-follow** | cache-only lookup |
| `storeInCache` | **MVP** | boolean, disables cache for one call |
| `zeroDataRetention` (ZDR) | **Defer** | enterprise; delete payload after response |
| `actions[]` (click/wait/scroll/write/press/screenshot/executeJavascript) | **Fast-follow** | multi-step page manipulation before scrape |

### 6.4 Crawl parameters

| Parameter | Tier | Notes |
|---|---|---|
| `url`, `limit` (default 10000) | **MVP** | |
| `maxDiscoveryDepth` | **MVP** | depth-from-root hop count |
| `includePaths[]` / `excludePaths[]` | **MVP** | regex patterns on path |
| `regexOnFullURL` | **MVP** | match full URL including query |
| `crawlEntireDomain` | **MVP** | follow siblings/parents, not just forward links |
| `allowSubdomains` | **MVP** | |
| `allowExternalLinks` | **MVP** | |
| `sitemap: "include" \| "skip" \| "only"` | **MVP** | default include |
| `ignoreQueryParameters` | **MVP** | dedupe `/foo?a=1` vs `/foo?a=2` |
| `delay` (seconds between scrapes) | **MVP** | |
| `maxConcurrency` | **MVP** | bounded by plan |
| `scrapeOptions` (all §6.3 options) | **MVP** | applied per child scrape |
| `prompt` (NL → auto-config) | **Fast-follow** | Claude generates crawl config from natural language |
| `webhook` (events: `started`/`page`/`completed`/`failed`) | **MVP** | |
| WebSocket streaming watcher | **Fast-follow** | `document`/`error`/`done` events |
| Pagination via `next` (10MB chunks) | **MVP** | |

### 6.5 Extract parameters

| Parameter | Tier | Notes |
|---|---|---|
| `urls[]` (including wildcards `example.com/*`) | **MVP** | wildcard triggers internal crawl |
| `schema` (JSON Schema) | **MVP** | Ajv-validated |
| `prompt` (natural language) | **MVP** | |
| `systemPrompt` | **MVP** | override default |
| `enableWebSearch` | **Fast-follow** | pulls supporting pages via `/search` |
| `agent: { model: "peep-agent-1" }` | **Defer** | multi-page browser-navigating extraction |
| Prompt-only (no URLs) | **Defer** | alpha in Firecrawl; Claude decides what to scrape |

### 6.6 Search parameters

| Parameter | Tier | Notes |
|---|---|---|
| `query` | **Fast-follow** | required |
| `limit` | **Fast-follow** | |
| `location`, `lang`, `country` | **Fast-follow** | |
| `tbs` (time filter: `qdr:d`/`qdr:w`/custom date) | **Fast-follow** | |
| `sources: ["web","news","images"]` | **Fast-follow** | |
| `categories: ["github","research","pdf"]` | **Fast-follow** | |
| `scrapeOptions` | **Fast-follow** | scrape each result page |
| Search provider | – | Brave Search API or SerpAPI — user decision, see Open Questions |

### 6.7 Anti-bot / infra

| Capability | Tier | Notes |
|---|---|---|
| Proxy tiers (basic / stealth / auto) | **Fast-follow** | stealth via Bright Data |
| UA rotation + `Sec-CH-UA` headers | **MVP** | |
| `playwright-extra` stealth plugin | **MVP** | |
| robots.txt honoring + override flag | **MVP** | PRO plan can override |
| Per-user rate limits (plan-tiered) | **MVP** | sliding window on Upstash |
| Per-host rate limits + concurrency cap | **MVP** | |
| Retry/backoff with jitter | **MVP** | |
| Block detection + strategy escalation | **Fast-follow** | HTTP → Playwright → proxy-Playwright |
| Per-host success-strategy cache (Redis) | **Fast-follow** | remember what worked |

### 6.8 Developer ergonomics

| Feature | Tier | Notes |
|---|---|---|
| Python SDK (`peep-py`) | **Fast-follow** | auto-generated from OpenAPI |
| JS/TS SDK (`@peep/sdk`) | **MVP** | hand-tuned (we'll dogfood it in the playground) |
| CLI (`peep-cli`) | **Fast-follow** | wraps the JS SDK |
| MCP server (Claude/Cursor/VS Code) | **Fast-follow** | exposes scrape/extract/crawl as MCP tools |
| OpenAPI spec at `/api/v1/openapi.json` | **MVP** | drives SDK generation |
| Swagger UI at `/api-reference` | **MVP** | |
| Webhooks signing (HMAC-SHA256) | **MVP** | |
| Batch ID job tracking + polling | **MVP** | |
| Self-host (docker-compose) | **Defer** | open-source a stripped version |

### 6.9 Dashboard & commercial

| Feature | Tier | Notes |
|---|---|---|
| Sign-in (Google + GitHub) | **MVP** | |
| API key mgmt (create/list/revoke, one-time reveal) | **MVP** | |
| Credit balance + ledger | **MVP** | |
| Usage chart (daily, last 30d) | **MVP** | |
| Jobs list + individual job viewer | **MVP** | |
| Interactive playground | **MVP** | |
| Crawl job live progress viewer | **Fast-follow** | |
| Pricing page + Stripe checkout | **MVP** | Free / Hobby / Standard / Growth / Scale / Enterprise (mirror Firecrawl tiers) |
| Auto-recharge credit packs | **Fast-follow** | rollover |
| Plan-tiered rate limits (concurrent + rpm) | **MVP** | |
| Team seats | **Defer** | |
| SSO (SAML/OIDC) | **Defer** | enterprise |
| Zero Data Retention (ZDR) | **Defer** | enterprise |
| SLA dashboard | **Defer** | |
| MDX docs site | **MVP** | |
| Changelog page | **Fast-follow** | |

### 6.10 Performance + ops targets (borrowed from Firecrawl)

| Metric | Target |
|---|---|
| Web coverage (JS-heavy included) | ≥ 90% at GA (Firecrawl claims 96%) |
| p95 scrape latency (cache cold) | ≤ 5s (Firecrawl claims 3.4s) |
| Cache hit latency | ≤ 300ms |
| Worker uptime | 99.9% |
| Queue depth alarm | > 100 or wait > 30s |

---

## 7. Phased build plan (Firecrawl-parity build order)

Revised into **10 phases** (0–9). Every feature from §6 is placed. Tiering: `[MVP]` ships at GA; `[FF]` is fast-follow within 2 weeks; `[D]` is deferred. Effort: S ≤ 3d, M 4–6d, L 7+d.

### Phase 0 — Pre-flight (S, 0.5d)
Init git, create OAuth apps (Google, GitHub), provision Neon + Upstash + Cloudflare R2 + Anthropic accounts, write [.env.example](.env.example), pin Node version.

### Phase 1 — Foundation (S, ~3d)
shadcn (black theme, Tailwind v4 CSS-first), Prisma + Neon migrations, NextAuth v5 (Google + GitHub), landing-page shell, forced dark mode. Enable `cacheComponents: true` in [next.config.ts](next.config.ts). **No scraping logic.**

### Phase 2 — Dashboard + API keys + credit ledger (M, ~4d)
Dashboard layout, API key CRUD (one-time reveal), credit ledger + signup grant, usage page (balance + last 50 ledger rows), plan-tier enum wired.
`[MVP]` API keys, credits, ledger, plan tiers stub.

### Phase 3 — `/scrape` MVP: HTTP-only, all non-JS formats (L, ~7d)
Bearer auth, zod validators, SSRF guard. `ScrapeJob` rows, synchronous response. Built-in page cache (Postgres `ScrapeResult` reused per-URL within `maxAge`).
`[MVP]` formats: `markdown`, `html`, `rawHtml`, `links`, `images`, `screenshot` (HTTP-only falls back to "unavailable" for screenshot — real screenshot arrives in Phase 4). Params: `url`, `formats[]`, `onlyMainContent`, `includeTags`, `excludeTags`, `waitFor` (HTTP mode = timeout only), `timeout`, `mobile` (UA only), `skipTlsVerification`, `blockAds` (NOOP until Phase 4), `removeBase64Images`, `maxAge`, `minAge`, `storeInCache`. Playground UI.
`[FF]` `fastMode` alias for "force HTTP path".

### Phase 4 — Queue + Playwright worker + proxy tiers + actions (L, ~10d)
BullMQ + Upstash Redis. Fly.io worker with Dockerfile. Playwright + `playwright-extra` stealth. Browser pool (1 chromium, N contexts, recycle every 50 pages). R2 upload for screenshots and raw HTML. Refactor `/scrape` route to enqueue + wait (Postgres LISTEN/NOTIFY with 60s timeout).
`[MVP]` JS rendering path, real `screenshot` (fullPage, quality, viewport), `blockAds` via uBlock list, real `waitFor` (selector or ms), `mobile` viewport, `country`/`languages` applied to context.
`[FF]` `actions[]` (click, wait, scroll, write, press, screenshot, executeJavascript), `proxy: basic|stealth|auto` wiring (Bright Data integration), strategy-escalation cache per host.

### Phase 5 — AI formats + `/extract` endpoint (L, ~7d)
Claude SDK singleton, prompt-caching strategy (§8). Ajv validation. `json` format on `/scrape` via inline extraction. Standalone `/api/v1/extract` with `urls[]` (including `example.com/*` wildcard → internal crawl + extract), `schema`, `prompt`, `systemPrompt`.
`[MVP]` `json` format (+4 credits), `/extract` single-URL + multi-URL + wildcard, schema-free mode (return schema + data).
`[FF]` `summary` format (+2), `branding` format (+2), `enableWebSearch` (depends on Phase 7 `/search`), NL `prompt` auto-generating crawl options (depends on Phase 6).
`[D]` `agent: { model: "peep-agent-1" }`, prompt-only-no-URLs.

### Phase 6 — `/crawl`, `/map`, `/batch/scrape`, webhooks, WebSocket streaming (L, ~10d)
Full crawl params (§6.4): `crawlEntireDomain`, `allowSubdomains`, `allowExternalLinks`, `sitemap: include|skip|only`, `ignoreQueryParameters`, `regexOnFullURL`, `delay`, `maxConcurrency`, `includePaths`/`excludePaths`, `maxDiscoveryDepth`. Pagination via `next` (10MB chunks). Cancellation. Webhook emitter (HMAC-SHA256 signed) with events `crawl.started`/`page`/`completed`/`failed`. WebSocket watcher at `/api/v1/crawl/:id/watch` emitting `document`/`error`/`done`. Batch scrape endpoint + job tracking. `GET /api/v1/crawl/:id/errors`.
`[MVP]` all above.
`[FF]` NL `prompt` → crawl config (Claude generates config JSON).

### Phase 7 — `/search` + `changeTracking` + anti-bot hardening (M, ~6d)
`/api/v1/search` with provider abstraction (Brave / SerpAPI — see Open Questions). `sources: web|news|images`, `categories: github|research|pdf`, `tbs`, `location/lang/country`, optional `scrapeOptions`. `changeTracking` format on `/scrape` (and via `scrapeOptions` on `/crawl`): `git-diff` + `json` modes, `tag` for scoped histories, `ChangeSnapshot` table. Robots.txt enforcement + override flag, per-user + per-host rate limiting (Upstash sliding window), retry/backoff, block-detection + strategy escalation.
`[FF]` `/search`, `changeTracking` both modes.
`[MVP]` rate limits, robots, block detection — these are non-negotiable before broad beta.

### Phase 8 — SDKs + MCP + developer ergonomics (M, ~6d)
OpenAPI 3.1 spec at `/api/v1/openapi.json` auto-generated from zod. Swagger UI at `/api-reference`. Hand-tuned JS/TS SDK (`@peep/sdk`) used by the playground. Auto-generated Python SDK (`peep-py`) via `openapi-python-client`. CLI (`peep-cli`) wrapping JS SDK. MCP server exposing `scrape`/`extract`/`crawl`/`map`/`search` as tools. MDX docs at `/docs/*`.
`[MVP]` OpenAPI, Swagger UI, JS SDK, MDX docs.
`[FF]` Python SDK, CLI, MCP server.
`[D]` Self-host docker-compose, browser sandbox sessions.

### Phase 9 — Billing + observability + prod deploy (L, ~7d)
Stripe checkout (6 tiers mirroring Firecrawl: Free/Hobby/Standard/Growth/Scale/Enterprise), webhook (`invoice.paid`, `customer.subscription.updated`), credit auto-recharge packs with rollover. Sentry + pino structured logging + Bull Board admin at `/admin/queues`. Vitest unit + Playwright e2e + testcontainers integration. Deploy: Vercel (app), Fly.io (worker), Upstash pay-as-you-go, Neon Pro. R2 lifecycle rules (30d screenshots free, forever PRO).
`[MVP]` Stripe, Sentry, tests, deploy.
`[FF]` Auto-recharge, changelog page, crawl-live-progress viewer.
`[D]` Team seats, SSO, SLA dashboard, ZDR.

### Scope cuts if timeline slips
Kill in this order: MDX docs (Phase 8) → Python SDK (Phase 8) → `branding`/`summary` formats (Phase 5) → WebSocket streaming (Phase 6) → `/search` (Phase 7).

---

## 8. AI extraction design

### Modes
1. **Schema-based** (primary): User supplies a JSON Schema. Claude returns JSON that validates against it. We pass the schema as the **first content block** so it's stable across pages and benefits from prompt caching.
2. **Schema-free**: User provides only a natural-language `prompt` ("extract pricing tiers"). Claude infers a schema and fills it. Returned schema is included so the user can lock it in for subsequent calls.

### Inputs (in order)
1. **System prompt** (~1.5k tokens, cached) — extraction rules, format constraints, examples.
2. **User-provided JSON Schema** (cached at `cache_control: { type: "ephemeral" }` so it's reusable across many URLs from the same caller).
3. **Page content** — clean **markdown** (Readability + Turndown), not raw HTML. ~5-15× cheaper. Truncate at 50k tokens.
4. **Optional screenshot** (if `extract.useVision: true`) — 1280×800 viewport, JPEG q70.

### Model choice
- **Default**: `claude-haiku-4-5-20251001` — fast, cheap, sufficient for most extractions
- **Pro tier**: `claude-sonnet-4-6` for complex/multimodal — opt-in via plan + `extract.model` override

### Prompt caching strategy
- Cache breakpoints: **system prompt** + **user schema**. Page content is never cached (unique per request).
- Use `cache_control: { type: "ephemeral" }` (5-min TTL). For users repeatedly extracting from many URLs with the same schema, the second-and-onward calls hit cache → ~90% of the static prefix is free input cost.
- Track cache hit rate per request in worker logs (Anthropic returns `usage.cache_read_input_tokens`).

### Cost per scrape (Haiku 4.5, schema-based)
- Input: 1.5k system (cached after 1st) + 0.5k schema (cached) + 8k markdown = 10k uncached / 8k uncached after cache hit
- Output: ~400 tokens
- Haiku 4.5 pricing (estimate): ~$1/M input, ~$5/M output
- **First call**: 10k × $1/M + 0.4k × $5/M ≈ **$0.012**
- **Cached calls**: 8k × $1/M + 2k × $0.10/M (cached) + 0.4k × $5/M ≈ **$0.010**
- Adds ~$0.01 to ~$0.02 per scrape on top of infra cost

> **Gotcha**: Anthropic's prompt cache has 5-min TTL. Don't put per-page data above the cache breakpoint or you blow the cache. Schema goes ABOVE markdown content in the request structure.

---

## 9. Anti-bot strategy (generic web)

| Layer | Implementation |
|---|---|
| **User-Agent** | Rotate among ~5 real Chrome UAs (kept in [src/server/scraper/stealth.ts](src/server/scraper/stealth.ts), updated quarterly). Match `Sec-CH-UA` headers. |
| **Browser fingerprint** | `playwright-extra` + `puppeteer-extra-plugin-stealth` (Playwright-compatible build) — patches `navigator.webdriver`, plugins, languages, WebGL vendor, etc. |
| **robots.txt** | Fetch + parse on first scrape per host; cache 24h in Redis. **Honor by default**; allow per-request `respectRobotsTxt: false` (gated to PRO tier — log this for compliance). |
| **Per-host rate limit** | Upstash sliding window: default 1 req/s per host. Per-user override up to 10 req/s on PRO. |
| **Per-user rate limit** | Plan-tier dependent (e.g. FREE: 10 req/min, PRO: 100 req/s). 429 with `Retry-After` header. |
| **Retry/backoff** | 3 retries on 5xx and network errors, exponential 1s/2s/4s with full jitter. **Don't** retry 4xx (except 429/408). |
| **Block detection** | After response: check status (403/429/503), check HTML for known challenge fingerprints (`cf-ray`, "Just a moment", DataDome, PerimeterX). If matched → escalate strategy: HTTP-only → headed Playwright → Bright Data Scraping Browser. |
| **Proxy** | Off by default. Opt-in `useProxy: true` (PRO) routes via Bright Data residential pool. Charge 5× credits. |
| **Concurrency per host** | Hard cap of 2 concurrent connections per `eTLD+1` to avoid DoS-ing small sites. |
| **Cookies / sessions** | Per-job ephemeral context. `persistContext: true` flag (PRO) keeps a named browser context for sites needing session continuity (carts, wizards). |

Compliance footnote: log `respectRobotsTxt: false` invocations for audit; refuse to scrape `*.gov` with that flag off-by-default; maintain a hard blocklist of obviously-illegal targets.

---

## 10. Open questions (need decisions before / during build)

1. **Queue: BullMQ vs Inngest vs Trigger.dev?**
   - BullMQ is cheap and self-contained but you babysit Redis and observability.
   - Inngest is durable functions on serverless (no worker process needed) — but Playwright still needs a long-running host, so it doesn't eliminate the worker. Recommend BullMQ.
2. **Sync `/scrape` default?** Firecrawl defaults to sync with a max ~30s wait. Match that behavior, or async-by-default and force users to opt into sync? **Recommend: sync default, 60s timeout, with `Prefer: respond-async` header escape hatch.**
3. **Hosting for Next.js app**: Vercel (easiest, pricey egress) or Fly.io (collocated with worker, cheaper)? **Recommend Vercel for v1**, Fly.io if egress costs become real.
4. **Screenshot storage TTL?** R2 forever (storage cheap), 30d, or per-plan? **Recommend 30d default, FOREVER on PRO.**
5. **Webhooks** for async jobs in v1, or punt? **Recommend punt to Phase 6.**
6. **Pricing model**: pure credits (1 scrape = 1 credit, +N for proxy/extract) vs per-feature billing? **Recommend credits — single SKU, easier UX.** Plans: FREE 500 credits one-time, HOBBY $20/mo 5k credits, PRO $99/mo 50k credits + proxy access, ENTERPRISE custom.
7. **`git init` now?** No `.git` exists. Confirm before committing anything.
8. **Repo structure**: monorepo (Turbo) for app + worker, or single package as planned? **Single package**, since they share most code; only deployment artifacts differ.
9. **Multimodal extraction default?** Sending screenshots to Claude doubles cost. **Recommend off-by-default**, opt-in flag.
10. **Brand**: confirm "Peep" trademark availability, decide on logo direction before Phase 1 landing build.
11. **Tailwind v4 + shadcn**: shadcn's v4 support is recent — pin shadcn CLI version explicitly to avoid breakage.
12. **Email**: NextAuth supports magic-link. Skip in v1 (Google + GitHub are enough)? **Recommend yes, skip.**

---

## Verification (end-to-end smoke test for each phase)

| Phase | How to verify |
|---|---|
| 0 | `git status` clean, `.env.local` populated, `.env.example` committed, cloud accounts provisioned |
| 1 | `yarn dev` → visit `/`, confirm dark theme; sign in with Google + GitHub → `/dashboard` placeholder loads; `prisma studio` shows User row |
| 2 | Create API key in dashboard UI → confirm shown once → DB row has only hash → revoke → list excludes. Ledger shows 500-credit signup grant. |
| 3 | `curl` against `/api/v1/scrape` for `https://example.com` with every non-JS format → markdown/html/rawHtml/links/images returned, credit decrements, ledger row created. Re-request within `maxAge` hits cache (still 1 credit, but <300ms). Bad key → 401. |
| 4 | Same curl with `https://nextjs.org` (JS-heavy) with `formats: ["markdown","screenshot"]` + `actions: [{type:"click",selector:"..."}]` → returns rendered content + screenshot signed URL. `proxy:"stealth"` against a Cloudflare page succeeds. `fly logs -a peep-worker` shows job processed. |
| 5 | `formats:["json"]` with product schema → JSON matches. `/api/v1/extract` with wildcard `example.com/*` → crawls + extracts. Second identical request within 5 min shows `cache_read_input_tokens > 0`. |
| 6 | `/api/v1/crawl` against a small docs site (`limit: 50, crawlEntireDomain: true`) → poll `/api/v1/crawl/:id` until `status: done` → paginated via `next`. Webhook receives signed `crawl.page` + `crawl.completed` events. WS watcher streams documents. `/api/v1/batch/scrape` with 10 URLs returns consolidated job. |
| 7 | `/api/v1/search?query=firecrawl&sources=web,news&scrapeOptions={formats:[markdown]}` returns enriched results. Scrape with `formats:["markdown","changeTracking"]` twice on a changing page → second call returns `changeStatus:"changed"` with git-diff. 50 concurrent same-host requests throttled to 1/s. robots.txt `Disallow` → 403 without override. |
| 8 | `GET /api/v1/openapi.json` returns valid OpenAPI. `npm i @peep/sdk && npx peep scrape https://example.com` works end-to-end. Swagger UI renders at `/api-reference`. MCP server registered in Claude Desktop calls `peep.scrape`. |
| 9 | Stripe test subscription → credits added, plan updated; force a worker exception → Sentry captures it; `yarn test` + `yarn test:e2e` pass in CI; Vercel + Fly prod deploys green. |

**Local dev loop**: `yarn dev` (Next.js) + `yarn worker` (`tsx watch src/workers/index.ts`) + `docker compose up redis` (or just point at Upstash). Required env vars in [.env.example](.env.example): `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET`, `ANTHROPIC_API_KEY`, `UPSTASH_REDIS_REST_URL/TOKEN`, `REDIS_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `BRIGHTDATA_PROXY_URL` (Phase 4), `BRAVE_SEARCH_API_KEY` or `SERPAPI_KEY` (Phase 7), `STRIPE_SECRET_KEY` (Phase 9), `SENTRY_DSN` (Phase 9), `WEBHOOK_SIGNING_SECRET` (Phase 6).


---

# Detailed Build Phases (ground-up)

Each phase is self-contained: prereqs → steps → files → verification → pitfalls. `[cmd]` = shell command. `[file]` = file to create/edit. `[✓]` = verification checkpoint.

---

## Phase 0 — Pre-flight (30 min)

Everything you need before Phase 1 starts. Do not skip.

### Steps
1. **Initialize git** (no `.git` exists today):
   - `[cmd]` `git init && git branch -M main`
   - `[file]` Create [.gitignore](.gitignore) with Next.js defaults + `.env*`, `node_modules/`, `.next/`, `prisma/*.db`, `*.log`, `.DS_Store`.
   - `[cmd]` `git add . && git commit -m "chore: initial scaffold"`
2. **Provision cloud accounts** (free tiers fine for Phase 1):
   - Neon: create project `peep`, branch `main`. Copy pooled + direct connection strings.
   - Upstash Redis: DB `peep-queue` (us-east, free tier). Copy REST URL + token.
   - Google Cloud: OAuth 2.0 client ID (Web app). Authorized redirect: `http://localhost:3000/api/auth/callback/google`.
   - GitHub: OAuth App. Callback: `http://localhost:3000/api/auth/callback/github`.
   - Anthropic: API key (reserve — first used in Phase 5).
   - Cloudflare R2: bucket `peep-artifacts` (reserve — Phase 4).
3. **Create [.env.example](.env.example)** with every var name (empty values), committed:
   ```
   DATABASE_URL=
   DIRECT_URL=
   NEXTAUTH_SECRET=
   NEXTAUTH_URL=http://localhost:3000
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=
   GITHUB_CLIENT_ID=
   GITHUB_CLIENT_SECRET=
   ANTHROPIC_API_KEY=
   UPSTASH_REDIS_REST_URL=
   UPSTASH_REDIS_REST_TOKEN=
   REDIS_URL=              # BullMQ wire protocol (not REST)
   R2_ACCOUNT_ID=
   R2_ACCESS_KEY_ID=
   R2_SECRET_ACCESS_KEY=
   R2_BUCKET=
   BRIGHTDATA_PROXY_URL=   # optional
   SENTRY_DSN=             # Phase 9
   STRIPE_SECRET_KEY=      # Phase 9
   BRAVE_SEARCH_API_KEY=   # Phase 7 (or SERPAPI_KEY)
   WEBHOOK_SIGNING_SECRET= # Phase 6
   ```
4. **Create [.env.local](.env.local)** (not committed) with real values for Neon + OAuth now; fill others as phases require. Generate `NEXTAUTH_SECRET` with `openssl rand -base64 32`.
5. **Pin Node version**: `[file]` `.nvmrc` = `20.18.0` (Next 16 supports ≥20; Node 25 is fine locally but pin for Docker/Fly parity).

### [✓] Checkpoint
- `git status` clean. `.env.local` **not** staged. `yarn dev` still runs the default page.

---

## Phase 1 — Foundation: shadcn + Prisma + NextAuth + landing shell (2-3 days)

**Goal**: App boots in dark theme, users can sign in/out, DB has NextAuth tables, landing page exists. **Zero scraping logic.**

### 1.1 shadcn init (black theme, Tailwind v4)
Because Tailwind v4 is CSS-first, shadcn CLI writes tokens into [src/app/globals.css](src/app/globals.css) rather than a `tailwind.config.js`.
1. `[cmd]` `yarn add -D shadcn@latest` (pin once installed; v4 support is recent)
2. `[cmd]` `npx shadcn@latest init` — answers: **Style**: new-york · **Base color**: zinc · **CSS variables**: yes · **Path alias**: `@/components`
3. Installs [components.json](components.json), creates [src/components/ui/](src/components/ui/), extends [src/app/globals.css](src/app/globals.css) with `@layer base` tokens (`--background`, `--foreground`, `--primary`, etc.) and `:root` + `.dark` variants.
4. Install initial primitives: `[cmd]` `npx shadcn@latest add button card input label dialog dropdown-menu table toast sheet separator badge avatar skeleton`
5. **Force dark** for v1: in [src/app/layout.tsx](src/app/layout.tsx), add `className="dark"` on `<html>` (keep existing font vars). Later phases can add a theme toggle.
6. Replace the default `body { font-family: Arial, ...}` rule in [src/app/globals.css](src/app/globals.css) — shadcn tokens drive this now.

**[file]** modify [src/app/layout.tsx](src/app/layout.tsx):
```tsx
<html lang="en" className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
  <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
    {children}
  </body>
</html>
```

### 1.2 Prisma + Neon
1. `[cmd]` `yarn add -D prisma && yarn add @prisma/client`
2. `[cmd]` `npx prisma init --datasource-provider postgresql` — creates [prisma/schema.prisma](prisma/schema.prisma).
3. Replace schema with the full version from §3 above.
4. `[file]` [src/lib/db.ts](src/lib/db.ts) — singleton PrismaClient with global caching to survive HMR:
   ```ts
   import { PrismaClient } from "@prisma/client";
   const g = globalThis as unknown as { prisma?: PrismaClient };
   export const db = g.prisma ?? new PrismaClient();
   if (process.env.NODE_ENV !== "production") g.prisma = db;
   ```
5. `[cmd]` `npx prisma migrate dev --name init` — applies to Neon. Verify tables in `npx prisma studio`.

### 1.3 NextAuth v5 (Auth.js)
1. `[cmd]` `yarn add next-auth@beta @auth/prisma-adapter`
2. `[file]` [src/lib/auth.ts](src/lib/auth.ts):
   ```ts
   import NextAuth from "next-auth";
   import Google from "next-auth/providers/google";
   import GitHub from "next-auth/providers/github";
   import { PrismaAdapter } from "@auth/prisma-adapter";
   import { db } from "./db";

   export const { auth, handlers, signIn, signOut } = NextAuth({
     adapter: PrismaAdapter(db),
     providers: [Google, GitHub],
     session: { strategy: "database" },
     pages: { signIn: "/sign-in" },
     callbacks: {
       async session({ session, user }) {
         session.user.id = user.id;
         return session;
       },
     },
     events: {
       async createUser({ user }) {
         await db.creditLedger.create({
           data: { userId: user.id, delta: 500, reason: "signup_grant" },
         });
       },
     },
   });
   ```
3. `[file]` [src/app/api/auth/[...nextauth]/route.ts](src/app/api/auth/[...nextauth]/route.ts):
   ```ts
   export { GET, POST } from "@/lib/auth";
   ```
   (NextAuth v5 exports `handlers` — re-export directly, no factory wrapping.)
4. `[file]` [src/types/next-auth.d.ts](src/types/next-auth.d.ts) — augment `Session["user"]` to include `id` and `planTier`.
5. `[file]` [src/middleware.ts](src/middleware.ts) — gate `/dashboard` routes:
   ```ts
   export { auth as middleware } from "@/lib/auth";
   export const config = { matcher: ["/dashboard/:path*"] };
   ```
6. `[file]` [src/app/(auth)/sign-in/page.tsx](src/app/(auth)/sign-in/page.tsx) — two buttons calling `signIn("google")` / `signIn("github")` via a client component wrapper.
7. `[file]` [src/app/(dashboard)/dashboard/page.tsx](src/app/(dashboard)/dashboard/page.tsx) — placeholder `<h1>Dashboard</h1>` server component, uses `await auth()` to show email.

### 1.4 Landing shell
1. Rewrite [src/app/page.tsx](src/app/page.tsx) with a minimal hero: headline "Peep", subhead "One URL in, clean markdown + structured JSON out", CTA "Get an API key" → `/sign-in`, a static code block showing a `curl` example. Use shadcn `Button` + `Card`.
2. `[file]` [src/app/(marketing)/layout.tsx](src/app/(marketing)/layout.tsx) — top nav with `Peep` wordmark, links to `/pricing`, `/docs`, `/dashboard`.

### 1.5 Next.js 16 config
`[file]` modify [next.config.ts](next.config.ts) — add `experimental: { cacheComponents: true }` and allowlist image hosts (`lh3.googleusercontent.com`, `avatars.githubusercontent.com`).

### Files touched (Phase 1)
Create: [components.json](components.json), [prisma/schema.prisma](prisma/schema.prisma), [prisma/migrations/](prisma/migrations/), [src/lib/db.ts](src/lib/db.ts), [src/lib/auth.ts](src/lib/auth.ts), [src/app/api/auth/[...nextauth]/route.ts](src/app/api/auth/[...nextauth]/route.ts), [src/middleware.ts](src/middleware.ts), [src/types/next-auth.d.ts](src/types/next-auth.d.ts), [src/app/(auth)/sign-in/page.tsx](src/app/(auth)/sign-in/page.tsx), [src/app/(dashboard)/dashboard/page.tsx](src/app/(dashboard)/dashboard/page.tsx), [src/app/(marketing)/layout.tsx](src/app/(marketing)/layout.tsx), [src/components/ui/*](src/components/ui/), [src/components/marketing/Hero.tsx](src/components/marketing/Hero.tsx), [src/lib/utils.ts](src/lib/utils.ts).
Modify: [src/app/layout.tsx](src/app/layout.tsx), [src/app/page.tsx](src/app/page.tsx), [src/app/globals.css](src/app/globals.css), [next.config.ts](next.config.ts), [package.json](package.json).

### [✓] Acceptance
- `yarn dev` → landing page renders in forced dark theme
- `/sign-in` with Google **and** GitHub each flow back to `/dashboard` showing the logged-in email
- `npx prisma studio` shows `User`, `Account`, `Session`, `CreditLedger` rows after signup
- Sign-out redirects to `/`
- `yarn build` passes with no TS errors (Next 16 will complain about any un-awaited `params`)

### Pitfalls
- shadcn CLI on Tailwind v4 requires the newest CLI — old CLIs will write a `tailwind.config.js` that gets ignored. If tokens don't apply, check [src/app/globals.css](src/app/globals.css) has shadcn's `@layer base` block.
- NextAuth v5 is still beta — pin exact version. The `handlers` export shape is different from v4.
- In Next 16, **never** write `function Page({ params })` — it must be `async` and `await params`.

---

## Phase 2 — Dashboard + API key infrastructure (3-4 days)

**Goal**: Users can create API keys from the dashboard, revoke them, see them listed. Credit ledger tracked. No scraping endpoints yet.

### 2.1 API key module
1. `[file]` [src/lib/api-key.ts](src/lib/api-key.ts):
   - `generateApiKey()` → `{ full: "peep_live_<32 bytes base64url>", prefix: "peep_live_xxxxxxxx", hash: sha256(full) }`
   - `verifyApiKey(raw: string)` → reads `ApiKey` by `hashedKey`, constant-time compares, checks `revokedAt`, updates `lastUsedAt`, returns `{ userId, apiKeyId }` or null.
2. `[file]` [src/lib/credits.ts](src/lib/credits.ts):
   - `debitCredits(userId, amount, { refType, refId })` — Prisma `$transaction`: decrement `User.creditBalance`, insert `CreditLedger` row, throw `InsufficientCreditsError` if balance would go negative.
   - `refundCredits(userId, amount, ...)` — inverse.
3. `[file]` [src/lib/errors.ts](src/lib/errors.ts) — typed errors (`InsufficientCreditsError`, `InvalidApiKeyError`, etc.) + `toJsonError(err)` helper returning `{ code, message, status }`.

### 2.2 Dashboard API key routes (session-auth)
1. `[file]` [src/app/api/dashboard/api-keys/route.ts](src/app/api/dashboard/api-keys/route.ts):
   - `GET` → list keys (omit hash) for `auth()` user
   - `POST` → accept `{ name }`, create key, return plaintext **once**
2. `[file]` [src/app/api/dashboard/api-keys/[id]/route.ts](src/app/api/dashboard/api-keys/[id]/route.ts):
   - `DELETE` → set `revokedAt` on the key if `userId` matches (remember: `await params`)

### 2.3 Dashboard UI
1. `[file]` [src/app/(dashboard)/layout.tsx](src/app/(dashboard)/layout.tsx) — sidebar nav (Overview, Playground, Jobs, API Keys, Usage), top bar with avatar + sign-out.
2. `[file]` [src/app/(dashboard)/dashboard/api-keys/page.tsx](src/app/(dashboard)/dashboard/api-keys/page.tsx) — server component lists keys via `db.apiKey.findMany({...})`.
3. `[file]` [src/components/dashboard/CreateKeyDialog.tsx](src/components/dashboard/CreateKeyDialog.tsx) — client component, shadcn `Dialog`. On success, shows plaintext in a monospace block with a "Copy" button, explicit warning "Save this now — we'll never show it again".
4. `[file]` [src/components/dashboard/KeysTable.tsx](src/components/dashboard/KeysTable.tsx) — shadcn `Table` listing prefix, name, last-used, created, revoked.
5. `[file]` [src/app/(dashboard)/dashboard/usage/page.tsx](src/app/(dashboard)/dashboard/usage/page.tsx) — displays `creditBalance` + latest 50 ledger entries. No chart yet.

### 2.4 Zod foundation
`[file]` [src/lib/validators/common.ts](src/lib/validators/common.ts) — shared helpers (`urlSchema` validates `http(s)://` and blocks localhost/private IPs via SSRF guard).

### [✓] Acceptance
- Sign in → create key "cli-test" → plaintext shown in dialog once → visible in table with only the prefix afterward
- Revoke key → `revokedAt` populated; revoked keys visually muted
- Usage page shows `500` balance (from Phase 1 signup grant) + ledger row
- Attempting `DELETE /api/dashboard/api-keys/<someone-else's-id>` returns 404 (not 403 — don't leak existence)

### Pitfalls
- Never store raw keys. `hashedKey` is SHA-256 of the full string. Use `crypto.timingSafeEqual` when verifying.
- In Next 16 route handlers, context is `{ params: Promise<{ id: string }> }` — must `await`.
- Don't cache dashboard pages — data is per-user. Do NOT add `'use cache'` here.

---

## Phase 3 — `/api/v1/scrape` MVP: HTTP-only + all non-JS formats + cache (6-7 days)

**Goal**: Bearer-authenticated scrape endpoint returning `markdown`, `html`, `rawHtml`, `links`, `images`, and stubbed `screenshot` format. Built-in page cache (`maxAge`/`minAge`). Runs synchronously inside the route handler (no queue yet).

### 3.1 Dependencies
`[cmd]` `yarn add zod undici @mozilla/readability linkedom turndown turndown-plugin-gfm`
`[cmd]` `yarn add -D @types/turndown`

### 3.2 Bearer auth helper
`[file]` [src/lib/api-auth.ts](src/lib/api-auth.ts): `requireApiKey(req: Request)` — extracts `Authorization: Bearer ...`, calls `verifyApiKey`, throws or returns `{ userId, apiKeyId, planTier }`.

### 3.3 Validator
`[file]` [src/lib/validators/scrape.ts](src/lib/validators/scrape.ts): zod `ScrapeRequestSchema` covering every MVP param from §6.3:
- `url` (URL, SSRF-safe)
- `formats[]`: enum of `markdown | html | rawHtml | links | images | screenshot | json | summary | branding | changeTracking`
- `onlyMainContent`, `includeTags[]`, `excludeTags[]` (CSS selectors)
- `waitFor` (union: CSS selector string | ms number)
- `timeout` (default 30000)
- `mobile`, `skipTlsVerification`, `blockAds`, `removeBase64Images`, `fastMode`
- `country` (ISO alpha-2, default "US"), `languages` (string[])
- `proxy` (enum: `basic | stealth | auto`, default `basic`) — plumb through even though Phase 3 ignores it
- `maxAge` (ms, default 172_800_000 = 2d), `minAge` (ms), `storeInCache` (bool, default true)
- `actions[]` — parse but reject in Phase 3 with "requires Phase 4"
- `extract: { schema?, prompt?, systemPrompt? }` — validator only (implementation Phase 5)

### 3.4 HTTP-only scraper
`[file]` [src/server/scraper/fetcher.ts](src/server/scraper/fetcher.ts):
- `fetchPage(url, { timeout, userAgent, country, languages, skipTlsVerification })` — `undici` with custom `Dispatcher`, follows redirects (max 5), streams response with 10MB cap, returns `{ html, statusCode, finalUrl, headers, fetchDurationMs }`.
- `Accept-Language` header from `languages` array.
- SSRF guard: custom `Agent` with `connect` hook that resolves DNS and rejects private IPs before socket open.

`[file]` [src/server/scraper/readability.ts](src/server/scraper/readability.ts): parse via `linkedom` → `Readability` → `{ title, content, textContent, excerpt, length, lang }`.

`[file]` [src/server/scraper/turndown.ts](src/server/scraper/turndown.ts): Turndown with GFM plugin (tables, strikethrough). Rules for fenced code with language class. Strips `script/style/nav/footer/aside` when `onlyMainContent: true`.

`[file]` [src/server/scraper/formats.ts](src/server/scraper/formats.ts) — orchestrator that maps `formats[]` → output object:
- `markdown`: Readability → Turndown
- `html`: sanitized (DOMPurify) Readability HTML
- `rawHtml`: untouched response body
- `links`: `extractLinks(html, finalUrl, { sameOrigin? })`
- `images`: all `<img src>` resolved absolute, deduped
- `screenshot`: `null` with metadata `{ unavailable: "js-rendering required", retryWith: "proxy:stealth or js:true" }` — real impl in Phase 4

### 3.5 Caching layer
`[file]` [src/lib/scrape-cache.ts](src/lib/scrape-cache.ts):
- `cacheKey(url, options)` — stable SHA-256 hash over normalized URL + scrape-affecting options (`formats`, `onlyMainContent`, `mobile`, `country`, `actions`, etc.)
- `getCached(key, { maxAge, minAge })` — reads `ScrapeResult` via a new `cacheKey` column (index), returns if `now - createdAt <= maxAge` (and `>= minAge` when set).
- `writeCache(key, result)` — dedupes by key; latest wins.
- On `storeInCache: false`, skip write.
- Cache hits still debit 1 credit (Firecrawl parity) and return a `cached: true` flag in metadata.

**Schema migration**: add `cacheKey String?` + `@@index([cacheKey])` to `ScrapeResult`.

### 3.6 Route
`[file]` [src/app/api/v1/scrape/route.ts](src/app/api/v1/scrape/route.ts) — POST: authenticate → validate → compute `cacheKey` → if `getCached()` hit, return it (`cached: true`); else debit credits → create `ScrapeJob` (RUNNING) → fetch + format → write `ScrapeResult` + `writeCache()` → update job DONE → respond. On failure: refund credits, mark job FAILED, return typed error with `{ code, message, status }`.

`[file]` [src/app/api/v1/scrape/[id]/route.ts](src/app/api/v1/scrape/[id]/route.ts) — GET for async-mode polling (even in Phase 3 where it's all sync, this endpoint lets SDKs use the same polling path).

### 3.7 Playground UI
`[file]` [src/app/(dashboard)/dashboard/playground/page.tsx](src/app/(dashboard)/dashboard/playground/page.tsx) — URL input, checkboxes for every format, collapsible "advanced" panel for all §6.3 params, live response viewer (markdown preview + raw JSON tab + screenshot thumb).

### [✓] Acceptance
- `curl` with `formats:["markdown","html","rawHtml","links","images"]` returns all five cleanly for Wikipedia, GitHub README, a news article, example.com
- `screenshot` format returns `null` with the "retry with JS" hint
- Second identical request within `maxAge` returns cached result in <300ms with `cached: true`, still debits 1 credit
- `storeInCache: false` + `maxAge: 0` bypasses cache both ways
- `onlyMainContent: false` preserves navigation markdown
- `includeTags: [".price"]` / `excludeTags: [".ads"]` affects output
- SSRF attempts (`http://169.254.169.254`, `http://localhost`, DNS-rebinding to `10.0.0.1`) → 400 `INVALID_URL`
- Credit ledger debits 1, refunds on failure
- Bad key → 401 `INVALID_API_KEY`. Bad body → 422. Zero credits → 402.

### Pitfalls
- **SSRF via DNS**: resolve hostname yourself, check IP against private ranges, then pass IP to `undici` (not hostname) — otherwise attackers rebind mid-request.
- Cap response size at 10MB; abort stream on overflow.
- `rawHtml` must be the pre-Readability body; `html` must be post-sanitize — don't conflate.
- Cache key must include **everything that affects output**, including `country` and `actions[]`. Miss this and stale cache serves wrong data.

---

## Phase 4 — Queue + Playwright worker + proxy tiers + actions (9-10 days)

**Goal**: Separate worker process pulls jobs from BullMQ, runs Playwright for JS-heavy pages, supports actions (`click`/`wait`/`scroll`/`write`/`press`/`screenshot`/`executeJavascript`), proxy tiers (`basic`/`stealth`/`auto`), mobile viewport, country/languages, `blockAds`, real screenshots uploaded to R2.

### 4.1 Dependencies
`[cmd]` `yarn add bullmq ioredis playwright playwright-extra puppeteer-extra-plugin-stealth @cliqz/adblocker-playwright @aws-sdk/client-s3 @aws-sdk/s3-request-presigner tsx concurrently`
`[cmd]` `yarn playwright install chromium`

### 4.2 Queue module
`[file]` [src/lib/queue.ts](src/lib/queue.ts): exports `scrapeQueue`, `crawlQueue`, `extractQueue`, `batchQueue` (BullMQ `Queue` instances) backed by `ioredis` using `REDIS_URL`. Default job options: `attempts: 3`, `backoff: { type: "exponential", delay: 2000 }`, `removeOnComplete: { age: 86400 }`, `removeOnFail: { age: 604800 }`. Plan-tier-aware priority.

### 4.3 Browser strategy + stealth
`[file]` [src/server/scraper/stealth.ts](src/server/scraper/stealth.ts): `playwright-extra` + stealth plugin. UA pool (Chrome macOS/Windows, Safari macOS, Firefox Windows, Chrome Android) paired with matching `Sec-CH-UA`.

`[file]` [src/server/scraper/browser.ts](src/server/scraper/browser.ts):
- `BrowserPool`: owns 1 chromium, N `BrowserContext` (env `CONCURRENCY`, default 3).
- `withPage(fn, { proxy })` — leases a context (creates new if `proxy` differs from cached), runs fn. Recycles context after 50 uses.
- `navigate(page, url, { waitFor, timeout, mobile, country, languages, blockAds, skipTlsVerification, removeBase64Images })` — sets viewport (375×812 if `mobile`), UA, `Accept-Language`, geolocation (via country → lat/lon map); optional adblocker middleware; `page.goto(url, { waitUntil: "networkidle", timeout })`; wait for selector or ms.

`[file]` [src/server/scraper/screenshot.ts](src/server/scraper/screenshot.ts): `capture(page, { fullPage, quality, viewport })` → JPEG/PNG buffer.

### 4.4 Actions
`[file]` [src/server/scraper/actions.ts](src/server/scraper/actions.ts): run `actions[]` sequentially on a page before scraping. Action types + params:
- `click { selector }`
- `wait { selector? | ms }`
- `scroll { direction, amount? }`
- `write { selector, text }`
- `press { key }`
- `screenshot { fullPage? }` — intermediate screenshot, returned in metadata
- `executeJavascript { script }` — returns last expression value

Each action has a 10s default timeout and records duration for debugging.

### 4.5 Proxy tiers
`[file]` [src/server/proxy/providers.ts](src/server/proxy/providers.ts):
- `basic` — no proxy (direct egress from Fly)
- `stealth` — Bright Data Scraping Browser (residential pool)
- `auto` — pick based on per-host success history (Redis `host:strategy:<etld+1>`), start with `basic`, escalate on block

`[file]` [src/server/scraper/strategy.ts](src/server/scraper/strategy.ts) (extended):
- `pickStrategy({ options, host })` → `"http" | "playwright:basic" | "playwright:stealth"`. Starts at HTTP if `fastMode` or format list has no JS-requiring items, else Playwright.
- `scrape(url, options)` dispatches; on block-detected response (§4.7) escalates and retries once.

### 4.6 R2 upload
`[file]` [src/lib/r2.ts](src/lib/r2.ts):
- `uploadScreenshot(jobId, buf, { format })` → `r2Key`
- `uploadRawHtml(jobId, htmlString)` → `r2Key` (gzipped)
- `getSignedUrl(r2Key, ttlSec = 3600)` via `@aws-sdk/s3-request-presigner` against R2's S3-compatible endpoint.

### 4.7 Block detection (primitive — full version in Phase 7)
`[file]` [src/server/scraper/block-detect.ts](src/server/scraper/block-detect.ts): regex fingerprints (`cf-ray`, "Just a moment", DataDome markers, PerimeterX). Returns `{ blocked: boolean, provider?: "cloudflare" | "datadome" | "perimeterx" }`.

### 4.8 Worker
`[file]` [src/workers/scrape.worker.ts](src/workers/scrape.worker.ts): BullMQ `Worker` on `"scrape"` queue. Flow: mark RUNNING → run strategy (with actions) → detect block → escalate if needed → capture screenshot if requested → upload to R2 → write `ScrapeResult` + job DONE in `$transaction` → `NOTIFY scrape_done, <jobId>`.

`[file]` [src/workers/index.ts](src/workers/index.ts): starts all workers; SIGTERM handler drains gracefully (max 30s).

### 4.9 Refactor route to enqueue + wait
Rewrite [src/app/api/v1/scrape/route.ts](src/app/api/v1/scrape/route.ts):
1. Compute `cacheKey`, hit cache if possible (even in Phase 4, cache logic from Phase 3 still applies).
2. Create `ScrapeJob` row `QUEUED`, enqueue into BullMQ.
3. If `async: true` OR `Prefer: respond-async` header → return `{ jobId, status: "queued" }` immediately.
4. Else → open a Postgres `LISTEN scrape_done` connection, await notification for `jobId` with 60s timeout (fallback 500ms poll on `ScrapeJob.status`). Read result, return it.

### 4.10 Dev loop
`[file]` modify [package.json](package.json) scripts:
```json
"dev": "next dev",
"worker": "tsx watch src/workers/index.ts",
"dev:all": "concurrently -n next,worker -c blue,green \"yarn dev\" \"yarn worker\""
```

### 4.11 Fly deployment prep (actual deploy in Phase 9)
`[file]` [Dockerfile.worker](Dockerfile.worker): `mcr.microsoft.com/playwright:v1.49.0-jammy` base, installs prod deps, runs `node --import tsx src/workers/index.ts`.
`[file]` [fly.toml](fly.toml): `app = "peep-worker"`, `processes.worker = "node --import tsx src/workers/index.ts"`, `vm_size = "shared-cpu-2x"`, `vm_memory = "2gb"`.

### [✓] Acceptance
- Scrape `https://nextjs.org` with `formats:["markdown","screenshot","images"]` → rendered markdown, real screenshot signed URL, resolved images
- `actions:[{type:"click",selector:".load-more"},{type:"wait",ms:2000}]` before scrape works on an infinite-scroll page
- `mobile:true` returns mobile-rendered markdown (layout difference)
- `proxy:"stealth"` on a Cloudflare-protected page succeeds (requires Bright Data creds)
- `blockAds:true` measurably reduces page weight / request count
- `executeJavascript` action returns `document.title` as result
- Worker processes jobs under 15s p50, survives 100 sequential scrapes <1.5GB RSS
- Kill worker mid-scrape → BullMQ stalled-job recovery retries

### Pitfalls
- `playwright install chromium` downloads ~200MB per env — Docker image inherits from `mcr.microsoft.com/playwright` to skip.
- `LISTEN/NOTIFY` requires a **dedicated** pg client (not Prisma). Use `pg` library directly, or fall back to 500ms polling.
- Browser contexts leak memory if not closed — the recycle-every-50 rule is not optional.
- BullMQ's `Worker` and `Queue` need different Redis connection options (worker requires `maxRetriesPerRequest: null`).
- Bright Data residential proxies meter bandwidth (not requests) — a screenshot request can cost $0.05. Surface cost in `creditsUsed`.
- `executeJavascript` is a foot-gun: sandbox execution time, never include in public-facing docs without warnings.

---

## Phase 5 — AI extraction with Claude (4-5 days)

**Goal**: Structured data extraction. `extract` as a format on `/scrape`, plus top-level `/api/v1/extract` for multi-URL batches.

### 5.1 Dependencies
`[cmd]` `yarn add @anthropic-ai/sdk ajv ajv-formats`

### 5.2 Claude client
`[file]` [src/server/ai/claude.ts](src/server/ai/claude.ts): singleton `Anthropic` client with `ANTHROPIC_API_KEY`, default `max_tokens: 4096`, default model `claude-haiku-4-5-20251001`.

### 5.3 Prompts (cache-aligned)
`[file]` [src/server/ai/prompts.ts](src/server/ai/prompts.ts):
- `EXTRACTION_SYSTEM_PROMPT` (~1.5k tokens) — explains output format, JSON-only rules, handling of missing fields, anti-hallucination directive ("if unsure, omit rather than invent").
- Cached via `system: [{ type: "text", text: PROMPT, cache_control: { type: "ephemeral" } }]`.

### 5.4 Schema-based extraction
`[file]` [src/server/ai/extract.ts](src/server/ai/extract.ts): calls `anthropic.messages.create` with:
- `system` = cached extraction prompt
- user content block order: `<schema>` (cached) → optional `<instruction>` → optional image (if vision on) → `<page>` markdown
- parse JSON from response, validate with Ajv against user schema; throw `ExtractionValidationError` with Ajv details on mismatch
- return `{ data, usage }` (usage includes `cache_read_input_tokens` for observability)

### 5.5 Schema-free mode
`[file]` [src/server/ai/infer-schema.ts](src/server/ai/infer-schema.ts): given only a natural-language `prompt`, asks Claude to emit both a schema and matching data. Returns `{ schema, data }` so users can lock it in later.

### 5.6 `summary` format
`[file]` [src/server/ai/summary.ts](src/server/ai/summary.ts): short Claude call producing a 2-3 paragraph overview of the page. Cached system prompt. +2 credits.

### 5.7 `branding` format
`[file]` [src/server/ai/branding.ts](src/server/ai/branding.ts): multi-step pipeline: (1) extract colors from `<link rel="icon">` favicon palette + computed CSS background/text colors via Playwright context (requires Phase 4 JS path), (2) extract font families from CSS `@font-face` + computed styles, (3) identify typography scale by sampling headings/body text, (4) ask Claude to classify UI components present (buttons, cards, forms). Returns `{ colors: { primary, background, text, accent[] }, fonts: { sans, serif, mono }, typography: { h1, h2, body }, ui: string[] }`. +2 credits.

### 5.8 Wire into scrape worker
Update [src/workers/scrape.worker.ts](src/workers/scrape.worker.ts): after markdown is ready, iterate `options.formats`. For `json` → run `extractStructured`. For `summary` → run summary. For `branding` → run branding pipeline. Each bills its credit delta separately; partial failures return successful formats and error details for failed ones.

### 5.9 `/api/v1/extract` route + worker
`[file]` [src/app/api/v1/extract/route.ts](src/app/api/v1/extract/route.ts): accepts:
- `urls[]` — can include wildcards `example.com/*` (wildcard triggers an internal `/map` + filter pass)
- `schema`, `prompt`, `systemPrompt`
- `enableWebSearch` (Phase 5 wiring only; impl lands when `/search` exists in Phase 7 — gated flag that returns `NOT_AVAILABLE` until then)
Enqueues `extractQueue` job, returns `{ jobId, url: "/api/v1/extract/:id" }`.

`[file]` [src/app/api/v1/extract/[id]/route.ts](src/app/api/v1/extract/[id]/route.ts): GET for polling status + fetching results.

`[file]` [src/workers/extract.worker.ts](src/workers/extract.worker.ts): for each URL (expanding wildcards via `/map` logic), scrape (reusing the scrape pipeline with cache), extract, aggregate. Concurrency cap per job = 5. Results streamed to a `ExtractResult` table keyed by extract job ID.

### 5.10 Schema migration
Add `ExtractJob` + `ExtractResult` tables mirroring scrape shape, but with `schema`, `prompt`, `systemPrompt`, `enableWebSearch` columns, `urls: String[]` and a join table for expanded URLs.

### [✓] Acceptance
- POST `/api/v1/scrape` with `formats: ["markdown","json"]` and `extract: { schema: {...} }` on a product page → returns structured JSON matching schema
- `formats: ["summary"]` on a long article returns a coherent 2-3 paragraph summary
- `formats: ["branding"]` on a marketing site returns colors + fonts + components
- Schema-free mode: `extract: { prompt: "extract the pricing tiers" }` → returns `{ schema, data }` with both populated
- `/api/v1/extract` with `urls: ["https://example.com/*"]` expands via sitemap and extracts from each
- Second identical request within 5 min shows `usage.cache_read_input_tokens > 0` in logs
- Invalid AI output caught by Ajv → 422 `EXTRACTION_SCHEMA_MISMATCH` and refunds extract credits (keeps scrape credits)

### Pitfalls
- Claude sometimes wraps JSON in markdown fences. `extractJsonFromResponse` must strip ```...```.
- Put schema **above** page markdown — caching is order-sensitive.
- Token budget: truncate markdown at 50k tokens (use Anthropic SDK tokenizer estimate).
- Don't pass raw HTML to Claude — always markdown. 5-15× cheaper.
- `branding` format needs the Playwright path (computed CSS) — route through worker, never run in the sync request handler.

---

## Phase 6 — `/crawl`, `/map`, `/batch/scrape`, webhooks, WebSocket streaming (9-10 days)

**Goal**: Complete crawl surface matching Firecrawl parity, plus batch scrape, signed webhooks, and WebSocket live streaming.

### 6.1 Dependencies
`[cmd]` `yarn add fast-xml-parser robots-parser micromatch ws`
`[cmd]` `yarn add -D @types/ws @types/micromatch`

### 6.2 Sitemap discovery
`[file]` [src/server/crawl/sitemap.ts](src/server/crawl/sitemap.ts): `/sitemap.xml`, `/sitemap_index.xml` (follow `<sitemapindex>`), parse with `fast-xml-parser`. Also discover sitemaps via robots.txt `Sitemap:` entries. Support `sitemap: "include" | "skip" | "only"`.

### 6.3 Frontier
`[file]` [src/server/crawl/frontier.ts](src/server/crawl/frontier.ts): BFS with Redis set for dedup (`crawl:<jobId>:seen`). Supports all §6.4 crawl params from §6 inventory:
- `limit` (default 10000), `maxDiscoveryDepth`
- `includePaths[]`/`excludePaths[]` as regex (NOT globs — Firecrawl parity)
- `regexOnFullURL` switches match target
- `crawlEntireDomain` (siblings/parents allowed)
- `allowSubdomains`, `allowExternalLinks`
- `ignoreQueryParameters` (normalize URLs without query on dedup)
- `delay` seconds between scrapes
- `maxConcurrency` (capped by plan tier)

### 6.4 Filters
`[file]` [src/server/crawl/filters.ts](src/server/crawl/filters.ts): URL normalization (lowercase host, strip trailing slash, optional strip query), extension blocklist (`.pdf`, `.zip`, etc. unless `allowBinaryFormats`).

### 6.5 Crawl worker
`[file]` [src/workers/crawl.worker.ts](src/workers/crawl.worker.ts):
- Load `CrawlJob`, run sitemap discovery if `sitemap != "skip"`; skip BFS entirely if `sitemap: "only"`.
- Apply `delay` between scrape enqueues; cap in-flight children at `maxConcurrency`.
- For each popped URL, enqueue child `ScrapeJob` (inherits `scrapeOptions`).
- Subscribe to Redis pub/sub for `scrape:done:<jobId>` events → extract `links` → push new URLs into frontier.
- Update `CrawlJob.totalDiscovered`/`totalCompleted` transactionally + emit webhook `crawl.page` event.
- On each URL: mid-crawl credit check (cancel gracefully if exhausted).
- Check `status: CANCELLED` flag on each iteration (DELETE endpoint sets it).
- Emit `crawl.completed` or `crawl.failed` webhook on terminate.

### 6.6 Webhook emitter
`[file]` [src/lib/webhooks.ts](src/lib/webhooks.ts):
- `emit(url, event, payload, secret)` — POST JSON body, sign with HMAC-SHA256 via `WEBHOOK_SIGNING_SECRET` or per-request `webhook.secret`. Headers: `Peep-Signature`, `Peep-Event`, `Peep-Timestamp`, `Peep-Delivery-Id`.
- Queue failed deliveries to `webhookQueue` for retry (BullMQ, 5 attempts exponential).
- Event catalog: `crawl.started`, `crawl.page`, `crawl.completed`, `crawl.failed`, `batch.completed`, `extract.completed`.

### 6.7 WebSocket live streaming
`[file]` [src/app/api/v1/crawl/[id]/watch/route.ts](src/app/api/v1/crawl/[id]/watch/route.ts): upgrades to WS (Next.js 16 supports WS in route handlers under Node runtime). Authenticates via Bearer query param (`?token=peep_live_...`). Streams `document`/`error`/`done` messages from Redis pub/sub.

### 6.8 Routes
`[file]` [src/app/api/v1/crawl/route.ts](src/app/api/v1/crawl/route.ts): POST creates `CrawlJob`, enqueues, returns `{ jobId, url, websocketUrl }`. Also supports `prompt` (NL description) → Claude generates the crawl config JSON (stored as `CrawlJob.options` alongside the original prompt).

`[file]` [src/app/api/v1/crawl/[id]/route.ts](src/app/api/v1/crawl/[id]/route.ts):
- GET `?next=cursor&limit=100`: paginated results (10MB chunks), `{ status, total, completed, creditsUsed, expiresAt, next, data[] }`
- DELETE: cancels

`[file]` [src/app/api/v1/crawl/[id]/errors/route.ts](src/app/api/v1/crawl/[id]/errors/route.ts): GET returns `{ errors: { url, errorCode, message, scrapedAt }[] }` for failed children.

`[file]` [src/app/api/v1/map/route.ts](src/app/api/v1/map/route.ts): sync. Combines sitemap + 1-level crawl from homepage. Params: `url`, `search` (fuzzy path match), `limit` (default 5000, cap 50000), `includeSubdomains`. Returns `{ success, links[] }`.

### 6.9 Batch scrape
`[file]` [src/app/api/v1/batch/scrape/route.ts](src/app/api/v1/batch/scrape/route.ts): POST accepts `{ urls: string[], scrapeOptions?, webhook? }`, creates `BatchJob` with N `ScrapeJob` children, enqueues all. Returns `{ jobId, url: "/api/v1/batch/scrape/:id", total: N }`.
`[file]` [src/app/api/v1/batch/scrape/[id]/route.ts](src/app/api/v1/batch/scrape/[id]/route.ts): GET status + paginated results (same shape as crawl).

**Schema migration**: add `BatchJob` table (id, userId, total, completed, status, options, createdAt, completedAt). Add `batchJobId` nullable FK on `ScrapeJob`.

### 6.10 Dashboard
`[file]` [src/app/(dashboard)/dashboard/jobs/page.tsx](src/app/(dashboard)/dashboard/jobs/page.tsx) — unified list of scrape / crawl / batch / extract jobs, filterable.
`[file]` [src/app/(dashboard)/dashboard/jobs/crawl/[id]/page.tsx](src/app/(dashboard)/dashboard/jobs/crawl/[id]/page.tsx) — live progress view using the WS watcher.

### [✓] Acceptance
- Crawl Tailwind docs (`limit: 50, crawlEntireDomain: true, includePaths: ["/docs/.*"]`) completes <5 min
- `/map` returns 1000+ URLs for a sitemap-rich site; `search: "pricing"` filters
- `/batch/scrape` with 10 URLs returns results paginated; partial failures surface in `errors[]`
- DELETE cancels in-flight crawl; subsequent scrapes don't process
- Webhook endpoint receives signed `crawl.page` + `crawl.completed`; signature verifies
- WS watcher streams `document` events in real-time via `wscat -c 'wss://.../api/v1/crawl/ID/watch?token=...'`
- NL prompt (`prompt: "crawl the docs section"`) auto-generates correct `includePaths`
- Crawl errors endpoint returns detailed per-URL failures

### Pitfalls
- **Cycle detection**: normalize URLs (strip fragments, trailing slashes, lowercase host, optional strip query) before dedup.
- Mid-crawl credit exhaustion: check before each batch enqueue; cancel gracefully with `status: CANCELLED, reason: "out_of_credits"`.
- Don't enqueue 10k scrapes at once — producer rate limit, max 50 pending children per crawl.
- Webhook retries must be idempotent: clients need `Peep-Delivery-Id` to dedupe.
- Next 16 WS: confirm the runtime supports upgrade in Route Handlers; if not, run WS on the worker process and proxy via Vercel (or directly expose worker port).

---

## Phase 7 — `/search` + `changeTracking` + anti-bot hardening (6-7 days)

**Goal**: Launch `/search` endpoint, `changeTracking` format (both `git-diff` and `json` modes), and complete the anti-bot layer (robots, rate limits, block-escalation, proxy tiers).

### 7.1 Dependencies
`[cmd]` `yarn add @upstash/ratelimit @upstash/redis diff`

### 7.2 `/search` endpoint
Provider abstraction — **decision needed** (see Open Questions §10): Brave Search API vs SerpAPI. Brave is cheaper and has first-class API; SerpAPI has broader coverage (Google/Bing/etc.).

`[file]` [src/server/search/provider.ts](src/server/search/provider.ts) — interface `SearchProvider { search(q, opts): Promise<SearchResult[]> }`.
`[file]` [src/server/search/brave.ts](src/server/search/brave.ts) OR [src/server/search/serpapi.ts](src/server/search/serpapi.ts) — concrete implementation.

`[file]` [src/lib/validators/search.ts](src/lib/validators/search.ts): zod schema matching §6.6.

`[file]` [src/app/api/v1/search/route.ts](src/app/api/v1/search/route.ts): POST `{ query, limit?, location?, lang?, country?, tbs?, sources? (web|news|images), categories? (github|research|pdf), scrapeOptions? }`. If `scrapeOptions` is passed, enqueue child scrape jobs for the top N results and return once all complete (or timeout). Credits: 2 per 10 search results + scrape credits per enriched result.

### 7.3 Change tracking
**Schema migration**: new `ChangeSnapshot` table — `id, userId, url, tag, markdown (Text), contentHash, createdAt`. Indexed on `(userId, url, tag, createdAt DESC)`.

`[file]` [src/server/scraper/change-tracking.ts](src/server/scraper/change-tracking.ts):
- `loadPrevious(userId, url, tag?)` → latest snapshot before now.
- `computeDiff(prevMarkdown, currMarkdown, mode: "git-diff" | "json", { schema?, prompt? })`:
  - `git-diff`: `diff` library, unified format
  - `json`: Claude call — given prev + curr + schema, return `{ previousValues, currentValues }` for each schema field (+5 credits)
- `store(userId, url, tag, markdown, contentHash)` — insert new snapshot.
- `deriveChangeStatus(prev, curr)` → `"new" | "same" | "changed" | "removed"`.

Wire into [src/workers/scrape.worker.ts](src/workers/scrape.worker.ts): when `formats` includes `changeTracking`, load previous snapshot (if any), compute status, compute diff if changed, store snapshot, include in response as `changeTracking: { previousScrapeAt, changeStatus, visibility, diff?, json? }`.

### 7.4 Rate limiter
`[file]` [src/lib/ratelimit.ts](src/lib/ratelimit.ts):
- `perUser(userId, plan)` — sliding window keyed to plan (tiers mirror Firecrawl: FREE 10/min, Hobby 60/min, Standard 50 concurrent, Growth/Scale higher).
- `perHost(host)` — 1 req/sec default, configurable up to plan cap.
- `hostConcurrency(host)` — Redis `INCR` with TTL, max 2 concurrent.

### 7.5 Robots.txt
`[file]` [src/server/scraper/robots.ts](src/server/scraper/robots.ts):
- `fetchRobots(host)` — cached 24h in Redis.
- `isAllowed(robotsTxt, url, userAgent = "PeepBot/1.0 (+https://peep.dev/bot)")` — `robots-parser`.
- Route handler checks `isAllowed` unless `respectRobotsTxt: false` AND user is PRO+. Audit-log overrides.

### 7.6 Block detection + strategy escalation
Finalize [src/server/scraper/strategy.ts](src/server/scraper/strategy.ts):
- `detectBlock(html, statusCode, headers)` — fingerprints for Cloudflare (`cf-ray`, "Just a moment"), DataDome (`datadome` cookie, challenge HTML), PerimeterX (`_px`).
- Escalation: HTTP → `playwright:basic` → `playwright:stealth` (Bright Data) → final failure with `BLOCKED_BY_BOT_PROTECTION`.
- Per-host strategy success cache (Redis, 24h sliding window) so next scrape for same host starts at last-known-good.

### 7.7 Bright Data integration
`[file]` [src/server/proxy/brightdata.ts](src/server/proxy/brightdata.ts): wraps Playwright launch with `proxy: { server: BRIGHTDATA_PROXY_URL, username, password }`. Surfaces bandwidth-cost estimate per request.

### [✓] Acceptance
- `/search` with `sources:["web","news"]` returns categorized results; with `scrapeOptions: { formats: ["markdown"] }` each result has populated markdown
- `/search` with `tbs: "qdr:d"` returns only last-24h results
- Scrape with `formats:["markdown","changeTracking"]` twice on a changed page → second returns `changeStatus:"changed"` with git-diff; third unchanged returns `"same"`
- `changeTracking` in `json` mode with a schema returns previous vs current field values (+5 credits)
- `tag` isolates separate tracking histories for same URL
- Cloudflare-protected page: default `proxy:"auto"` auto-escalates and succeeds OR returns `BLOCKED_BY_BOT_PROTECTION` with next-step hint
- 50 concurrent requests to same host throttled to 1/s; 51st returns 429 with `Retry-After`
- robots.txt `Disallow: /private/` returns 403; `respectRobotsTxt: false` (PRO) bypasses with audit row in `CreditLedger` (reason: `robots_override`)

### Pitfalls
- Change tracking json mode can hallucinate prev values if model isn't given the actual previous markdown — always pass both snapshots verbatim.
- Search providers rate-limit us, not just our users — cache search results server-side (30min TTL) to avoid burning provider quota.
- Bright Data meters bandwidth; emit a `BANDWIDTH_ESTIMATE` log line per stealth request.
- Change tracking snapshots can explode storage — schedule a cleanup job that keeps only the latest N per (url, tag).

---

## Phase 8 — SDKs + MCP + developer ergonomics (5-6 days)

**Goal**: Ship an OpenAPI spec, hand-tuned JS SDK, auto-generated Python SDK, a CLI, and an MCP server. Launch MDX docs site.

### 8.1 OpenAPI spec + Swagger UI
`[cmd]` `yarn add @asteasolutions/zod-to-openapi`
`[file]` [src/lib/openapi.ts](src/lib/openapi.ts): registry building OpenAPI 3.1 from zod schemas (scrape, crawl, map, extract, search, batch, usage).
`[file]` [src/app/api/v1/openapi.json/route.ts](src/app/api/v1/openapi.json/route.ts): emits the spec as JSON.
`[file]` [src/app/(marketing)/api-reference/page.tsx](src/app/(marketing)/api-reference/page.tsx): Swagger UI client component, fetches `/api/v1/openapi.json`.

### 8.2 JS/TS SDK (`@peep/sdk`)
`[file]` `packages/sdk-js/` (sibling to `src/` — monorepo-lite via yarn workspaces).
- `Peep` class with methods `scrape`, `crawl`, `crawlStatus`, `crawlCancel`, `crawlErrors`, `watchCrawl` (WS), `map`, `extract`, `search`, `batchScrape`, `batchScrapeStatus`, `usage`.
- Auto-paginates crawl/batch result endpoints.
- TypeScript types re-exported from generated `src/types/api.ts`.
- Dogfooded by [src/app/(dashboard)/dashboard/playground/page.tsx](src/app/(dashboard)/dashboard/playground/page.tsx).

### 8.3 Python SDK (`peep-py`)
`[file]` `packages/sdk-py/` — auto-generated via `openapi-python-client` from `/api/v1/openapi.json`, with a thin handcrafted ergonomic wrapper (`Peep` class mirroring JS API). Publish to PyPI in Phase 9.

### 8.4 CLI (`peep-cli`)
`[file]` `packages/cli/` — thin wrapper around `@peep/sdk`. Commands: `peep scrape <url> [flags]`, `peep crawl <url>`, `peep extract <url> --schema schema.json`, `peep search <query>`. Auth via `PEEP_API_KEY` env or `~/.peep/config`.

### 8.5 MCP server
`[file]` `packages/mcp/` — implements MCP protocol (stdio transport). Tools exposed: `peep_scrape`, `peep_crawl`, `peep_map`, `peep_extract`, `peep_search`. Config snippet for Claude Desktop + Cursor + VS Code ships in `packages/mcp/README.md`.

### 8.6 MDX docs
`[file]` [src/app/(marketing)/docs/[[...slug]]/page.tsx](src/app/(marketing)/docs/[[...slug]]/page.tsx) — dynamic MDX loader from `content/docs/*.mdx`.
- Quickstart, Authentication, `/scrape`, `/crawl`, `/map`, `/extract`, `/search`, `/batch`, Webhooks, Rate limits, Errors, SDKs, Self-host (Phase 10+).
- Sidebar nav, search (FlexSearch), dark code blocks via shiki.

### [✓] Acceptance
- `curl https://peep.dev/api/v1/openapi.json | npx swagger-cli validate -` passes
- Swagger UI at `/api-reference` renders all endpoints and "Try it out" works with a real API key
- `npm i @peep/sdk` + `new Peep({ apiKey }).scrape(...)` works end-to-end
- `pip install peep-py && peep.scrape(...)` works
- `npx peep-cli scrape https://example.com --format markdown` prints markdown
- MCP server registered in Claude Desktop; `peep_scrape` tool call succeeds inside a Claude conversation
- Docs site live at `/docs`, every endpoint has a page with curl + JS + Python examples

### Pitfalls
- zod → OpenAPI loses some nuance (discriminated unions, refinements) — write manual patches for complex types.
- Don't version-lock the JS SDK to the app release — ship SDKs independently.
- MCP server spec is moving fast; pin SDK versions.
- MDX in Next 16: use `@next/mdx` pinned to 16-compatible version; watch for RSC serialization issues.

---

## Phase 9 — Billing, observability, prod deploy (5-6 days)

**Goal**: Ship it. Stripe subscriptions with all 6 Firecrawl-parity tiers, monitoring, prod infra on Vercel + Fly, test coverage.

### 8.1 Stripe
### 9.1 Stripe — 6 tiers (Firecrawl parity)
`[cmd]` `yarn add stripe`
Products:
- **Free**: 500 one-time credits, 2 concurrent, 10 scrapes/min, 1 crawl/min
- **Hobby**: $19/mo, 3k credits, 5 concurrent
- **Standard**: $99/mo, 100k credits, 50 concurrent
- **Growth**: $399/mo, 500k credits, 100 concurrent
- **Scale**: $749/mo, 1M credits, 150 concurrent
- **Enterprise**: custom pricing, custom concurrency, ZDR, SSO
Plus **top-up packs** (Firecrawl-style auto-recharge, rollover): $10/5k, $50/30k.

`[file]` [src/lib/stripe.ts](src/lib/stripe.ts), [src/app/api/webhooks/stripe/route.ts](src/app/api/webhooks/stripe/route.ts) — verify signature from raw body, grant credits on `invoice.paid`, update `planTier` on `customer.subscription.updated/deleted`, handle `charge.refunded`.
Dashboard upgrade flow via Stripe Checkout; Customer Portal for plan changes + invoices.

### 9.2 Observability
`[cmd]` `yarn add @sentry/nextjs pino pino-http`
- `[file]` [sentry.server.config.ts](sentry.server.config.ts), [sentry.client.config.ts](sentry.client.config.ts), [sentry.edge.config.ts](sentry.edge.config.ts).
- `pino` structured logging with request-id middleware; pipe to Fly logs + Sentry breadcrumbs.
- Bull Board mounted at `/admin/queues` behind admin-role check.

### 9.3 Tests
`[cmd]` `yarn add -D vitest @vitest/ui supertest @playwright/test testcontainers`
- Unit: [src/lib/](src/lib/) modules (api-key hashing, credits transactional, rate-limit math, cache key).
- Integration: API routes with test Postgres via `testcontainers`.
- E2E: Playwright browsing the dashboard (sign in mocked via test OAuth).
- Contract tests: OpenAPI spec matches actual response shapes.
- Smoke: nightly CI run against staging for each endpoint.

### 9.4 Dashboard polish
- `[file]` [src/components/dashboard/UsageChart.tsx](src/components/dashboard/UsageChart.tsx) — shadcn `recharts` daily credits over last 30d.
- Billing page: plan, upgrade, invoices via Stripe Customer Portal.
- Crawl live-progress viewer (reuses Phase 6 WS watcher).
- Changelog page (MDX-driven).

### 9.5 Production deploy
- **App**: push to Vercel, set env vars, configure custom domain (peep.dev / similar). Enable Vercel Edge Config for feature flags (note: Cache Components needs Node runtime — don't use edge runtime for routes).
- **Worker**: `fly launch` using [Dockerfile.worker](Dockerfile.worker), scale to 1 machine, autoscale rule: `min_machines_running = 1`, scale up when queue depth > 20.
- **Redis**: upgrade Upstash from free → pay-as-you-go.
- **Postgres**: Neon Pro tier for branching + autoscaling.
- **R2**: lifecycle rule — delete screenshots after 30d (free tier), forever on PRO.
- **SDK publishing**: CI publishes `@peep/sdk` to npm and `peep-py` to PyPI on tagged release.

### [✓] Acceptance
- Stripe test-mode flow for each of 6 tiers works end-to-end (checkout → webhook → credits granted → `planTier` updated → concurrency + rate limits enforced)
- Auto-recharge pack kicks in when balance < threshold
- Sentry captures a forced worker exception with full context
- `yarn test` + `yarn test:e2e` pass in CI
- Public docs live at `peep.<domain>/docs`; API reference at `/api-reference`
- Fly worker healthy, processing real queue; autoscale triggered under load test
- Landing page live demo works against prod
- SDKs published: `npm i @peep/sdk`, `pip install peep-py`, both work

### Pitfalls
- Stripe webhook signature: **raw body** required. Next 16 route handler: `await req.text()` before `stripe.webhooks.constructEvent`.
- Sentry + Next 16: pin an SDK version that supports `cacheComponents`; older versions break RSC serialization.
- Vercel env: Neon's pooled URL in `DATABASE_URL`, direct URL in `DIRECT_URL`. Prisma migrations need direct; runtime uses pooler.
- Test Stripe in test mode with test cards early; production `invoice.paid` behavior differs subtly (immediate vs eventual).

---

## Global milestones

| Week | Phases | Deliverable |
|---|---|---|
| 1 | 0–1 | Signed-in dashboard in black theme |
| 2 | 2 | API keys + credits + usage page |
| 3 | 3 | All non-JS formats + cache; HTTP-only scrape with full param surface |
| 4–5 | 4 | Playwright worker + actions + proxy tiers; real screenshots via R2 |
| 6 | 5 | AI formats (json/summary/branding); `/extract` with wildcards |
| 7–8 | 6 | Crawl + map + batch + webhooks + WS streaming |
| 9 | 7 | `/search` + change tracking + anti-bot pass |
| 10 | 8 | OpenAPI + JS SDK + Python SDK + CLI + MCP server + docs |
| 11–12 | 9 | Stripe (6 tiers) + Sentry + prod deploy + launch |

**Total**: ~12 weeks for one engineer at full-time, or ~8 weeks with two engineers splitting Phase 4 (browser) and Phase 6 (crawl) in parallel. Scope cuts in order if tight: MDX docs (P9) → Python SDK (P8) → `branding`/`summary` formats (P5) → WS streaming (P6) → `/search` (P7).

## When to pause and redesign

- **After Phase 3**: revisit API response shape — Firecrawl-compatible enough for their customers to migrate with minimal code change?
- **After Phase 4**: load test. If >3s p50 scrape latency, optimize before layering more features.
- **After Phase 6**: invite 10 real users for closed beta. Feedback drives Phase 7/8 priorities.
- **After Phase 8**: dogfood against real integration targets (MCP in Claude Desktop, JS SDK in a customer app). Don't wire Stripe until the dev experience feels right.
