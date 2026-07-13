# Peep ↔ Firecrawl Parity (v2 baseline)

Audited 2026-07-01 against **Firecrawl v2** (api.firecrawl.dev/v2, ~v2.11). Firecrawl has
moved well past the v1 surface: new endpoints `/agent`, `/interact`, `/parse`, `/monitor`;
new scrape formats; keyless access; PII redaction. `/extract` + `/llmstxt` are now legacy.

Legend: ✅ full · 🟡 partial / degraded · ❌ missing or in-schema-only (accepted, does nothing).

---

## 🔴 Integrity bugs — FIX FIRST (we accept/charge but don't deliver)
These are worse than missing features: the API takes the request (and sometimes **credits**)
and silently does nothing. They erode trust and must be fixed or removed.

| Bug | Impact | Evidence |
|---|---|---|
| **`query` scrape format billed +4, no runtime handler** | Charged, returns nothing | schema `scrape.ts:53`, billed `scrape-service.ts:33`, no producer in `strategy.ts` |
| **`audio` scrape format billed +4, no runtime handler** | Charged, returns nothing | schema `scrape.ts:46`, billed `scrape-service.ts:34`, no producer |
| **Stealth/enhanced proxy egress never wired to the browser** | +4 "stealth" surcharge charged, escalation fires, but traffic is **not proxied** | `browser.ts` `newContext()` gets no `proxy` arg though `proxyServer` is threaded in |
| **Crawl `maxDiscoveryDepth`/`maxDepth` not enforced** | Depth-limited crawls run unbounded (only `limit` caps) | parsed `crawl.ts:24`, never read by `frontier.ts`/worker |
| **`skipTlsVerification` no-op** | TLS still verified despite flag | accepted `scrape.ts:148`, never applied in `fetcher.ts` |
| **`location.country` no-op** | Geo requests ignored (only affects cache key) | flattened `scrape-service.ts:69`, never used in fetch/browser/proxy |
| **Worker path never persists `cacheKey`** | Queued scrapes never cached; `storeInCache` inconsistent | `scrape.worker.ts:79-104` |
| **Extract `showSources` mis-wired** | Reads `urlTrace` instead; `showSources` dead | `extract-service.ts:162` |
| **Dead params (parsed, never applied)** | Silent no-ops mislead SDK users | search `location`/`filter`; batch `maxConcurrency`; crawl `robotsUserAgent`; extract `enableWebSearch`/`includeSubdomains`/`allowExternalLinks`/`ignoreSitemap`/`limit` |
| **includeTags/excludeTags/removeBase64Images bypassed** on default Readability path | Options silently ignored unless main-content extraction fails | `strategy.ts:546-556` |
| **headers/waitFor/blockAds/mobile apply on Playwright branch only** | No-op on the HTTP fast path | `fetcher.ts` lacks them |
| **Extract webhooks declared but never emitted** | `extract.*` events never fire | no `emitWebhook` in `extract.worker.ts` |

## Endpoint parity
| Endpoint | FC v2 | Peep | Notes |
|---|---|---|---|
| `/scrape` | ✅ | ✅ | strong; see format/option gaps below |
| `/crawl` (+stream/errors/cancel) | ✅ | ✅ | missing depth enforcement + `allowBackwardLinks` alias |
| `/map` | ✅ | ✅ | +crt.sh subdomains (Peep bonus); missing `timeout`, relevance-ranked `search` |
| `/search` | ✅ | ✅ | `location`/`filter` dead; DDG folds news→web |
| `/batch/scrape` | ✅ | ✅ | `maxConcurrency` unenforced |
| `/extract` (legacy in FC) | ✅ | 🟡 | biggest gap cluster (wildcards, web-search, per-URL opts, prompt-only) |
| `/agent` | ✅ deep-research | 🟡 **different** | Peep's is a lead/data **harvester**, not FC's autonomous research agent |
| `/interact` (browser sandbox) | ✅ | ❌ | dashboard has a "Coming Soon" stub, no endpoint |
| `/parse` (PDF/DOCX/XLSX→md) | ✅ | ❌ | **no PDF/doc parsing at all** |
| `/monitor` (scheduled change checks) | ✅ | ❌ | — |
| `/llmstxt` | ✅ (deprecated) | ❌ | low value (FC deprecating) |

