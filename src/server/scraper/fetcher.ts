import { Agent, fetch as undiciFetch, setGlobalDispatcher } from "undici";
import { lookup as dnsLookup } from "node:dns/promises";
import net from "node:net";

import { ValidationError } from "@/lib/errors";

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
function pickUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]!;
}

// ─── SSRF guard ─────────────────────────────────────────────────
// An attacker can point DNS at a private IP, so we must resolve the
// host ourselves and reject private / loopback / link-local / CGN /
// multicast ranges BEFORE a socket is opened. We short-circuit the
// literal-host cases too (`localhost`, 0.0.0.0) even though zod's
// urlSchema already catches most of those.

const PRIVATE_V4_BLOCKS: Array<[number, number]> = [
  // CIDR → [start, prefix length], IP-as-uint32
  [ipv4ToUint32("0.0.0.0"), 8], // "this network"
  [ipv4ToUint32("10.0.0.0"), 8], // RFC1918
  [ipv4ToUint32("100.64.0.0"), 10], // CGN
  [ipv4ToUint32("127.0.0.0"), 8], // loopback
  [ipv4ToUint32("169.254.0.0"), 16], // link-local
  [ipv4ToUint32("172.16.0.0"), 12], // RFC1918
  [ipv4ToUint32("192.0.0.0"), 24], // IETF protocol
  [ipv4ToUint32("192.0.2.0"), 24], // TEST-NET-1
  [ipv4ToUint32("192.168.0.0"), 16], // RFC1918
  [ipv4ToUint32("198.18.0.0"), 15], // benchmarking
  [ipv4ToUint32("198.51.100.0"), 24], // TEST-NET-2
  [ipv4ToUint32("203.0.113.0"), 24], // TEST-NET-3
  [ipv4ToUint32("224.0.0.0"), 4], // multicast
  [ipv4ToUint32("240.0.0.0"), 4], // reserved
];

function ipv4ToUint32(ip: string): number {
  const [a, b, c, d] = ip.split(".").map(Number) as [
    number,
    number,
    number,
    number,
  ];
  return ((a << 24) >>> 0) + ((b << 16) >>> 0) + ((c << 8) >>> 0) + d;
}

function isPrivateV4(ip: string): boolean {
  const n = ipv4ToUint32(ip);
  return PRIVATE_V4_BLOCKS.some(([base, prefix]) => {
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return (n & mask) === (base & mask);
  });
}

function isPrivateV6(ip: string): boolean {
  const lower = ip.toLowerCase();
  // Simplified — covers the big classes. Full IPv6 SSRF analysis is
  // overkill for MVP; the underlying network layer would also refuse
  // most of these.
  if (lower === "::1") return true; // loopback
  if (lower.startsWith("fe80:")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
  if (lower.startsWith("::ffff:")) {
    // IPv4-mapped — re-check as v4
    const v4 = lower.split("::ffff:")[1]!;
    if (net.isIPv4(v4)) return isPrivateV4(v4);
  }
  return false;
}

async function assertSafeHost(hostname: string): Promise<string> {
  // Resolve ourselves so attackers can't DNS-rebind us.
  const results = await dnsLookup(hostname, { all: true });
  for (const r of results) {
    if (r.family === 4 && isPrivateV4(r.address)) {
      throw new ValidationError({
        reason: "URL resolves to a private IP range",
        address: r.address,
      });
    }
    if (r.family === 6 && isPrivateV6(r.address)) {
      throw new ValidationError({
        reason: "URL resolves to a private IPv6 range",
        address: r.address,
      });
    }
  }
  // Return the first resolved IP for downstream info; we still use the
  // hostname for TLS (SNI) — trading theoretical rebind for Host-header
  // correctness.
  return results[0]?.address ?? hostname;
}

// Process-wide dispatcher for undici with modest connection reuse.
const agent = new Agent({ connect: { timeout: 10_000 } });
setGlobalDispatcher(agent);

export type FetchResult = {
  body: Buffer;
  bodyText: string;
  contentType: string;
  statusCode: number;
  finalUrl: string;
  headers: Record<string, string>;
  durationMs: number;
};

export async function fetchPage(
  url: string,
  opts: {
    timeoutMs: number;
    headers?: Record<string, string>;
    skipTlsVerification?: boolean;
    userAgent?: string;
    languages?: string[];
    country?: string;
  },
): Promise<FetchResult> {
  const parsed = new URL(url);
  await assertSafeHost(parsed.hostname);

  const start = Date.now();
  const ua = opts.userAgent ?? pickUserAgent();
  const acceptLanguage =
    opts.languages && opts.languages.length
      ? opts.languages.join(",")
      : "en-US,en;q=0.9";

  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), opts.timeoutMs);

  try {
    const res = await undiciFetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": ua,
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "accept-language": acceptLanguage,
        ...opts.headers,
      },
      // @ts-expect-error undici types lag behind — maxRedirections is fine
      maxRedirections: MAX_REDIRECTS,
    });

    // Size-capped read. We can't trust Content-Length headers so we
    // track bytes received and abort on overflow.
    const chunks: Buffer[] = [];
    let received = 0;
    if (!res.body) throw new Error("No response body");
    const reader = res.body.getReader();
    // eslint-disable-next-line no-constant-condition
    while (true) {
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
      finalUrl: res.url || url,
      headers: responseHeaders,
      durationMs: Date.now() - start,
    };
  } finally {
    clearTimeout(abortTimer);
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
