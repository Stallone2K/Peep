import type { Page } from "playwright";

import type { ScrapeRequestInput } from "@/lib/validators/scrape";
import { fetchPage, type FetchResult } from "@/server/scraper/fetcher";
import {
  extractReadable,
  extractMetadata,
  sanitizeHtml,
} from "@/server/scraper/readability";
import { htmlToMarkdown } from "@/server/scraper/turndown";
import { extractLinks, extractImages } from "@/server/scraper/links";
import {
  extractAttributes,
  type AttributeSelector,
  type AttributeResult,
} from "@/server/scraper/attributes";
import { BrowserPool } from "@/server/scraper/browser";
import { captureScreenshot } from "@/server/scraper/screenshot";
import { extractBrandingSignals } from "@/server/scraper/branding-extract";
import {
  parseVideoId,
  extractYouTubeFromHtml,
  renderYouTubeMarkdown,
  type YouTubeData,
} from "@/server/youtube/extract";
import { executeActions, type Action } from "@/server/scraper/actions";
import { detectBlock } from "@/server/scraper/block-detect";
import { getProxyConfig, isStealthAvailable, type ProxyTier } from "@/server/proxy/providers";
import { uploadScreenshot, isR2Configured } from "@/lib/storage";
import { extractStructured } from "@/server/ai/extract";
import { inferSchemaAndExtract } from "@/server/ai/infer-schema";
import { generateSummary } from "@/server/ai/summary";
import { extractBranding } from "@/server/ai/branding";
import { isAIConfigured } from "@/server/ai/client";
import { isAllowedByRobots } from "@/server/scraper/robots";
import { ApiError, ForbiddenError } from "@/lib/errors";
import {
  getStrategyHint,
  recordStrategySuccess,
} from "@/lib/strategy-cache";

export type EngineType = "http" | "playwright" | "proxy-playwright";

export class BlockedByBotProtectionError extends ApiError {
  constructor(hostname: string, lastEngine: EngineType) {
    super(
      "BLOCKED_BY_BOT_PROTECTION",
      `Scrape of ${hostname} was blocked by bot protection after escalating through ${lastEngine}. Retry with proxy:"stealth" on a paid plan, or use a different URL.`,
      403,
      { lastEngine },
    );
  }
}

export type ScrapeResult = {
  markdown?: string;
  html?: string;
  rawHtml?: string;
  links?: string[];
  images?: string[];
  attributes?: AttributeResult[];
  screenshot?: string; // signed URL or null
  json?: unknown;
  summary?: string;
  branding?: Record<string, unknown>;
  changeTracking?: import("@/server/scraper/change-tracking").ChangeTrackingResult;
  metadata: Record<string, unknown>;
  youtube?: YouTubeData;
  extracted?: unknown;
  pageStatus: number;
  durationMs: number;
  engineUsed: EngineType;
  proxyUsed?: string;
  actionResults?: unknown[];
};

// Decide which engine to use based on request options.
export function pickEngine(input: ScrapeRequestInput): EngineType {
  // If actions are present, we need a browser
  if (input.actions && input.actions.length > 0) return "playwright";

  // If screenshot is requested, need browser
  const wantsScreenshot = input.formats.some((f) => f.type === "screenshot");
  if (wantsScreenshot) return "playwright";

  // Branding needs the rendered page to read real computed colours/fonts
  // (inferring from HTML text misses Tailwind / external-CSS sites).
  const wantsBranding = input.formats.some((f) => f.type === "branding");
  if (wantsBranding) return "playwright";

  // YouTube watch URLs render the data JSON best via the browser (avoids the
  // consent/bot interstitial on datacenter IPs).
  if (parseVideoId(input.url)) return "playwright";

  // If fastMode is on, always HTTP
  if (input.fastMode) return "http";

  // If proxy is stealth/enhanced, need browser
  if (input.proxy === "stealth" || input.proxy === "enhanced") {
    return isStealthAvailable() ? "proxy-playwright" : "playwright";
  }

  // Default: HTTP (fast path)
  return "http";
}

