# Peep ⟷ Firecrawl — Feature Parity & "Beat It" Tracker

Living checklist for matching Firecrawl feature-for-feature and then surpassing it.
Update the status columns as work lands. Companion to the Rust migration plan
(`.claude/plans/hashed-purring-cascade.md`).

**Legend:** ✅ done · 🟡 partial · ❌ missing · ⭐ Peep-original (no Firecrawl equivalent)

---

## 1. Core Endpoints

| Endpoint | Firecrawl | Peep | Notes |
|---|---|---|---|
| `POST /scrape` (+ `GET /scrape/:id`) | ✅ | ✅ | At parity |
| `POST /crawl` (+ status, `/errors`, SSE `/stream`, cancel) | ✅ | ✅ | Peep also has SSE streaming |
| `POST /map` | ✅ | ✅ | At parity |
| `POST /search` (+ scrape enrichment) | ✅ | ✅ | At parity |
| `POST /batch/scrape` (+ append) | ✅ | ✅ | At parity |
| `POST /extract` (async, schema/prompt) | ✅ | ✅ | At parity |
| `POST /agent` (FIRE-1 autonomous) | ✅ | ❌ | Dashboard stub only |
| `POST /interact` (stateful browser session) | ✅ | ❌ | Dashboard stub only |
| `POST /parse` (PDF/docx → markdown, "Fire-PDF") | ✅ | ❌ | — |
| Browser Sandbox (managed isolated browser for agents) | ✅ | ❌ | — |
| `POST /collect` (Asset Collector) | ❌ | ⭐✅ | **Peep-original — shipped** |

## 2. Scrape Formats

| Format | Firecrawl | Peep | Notes |
|---|---|---|---|
| markdown, html, rawHtml, links, screenshot | ✅ | ✅ | |
| json (schema + prompt extraction) | ✅ | ✅ | Gemini |
| summary | ✅ | ✅ | |
| images | ✅ | ✅ | |
| **attributes** (CSS selector → attribute) | ✅ | ✅ | **Shipped this session** |
| changeTracking (git-diff + json, tags) | ✅ | ✅ | |
| branding / brand profile | ✅ | ✅ | |
| **highlights** (verbatim matching sentences/code/tables) | ✅ | ❌ | Peep has `query` (similar, not identical) |
| audio (extract audio from YouTube) | ✅ | 🟡 | In schema, not implemented |

## 3. Scrape / Crawl / Map / Search Options — **at parity**
include/exclude tags & paths, onlyMainContent, timeout, waitFor, mobile, proxy modes
(basic/stealth/enhanced/auto), country/languages, actions engine (9 types), maxAge/minAge
cache, depth, domain scope, sitemap modes, NL-prompt→config, dedup, robots handling,
webhooks (HMAC-signed). No material gaps here.

## 4. Distribution Layer — **Peep's biggest gap**

| | Firecrawl | Peep |
|---|---|---|
| Python SDK | ✅ | ❌ |
| Node/TS SDK | ✅ | ❌ |
| Go / Ruby / PHP / .NET SDKs | ✅ | ❌ |
| **Rust SDK** (Firecrawl's official one) | ✅ | ❌ (natural fit — build in `peep-rs`) |
| **MCP server** (Claude/Cursor/VS Code) | ✅ | ❌ (thin wrapper over existing API) |
| CLI | ✅ | ❌ |
| Claude Code plugin | ✅ | ❌ |
| Integrations: n8n, Zapier, Make, LangChain, LlamaIndex | ✅ | ❌ (marketed on landing, not built) |

## 5. Agentic Tier — **missing**
- `/agent` (FIRE-1): describe-what-you-need autonomous multi-page gathering → structured data.
- `/interact` + Browser Sandbox: stateful sessions (click/fill/navigate via prompt or code).
  Note: Peep already has the **actions engine** (`actions.ts`); the gap is the *session* surface.

## 6. File Parsing — **missing**
- `/parse` endpoint + a fast PDF engine. Firecrawl's "Fire-PDF" is *Rust-based* — building
  Peep's in `peep-rs` is parity + the premium-perf goal in one move.

## 7. ⭐ Peep-Original Differentiators (how we go *beyond* Firecrawl)
- ⭐✅ **Asset Collector** (`/collect`) — one query → harvest every image across the web → deduped gallery. *(shipped)*
- ⭐ **Rust core** — 10–100× HTTP-path concurrency at a fraction of the memory (migration in progress, R0 done).
- ⭐ **$0 fully self-hostable** on one VPS (Postgres/Redis/disk/Caddy) — no required paid SaaS.
- Ideas backlog: video/asset-pack export, reverse-image & entity search, scheduled change-watch with
  email-diff, "research bundle" (search→crawl→extract→cite) one-shot, local-LLM (Ollama) extraction.

## 8. ✅ Shipped This Session
- `attributes` scrape format (deterministic CSS-selector extraction).
- Search **image-harvest** pass-through (`images`/`attributes` now flow through `/search` enrichment).
- ⭐ **Asset Collector**: `/api/v1/collect` + dashboard playground (`/dashboard/playground/collect`).
- Infra/perf: self-hosted Postgres+Redis compose; fixed dead-Upstash stall (→ local Redis).
- Rust core R0: workspace + wire contracts + verified BullMQ interop.

## 9. Prioritized Backlog

**P0 — high value / low effort (do next)**
- [ ] `highlights` format (AI, reuses Gemini infra)
- [ ] `/parse` endpoint (PDF → markdown; later swap in Rust Fire-PDF)
- [ ] **MCP server** (thin wrapper over the existing REST API — unlocks Claude/Cursor/VS Code)
- [ ] Asset Collector polish: large-image filter, dimensions, dedup-by-image-hash, video/social embeds

**P1 — meaningful surface**
- [ ] Official **Node/TS SDK**, then **Python SDK**
- [ ] `/interact` stateful browser-session endpoint (build on existing actions engine)
- [ ] CLI (wraps the SDK)
- [ ] `audio` format (YouTube/media extraction)

**P2 — larger bets**
- [ ] `/agent` (FIRE-1-style autonomous gathering)
- [ ] Browser Sandbox (managed isolated sessions)
- [ ] Integrations: LangChain, LlamaIndex, n8n, Zapier, Make
- [ ] Rust SDK (once the Rust core API stabilizes)

---
*Source of truth for feature-matching. Firecrawl refs: docs.firecrawl.dev, firecrawl.dev/changelog (current as of 2026-06).*
