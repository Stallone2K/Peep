import { lookup as dnsLookup } from "node:dns/promises";
import net from "node:net";

import { Agent } from "undici";
import type { Page } from "playwright";

import { ValidationError } from "@/lib/errors";

// ─── Shared SSRF guard ──────────────────────────────────────────────
// Single source of truth for "is this URL safe to fetch from our
// network position". Used by:
//   - the HTTP fetcher (per redirect hop, with IP pinning)
//   - the Playwright path (before page.goto + a request interceptor
//     that covers subresources and JS-driven redirects)
//   - webhook delivery (at enqueue and at delivery time)
//
// An attacker can point DNS at a private IP, so we resolve the host
// ourselves and reject private / loopback / link-local / CGN /
// multicast ranges BEFORE a socket is opened. The resolved IP is
// returned so callers can pin the connection to it (defeats
// DNS-rebinding TOCTOU).
//
// Self-hosters who legitimately need to scrape internal hosts can
// allowlist exact hostnames via SSRF_ALLOWED_HOSTS (comma-separated).

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

const PRIVATE_V4_BLOCKS: Array<[number, number]> = [
  // CIDR → [base-as-uint32, prefix length]
  [ipv4ToUint32("0.0.0.0"), 8], // "this network"
  [ipv4ToUint32("10.0.0.0"), 8], // RFC1918
  [ipv4ToUint32("100.64.0.0"), 10], // CGN
  [ipv4ToUint32("127.0.0.0"), 8], // loopback
  [ipv4ToUint32("169.254.0.0"), 16], // link-local (cloud metadata)
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

export function isPrivateV4(ip: string): boolean {
  if (!net.isIPv4(ip)) return true; // fail closed on garbage
  const n = ipv4ToUint32(ip);
  return PRIVATE_V4_BLOCKS.some(([base, prefix]) => {
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return (n & mask) === (base & mask);
  });
}

// Expand an IPv6 literal into its 16 bytes. Handles `::` compression,
// embedded IPv4 tails (`::ffff:1.2.3.4`) and zone indices (`fe80::1%eth0`).
// Returns null on anything malformed — callers treat that as private.
function parseIPv6(ip: string): number[] | null {
  let s = ip;
  const zone = s.indexOf("%");
  if (zone !== -1) s = s.slice(0, zone);

  // Rewrite an embedded IPv4 tail as two hex groups so the rest of the
  // parse is uniform.
  const lastColon = s.lastIndexOf(":");
  const tail = s.slice(lastColon + 1);
  if (tail.includes(".")) {
    if (!net.isIPv4(tail)) return null;
    const [a, b, c, d] = tail.split(".").map(Number) as [
      number,
      number,
      number,
      number,
    ];
    s =
      s.slice(0, lastColon + 1) +
      (((a << 8) | b) >>> 0).toString(16) +
      ":" +
      (((c << 8) | d) >>> 0).toString(16);
  }

  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 && head.length !== 8) return null;
  if (halves.length === 2 && missing < 1) return null;

  const groups = [
    ...head,
    ...Array<string>(halves.length === 2 ? missing : 0).fill("0"),
    ...rest,
  ];
  if (groups.length !== 8) return null;

  const bytes: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
    const v = parseInt(g, 16);
    bytes.push((v >> 8) & 0xff, v & 0xff);
  }
  return bytes;
}

export function isPrivateV6(ip: string): boolean {
  const b = parseIPv6(ip);
  if (!b) return true; // fail closed

  const allZero = (from: number, to: number) =>
    b.slice(from, to).every((x) => x === 0);
  const embeddedV4 = (offset: number) =>
    `${b[offset]}.${b[offset + 1]}.${b[offset + 2]}.${b[offset + 3]}`;

  // ::  (unspecified) and ::1 (loopback)
  if (allZero(0, 15) && (b[15] === 0 || b[15] === 1)) return true;
  // ff00::/8 multicast
  if (b[0] === 0xff) return true;
  // fe80::/10 link-local
  if (b[0] === 0xfe && (b[1]! & 0xc0) === 0x80) return true;
  // fc00::/7 ULA
  if ((b[0]! & 0xfe) === 0xfc) return true;
  // ::ffff:0:0/96 IPv4-mapped → judge by the embedded IPv4
  if (allZero(0, 10) && b[10] === 0xff && b[11] === 0xff) {
    return isPrivateV4(embeddedV4(12));
  }
  // ::/96 IPv4-compatible (deprecated) — block outright
  if (allZero(0, 12)) return true;
  // 64:ff9b::/96 NAT64 + 64:ff9b:1::/48 local-use NAT64 — block outright.
  // These let a v6 socket reach arbitrary v4 space through a translator,
  // sidestepping the v4 checks.
  if (b[0] === 0 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) {
    return true;
  }
  // 2002::/16 6to4 → judge by the embedded IPv4
  if (b[0] === 0x20 && b[1] === 0x02) return isPrivateV4(embeddedV4(2));
  // 2001::/32 Teredo — the client v4 is XOR-obfuscated; block outright
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0 && b[3] === 0) return true;

  return false;
}

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateV4(ip);
  if (net.isIPv6(ip)) return isPrivateV6(ip);
  return true; // fail closed
}

