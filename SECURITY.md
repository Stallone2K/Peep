# Peep — Security Audit (2026-07-01)

Owner-authorized review of `/home/stallone/Projects/peep`. Severity-ranked. The app is
well-built on access control (per-user ownership, constant-time key compare, atomic credit
guard, isolated BYO-session contexts) — the exploitable risk concentrates in **SSRF** (the
crown-jewel surface for a scraper) and **dependency advisories**.

Legend: 🔴 Critical · 🟠 High · 🟡 Medium · 🔵 Low/Info · ✅ verified-good.

## 🔴 Critical
### C1 — Browser-path SSRF (no host validation before `page.goto`)
`assertSafeHost()` (the private-IP guard) runs **only** in the HTTP `fetchPage()`
(`fetcher.ts:131`). The browser path — `runPlaywright()` → `page.goto(input.url)`
(`strategy.ts:263`) — **never calls it**. Any scrape that forces the browser
(`formats:["screenshot"|"branding"]`, `actions`, YouTube URLs, `proxy:"stealth"`, or an
HTTP-block escalation) navigates to arbitrary internal targets unchecked.
- **Exploit:** `POST /v1/scrape {"url":"http://169.254.169.254/latest/meta-data/iam/security-credentials/","formats":["screenshot"]}` → returns/screenshots cloud-metadata credentials; or hit `http://127.0.0.1:<port>`, internal admin panels, Redis/Postgres HTTP surfaces.
- **Fix:** call `assertSafeHost(new URL(input.url).hostname)` before every `page.goto` (initial + any in-page navigation/redirect); block `about:`/`file:`/`chrome:` schemes; ideally also enforce at the browser via a request interceptor that aborts private-IP requests (covers sub-resources + JS redirects).

## 🟠 High
### H1 — Webhook SSRF (delivery target not validated)
`webhook.worker.ts:45` does `fetch(delivery.url, …)` to a **user-supplied URL** with no
private-IP check. Register a webhook at `http://169.254.169.254/…` or
`http://internal-host:6379/` → the worker connects (blind SSRF, internal port-scan, and
data exfil since the signed payload carries scraped content).
- **Fix:** run the same `assertSafeHost` on `delivery.url` at enqueue **and** delivery time; require `https`; re-validate on redirect (or disable redirects for webhooks).

### H2 — HTTP-path redirect SSRF + DNS-rebinding (`fetcher.ts`)
`undiciFetch(url,{redirect:"follow",maxRedirections:5})` — `assertSafeHost` validates only
the initial hostname; **redirect hops are not re-validated** (a public URL 302→`169.254.169.254`
is followed), and the validated IP is **not pinned** (undici re-resolves the hostname → classic
DNS-rebind/TOCTOU).
- **Fix:** `redirect:"manual"`, resolve+validate+**pin** each hop (connect to the checked IP, keep hostname only for SNI/Host), cap hops.

### H3 — Next.js known advisories (upgrade required)
`yarn audit` flags multiple **HIGH** advisories on `next`: *Middleware/Proxy bypass in App
Router* (directly relevant — `proxy.ts` is the auth gate; auth is also enforced at the layout
so this is defense-in-depth, but still), *SSRF in server actions*, and several *DoS* vectors,
plus cache-poisoning/XSS. `fast-uri` (HIGH, path traversal), `uuid`/`postcss` (moderate) are
transitive.
- **Fix:** bump Next.js to the latest patched release; re-run `yarn audit` to clear transitives.

## 🟡 Medium
### M1 — ReDoS via user-supplied crawl regex → worker DoS
`filters.ts:154` compiles `new RegExp(userPattern)` from crawl `includePaths`/`excludePaths`
with no complexity/time bound. A pattern like `(a+)+$` against long URLs causes catastrophic
backtracking; because Node is single-threaded, one hung regex **blocks the whole crawl worker**
(all tenants' jobs on it), not just the attacker's crawl.
- **Fix:** cap pattern length, run matching under a timeout (e.g. `re2` / a worker-thread with a deadline), or use the linear-time `re2` engine for user regex.

### M2 — Missing HTTP security headers
`next.config.ts` has no `headers()` — no CSP, HSTS, X-Frame-Options, X-Content-Type-Options,
Referrer-Policy, or Permissions-Policy. Clickjacking + MIME-sniff + no HSTS.
- **Fix:** add a `headers()` block (or set them in Caddy) with a strict CSP for the dashboard, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.

### M3 — Encryption key: hardcoded fallback + secret reuse
`crypto.ts:11` derives the AES key from `NEXTAUTH_SECRET || "peep-dev-secret"` — if the env var
is ever unset in prod, **all stored BYO cookies are encrypted under a publicly known key**. It
also **reuses the session secret** for at-rest encryption.
- **Fix:** fail-closed (throw) if `NEXTAUTH_SECRET` is unset in production; derive a *separate*
encryption key via HKDF with a context label rather than reusing the session secret directly.

### M4 — Status/polling GET routes bypass rate limiting
`preflight()`/`enforceUserRateLimit` is applied on the mutating `/v1/*` routes but **not** on the
`[id]` status/polling GETs (`/v1/scrape/[id]`, `/crawl/[id]`, etc.) — only `requireApiKey`. A
client tight-looping a status endpoint is unthrottled (resource/DoS).
- **Fix:** add a lighter read-rate-limit bucket to the `[id]` and stream routes.

### M5 — Stealth proxy egress not wired (privacy/integrity)
`browser.ts` never applies `proxyServer` to `newContext()` (parity audit finding). Requests made
with `proxy:"stealth"` egress **directly** from the server — surprising for a privacy feature, and
combined with C1 means "stealth" traffic can also reach internal hosts. (Also billed +4 for nothing.)

## 🔵 Low / Info
- **IPv6 SSRF is simplified** (`fetcher.ts:66`, self-noted): NAT64 `64:ff9b::/96`, IPv4-compatible `::a.b.c.d`, and some mapped forms aren't covered. Tighten once C1/H2 pinning lands.
- **`Math.random()`** for UA rotation / ratelimit ZSET member / a PW job id — non-security-critical (not used for tokens/keys/IVs). Fine.
- No `dangerouslySetInnerHTML`, no raw SQL (`$queryRaw`), no `eval`/`child_process` anywhere. ✅
- Redis/Postgres exposure, container user, and DoS bounds (crawl `limit`, agent `maxSources≤60`/`targetRecords≤500`, search `limit≤20`) — verify `docker-compose.yml` binds DB/Redis to `127.0.0.1` and set a request body-size limit (not fully re-verified this pass).

## ✅ Verified robust (no action)
API-key generation/hashing/compare (256-bit CSPRNG, SHA-256, `timingSafeEqual`) · per-user
ownership scoping on all `[id]` routes (`findFirst {id,userId}` — no IDOR) · atomic credit debit
(`balance >= amount` SQL guard) · BYO YouTube-session isolation (fresh non-pooled context, always
closed) · idempotency (per-user + body-hash) · webhook HMAC-SHA256 signing (timestamp-bound) ·
AES-256-GCM (random 12-byte IV per message, auth tag verified) · signed expiring `/api/files` URLs.

## Remediation order
1. **C1 + H1 + H2** — the SSRF cluster (shared fix: a reusable `assertSafeUrl` applied at the
   browser path, the webhook target, and every redirect hop). Do first.
2. **H3** — upgrade Next.js, clear `yarn audit`.
3. **M1 (ReDoS), M2 (headers), M3 (key), M4 (read rate-limit)**.
4. **M5** + Low/Info hardening.
