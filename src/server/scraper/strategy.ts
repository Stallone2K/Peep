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
import { BrowserPool } from "@/server/scraper/browser";
import { captureScreenshot } from "@/server/scraper/screenshot";
import { executeActions, type Action } from "@/server/scraper/actions";
import { detectBlock } from "@/server/scraper/block-detect";
import { getProxyConfig, isStealthAvailable, type ProxyTier } from "@/server/proxy/providers";
import { uploadScreenshot, isR2Configured, getR2SignedUrl } from "@/lib/r2";
import { extractStructured } from "@/server/ai/extract";
import { inferSchemaAndExtract } from "@/server/ai/infer-schema";
import { generateSummary } from "@/server/ai/summary";
import { extractBranding } from "@/server/ai/branding";
import { isAIConfigured } from "@/server/ai/client";

export type EngineType = "http" | "playwright" | "proxy-playwright";

export type ScrapeResult = {
  markdown?: string;
  html?: string;
  rawHtml?: string;
  links?: string[];
  images?: string[];
  screenshot?: string; // signed URL or null
  json?: unknown;
  summary?: string;
  branding?: Record<string, unknown>;
  metadata: Record<string, unknown>;
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
  let engine = pickEngine(input);
  const wantedTypes = new Set(input.formats.map((f) => f.type));

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
  const proxyTier: ProxyTier =
    engine === "proxy-playwright"
      ? (input.proxy as ProxyTier)
      : "basic";
  const proxyConfig = getProxyConfig(proxyTier);

  const pool = BrowserPool.getInstance();
  return pool.withPage(
    async (page: Page) => {
      // Navigate
      await page.goto(input.url, {
        waitUntil: "networkidle",
        timeout: input.timeout,
      });

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

        // Upload to R2 if configured, otherwise encode as data URL
        if (isR2Configured()) {
          const jobId = `pw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const r2Key = await uploadScreenshot(jobId, buf);
          screenshotUrl = await getR2SignedUrl(r2Key);
        } else {
          screenshotUrl = `data:image/jpeg;base64,${buf.toString("base64")}`;
        }
      }

      // Check for block on rendered page
      const block = detectBlock(
        renderedHtml,
        statusCode,
        {},
      );

      if (
        block.blocked &&
        input.proxy === "auto" &&
        isStealthAvailable() &&
        engine !== "proxy-playwright"
      ) {
        // Could escalate to proxy-playwright here for a retry.
        // For Phase 4 MVP: just return what we got with a blocked hint.
      }

      const base = buildResultFromHtml({
        html: renderedHtml,
        statusCode,
        finalUrl,
        input,
        wantedTypes,
        start,
        engine: engine as EngineType,
      });
      const withAI = await applyAIFormats(
        base,
        input,
        wantedTypes,
        renderedHtml,
      );

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
// not configured (GROQ_API_KEY missing), each failed format gets a
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
        "GROQ_API_KEY not set — json/summary/branding formats skipped",
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
