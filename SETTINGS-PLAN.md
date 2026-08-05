# Peep — Settings Modal, Multi-Tenancy, Billing & Account Control (Execution Plan)

Goal: a Gather-CMS-style **settings modal** (left-nav sections + content panel) with far more
control than Gather — full account control, real workspace/team multi-tenancy, Razorpay billing,
logout, and changelog. Built incrementally in phases so each ships independently.

## Current state (grounding)
- Auth: NextAuth **database sessions** (`PrismaAdapter`, `strategy:"database"`), OAuth-only
  (Google + GitHub) — **no password, no 2FA, no logout button** wired. `signOut` is available.
- **No Team/Workspace model** — "Personal Team" is cosmetic; all data scoped by `User.id`.
  `planTier` + `creditBalance` live on `User`.
- Settings page = YouTube card + "coming soon" text. `/changelog`, `/pricing`, `/docs/help` 404.
- Have: `ui/dialog.tsx`, `ui/dropdown-menu.tsx`, `ui/tabs.tsx`, `ui/switch.tsx`, `ui/input.tsx`,
  local-disk artifact storage (reuse for avatar/logo uploads), webhook HMAC system, API-key CRUD.

## The Settings Modal — information architecture
A `Dialog` (route-aware: `?settings=<section>` so it's linkable/back-button friendly) with a
240px left nav grouped like Gather, but richer:

**ACCOUNT** (per-user)
- **My Account** — avatar upload + preferred/display name · Account Security (email + change,
  Set/Change Password, 2FA setup, connected providers Google/GitHub) · Devices/Sessions (list
  active DB sessions, revoke, "Log out of all devices") · Danger Zone (delete account).
- **Preferences** — theme (light/dark/system), density, default scrape formats, default timeout,
  timezone, language, "reduce motion".
- **Notifications** — email + in-app toggles: job completed/failed, credit-low, security alerts,
  weekly usage summary, product updates.
- **Keyboard Shortcuts** — reference sheet (⌘K command palette, nav, actions).

**WORKSPACE** (per-team — needs multi-tenancy)
- **General** — workspace name, slug, logo, default region/proxy, delete workspace.
- **People** — members list with roles (Owner/Admin/Member), invite by email, pending invites,
  resend/revoke, remove member, transfer ownership.
- **Billing & Usage** — plan tier, credit balance + ledger, usage charts, **Razorpay** upgrade /
  manage subscription / buy credit top-ups, invoices/receipts.
- **API Keys** — move the existing key manager into the modal (create/reveal/revoke), scoped to team.
- **Webhooks** — endpoints, rotate signing secret, recent delivery log (success/retry/fail).
- **Integrations / Connections** — YouTube Session (move here), MCP server setup, SDK snippets,
  future connectors (Slack, Zapier, n8n, LangChain) as "Connect / Coming soon".
- **Import / Export** — export account/workspace data (JSON), usage CSV.

**DEVELOPER**
- **Rate limits & concurrency** (read-only view of current tier caps).
- **Audit log** (security-relevant events: key created/revoked, member changes, logins).

**FEATURES** (beta flags) — Agent, Interact (browser sandbox), toggles per workspace.

## Phase plan

### Phase A — Modal shell + Account + Logout (P0, no schema migration)
- Build `SettingsModal` (Dialog + left-nav + content router keyed on `?settings=`), reusable
  `SettingsSection`/`SettingsRow` primitives, Peep dark/orange styling.
- Wire the **user menu** in `sidebar-nav.tsx` bottom chip → dropdown: Profile · Settings · Theme ·
  **Sign Out** (`signOut()`), and the `TopBar` avatar.
- **My Account**: avatar upload (reuse `storage.ts` → `/api/files`), display-name edit
  (`/api/dashboard/account` PATCH), connected providers list.
- **Security/Sessions**: list `Session` rows (DB), revoke one, "Log out of all devices"
  (delete other sessions). **Danger Zone**: delete account (cascade) with typed confirmation.
- **Preferences** + **Notifications** + **Keyboard Shortcuts** (store prefs on User as JSON).
- Files: `src/components/dashboard/settings/*`, `src/app/api/dashboard/account/**`,
  `src/app/api/dashboard/sessions/**`, edit `sidebar-nav.tsx` + `top-bar.tsx`.

### Phase B — Real multi-tenancy (Teams/Workspaces) (L — the big one)
- **Schema**: `Team { id, name, slug, logoKey, planTier, creditBalance, createdAt }`,
  `TeamMember { teamId, userId, role: OWNER|ADMIN|MEMBER }`,
  `TeamInvite { teamId, email, role, token, expiresAt, invitedById }`. Add `teamId` to
  `ScrapeJob/CrawlJob/BatchJob/ApiKey/CreditLedger/ExtractJob/...`. Move `planTier`+`creditBalance`
  ownership from User → Team (keep User for identity only).
- **Migration** (careful, prod has data + the protected `_btest.ts`): backfill — create one
  personal Team per existing User, membership OWNER, copy planTier/creditBalance, set `teamId` on
  all existing rows. Reversible, idempotent script under `scripts/`.
- **Session/context**: "active team" in session (or cookie); `requireSession`/`requireApiKey`
  resolve `{ userId, teamId, role }`. **Scope every query by teamId** (audit all `where:{userId}`).
- **Team switcher** (the "Personal Team" chip): real dropdown — switch team, Create Team, Settings.
- **Workspace → General + People** settings sections; invite flow (email w/ token → accept route).
- Credits/rate-limit/idempotency re-scoped to team.

### Phase C — Razorpay billing (PLAN NOW, execute on command)
- Plans/tiers table (Free/Hobby/Standard/Growth/Scale) with monthly credits + concurrency caps
  (extend `plans.ts`). **Razorpay**: Subscriptions API for plans + Orders API for one-time credit
  top-ups. Checkout via Razorpay Checkout.js in the Billing section.
- Webhook `/api/webhooks/razorpay` (verify `X-Razorpay-Signature` HMAC): `subscription.activated`/
  `charged` → set team plan + grant monthly credits; `order.paid` → grant top-up credits;
  `subscription.cancelled`/`halted` → downgrade at period end. All credit moves via `CreditLedger`.
- Env: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (user sets on VPS).
- `/pricing` public page (tiers) → "Upgrade" links here / opens Billing modal.
- **This is the one paid dependency** — matches the "execute in a while" ask.

### Phase D — Changelog + dead links + polish (P1)
- `/changelog` (data-driven like `/docs`), wire "What's New" + the sidebar notification dot to
  unseen entries (store `lastSeenChangelogAt` on User). Fix `/docs/help` (create or repoint Help).
- Move API Keys + Webhooks + YouTube session into the modal's Workspace/Integrations sections
  (keep deep-link routes too).

### Phase E — Advanced (optional, later)
- 2FA (TOTP) + optional password credential provider (expands auth surface — new work).
- Audit log, Import/Export, keyboard command palette (⌘K), feature-flag toggles.

## "More we can add" (menu of extras to pull in)
Command palette (⌘K) · per-workspace default scrape presets · saved views · scheduled/recurring
scrapes (monitor) · usage budgets + alerts · IP allowlist for API keys · per-key scopes/rate limits
· email digests · dark/light theme + brand accent · onboarding checklist · referral credits ·
data-retention controls (auto-purge results) · export to S3/Drive · SSO (later) · status page.

## Constraints / notes
- Deploy = tar-sync to VPS; **preserve `_btest.ts`**; rebuild + pm2 restart web (+ worker if
  workers touched). cacheComponents: keep `auth()`/dynamic reads inside `Suspense`.
- Phase B migration is the riskiest (prod data) — write it idempotent + test on a copy first.
- Recommended order: **A → D (quick wins) → B (multi-tenancy) → C (Razorpay) → E**.
