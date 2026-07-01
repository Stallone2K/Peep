# Peep — Refinement Backlog

Consolidated from a 4-dimension audit (dead links · leftover code · feature completeness ·
robustness/UX). Ordered by tier; each item has a rough effort (S/M/L). Analysis-only — nothing
changed yet. The codebase is disciplined overall (consistent error envelope, ownership checks,
SSRF guard, graceful worker shutdown); gaps cluster in **correctness polish, ops/testing,
mobile nav, and missing marketing/legal pages**.

## Tier 1 — Quick wins (S, high value) — do first
- **Docs contract bugs** (I authored these — real inaccuracies) — `src/lib/docs/registry.tsx` vs `src/lib/validators/*`:
  - Search `limit` documented "5" → schema default is **10**.
  - Extract `urls` marked **required** → actually optional (needs `urls` OR `prompt`).
  - Scrape docs show top-level `schema`/`prompt` → schema only accepts them nested (silently stripped).
  - Crawl webhook events `page.scraped/completed` → real enum `crawl.started/page/completed/failed`.
  - Undocumented shipped scrape formats: `summary`, `branding`, `attributes`, `query`, `audio`(partial).
  - MCP docs list 7 tools → package registers **9** (`peep_batch_scrape`, `peep_youtube`).
- **Interact playground is a dead "Coming Soon" stub but sidebar badges it "NEW"** and scrape results deep-link into it — `playground/interact/page.tsx`, `sidebar-nav.tsx:64`, `scrape-playground.tsx:302`. De-badge / hide until built (S) or build it (L).
- **api-keys-manager fetches lack try/catch** — `src/components/dashboard/api-keys-manager.tsx:117,297`. A 502/HTML response makes `res.json()` throw; dialog hangs on "Creating…". Wrap + toast.
- **Dashboard overview "Concurrent Browsers" hardcoded `0`** — `dashboard/page.tsx:73`. Data source already exists (`concurrency` route). Wire it.
- **Toast-only stubs** — Enrich Table, JSON Schema editor, Report Issue (scrape/map playgrounds). Decide: build, or make the affordance honest.

## Tier 2 — Robustness / ops (before scaling load)
- **No test suite at all** (L) — no vitest/jest, no `*.test.ts`. Highest risk given credits/billing + scraping. Start: `credits.ts`, SSRF `fetcher.ts`, `ratelimit.ts`, error envelope.
- **No health/readiness endpoint** (S) — add `GET /api/health` pinging Prisma + Redis.
- **No error monitoring** (M) — wire Sentry (Next + worker); today 500s only hit `console.error`.
- **Worker missing crash handlers** (S) — `src/workers/index.ts` has SIGTERM drain but no `unhandledRejection`/`uncaughtException`; a stray rejection kills it silently.
- **No `error.tsx` / `global-error.tsx`** (S) — a thrown Prisma query shows Next's raw error screen. Add styled boundaries.
- **Status GET routes bypass rate limiting** (S) — `[id]` polling GETs call `requireApiKey` only, no `enforceUserRateLimit`. Add a lighter read bucket.
- **SSRF IPv6 coverage partial** (M) — `fetcher.ts:66` self-notes; harden mapped/embedded IPv6 + re-check after redirects.

## Tier 3 — Responsive / mobile + missing pages
- **No mobile nav** anywhere: marketing (`(marketing)/layout.tsx:43`), docs sidebar (`docs/layout.tsx:60`, hidden `<lg`), dashboard rail (`(dashboard)/layout.tsx`). Docs are fully unreachable on tablet/phone. Add `Sheet` drawers. (M each)
- **Dead links / missing routes** (S–M): `/pricing`, `/changelog`, `/dashboard/playground` (parent — redirect to `/scrape`), `/docs/help`, `/docs/skills`, and footer pages `/about /contact /terms /privacy /status /api-reference`. Build real pages or stop linking.

## Tier 4 — Known feature backlog (M–XL)
- **Settings sub-features**: Profile (S) · Webhook Secrets (M) · Team (L) · Billing (L). Only YouTube Session works today.
- **`/parse`** (PDF/docx → markdown) — P0 in PARITY. **`highlights`** format (S–M). **`audio`** format finish (in schema, worker never emits).
- **Browser Sandbox** (managed sessions) — actions engine exists, session surface doesn't.
- **Agent AG-2/3/4** (pagination/nav/deeper harvest) · **YouTube YT-4/5**.
- **Rust core R1–R5** — only R0 (contracts + interop) done; the actual scrape/crawl/observability work is stubbed. Includes the differential parity harness (gates cutover).
- **Billing** (Stripe subs/tiers/auto-recharge) — note: the credits/Peep-Card layer is already shipped. **Monitoring** (Bull Board `/admin/queues`).
- **CLI, more SDKs, integrations** (LangChain/LlamaIndex/n8n/Zapier/Make) — some marketed on the landing page but unbuilt.
- **Publish** MCP/SDK packages to npm/PyPI; **OpenAPI spec** (deferred).

## Tracker accuracy (do alongside Tier 1)
- **PARITY.md stale**: marks `/agent`, MCP, Node SDK, Python SDK as ❌ (all shipped); claims `/collect` Asset Collector shipped (does **not** exist in tree).
- **Stale source comments**: `validators/scrape.ts:8` ("summary/branding rejected at runtime" — now emitted); `server/youtube/extract.ts:4` ("comments land in later phases" — YT-3 done).
