# Peep — Public API, Credits, Docs & MCP (Phase Plan)

Locked plan for the developer-surface phase. **Execute on command**, in order below.
Companion to PARITY.md / PLAN.md.

## Decisions (locked)
- **Docs:** public `/docs` + `/docs/[[...slug]]` MDX, mirroring Khabri/Gather (DocsHeader +
  240px sticky sidebar + max-w-3xl content), styled with Peep tokens (dark, orange-500
  accent, Geist / Geist-Mono).
- **Build order:** API-1 (credits) → DOCS-1 (docs site) → MCP-1 → SDK-1.
- **Credits:** add `GET /v1/credits`, `X-Peep-Credits-Used/Remaining` headers, `402`
  envelope. One shared balance (the Peep Card) across playground + API + MCP.

## Public API surface
| Endpoint | Method | Purpose | Credits |
|---|---|---|---|
| `/v1/scrape` (+`/:id`) | POST/GET | URL → markdown/json/links/images/screenshot/branding/youtube | 1 base; +4 AI; +4 stealth |
| `/v1/crawl` (+`/:id`,`/:id/errors`,`/:id/stream`) | POST/GET/DELETE | discover + scrape a site (SSE) | 1/page |
| `/v1/map` | POST | URL list (+crt.sh subdomains) | 1 flat |
| `/v1/search` | POST | web/news/images (+scrape enrich) | 2/10 results |
| `/v1/batch/scrape` (+`/:id`) | POST/GET | many URLs in parallel | 1/URL |
| `/v1/extract` (+`/:id`) | POST/GET | AI structured extraction | 5/URL |
| `/v1/agent` (+`/:id`) | POST/GET | lead/data harvester | maxSources + 4 |
| `/v1/credits` (new) | GET | Peep Card balance + ledger | 0 |

Cross-cutting: Bearer `peep_live_*`, per-user+host rate limits, `Idempotency-Key`,
credit-reserve + refund-on-failure, standard error envelope.

## Peep Card credit model (formalize)
- One `User.creditBalance` (500 signup grant) debited by every source; `CreditLedger` audit.
- Every response: `creditsUsed` + headers `X-Peep-Credits-Used` / `X-Peep-Credits-Remaining`.
- `GET /v1/credits` → `{ balance, plan, recentLedger }`. `402 Insufficient Credits` at zero.

## MCP server (`@peep/mcp`)
Thin wrapper over REST. Tools: `peep_scrape`, `peep_crawl`, `peep_map`, `peep_search`,
`peep_extract`, `peep_agent`, `peep_youtube`, `peep_credits`. Auth via `PEEP_API_KEY`
(shared Peep Card). stdio + optional hosted HTTP/SSE. npm + Claude Code plugin manifest.

## API Docs site (mirror Khabri)
- `/docs` layout (DocsHeader + DocsSidebar 240px + MDX content) + `/docs/[[...slug]]`.
- Content: Intro · Authentication · **Credits & Peep Card** (costs table, 402) · Rate
  limits · Idempotency · one page per endpoint (params + tabbed cURL/Node/Python/MCP) ·
  Errors · Changelog.
- Reuse: `lib/mdx.ts` + `docs-nav.ts` (Khabri pattern), Peep UI tokens, playground
  payload-builder for in-sync code samples. Linked from landing nav + API Keys page.

## Execution phases
1. **API-1** ✅ — `GET /v1/credits`, `X-Peep-Credits-Used/Remaining` headers on all
   v1 routes (via `successJson` in `route-helpers.ts`), `402` envelope (already
   present via `InsufficientCreditsError`). OpenAPI generation deferred (optional).
2. **DOCS-1** ✅ — public `/docs` at `src/app/docs` (data-driven TSX, not MDX — cleaner
   for an API reference under Next 16 + cacheComponents; reuses Peep's `CodeTabs`).
   Header + 240px sticky sidebar + `max-w-3xl`, orange-500 accent. Pages: intro, auth,
   credits, rate-limits, idempotency, errors, scrape, crawl, map, search, batch,
   extract, agent, youtube, sdks, mcp. Linked from API Keys page. `nav.ts` / `registry.tsx`
   / `samples.ts` / `doc-ui.tsx` / `doc-article.tsx` / `docs-sidebar.tsx`.
3. **MCP-1** ✅ — `packages/peep-mcp` (`@peep/mcp`): 9 tools over stdio, `PEEP_API_KEY`
   auth, async job polling, credit footer. Verified via `tools/list`. README + docs page.
4. **SDK-1** ✅ — `packages/peep-sdk` (`@peep/sdk`, Node, typed, builds w/ .d.ts) +
   `packages/peep-python` (`peep-sdk`, requests-based). Both surface `lastCredits`,
   throw typed errors, and have `*AndWait` polling helpers. Docs `/docs/sdks` page.

> Implementation note: docs render data-driven TSX rather than MDX (no MDX tooling was
> installed; an API reference is highly structured, so a typed registry + shared sample
> builder keeps cURL/Node/Python/MCP examples in sync). Structure mirrors Khabri.
> Remaining optional: OpenAPI/Swagger spec, publish packages to npm/PyPI, `/pricing` +
> `/changelog` pages (pre-existing 404s the marketing nav already links to).
