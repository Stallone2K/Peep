import { fetch as undiciFetch, type Agent } from "undici";

import { ValidationError } from "@/lib/errors";
import {
  assertSafeUrl,
  createPinnedDispatcher,
} from "@/server/scraper/ssrf";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB body cap
const MAX_REDIRECTS = 5;

// Reusable UA pool. Rotated per-request for light fingerprint
// variation. Phase 7 hardens this further (stealth plugin, Sec-CH-UA
// parity, residential proxy escalation).
const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
];
// Mobile UAs — used when the caller sets `mobile:true`. Even on the
// HTTP fast path (no rendering) this makes UA-sniffing servers return
// their mobile HTML, so the option isn't a browser-only no-op.
const MOBILE_USER_AGENTS = [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
];
function pickUserAgent(mobile = false): string {
  const pool = mobile ? MOBILE_USER_AGENTS : USER_AGENTS;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

export type FetchResult = {
  body: Buffer;
  bodyText: string;
  contentType: string;
  statusCode: number;
  finalUrl: string;
  headers: Record<string, string>;
  durationMs: number;
};

// SSRF-hardened page fetch. Redirects are followed MANUALLY so every
// hop goes through assertSafeUrl (a public URL 302→169.254.169.254 is
// rejected, not followed), and each hop's socket is pinned to the IP
// that passed validation (defeats DNS-rebinding between check and
// connect). The URL keeps its hostname, so Host header, SNI and cert
// validation stay correct.
export async function fetchPage(
  url: string,
  opts: {
    timeoutMs: number;
    headers?: Record<string, string>;
    skipTlsVerification?: boolean;
    userAgent?: string;
    languages?: string[];
    country?: string;
    mobile?: boolean;
  },
): Promise<FetchResult> {
  const start = Date.now();
  const ua = opts.userAgent ?? pickUserAgent(opts.mobile);
  const acceptLanguage =
    opts.languages && opts.languages.length
      ? opts.languages.join(",")
      : "en-US,en;q=0.9";
  const requestHeaders = {
    "user-agent": ua,
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": acceptLanguage,
    ...opts.headers,
  };

  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), opts.timeoutMs);

  let currentUrl = url;
  let dispatcher: Agent | null = null;

  try {
    for (let hop = 0; ; hop++) {
      const safe = await assertSafeUrl(currentUrl);
      dispatcher = createPinnedDispatcher(safe.address, safe.family, {
        rejectUnauthorized: opts.skipTlsVerification ? false : undefined,
      });

      const res = await undiciFetch(currentUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: requestHeaders,
        dispatcher,
      });

      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        await res.body?.cancel().catch(() => {});
        await dispatcher.close().catch(() => {});
        dispatcher = null;
        if (hop >= MAX_REDIRECTS) {
          throw new ValidationError({
            reason: `Too many redirects (max ${MAX_REDIRECTS})`,
          });
        }
        // Resolve relative Locations against the current hop; the next
        // loop iteration re-validates the target before connecting.
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      // Size-capped read. We can't trust Content-Length headers so we
      // track bytes received and abort on overflow.
      const chunks: Buffer[] = [];
      let received = 0;
      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        received += value.byteLength;
        if (received > MAX_BYTES) {
          void reader.cancel().catch(() => {});
          throw new ValidationError({
            reason: `Response exceeded ${MAX_BYTES / 1024 / 1024}MB cap`,
          });
        }
        chunks.push(Buffer.from(value));
      }
      const body = Buffer.concat(chunks);
      const contentType = res.headers.get("content-type") ?? "";

      // Decode to string for HTML/text content types. For binary (PDF,
      // images) we'd handle differently — Phase 3 is HTML-focused.
      const bodyText = isTextish(contentType)
        ? body.toString(decodeCharset(contentType))
        : body.toString("utf8");

      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        responseHeaders[k] = v;
      });

      return {
        body,
        bodyText,
        contentType,
        statusCode: res.status,
        finalUrl: currentUrl,
        headers: responseHeaders,
        durationMs: Date.now() - start,
      };
    }
  } finally {
    clearTimeout(abortTimer);
    if (dispatcher) await dispatcher.close().catch(() => {});
  }
}

function isTextish(contentType: string): boolean {
  const lower = contentType.toLowerCase();
  return (
    lower.startsWith("text/") ||
    lower.includes("application/xhtml") ||
    lower.includes("application/xml") ||
    lower.includes("application/json") ||
    lower.includes("+xml") ||
    lower.includes("+json")
  );
}

function decodeCharset(contentType: string): BufferEncoding {
  const match = contentType.match(/charset=([^;]+)/i);
  if (!match) return "utf8";
  const name = match[1]!.trim().toLowerCase().replace(/"/g, "");
  if (name === "utf-8" || name === "utf8") return "utf8";
  if (name === "latin1" || name === "iso-8859-1") return "latin1";
  if (name === "ascii") return "ascii";
  return "utf8";
}