// Run the full scrape pipeline — picks engine, fetches, extracts,
// optionally captures screenshot, returns unified result.
export async function runScrapeWithStrategy(
  input: ScrapeRequestInput,
): Promise<ScrapeResult> {
  const start = Date.now();

  // Phase 7 — robots.txt pre-flight. Runs for every scrape regardless
  // of path (inline /scrape, /crawl child, /batch child) so policy is
  // enforced uniformly. Override is validated at the route boundary.
  const robots = await isAllowedByRobots(input.url, {
    bypass: input.respectRobotsTxt === false,
  });
  if (!robots.allowed) {
    throw new ForbiddenError(
      `Blocked by robots.txt for ${new URL(input.url).hostname}. Set respectRobotsTxt: false on a paid plan to bypass.`,
    );
  }

  const hostname = new URL(input.url).hostname;
  let engine = pickEngine(input);
  const wantedTypes = new Set(input.formats.map((f) => f.type));

  // Phase 7C — last-known-good strategy for this host. If we
  // previously had to escalate to stealth, skip the HTTP probe
  // entirely and go straight to the tier that worked. Only honoured
  // on `auto` proxy — explicit tiers stay respected.
  if (input.proxy === "auto" && !input.actions?.length) {
    const hint = await getStrategyHint(hostname);
    if (hint === "proxy-playwright" && isStealthAvailable()) {
      engine = "proxy-playwright";
    } else if (hint === "playwright" && engine === "http") {
      engine = "playwright";
    }
  }

  // ─── HTTP path ──────────────────────────────────────────────
  if (engine === "http") {
    const fetched = await fetchPage(input.url, {
      timeoutMs: input.timeout,
      headers: input.headers,
      skipTlsVerification: input.skipTlsVerification,
      languages: input.languages,
      country: input.country,
    });

    // Check for block — escalate to Playwright if auto
    const block = detectBlock(
      fetched.bodyText,
      fetched.statusCode,
      fetched.headers,
    );

    if (block.blocked && input.proxy === "auto") {
      // Escalate to Playwright
      engine = "playwright";
    } else {
      await recordStrategySuccess(hostname, "http");
      const base = buildResultFromHtml({
        html: fetched.bodyText,
        statusCode: fetched.statusCode,
        finalUrl: fetched.finalUrl,
        input,
        wantedTypes,
        start,
        engine: "http",
      });
      return applyAIFormats(base, input, wantedTypes, fetched.bodyText);
    }
  }

  // ─── Playwright path (with optional proxy) ──────────────────
  try {
    return await runPlaywright({
      input,
      engine,
      hostname,
      wantedTypes,
      start,
    });
  } catch (err) {
    // Escalate once to the stealth tier if the block detector
    // signalled a bot-protection page on a non-proxied run.
    if (err instanceof NeedsStealthEscalation) {
      return runPlaywright({
        input,
        engine: "proxy-playwright",
        hostname,
        wantedTypes,
        start,
      });
    }
    throw err;
  }
}

