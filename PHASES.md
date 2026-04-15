# Peep — Build Phases

Ground-up, step-by-step build guide. Each phase is self-contained: prereqs → steps → files touched → verification → pitfalls. Companion to [PLAN.md](PLAN.md).

**Legend**: `[cmd]` = shell command. `[file]` = file to create/edit. `[✓]` = verification checkpoint.

---

## Phase 0 — Pre-flight (30 min)

Everything you need before Phase 1 starts. Do not skip.

### Steps
1. **Initialize git** (no `.git` exists today):
   - `[cmd]` `cd /home/stallone/Projects/peep && git init && git branch -M main`
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
   SENTRY_DSN=             # Phase 8
   STRIPE_SECRET_KEY=      # Phase 8
   ```
4. **Create [.env](.env)** (not committed) with real values for Neon + OAuth now; fill others as phases require. Generate `NEXTAUTH_SECRET` with `openssl rand -base64 32`.
5. **Pin Node version**: `[file]` `.nvmrc` = `20.18.0` (Next 16 supports ≥20; Node 25 is fine locally but pin for Docker/Fly parity).

### [✓] Checkpoint
- `git status` clean. `.env` **not** staged. `yarn dev` still runs the default page.

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
3. Replace schema with the full version from [PLAN.md §3](PLAN.md). (User, Account, Session, VerificationToken, ApiKey, ScrapeJob, ScrapeResult, CrawlJob, CreditLedger, + enums.)
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

## Phase 3 — `/api/v1/scrape` MVP, HTTP-only (4-5 days)

**Goal**: A working Bearer-authenticated scrape endpoint that returns clean markdown from static pages. **No queue, no Playwright yet** — runs synchronously inside the route handler.

### 3.1 Dependencies
`[cmd]` `yarn add zod undici @mozilla/readability linkedom turndown`
`[cmd]` `yarn add -D @types/turndown`

### 3.2 Bearer auth helper
`[file]` [src/lib/api-auth.ts](src/lib/api-auth.ts): `requireApiKey(req: Request)` — extracts `Authorization: Bearer ...`, calls `verifyApiKey`, throws or returns `{ userId, apiKeyId }`.

### 3.3 Validator
`[file]` [src/lib/validators/scrape.ts](src/lib/validators/scrape.ts): zod `ScrapeRequestSchema` matching the shape in [PLAN.md §4](PLAN.md) — `url`, `formats[]`, `onlyMainContent`, `includeTags[]`, `excludeTags[]`, `waitFor`, `timeout`, `mobile`, `js`, `extract { schema, prompt, systemPrompt }`.

### 3.4 HTTP-only scraper
`[file]` [src/server/scraper/fetcher.ts](src/server/scraper/fetcher.ts):
- `fetchPage(url, { timeout, userAgent })` → uses `undici` with custom headers, follows redirects (max 5), returns `{ html, statusCode, finalUrl, headers }`.
- SSRF guard: reject private IP ranges, `file://`, `localhost`.

`[file]` [src/server/scraper/readability.ts](src/server/scraper/readability.ts):
- Uses `linkedom` (faster than `jsdom`) to parse HTML into a DOM, passes to `@mozilla/readability.Readability`. Returns `{ title, content (HTML), textContent, excerpt, length, lang }`.

`[file]` [src/server/scraper/turndown.ts](src/server/scraper/turndown.ts):
- Configured Turndown service: headingStyle "atx", codeBlockStyle "fenced", bulletListMarker "-". Strips `<script>`, `<style>`, `<nav>`, `<footer>` when `onlyMainContent: true`. Turndown rule for `<pre><code class="language-X">` → fenced with language.

`[file]` [src/server/scraper/links.ts](src/server/scraper/links.ts):
- Extract all `<a href>`, resolve against base, dedupe, filter by same-origin option.

