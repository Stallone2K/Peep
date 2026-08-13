import { RE2JS } from "re2js";

// URL filtering + normalization used by the crawl frontier.
//
// Firecrawl-parity notes:
// - `includePaths` / `excludePaths` are REGEXES (not globs). The values
//   are compiled per-crawl and cached. `regexOnFullURL` switches the
//   match target between pathname-only (default) and the full URL.
// - `crawlEntireDomain` relaxes the "same-origin" rule to allow
//   navigating to parents/siblings under the same registrable domain.
// - `allowSubdomains` further relaxes to any `*.domain`.
// - `allowExternalLinks` turns off origin enforcement entirely.

const DEFAULT_BINARY_EXTENSIONS = new Set([
  // common document + media binaries we don't want to scrape HTML from
  "pdf", "zip", "rar", "7z", "tar", "gz", "bz2",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp", "tiff",
  "mp3", "mp4", "wav", "ogg", "webm", "mov", "avi", "mkv", "flac",
  "dmg", "exe", "msi", "iso", "apk",
  "css", "js", "map", "woff", "woff2", "ttf", "otf", "eot",
]);

export type FrontierConfig = {
  rootUrl: string;
  includePaths?: string[];
  excludePaths?: string[];
  regexOnFullURL?: boolean;
  crawlEntireDomain?: boolean;
  allowSubdomains?: boolean;
  allowExternalLinks?: boolean;
  allowBinaryFormats?: boolean;
  ignoreQueryParameters?: boolean;
};

// Normalize a URL so the dedup set sees `https://example.com/foo`,
// `https://example.com/foo/`, and `https://example.com/foo#bar` as one.
// Caller chooses whether to also strip the query string — that's a
// per-crawl knob.
export function normalizeUrl(
  raw: string,
  opts: { ignoreQueryParameters?: boolean } = {},
): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;

  u.hash = "";
  u.hostname = u.hostname.toLowerCase();
  if (opts.ignoreQueryParameters) u.search = "";
  // collapse trailing slash on non-root paths
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
  }
  // drop the default port
  if (
    (u.protocol === "http:" && u.port === "80") ||
    (u.protocol === "https:" && u.port === "443")
  ) {
    u.port = "";
  }
  return u.toString();
}

export function hasBinaryExtension(url: string): boolean {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").pop() ?? "";
    const dot = last.lastIndexOf(".");
    if (dot <= 0) return false;
    const ext = last.slice(dot + 1).toLowerCase();
    return DEFAULT_BINARY_EXTENSIONS.has(ext);
  } catch {
    return false;
  }
}

export type CompiledFrontierFilter = {
  shouldVisit: (url: string) => boolean;
};

// Cap the string we run user regexes against. Defence-in-depth on top
// of the linear-time engine — no legitimate URL filter needs to see
// more than this, and it bounds work on absurdly long discovered URLs.
const MAX_MATCH_TARGET = 4_000;

export function compileFilter(cfg: FrontierConfig): CompiledFrontierFilter {
  const root = new URL(cfg.rootUrl);
  const rootEtld1 = registrableDomain(root.hostname);

  const includes = (cfg.includePaths ?? []).map(compileRegex);
  const excludes = (cfg.excludePaths ?? []).map(compileRegex);

  return {
    shouldVisit(url: string): boolean {
      let u: URL;
      try {
        u = new URL(url);
      } catch {
        return false;
      }

      // origin rules
      if (!cfg.allowExternalLinks) {
        const host = u.hostname.toLowerCase();
        if (cfg.allowSubdomains || cfg.crawlEntireDomain) {
          if (registrableDomain(host) !== rootEtld1) return false;
        } else {
          if (host !== root.hostname.toLowerCase()) return false;
        }
      }

      // binary extension blocklist
      if (!cfg.allowBinaryFormats && hasBinaryExtension(url)) return false;

      // exclude wins
      const target = (cfg.regexOnFullURL ? url : u.pathname + u.search).slice(
        0,
        MAX_MATCH_TARGET,
      );
      for (const re of excludes) if (re.test(target)) return false;
      if (includes.length > 0) {
        let matched = false;
        for (const re of includes) {
          if (re.test(target)) {
            matched = true;
            break;
          }
        }
        if (!matched) return false;
      }

      return true;
    },
  };
}

// Best-effort eTLD+1. We don't ship the full Public Suffix List — for
// the common cases (`foo.example.com`, `example.co.uk`) the last two
// labels are fine. Two-letter TLD + known two-letter second-level
// suffixes fall back to last three labels. Good enough for MVP; can
// swap in `tldts` if edge cases bite.
const TWO_LEVEL_SUFFIXES = new Set([
  "co.uk", "co.in", "co.jp", "co.kr", "co.nz", "co.za", "co.il",
  "com.au", "com.br", "com.cn", "com.mx", "com.sg", "com.tr", "com.tw",
  "ac.uk", "gov.uk", "org.uk", "net.au", "org.au",
]);
function registrableDomain(host: string): string {
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  const last2 = parts.slice(-2).join(".");
  if (TWO_LEVEL_SUFFIXES.has(last2)) {
    return parts.slice(-3).join(".");
  }
  return last2;
}

type CompiledPattern = { test: (s: string) => boolean };

// Compile a user-supplied crawl regex with RE2 (re2js) instead of the
// native engine. RE2 guarantees LINEAR-time matching, which closes the
// ReDoS hole (SECURITY.md M1): a pattern like `(a+)+$` that causes
// catastrophic backtracking in `RegExp` — and, because Node is
// single-threaded, hangs the whole crawl worker for every tenant — runs
// in bounded time here. RE2 rejects backreferences / lookaround (the
// exact features that enable the blowup); those aren't needed for URL
// path filters, and a pattern using them falls back to a literal match.
function compileRegex(pattern: string): CompiledPattern {
  try {
    const re = RE2JS.compile(pattern);
    return { test: (s) => re.matcher(s).find() };
  } catch {
    // Invalid, or an unsupported feature (backref/lookaround) — treat
    // the input as a literal string rather than blowing up the crawl.
    try {
      const re = RE2JS.compile(
        pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      );
      return { test: (s) => re.matcher(s).find() };
    } catch {
      return { test: () => false };
    }
  }
}
