import type { Browser, BrowserContext, Page } from "playwright";
import { PlaywrightBlocker } from "@cliqz/adblocker-playwright";

import { launchStealth, pickUA } from "@/server/scraper/stealth";

const MAX_USES_PER_CONTEXT = 50;
const CONCURRENCY = Number(process.env.CONCURRENCY ?? "3");

// Lightweight browser pool. Owns a single Chromium instance with N
// reusable BrowserContexts. Contexts are recycled after 50 page-loads
// to prevent memory bloat.
//
// Usage:
//   const pool = BrowserPool.getInstance();
//   const result = await pool.withPage(async (page) => { ... });

class BrowserPool {
  private static instance: BrowserPool | null = null;
  private browser: Browser | null = null;
  private contexts: { ctx: BrowserContext; uses: number }[] = [];
  private queue: Array<(ctx: BrowserContext) => void> = [];
  private adBlocker: PlaywrightBlocker | null = null;

  static getInstance(): BrowserPool {
    if (!BrowserPool.instance) BrowserPool.instance = new BrowserPool();
    return BrowserPool.instance;
  }

  async init(): Promise<void> {
    if (this.browser) return;
    this.browser = await launchStealth();
    this.adBlocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking();
  }

  async withPage<T>(
    fn: (page: Page) => Promise<T>,
    opts?: {
      mobile?: boolean;
      blockAds?: boolean;
      proxy?: { server: string; username?: string; password?: string };
      languages?: string[];
      cookies?: Array<{
        name: string;
        value: string;
        domain: string;
        path: string;
      }>;
    },
  ): Promise<T> {
    await this.init();

    // Authenticated (BYO-session) scrapes get a fresh ISOLATED context that's
    // never pooled — so one user's session cookies can't leak into another's
    // scrape sharing a recycled context. Proxied (stealth/enhanced) scrapes
    // are isolated too: the proxy is a context-level setting, and a pooled
    // context would leak proxied egress into unproxied scrapes (and vice
    // versa).
    const isolated = !!opts?.cookies?.length || !!opts?.proxy;
    const ctx = isolated
      ? await this.browser!.newContext(
          opts?.proxy ? { proxy: opts.proxy } : {},
        )
      : await this.leaseContext();
    if (isolated && opts?.cookies) {
      await ctx.addCookies(opts.cookies).catch(() => {});
    }

    try {
      const uaInfo = pickUA();
      const page = await ctx.newPage();

      // Mobile viewport
      if (opts?.mobile) {
        await page.setViewportSize({ width: 375, height: 812 });
      } else {
        await page.setViewportSize({ width: 1280, height: 800 });
      }

      // UA + headers
      await page.setExtraHTTPHeaders({
        "user-agent": uaInfo.ua,
        "sec-ch-ua": uaInfo.secChUa,
        "sec-ch-ua-platform": `"${uaInfo.platform}"`,
        ...(opts?.languages?.length
          ? { "accept-language": opts.languages.join(",") }
          : {}),
      });

      // Ad blocker
      if (opts?.blockAds !== false && this.adBlocker) {
        await this.adBlocker.enableBlockingInPage(page);
      }

      try {
        return await fn(page);
      } finally {
        await page.close().catch(() => {});
      }
    } finally {
      if (isolated) await ctx.close().catch(() => {});
      else this.releaseContext(ctx);
    }
  }

  private async leaseContext(): Promise<BrowserContext> {
    // Reuse an existing context with remaining budget
    for (const entry of this.contexts) {
      if (entry.uses < MAX_USES_PER_CONTEXT) {
        entry.uses++;
        return entry.ctx;
      }
    }

    // Create a new context if under concurrency limit
    if (this.contexts.length < CONCURRENCY && this.browser) {
      const ctx = await this.browser.newContext();
      const entry = { ctx, uses: 1 };
      this.contexts.push(entry);
      return ctx;
    }

    // Wait for a release
    return new Promise<BrowserContext>((resolve) => {
      this.queue.push(resolve);
    });
  }

  private releaseContext(ctx: BrowserContext): void {
    const entry = this.contexts.find((e) => e.ctx === ctx);

    // Recycle if at max uses
    if (entry && entry.uses >= MAX_USES_PER_CONTEXT) {
      this.contexts = this.contexts.filter((e) => e.ctx !== ctx);
      void ctx.close().catch(() => {});

      // If there's a waiter, create a fresh context for them
      if (this.queue.length > 0 && this.browser) {
        void this.browser.newContext().then((freshCtx) => {
          const freshEntry = { ctx: freshCtx, uses: 1 };
          this.contexts.push(freshEntry);
          const resolve = this.queue.shift();
          if (resolve) resolve(freshCtx);
        });
      }
      return;
    }

    // Hand off to a waiting caller if one exists
    if (this.queue.length > 0) {
      const resolve = this.queue.shift();
      if (resolve && entry) {
        entry.uses++;
        resolve(ctx);
      }
    }
  }

  async shutdown(): Promise<void> {
    for (const entry of this.contexts) {
      await entry.ctx.close().catch(() => {});
    }
    this.contexts = [];
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
    BrowserPool.instance = null;
  }
}

export { BrowserPool };