### 3.5 Route
`[file]` [src/app/api/v1/scrape/route.ts](src/app/api/v1/scrape/route.ts):
```ts
export async function POST(req: Request) {
  try {
    const { userId, apiKeyId } = await requireApiKey(req);
    const body = ScrapeRequestSchema.parse(await req.json());
    await debitCredits(userId, 1, { refType: "ScrapeJob" });
    const job = await db.scrapeJob.create({
      data: { userId, apiKeyId, url: body.url, options: body, status: "RUNNING", startedAt: new Date() }
    });
    try {
      const { html, statusCode, finalUrl } = await fetchPage(body.url, {...});
      const article = extractReadability(html);
      const markdown = toMarkdown(article.content, { onlyMainContent: body.onlyMainContent });
      const links = extractLinks(html, finalUrl);
      await db.scrapeResult.create({
        data: { jobId: job.id, markdown, metadata: {...}, links, pageStatus: statusCode, durationMs: ... }
      });
      await db.scrapeJob.update({ where: { id: job.id }, data: { status: "DONE", completedAt: new Date() }});
      return Response.json({ success: true, data: { markdown, metadata: {...}, links }, jobId: job.id, creditsUsed: 1 });
    } catch (err) {
      await refundCredits(userId, 1, { refType: "ScrapeJob", refId: job.id });
      await db.scrapeJob.update({ where: { id: job.id }, data: { status: "FAILED", error: String(err) }});
      throw err;
    }
  } catch (err) {
    return Response.json(toJsonError(err), { status: toJsonError(err).status });
  }
}
```

### 3.6 Playground UI (optional but high-leverage for dogfooding)
`[file]` [src/app/(dashboard)/dashboard/playground/page.tsx](src/app/(dashboard)/dashboard/playground/page.tsx) — client component, URL input + format checkboxes, calls `/api/v1/scrape` with the user's own key, shows markdown + JSON side-by-side.

### [✓] Acceptance
- `curl -X POST -H "Authorization: Bearer peep_live_..." -H "Content-Type: application/json" -d '{"url":"https://example.com","formats":["markdown","links"]}' http://localhost:3000/api/v1/scrape` returns clean markdown
- Credit ledger debits 1, refunds on error
- Bad key → 401 `INVALID_API_KEY`. Bad body → 422 with zod details. Zero credits → 402 `INSUFFICIENT_CREDITS`.
- Jobs list in dashboard shows the run
- Works on 5 test URLs: Wikipedia, GitHub README, a news article, a blog, example.com