function allowedHosts(): Set<string> {
  return new Set(
    (process.env.SSRF_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

export type SafeUrl = {
  url: URL;
  hostname: string;
  // First resolved (and validated) address — pin the socket to this.
  address: string;
  family: 4 | 6;
};

// Validate a URL for outbound fetching. Throws ValidationError on any
// unsafe scheme, hostname, or resolved address; returns the parsed URL
// plus a validated IP callers should pin their connection to.
export async function assertSafeUrl(
  rawUrl: string,
  opts: { requireHttps?: boolean } = {},
): Promise<SafeUrl> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ValidationError({ reason: "Invalid URL", url: rawUrl });
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new ValidationError({
      reason: `URL scheme "${url.protocol}" is not allowed`,
    });
  }
  if (opts.requireHttps && url.protocol !== "https:") {
    throw new ValidationError({ reason: "URL must use https" });
  }

  let hostname = url.hostname.toLowerCase();
  // WHATWG URLs wrap IPv6 literals in brackets.
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    hostname = hostname.slice(1, -1);
  }
  if (!hostname) {
    throw new ValidationError({ reason: "URL has no hostname" });
  }

  const allowlisted = allowedHosts().has(hostname);

  if (
    !allowlisted &&
    (hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal"))
  ) {
    throw new ValidationError({
      reason: "Loopback / internal hostnames are not allowed",
      hostname,
    });
  }

  // Literal IP — no DNS involved.
  const literalFamily = net.isIP(hostname);
  if (literalFamily) {
    if (!allowlisted && isPrivateAddress(hostname)) {
      throw new ValidationError({
        reason: "URL points at a private IP range",
        address: hostname,
      });
    }
    return {
      url,
      hostname,
      address: hostname,
      family: literalFamily as 4 | 6,
    };
  }

  // Resolve ourselves so attackers can't DNS-rebind us; validate EVERY
  // returned address (the OS may connect to any of them).
  let results: Array<{ address: string; family: number }>;
  try {
    results = await dnsLookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new ValidationError({
      reason: "Hostname could not be resolved",
      hostname,
    });
  }
  if (!results.length) {
    throw new ValidationError({
      reason: "Hostname could not be resolved",
      hostname,
    });
  }
  if (!allowlisted) {
    for (const r of results) {
      if (isPrivateAddress(r.address)) {
        throw new ValidationError({
          reason: "URL resolves to a private IP range",
          hostname,
          address: r.address,
        });
      }
    }
  }

  return {
    url,
    hostname,
    address: results[0]!.address,
    family: results[0]!.family as 4 | 6,
  };
}

// Non-throwing variant for hot paths (the Playwright interceptor).
export async function isSafeUrl(rawUrl: string): Promise<boolean> {
  try {
    await assertSafeUrl(rawUrl);
    return true;
  } catch {
    return false;
  }
}

// undici dispatcher that connects to a pre-validated IP while keeping
// the original hostname for SNI, certificate checks and the Host
// header. Closes the DNS-rebind TOCTOU window: the socket goes to the
// address we checked, not whatever the attacker's DNS says next.
export function createPinnedDispatcher(
  address: string,
  family: 4 | 6,
  opts: { connectTimeoutMs?: number; rejectUnauthorized?: boolean } = {},
): Agent {
  const lookup = (
    _hostname: string,
    options: { all?: boolean },
    cb: (
      err: NodeJS.ErrnoException | null,
      address: string | Array<{ address: string; family: number }>,
      family?: number,
    ) => void,
  ) => {
    // net.connect calls lookup with `all: true` when autoSelectFamily
    // is enabled (Node 20+ default) — support both callback shapes.
    if (options?.all) cb(null, [{ address, family }]);
    else cb(null, address, family);
  };

  return new Agent({
    connect: {
      timeout: opts.connectTimeoutMs ?? 10_000,
      ...(opts.rejectUnauthorized === false
        ? { rejectUnauthorized: false }
        : {}),
      lookup,
      // undici forwards unknown connect options to net/tls.connect,
      // where `lookup` is honoured — its types just don't surface it.
    } as unknown as NonNullable<ConstructorParameters<typeof Agent>[0]>["connect"],
  });
}

// ─── Playwright request interceptor ─────────────────────────────────
// Aborts any in-page request (subresource, XHR, JS-driven redirect
// hop) whose target is a private address. DNS results are cached
// briefly per hostname so a page with 100 same-host assets doesn't do
// 100 lookups.

const HOST_CACHE_TTL_MS = 30_000;
const HOST_CACHE_MAX = 1_000;
const hostCache = new Map<string, { safe: boolean; expires: number }>();

async function cachedIsSafeUrl(rawUrl: string): Promise<boolean> {
  let key: string;
  try {
    const u = new URL(rawUrl);
    if (!ALLOWED_PROTOCOLS.has(u.protocol)) return false;
    key = u.hostname.toLowerCase();
  } catch {
    return false;
  }

  const now = Date.now();
  const hit = hostCache.get(key);
  if (hit && hit.expires > now) return hit.safe;

  const safe = await isSafeUrl(rawUrl);
  if (hostCache.size >= HOST_CACHE_MAX) {
    const oldest = hostCache.keys().next().value;
    if (oldest !== undefined) hostCache.delete(oldest);
  }
  hostCache.set(key, { safe, expires: now + HOST_CACHE_TTL_MS });
  return safe;
}

export async function installSsrfPageGuard(page: Page): Promise<void> {
  await page.route("**/*", async (route) => {
    const reqUrl = route.request().url();
    if (await cachedIsSafeUrl(reqUrl)) {
      // Defer to the next handler (ad blocker) or continue.
      await route.fallback().catch(() => {});
    } else {
      await route.abort("blockedbyclient").catch(() => {});
    }
  });
}