## Scrape formats
| Format | FC v2 | Peep |
|---|---|---|
| markdown / html / rawHtml / links / images | ✅ | ✅ |
| screenshot (+fullPage) | ✅ | ✅ |
| json (structured) | ✅ | ✅ (needs AI key) |
| changeTracking (git-diff + json) | ✅ | ✅ |
| summary | ✅ | ✅ |
| branding | ✅ | ✅ (Peep implemented independently) |
| attributes | (FC: no) | ✅ Peep-only |
| **highlights** | ✅ | ❌ |
| **product** | ✅ | ❌ |
| **video** | ✅ | ❌ |
| **deterministicJson** | ✅ | ❌ |
| query | ✅ | 🔴 billed, no handler |
| audio | ✅ | 🔴 billed, no handler |

## Cross-cutting
| Feature | FC | Peep |
|---|---|---|
| Webhooks (HMAC signing, events, retries) | ✅ | ✅ (extract events not emitted) |
| Change tracking | ✅ | ✅ |
| Idempotency-Key | ✅ | ✅ |
| Rate limiting + concurrency caps | ✅ | ✅ |
| Result caching (maxAge/cacheKey) | ✅ | ✅ (worker path gap) |
| Auth / API keys | ✅ | ✅ (SHA-256, constant-time) |
| Structured extraction + AI abstraction | ✅ | ✅ (NVIDIA NIM + Gemini, free-tier) |
| Screenshot/artifact storage | ✅ (cloud) | 🟡 local VPS disk (S3 SDK still a dep) |
| Stealth / proxy | ✅ multi-geo | 🟡 Bright Data only **+ not wired (see bugs)** |
| **PDF/DOCX parsing** | ✅ | ❌ |
| **redactPII / Zero-Data-Retention** | ✅ | ❌ |
| **Keyless access** | ✅ | ❌ |
| **Real billing (Stripe checkout/top-up)** | ✅ | ❌ credits grant-only (Peep Card UI exists) |
| **CLI** | ✅ | ❌ (marketed, not built) |
| **Framework integrations** (LangChain/LlamaIndex/n8n/Zapier/Make/Dify) | ✅ | ❌ (landing-page logos only) |
| SDKs | Node/Py/Go/Rust/Ruby/PHP/.NET/Java | 🟡 Node + Python **published** (`@shownomore/peep-sdk`, `peep-sdk`) |
| MCP server | ✅ | ✅ published (`@shownomore/peep-mcp`, 9 tools) |

## Peep has that Firecrawl doesn't
- **YouTube intelligence** — metadata, SEO scoring, thumbnails, transcript, innertube comments, BYO-session (`src/server/youtube/*`).
- **Branding / design-token extraction** from rendered CSS (`branding-extract.ts`).
- **Agent lead/data harvester** — plan→search→scrape→dedupe (`agent/harvester.ts`).
- **crt.sh subdomain discovery** for `/map`.
- **Peep Card** credit model + metallic UI; multi-provider free-tier AI; Patchright engine-level anti-detect; `attributes` format.

## Prioritized roadmap
**P0 — Integrity (fix or remove the "charged-but-broken" list above).** Highest trust impact,
mostly small. Especially: stop billing `query`/`audio` (or implement), wire the stealth proxy
into `browser.ts` (or stop charging), enforce crawl depth, remove/implement dead params.
**P1 — High-value missing features:** `/parse` (PDF/DOCX), `highlights` format, `/interact`
browser sandbox (dashboard stub already advertised "NEW"), Extract fixes (wildcards, web-search,
per-URL scrapeOptions, prompt-only).
**P2 — Platform:** real billing (Stripe), `/monitor`, geo/multi proxy, cloud artifact storage,
`redactPII`/ZDR, keyless access.
**P3 — Ecosystem:** CLI, more SDKs (Go/Rust/Ruby/PHP), framework integrations, `product`/`video`/
`deterministicJson` formats, `/llmstxt` (low — FC deprecating).

> Supersedes the previous PARITY.md, which was stale (marked shipped `/agent`, MCP, SDKs as
> missing; claimed a `/collect` Asset Collector that does not exist in the tree).