### Pitfalls
- **SSRF**: block `127.0.0.1`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16` **after DNS resolution** (someone can point DNS at a private IP). Use `undici` dispatcher with a DNS lookup hook.
- Don't buffer huge responses — cap at 10MB HTML. Stream + abort on overflow.
- Turndown hates `<table>` — use the GFM plugin or strip tables in MVP.

---

## Phase 4 — Queue + Playwright worker (6-7 days)

**Goal**: Separate worker process pulls scrape jobs from BullMQ, runs Playwright for JS-heavy pages, stores screenshots in R2. API route enqueues + waits.

### 4.1 Dependencies
`[cmd]` `yarn add bullmq ioredis playwright playwright-extra puppeteer-extra-plugin-stealth @aws-sdk/client-s3 @aws-sdk/s3-request-presigner tsx`
`[cmd]` `yarn playwright install chromium`

### 4.2 Queue module
`[file]` [src/lib/queue.ts](src/lib/queue.ts): exports `scrapeQueue`, `crawlQueue`, `extractQueue` (BullMQ `Queue` instances) backed by `ioredis` using `REDIS_URL`. Default job options: `attempts: 3`, `backoff: { type: "exponential", delay: 2000 }`, `removeOnComplete: { age: 86400 }`, `removeOnFail: { age: 604800 }`.

### 4.3 Browser strategy
`[file]` [src/server/scraper/stealth.ts](src/server/scraper/stealth.ts): configure `playwright-extra` with stealth plugin; export a `launch()` function that returns a chromium instance with flags `--disable-blink-features=AutomationControlled`, `--no-sandbox`, `--disable-dev-shm-usage`.

`[file]` [src/server/scraper/browser.ts](src/server/scraper/browser.ts):
- `BrowserPool` class: owns 1 chromium, N `BrowserContext` (from env `CONCURRENCY`, default 3).
- `withPage(fn)` — leases a context, creates page, runs fn, closes page. Recycles context after 50 uses.
- `navigate(page, url, { waitFor, timeout, mobile })` — sets viewport, UA; `page.goto(url, { waitUntil: "networkidle" })`; optional `waitFor: selector|timeout`.

`[file]` [src/server/scraper/screenshot.ts](src/server/scraper/screenshot.ts): `capture(page, { fullPage })` → JPEG buffer.

`[file]` [src/server/scraper/strategy.ts](src/server/scraper/strategy.ts):
- `pickStrategy(options)` → `"http" | "playwright" | "proxy-playwright"` based on: `options.js`, prior block-detection history for the host, user's plan.
- `scrape(url, options)` — dispatches to the chosen strategy.

### 4.4 R2 upload
`[file]` [src/lib/r2.ts](src/lib/r2.ts):
- `uploadScreenshot(jobId, buf)` → returns `r2Key`.
- `getSignedUrl(r2Key, ttlSec = 3600)` — uses `@aws-sdk/s3-request-presigner` against R2's S3-compatible endpoint.

### 4.5 Worker
`[file]` [src/workers/scrape.worker.ts](src/workers/scrape.worker.ts):
```ts
import { Worker } from "bullmq";
new Worker("scrape", async (job) => {
  const { scrapeJobId, options } = job.data;
  await db.scrapeJob.update({ where: { id: scrapeJobId }, data: { status: "RUNNING", startedAt: new Date() } });
  const result = await scrape(options.url, options);
  if (options.formats.includes("screenshot")) {
    result.screenshotR2Key = await uploadScreenshot(scrapeJobId, result.screenshot);
  }
  await db.$transaction([
    db.scrapeResult.create({ data: { jobId: scrapeJobId, ...result } }),
    db.scrapeJob.update({ where: { id: scrapeJobId }, data: { status: "DONE", completedAt: new Date() } }),
  ]);
  await db.$executeRaw`NOTIFY scrape_done, ${scrapeJobId}`;
}, { connection, concurrency: Number(process.env.CONCURRENCY ?? 3) });
```

`[file]` [src/workers/index.ts](src/workers/index.ts): imports and starts all workers; sets up SIGTERM handler to drain.

### 4.6 Refactor route to enqueue + wait
Rewrite [src/app/api/v1/scrape/route.ts](src/app/api/v1/scrape/route.ts):
1. Create `ScrapeJob` row `QUEUED`, enqueue into BullMQ.
2. If `async` flag → return `{ jobId }` immediately.
3. Else → open a Postgres `LISTEN scrape_done` connection, await notification for `jobId` with 60s timeout (fallback short-poll). Read result, return it.

### 4.7 Dev loop
`[file]` modify [package.json](package.json) scripts:
```json
"dev": "next dev",
"worker": "tsx watch src/workers/index.ts",
"dev:all": "concurrently -n next,worker -c blue,green \"yarn dev\" \"yarn worker\""
```
`[cmd]` `yarn add -D concurrently`

### 4.8 Fly deployment prep (not deployed yet — prod deploy in Phase 8)
`[file]` [Dockerfile.worker](Dockerfile.worker): `mcr.microsoft.com/playwright:v1.49.0-jammy` base, installs prod deps, runs `node --import tsx src/workers/index.ts`.
`[file]` [fly.toml](fly.toml): `app = "peep-worker"`, `processes.worker = "node --import tsx src/workers/index.ts"`, `vm_size = "shared-cpu-2x"`, `vm_memory = "2gb"`.

### [✓] Acceptance
- `yarn dev:all` starts both processes
- Scrape `https://nextjs.org` (SPA) with `formats: ["markdown","screenshot"]` → markdown reflects rendered content, screenshot URL is a signed R2 URL that opens
- Worker logs show `BullMQ` job processed under 15s
- Kill worker mid-scrape → job retries when worker restarts (BullMQ stalled-job recovery)
- 100 sequential scrapes don't OOM the worker (memory stays <1.5GB)

### Pitfalls
- `playwright install chromium` downloads ~200MB per env. Docker image inherits from `mcr.microsoft.com/playwright` to skip that.
- `LISTEN/NOTIFY` requires a **dedicated** pg client, not the Prisma one. Use a separate `pg` library connection, or fall back to 500ms polling on `ScrapeJob.status`.
- Contexts leak memory if not closed — the pool's recycle-every-50 rule is not optional.
- BullMQ's `Worker` and `Queue` need different Redis connection options (worker requires `maxRetriesPerRequest: null`).

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
`[file]` [src/server/ai/extract.ts](src/server/ai/extract.ts):
```ts
export async function extractStructured({ markdown, schema, prompt, useVision, screenshotBuf }) {
  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    system: [{ type: "text", text: EXTRACTION_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{
      role: "user",
      content: [
        { type: "text", text: `<schema>${JSON.stringify(schema)}</schema>`, cache_control: { type: "ephemeral" } },
        prompt ? { type: "text", text: `<instruction>${prompt}</instruction>` } : null,
        useVision && screenshotBuf ? { type: "image", source: { type: "base64", media_type: "image/jpeg", data: screenshotBuf.toString("base64") } } : null,
        { type: "text", text: `<page>${markdown}</page>` },
      ].filter(Boolean),
    }],
  });
  const raw = extractJsonFromResponse(msg);
  const ajv = new Ajv({ strict: false }); addFormats(ajv);
  const validate = ajv.compile(schema);
  if (!validate(raw)) throw new ExtractionValidationError(validate.errors);
  return { data: raw, usage: msg.usage };
}
```

