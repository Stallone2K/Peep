# Peep — TypeScript → Rust Migration Checklist

Full pendency list for moving the performance-critical core to Rust (strangler,
hybrid). Companion to `../.claude/plans/hashed-purring-cascade.md`. Tick items as
they land; each phase is gated by the differential parity harness.

**Legend:** ✅ done · ⬜ pending · 🟢 stays TypeScript (not migrated)

---

## Scope boundary — what STAYS TypeScript (by design)
These are *not* migrated; Rust calls them or coexists:
- 🟢 Public API gateway — `src/app/api/v1/*`, `/api/dashboard/*` (auth, zod validate,
  idempotency, credit-reserve, **enqueue**). Next.js owns the public HTTP surface.
- 🟢 Auth — NextAuth, `api-key.ts`, `api-auth.ts`, sessions.
- 🟢 Dashboard + marketing (all React/UI).
- 🟢 AI — `src/server/ai/*` (Gemini) → a small Node **AI sidecar** Rust calls over REST
  (optionally ported to direct Gemini REST much later).
- 🟢 Search providers — `src/server/search/*` (ddg/brave). Lower volume; stays TS sidecar
  unless profiling says otherwise.
- 🟢 Browser/stealth — `browser.ts`, `stealth.ts`, `actions.ts`, `screenshot.ts` →
  Node **render sidecar** (the proven Playwright-extra stack), called by Rust.
- 🟢 Webhook delivery worker — one HMAC signing impl stays in TS; Rust just enqueues.
- 🟢 Prisma schema + migrations (source of truth); Rust uses `sqlx` against the same DB.
- 🟢 Validators (zod) — Rust mirrors them in `peep-contracts`.

---

## R0 — Foundation ✅ DONE
- ✅ Cargo workspace (`peep-contracts/core/store/queue/crawl` + `peep-worker`)
- ✅ `peep-contracts` wire structs (ScrapeRequestInput/ScrapeResult/JobData) + tests
- ✅ BullMQ↔Rust interop verified (data-plane); channel/key constants
- ✅ Self-hosted Postgres/Redis compose

## R1 — Rust HTTP scrape path (the big one)  ⬜
Port `src/server/scraper/*` (HTTP path) into `peep-core`:
- ⬜ `fetcher.ts` → `fetcher.rs` (reqwest + SSRF guard via `ipnet`/`hickory-resolver`,
  UA rotation, 10 MB cap, 5-redirect follow)
- ⬜ `block-detect.ts` → `block_detect.rs` (Cloudflare/DataDome/PerimeterX signatures)
- ⬜ `readability.ts` → `readability.rs` (`dom_smoothie`) + metadata + `sanitizeHtml`
- ⬜ `turndown.ts` → `markdown.rs` (`htmd`, GFM, language-tagged code)
- ⬜ `links.ts` → `links.rs` (links + images via `scraper`/html5ever)
- ⬜ `attributes.ts` → `attributes.rs` (the CSS-selector format)
- ⬜ `robots.ts` → `robots.rs` (`texting_robots` + Redis cache, exact key `robots:{host}` 24h)
- ⬜ `change-tracking.ts` → `change_tracking.rs` (`sha2` hash, `similar` git-diff; json-diff
  calls the AI sidecar)
- ⬜ `strategy.ts` (HTTP branch) → `strategy.rs` — `pickEngine` + HTTP pipeline assembly
- ⬜ **Cache-key parity**: reproduce `SHA256(JSON.stringify(normalized input))` byte-exactly
  so Rust hits TS-written cache rows
- ⬜ `peep-store`: write `ScrapeJob`/`ScrapeResult` via `sqlx` + `cuid2` ids
- ⬜ Stealth-surcharge credit debit (`CreditLedger`) via `sqlx`
- ⬜ `peep-queue`: real BullMQ **consume** (atomic wait→active move + lock + ack) —
  `bullmq-rs` or BullMQ Lua scripts; publish `scrape:done:{id}`
- ⬜ **Parity harness** (existing task #5): run TS `runScrapeWithStrategy` vs Rust over a
  URL corpus, diff markdown/links/metadata; **gates cutover**
- ⬜ Queue-routing flag: HTTP-eligible jobs → Rust; browser jobs stay on TS worker

## R2 — Render sidecar + full Rust scrape worker  ⬜
- ⬜ Node **render sidecar**: extract `browser/stealth/actions/screenshot` behind `POST /render`
- ⬜ Rust escalation: call sidecar on block / JS-needed / screenshot / actions
- ⬜ Strategy-hint cache (`strategy:{host}` 24h) in Rust
- ⬜ Rust artifact write → local disk (`ARTIFACTS_DIR`) reusing the storage scheme, or via sidecar
- ⬜ `axum` `/health` + `/metrics`
- ⬜ **Retire the TS scrape worker** (cut all scrape traffic to Rust)

## R3 — Crawl worker in Rust (`peep-crawl`)  ⬜
- ⬜ `frontier.ts` → frontier (Redis SET `crawl:{id}:seen` 24h)
- ⬜ `sitemap.ts` → sitemap (`quick-xml`, index recursion, 50k cap)
- ⬜ `filters.ts` → filters (URL normalize, include/exclude regex, domain-scope, binary skip)
- ⬜ `crawl.worker.ts` BFS loop → Rust (subscribe `scrape:done:*`, enqueue children, per-child
  credit check/debit, progress rollup, emit `crawl:event:{id}`)
- ⬜ **Retire the TS crawl worker**

## R4 — Map + batch in Rust  ⬜
- ⬜ `map-service.ts` → Rust (sitemap discovery + shallow fetch + link extraction + filters)
- ⬜ Batch rollup + final webhook fire (`rollUpBatch`) → Rust
- ⬜ `extract.worker.ts` — decision: keep TS (calls AI) or thin Rust shell delegating to AI sidecar
- ⬜ Retire those TS paths

## R5 — Harden, observe, deploy  ⬜
- ⬜ `tracing` + OpenTelemetry; Prometheus `/metrics`
- ⬜ Perf tuning (tokio concurrency, reqwest/sqlx pools, browser-pool caps)
- ⬜ Graceful shutdown + retry/backoff parity with BullMQ semantics
- ⬜ Delete dead TS engine/worker code
- ⬜ Docker images (`peep-worker` Rust, `peep-render` Node+Playwright) + prod compose
- ⬜ Load test vs SLOs (P50 <400ms, P95 <1.5s HTTP path; hundreds concurrent; mem ceiling)

---

## At-a-glance
| Phase | Theme | Status |
|---|---|---|
| R0 | Foundation, contracts, interop | ✅ done |
| R1 | Rust HTTP engine + store + queue-consume + parity harness | ⬜ next (largest) |
| R2 | Render sidecar + full scrape worker; retire TS scrape | ⬜ |
| R3 | Crawl worker in Rust | ⬜ |
| R4 | Map + batch in Rust | ⬜ |
| R5 | Observability, perf, deploy, cleanup | ⬜ |

**Reality check:** R1 is the bulk of the engineering (the whole HTTP engine + sqlx store +
real BullMQ consume + cache-key parity + the harness). R2–R4 reuse R1's plumbing. Browser,
AI, search, auth, API, and dashboard never move — they stay TS by design.