// ─── Internal helper: single Playwright run at a given proxy tier ──
// Pulled out of the orchestrator so the stealth-escalation path can
// call it a second time with a different tier without duplicating
// the navigate/screenshot/block-detect flow.
async function runPlaywright({
  input,
  engine,
  hostname,
  wantedTypes,
  start,
}: {
  input: ScrapeRequestInput;
  engine: EngineType;
  hostname: string;
  wantedTypes: Set<string>;
  start: number;
}): Promise<ScrapeResult> {
  const proxyTier: ProxyTier =
    engine === "proxy-playwright" ? "stealth" : "basic";
  const proxyConfig = getProxyConfig(proxyTier);

  const pool = BrowserPool.getInstance();
  return pool.withPage(
    async (page: Page) => {
      // Navigate. `domcontentloaded` always fires (the page's data JSON is
      // present by then); then give client-rendered content a brief settle
      // window — but DON'T wait for full "networkidle", which media/SPA sites
      // (YouTube, dashboards, anything with websockets/polling) never reach
      // and which would otherwise time the whole scrape out.
      await page.goto(input.url, {
        waitUntil: "domcontentloaded",
        timeout: input.timeout,
      });
      await page
        .waitForLoadState("networkidle", { timeout: 5000 })
        .catch(() => {});

      // WaitFor (selector or ms)
      if (input.waitFor > 0) {
        await page.waitForTimeout(input.waitFor);
      }

      // Execute actions
      let actionResults: unknown[] | undefined;
      if (input.actions && input.actions.length > 0) {
        actionResults = await executeActions(
          page,
          input.actions as Action[],
        );
      }

      // Get rendered HTML
      const renderedHtml = await page.content();
      const finalUrl = page.url();
      const statusCode = 200; // Playwright doesn't expose status easily

      // Screenshot
      let screenshotUrl: string | undefined;
      if (wantedTypes.has("screenshot")) {
        const screenshotFormat = input.formats.find(
          (f) => f.type === "screenshot",
        );
        const screenshotOpts = {
          fullPage:
            screenshotFormat && "fullPage" in screenshotFormat
              ? screenshotFormat.fullPage
              : false,
          quality:
            screenshotFormat && "quality" in screenshotFormat
              ? screenshotFormat.quality
              : undefined,
          viewport:
            screenshotFormat && "viewport" in screenshotFormat
              ? screenshotFormat.viewport
              : undefined,
        };

        const buf = await captureScreenshot(page, screenshotOpts);

        // Save to local-disk storage and keep the key; the response layer
        // signs it into a /api/files URL. Fall back to an inline data URL
        // only if storage is somehow unavailable.
        if (isR2Configured()) {
          const jobId = `pw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          screenshotUrl = await uploadScreenshot(jobId, buf);
        } else {
          screenshotUrl = `data:image/jpeg;base64,${buf.toString("base64")}`;
        }
      }

      // Check for block on rendered page
      const block = detectBlock(renderedHtml, statusCode, {});

      if (
        block.blocked &&
        input.proxy === "auto" &&
        isStealthAvailable() &&
        engine !== "proxy-playwright"
      ) {
        // Throw the sentinel — the BrowserPool finalizer releases the
        // page before runScrapeWithStrategy re-enters runPlaywright at
        // the stealth tier.
        throw new NeedsStealthEscalation();
      }

      if (block.blocked && engine === "proxy-playwright") {
        throw new BlockedByBotProtectionError(hostname, engine);
      }

      await recordStrategySuccess(hostname, engine);

      const base = buildResultFromHtml({
        html: renderedHtml,
        statusCode,
        finalUrl,
        input,
        wantedTypes,
        start,
        engine,
      });
      // Read real computed-style colours/fonts off the live page while it's
      // still open — far more accurate than AI-inferring from the HTML.
      const brandingSignals = wantedTypes.has("branding")
        ? await extractBrandingSignals(page).catch(() => null)
        : null;

      const withAI = await applyAIFormats(
        base,
        input,
        wantedTypes,
        renderedHtml,
      );

      // Override AI-inferred colours/fonts with the real computed values
      // (the AI still provides brandName / tagline / typography / ui).
      if (brandingSignals && withAI.branding) {
        withAI.branding = {
          ...withAI.branding,
          colors: brandingSignals.colors,
          fonts: brandingSignals.fonts,
          design: brandingSignals.design,
        };
      }

      // YouTube enrichment — integrated into the EXISTING fields (no new
      // section): the full data object surfaces in JSON, thumbnails in Images,
      // and the transcript+metadata become the Markdown.
      const videoId = parseVideoId(input.url) ?? parseVideoId(finalUrl);
      if (videoId) {
        const yt = await extractYouTubeFromHtml(videoId, renderedHtml).catch(
          () => null,
        );
        if (yt) {
          withAI.youtube = yt;
          withAI.images = [
            ...yt.thumbnails,
            ...(withAI.images ?? []),
          ].filter((v, i, a) => a.indexOf(v) === i);
          withAI.markdown = renderYouTubeMarkdown(yt);
        }
      }

      return {
        ...withAI,
        screenshot: screenshotUrl,
        proxyUsed: proxyTier !== "basic" ? proxyTier : undefined,
        actionResults,
      };
    },
    {
      mobile: input.mobile,
      blockAds: input.blockAds,
      proxyServer: proxyConfig?.server,
      languages: input.languages,
    },
  );
}

// Internal sentinel — used to unwind the BrowserPool before
// re-entering runPlaywright at a higher proxy tier. Not exported;
// callers outside this file should only ever see
// BlockedByBotProtectionError when the ladder is exhausted.
class NeedsStealthEscalation extends Error {
  constructor() {
    super("stealth_escalation_requested");
    this.name = "NeedsStealthEscalation";
  }
}

// Shared HTML → structured-output pipeline used by both HTTP and PW paths.
function buildResultFromHtml(opts: {
  html: string;
  statusCode: number;
  finalUrl: string;
  input: ScrapeRequestInput;
  wantedTypes: Set<string>;
  start: number;
  engine: EngineType;
}): ScrapeResult {
  const { html, statusCode, finalUrl, input, wantedTypes, start, engine } =
    opts;

  const metadata = extractMetadata(html, finalUrl, statusCode);
  const readable = extractReadable(html, finalUrl);
  const result: ScrapeResult = {
    metadata,
    pageStatus: statusCode,
    durationMs: Date.now() - start,
    engineUsed: engine,
  };

  if (wantedTypes.has("markdown")) {
    const sourceHtml =
      input.onlyMainContent && readable
        ? readable.content
        : sanitizeHtml(html, {
            includeTags: input.includeTags,
            excludeTags: input.excludeTags,
            onlyMainContent: input.onlyMainContent,
            onlyCleanContent: input.onlyCleanContent,
            removeBase64Images: input.removeBase64Images,
          });
    result.markdown = htmlToMarkdown(sourceHtml);
  }

  if (wantedTypes.has("html")) {
    result.html =
      input.onlyMainContent && readable
        ? readable.content
        : sanitizeHtml(html, {
            includeTags: input.includeTags,
            excludeTags: input.excludeTags,
            onlyMainContent: input.onlyMainContent,
            onlyCleanContent: input.onlyCleanContent,
            removeBase64Images: input.removeBase64Images,
          });
  }

  if (wantedTypes.has("rawHtml")) {
    result.rawHtml = html;
  }

  if (wantedTypes.has("links")) {
    result.links = extractLinks(html, finalUrl);
  }

  if (wantedTypes.has("images")) {
    result.images = extractImages(html, finalUrl);
  }

  if (wantedTypes.has("attributes")) {
    const attrFmt = input.formats.find((f) => f.type === "attributes") as
      | { selectors?: AttributeSelector[] }
      | undefined;
    result.attributes = extractAttributes(html, attrFmt?.selectors ?? []);
  }

  if (readable) {
    result.metadata = {
      ...result.metadata,
      readabilityTitle: readable.title,
      byline: readable.byline,
      excerpt: readable.excerpt,
      lang: readable.lang,
      readableLength: readable.length,
    };
  }

  result.durationMs = Date.now() - start;
  return result;
}

// Apply AI-powered formats (json, summary, branding) on top of the
// HTML-derived output. Each format is opt-in via formats[]. If AI is
// not configured (GEMINI_API_KEY missing), each failed format gets a
// typed "unavailable" hint in the result metadata rather than
// throwing — partial success is better than a 500.
async function applyAIFormats(
  base: ScrapeResult,
  input: ScrapeRequestInput,
  wantedTypes: Set<string>,
  rawHtml: string,
): Promise<ScrapeResult> {
  const needsAI =
    wantedTypes.has("json") ||
    wantedTypes.has("summary") ||
    wantedTypes.has("branding");
  if (!needsAI) return base;

  // Compute markdown source for AI input. Prefer the markdown format
  // if it's already in the result; otherwise render it on demand
  // (AI needs markdown regardless of whether the user asked for it).
  const mdForAI =
    base.markdown ??
    htmlToMarkdown(
      input.onlyMainContent
        ? (extractReadable(rawHtml, input.url)?.content ?? rawHtml)
        : rawHtml,
    );

  if (!isAIConfigured()) {
    base.metadata = {
      ...base.metadata,
      aiUnavailable:
        "GEMINI_API_KEY not set — json/summary/branding formats skipped",
    };
    return base;
  }

  // Run requested AI formats in parallel. Each Promise.allSettled
  // entry either resolves with a value or rejects — we degrade
  // gracefully per-format rather than failing the whole scrape.
  const ops: Array<{ key: string; promise: Promise<unknown> }> = [];

  if (wantedTypes.has("json")) {
    const jsonFmt = input.formats.find((f) => f.type === "json") as
      | { schema?: unknown; prompt?: string }
      | undefined;

    if (jsonFmt?.schema) {
      ops.push({
        key: "json",
        promise: extractStructured({
          markdown: mdForAI,
          schema: jsonFmt.schema as Record<string, unknown>,
          prompt: jsonFmt.prompt,
          systemPrompt: input.extract?.systemPrompt,
        }).then((r) => r.data),
      });
    } else if (jsonFmt?.prompt || input.extract?.prompt) {
      // Schema-free mode — LLM infers schema from prompt
      ops.push({
        key: "json",
        promise: inferSchemaAndExtract({
          markdown: mdForAI,
          prompt: jsonFmt?.prompt || input.extract?.prompt || "",
        }),
      });
    }
  }

  if (wantedTypes.has("summary")) {
    ops.push({
      key: "summary",
      promise: generateSummary({ markdown: mdForAI }).then((r) => r.summary),
    });
  }

  if (wantedTypes.has("branding")) {
    ops.push({
      key: "branding",
      promise: extractBranding({ markdown: mdForAI, rawHtml }).then(
        (r) => r.branding,
      ),
    });
  }

  const results = await Promise.allSettled(ops.map((o) => o.promise));
  const errors: Record<string, string> = {};

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;
    const r = results[i]!;
    if (r.status === "fulfilled") {
      if (op.key === "json") base.json = r.value;
      else if (op.key === "summary") base.summary = r.value as string;
      else if (op.key === "branding")
        base.branding = r.value as Record<string, unknown>;
    } else {
      errors[op.key] =
        r.reason instanceof Error ? r.reason.message : String(r.reason);
    }
  }

  if (Object.keys(errors).length > 0) {
    base.metadata = { ...base.metadata, aiErrors: errors };
  }

  return base;
}