### 5.5 Schema-free mode
`[file]` [src/server/ai/infer-schema.ts](src/server/ai/infer-schema.ts): given only a natural-language `prompt`, asks Claude to emit both a schema and matching data. Returns `{ schema, data }` so users can lock it in later.

### 5.6 Wire into scrape worker
Update [src/workers/scrape.worker.ts](src/workers/scrape.worker.ts): if `options.formats` includes `"extract"`, run extractor after markdown is ready. Bill extra credits (e.g. +2). Track `usage.cache_read_input_tokens` in a structured log.

### 5.7 `/api/v1/extract` route
`[file]` [src/app/api/v1/extract/route.ts](src/app/api/v1/extract/route.ts): accepts `{ urls[], schema, prompt }`, enqueues `extractQueue` job; worker scrapes each URL (reuses scrape pipeline), runs extraction, merges results.

`[file]` [src/workers/extract.worker.ts](src/workers/extract.worker.ts): orchestrates scrape-then-extract for each URL; limits concurrency per job.

### [✓] Acceptance
- POST `/api/v1/scrape` with `formats: ["markdown","extract"]` and `extract: { schema: {...} }` on a product page → returns structured JSON matching schema
- Schema-free mode: `extract: { prompt: "extract the pricing tiers" }` → returns `{ schema, data }` with both populated
- Second identical request within 5 min shows `usage.cache_read_input_tokens > 0` in logs
- Invalid AI output caught by Ajv → returns 422 `EXTRACTION_SCHEMA_MISMATCH` and refunds extract credits (keeps scrape credits)

### Pitfalls
- Claude sometimes wraps JSON in markdown fences. `extractJsonFromResponse` must strip ```...```.
- Put schema **above** page markdown in the content array — caching is order-sensitive.
- Token budget: truncate markdown at 50k tokens (use `@anthropic-ai/sdk`'s tokenizer estimate).
- Don't pass raw HTML — always markdown. 5-15× cheaper.

---

## Phase 6 — `/crawl` and `/map` (5-6 days)

**Goal**: Recursive crawler with depth/limit filters + sitemap-based URL discovery.

### 6.1 Sitemap + robots
`[file]` [src/server/crawl/sitemap.ts](src/server/crawl/sitemap.ts): fetches `/sitemap.xml`, `/sitemap_index.xml`, follows `<sitemapindex>`; parses with `fast-xml-parser`. Also discovers sitemaps via robots.txt `Sitemap:` entries.

### 6.2 Frontier
`[file]` [src/server/crawl/frontier.ts](src/server/crawl/frontier.ts): BFS with Redis set for dedup (`crawl:<jobId>:seen`). Respects `maxDepth`, `limit`, `includePaths` (micromatch), `excludePaths`.

### 6.3 Filters
`[file]` [src/server/crawl/filters.ts](src/server/crawl/filters.ts): path matching, same-origin rule, extension blocklist (`.pdf`, `.zip`, `.jpg` by default; override with `allowBinaryFormats`).

### 6.4 Crawl worker
`[file]` [src/workers/crawl.worker.ts](src/workers/crawl.worker.ts):
- Load `CrawlJob`, seed frontier with root URL.
- While frontier non-empty and `completed < limit`: pop N URLs, enqueue as `ScrapeJob` rows into `scrapeQueue` with `crawlJobId` set.
- Listen for scrape completion (via Redis pub/sub or polling), extract `links` from each result, push new URLs into frontier (filtered).
- Update `CrawlJob.totalDiscovered/totalCompleted` transactionally.
- Finalize when frontier empty or limit reached.

### 6.5 Routes
`[file]` [src/app/api/v1/crawl/route.ts](src/app/api/v1/crawl/route.ts): POST accepts crawl options, creates `CrawlJob`, enqueues, returns `{ jobId, url: "/api/v1/crawl/:id" }`.
`[file]` [src/app/api/v1/crawl/[id]/route.ts](src/app/api/v1/crawl/[id]/route.ts):
- GET (with `?next=cursor`): returns paginated results + `status/total/completed`.
- DELETE: sets `status: CANCELLED`, worker checks flag on each iteration.

`[file]` [src/app/api/v1/map/route.ts](src/app/api/v1/map/route.ts): runs synchronously, combines sitemap discovery + 1-level crawl from homepage, returns up to `limit` URLs (default 5000, cap 50000). Optional `search` filter (fuzzy match against URL path).

### 6.6 Dashboard
`[file]` [src/app/(dashboard)/dashboard/jobs/page.tsx](src/app/(dashboard)/dashboard/jobs/page.tsx) — show crawl jobs + individual scrape jobs, filter by type/status.

### [✓] Acceptance
- Crawl a small docs site (e.g. Tailwind docs, `limit: 50, maxDepth: 3`) → completes <5 min
- `GET /api/v1/crawl/:id` paginates via cursor
- DELETE cancels in-flight crawl; subsequent scrapes don't process
- `/api/v1/map` returns 1000+ URLs for a large site with sitemap
- `includePaths: ["/docs/**"]` correctly filters

### Pitfalls
- **Cycle detection**: always normalize URLs (strip fragments, trailing slashes, lowercase host) before dedup — otherwise `/foo` and `/foo/` look different.
- Crawls can blow credit balance fast — mid-crawl credit check, cancel gracefully if user runs out.
- Don't enqueue 10k scrape jobs at once into BullMQ — rate-limit the producer (e.g. max 50 pending per crawl job).

---

## Phase 7 — Anti-bot hardening (3-4 days)

**Goal**: Survive basic bot protections. Honor robots.txt. Rate limit sanely. Offer Bright Data escape hatch.

### 7.1 Rate limiter
`[cmd]` `yarn add @upstash/ratelimit @upstash/redis`
`[file]` [src/lib/ratelimit.ts](src/lib/ratelimit.ts):
- `perUser(userId, plan)` — sliding window keyed to plan (FREE: 10/min, HOBBY: 60/min, PRO: 100/sec).
- `perHost(host)` — 1 req/sec default, configurable via user opts (capped by plan).
- `hostConcurrency(host)` — Redis `INCR` with TTL, max 2 concurrent.

### 7.2 Robots.txt
`[file]` [src/server/scraper/robots.ts](src/server/scraper/robots.ts):
- `fetchRobots(host)` — cached 24h in Redis.
- `isAllowed(robotsTxt, url, userAgent = "PeepBot")` — parse with `robots-parser`.
- Route handler checks `isAllowed` unless `respectRobotsTxt: false` AND user is PRO+.

### 7.3 Block detection + retry strategy
Extend [src/server/scraper/strategy.ts](src/server/scraper/strategy.ts):
- After scrape, run `detectBlock(html, statusCode, headers)` — regex for known challenge fingerprints.
- If blocked:
  - Escalate: HTTP → Playwright → `proxy-playwright` (Bright Data) → fail with `BLOCKED_BY_BOT_PROTECTION`.
  - Record per-host strategy success rate in Redis (sliding 24h) so next scrape for the same host starts at the known-good strategy.

### 7.4 Proxy provider
`[file]` [src/server/proxy/brightdata.ts](src/server/proxy/brightdata.ts): wraps Playwright launch with `proxy: { server: BRIGHTDATA_PROXY_URL, username, password }`. Only available if `BRIGHTDATA_PROXY_URL` is set AND user plan allows.

### 7.5 UA rotation
`[file]` [src/server/scraper/stealth.ts](src/server/scraper/stealth.ts): small pool of real UAs (Chrome macOS, Chrome Windows, Safari macOS, Firefox Windows, Chrome Android). Pair with matching `Sec-CH-UA` headers.

### [✓] Acceptance
- Hit Cloudflare-protected page with default settings → 403 `BLOCKED_BY_BOT_PROTECTION` with retry hint
- Same page with `useProxy: true` and Bright Data configured → succeeds
- 50 concurrent scrapes of same host get throttled to 1/s; 51st returns 429 with `Retry-After`
- robots.txt `Disallow: /private/` returns 403 when scraping `/private/page`; `respectRobotsTxt: false` (PRO) bypasses with an audit log
- Per-user rate limit kicks in correctly per plan

### Pitfalls
- Bright Data counts bandwidth, not requests — `formats: ["screenshot"]` roughly triples cost. Surface this to users.
- Don't forget to release concurrency locks on failure paths.

---

## Phase 8 — Billing, observability, prod deploy (5-6 days)

**Goal**: Ship it. Stripe subscriptions, monitoring, docs, prod infra on Vercel + Fly, test coverage.

### 8.1 Stripe
`[cmd]` `yarn add stripe`
- Create 3 products (HOBBY $20, PRO $99, topups $10/5k credits).
- `[file]` [src/lib/stripe.ts](src/lib/stripe.ts), [src/app/api/webhooks/stripe/route.ts](src/app/api/webhooks/stripe/route.ts) — verify signature, grant credits on `invoice.paid`, update `planTier` on `customer.subscription.updated`.
- Dashboard upgrade flow via Stripe Checkout.

### 8.2 Observability
`[cmd]` `yarn add @sentry/nextjs`
- `[file]` [sentry.server.config.ts](sentry.server.config.ts), [sentry.client.config.ts](sentry.client.config.ts), [sentry.edge.config.ts](sentry.edge.config.ts).
- Structured logging: `pino` with request-id middleware; pipe to Fly logs + Sentry breadcrumbs.
- BullMQ dashboard (Bull Board) mounted at `/admin/queues` behind admin-role check.

### 8.3 Tests
`[cmd]` `yarn add -D vitest @vitest/ui supertest @playwright/test`
- Unit: [src/lib/](src/lib/) modules (api-key hashing, credits transactional, rate-limit math).
- Integration: API routes with test Postgres via `testcontainers`.
- E2E: Playwright browsing the dashboard (sign in mocked via test OAuth).

### 8.4 Docs
- `[file]` [src/app/(marketing)/docs/[[...slug]]/page.tsx](src/app/(marketing)/docs/[[...slug]]/page.tsx) rendering MDX from `/content/docs/*.mdx`.
- Pages: quickstart, authentication, /scrape, /crawl, /map, /extract, rate limits, errors, webhooks.
- `/api/v1/openapi.json` — machine-readable spec; embed Swagger UI at `/api-reference`.

### 8.5 Dashboard polish
- `[file]` [src/components/dashboard/UsageChart.tsx](src/components/dashboard/UsageChart.tsx) — shadcn `recharts` daily credits over last 30d.
- Billing page: plan, upgrade, invoices.

### 8.6 Production deploy
- **App**: push to Vercel, set env vars, configure custom domain. Enable Vercel's Edge Config for feature flags (not edge runtime — Cache Components incompatible).
- **Worker**: `fly launch` using `Dockerfile.worker`, scale to 1 machine, autoscale rule: `min_machines_running = 1`, scale up when queue depth > 20.
- **Redis**: upgrade Upstash from free → pay-as-you-go.
- **Postgres**: Neon Pro tier for branching + autoscaling.
- **R2**: set lifecycle rule — delete screenshots after 30d (free tier), forever on PRO.

### [✓] Acceptance
- Stripe test-mode subscription flow works end-to-end (checkout → webhook → credits granted → plan updated)
- Sentry captures a forced worker exception with full context
- `yarn test` + `yarn test:e2e` pass in CI (GitHub Actions)
- Public docs live at `peep.<domain>/docs`
- API reference live at `peep.<domain>/api-reference`
- Fly worker healthy, processing real queue
- Landing page real API demo works against prod

### Pitfalls
- Stripe webhook signature: use raw body, not parsed JSON. Next 16 route handler: `await req.text()` then verify.
- Sentry + Next 16: make sure the SDK version supports `cacheComponents`; older SDK versions break RSC serialization.
- Vercel env: Neon's pooled URL goes in `DATABASE_URL`, direct URL in `DIRECT_URL` (Prisma migrations need direct, runtime wants pooler).

---

## Global milestones

| Week | Phases | Deliverable |
|---|---|---|
| 1 | 0–1 | Signed-in dashboard in black theme |
| 2 | 2–3 | Static-page `curl` scrape works with API key |
| 3–4 | 4 | Playwright worker + R2; SPA scrapes work |
| 5 | 5 | AI extraction live (schema + schema-free) |
| 6 | 6 | Crawler + map shipping |
| 7 | 7 | Anti-bot pass; Bright Data fallback |
| 8 | 8 | Billing, docs, prod deploy, launch |

**Total**: ~8 weeks for one engineer at full-time, realistic with buffer. Cut Phase 8's MDX docs to launch in 6 if needed — that's the easiest scope to trim.

## When to pause and redesign

- **After Phase 3**: revisit — does the API response shape feel right? Firecrawl-compatible enough?
- **After Phase 4**: load test. If >3s p50 scrape latency, optimize before Phase 5.
- **After Phase 7**: real-user beta. Dogfood for a week before wiring Stripe.
