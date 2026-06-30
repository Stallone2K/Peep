// Official Node.js SDK for the Peep web scraping API.
// https://peep.shownomore.com/docs

export interface PeepOptions {
  /** Your `peep_live_*` API key. */
  apiKey: string;
  /** Override the API base URL. Defaults to https://peep.shownomore.com */
  baseUrl?: string;
  /** Optional custom fetch (e.g. for proxies / Node < 18 polyfills). */
  fetch?: typeof fetch;
}

/** Thrown on any non-2xx response from the Peep API. */
export class PeepError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "PeepError";
    this.status = status;
    this.code = code;
  }
}

export type Format =
  | "markdown"
  | "html"
  | "rawHtml"
  | "links"
  | "images"
  | "screenshot"
  | "json"
  | "changeTracking";

export interface ScrapeOptions {
  formats?: Format[];
  onlyMainContent?: boolean;
  includeTags?: string[];
  excludeTags?: string[];
  waitFor?: number;
  timeout?: number;
  actions?: Record<string, unknown>[];
  prompt?: string;
  schema?: Record<string, unknown>;
  proxy?: string;
  respectRobotsTxt?: boolean;
  [key: string]: unknown;
}

export interface CrawlOptions {
  limit?: number;
  maxDiscoveryDepth?: number;
  includePaths?: string[];
  excludePaths?: string[];
  crawlEntireDomain?: boolean;
  allowSubdomains?: boolean;
  prompt?: string;
  scrapeOptions?: ScrapeOptions;
  [key: string]: unknown;
}

export interface SearchOptions {
  limit?: number;
  sources?: ("web" | "news" | "images")[];
  lang?: string;
  country?: string;
  scrapeOptions?: ScrapeOptions;
  [key: string]: unknown;
}

export interface ExtractOptions {
  prompt?: string;
  schema?: Record<string, unknown>;
  enableWebSearch?: boolean;
  showSources?: boolean;
  [key: string]: unknown;
}

export interface AgentOptions {
  maxSources?: number;
  targetRecords?: number;
  schema?: Record<string, unknown>;
  urls?: string[];
  lang?: string;
  country?: string;
  [key: string]: unknown;
}

export interface JobHandle {
  success: boolean;
  jobId: string;
  url?: string;
  [key: string]: unknown;
}

/** Credit info surfaced from the X-Peep-Credits-* response headers. */
export interface Credits {
  used: number | null;
  remaining: number | null;
}

export interface PollOptions {
  /** Milliseconds between status checks. Default 2500. */
  intervalMs?: number;
  /** Give up after this many milliseconds. Default 300000 (5 min). */
  timeoutMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TERMINAL = /completed|failed|cancelled|canceled|error/i;

export class Peep {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  /** Credits used + remaining from the most recent request. */
  lastCredits: Credits = { used: null, remaining: null };

  constructor(opts: PeepOptions) {
    if (!opts?.apiKey) throw new Error("Peep: apiKey is required.");
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? "https://peep.shownomore.com").replace(/\/$/, "");
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
    if (!this.fetchImpl) {
      throw new Error(
        "Peep: no global fetch available. Use Node 18+ or pass a fetch implementation.",
      );
    }
  }

  private async request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const used = res.headers.get("x-peep-credits-used");
    const remaining = res.headers.get("x-peep-credits-remaining");
    this.lastCredits = {
      used: used !== null ? Number(used) : null,
      remaining: remaining !== null ? Number(remaining) : null,
    };

    const text = await res.text();
    const json = text ? JSON.parse(text) : {};

    if (!res.ok) {
      const err = (json as { error?: { code?: string; message?: string } }).error;
      throw new PeepError(
        res.status,
        err?.code ?? "UNKNOWN",
        err?.message ?? `Request failed with status ${res.status}`,
      );
    }
    return json as T;
  }

  // ── Sync endpoints ──────────────────────────────────────────
  scrape(url: string, options: ScrapeOptions = {}) {
    return this.request<Record<string, unknown>>("POST", "/api/v1/scrape", {
      url,
      ...options,
    });
  }

  map(url: string, options: Record<string, unknown> = {}) {
    return this.request<{ links: string[] }>("POST", "/api/v1/map", {
      url,
      ...options,
    });
  }

  search(query: string, options: SearchOptions = {}) {
    return this.request<Record<string, unknown>>("POST", "/api/v1/search", {
      query,
      ...options,
    });
  }

  // ── YouTube (sugar over scrape) ─────────────────────────────
  youtube(url: string) {
    return this.scrape(url, { formats: ["markdown"] });
  }

  // ── Async endpoints (return a JobHandle) ────────────────────
  crawl(url: string, options: CrawlOptions = {}) {
    return this.request<JobHandle>("POST", "/api/v1/crawl", { url, ...options });
  }
  getCrawl(jobId: string) {
    return this.request<Record<string, unknown>>("GET", `/api/v1/crawl/${jobId}`);
  }
  crawlAndWait(url: string, options: CrawlOptions = {}, poll?: PollOptions) {
    return this.startAndWait(() => this.crawl(url, options), (id) => this.getCrawl(id), poll);
  }

  batchScrape(urls: string[], scrapeOptions: ScrapeOptions = {}) {
    return this.request<JobHandle>("POST", "/api/v1/batch/scrape", {
      urls,
      scrapeOptions,
    });
  }
  getBatch(jobId: string) {
    return this.request<Record<string, unknown>>("GET", `/api/v1/batch/scrape/${jobId}`);
  }
  batchScrapeAndWait(urls: string[], scrapeOptions: ScrapeOptions = {}, poll?: PollOptions) {
    return this.startAndWait(
      () => this.batchScrape(urls, scrapeOptions),
      (id) => this.getBatch(id),
      poll,
    );
  }

  extract(urls: string[], options: ExtractOptions = {}) {
    return this.request<JobHandle>("POST", "/api/v1/extract", { urls, ...options });
  }
  getExtract(jobId: string) {
    return this.request<Record<string, unknown>>("GET", `/api/v1/extract/${jobId}`);
  }
  extractAndWait(urls: string[], options: ExtractOptions = {}, poll?: PollOptions) {
    return this.startAndWait(
      () => this.extract(urls, options),
      (id) => this.getExtract(id),
      poll,
    );
  }

  agent(prompt: string, options: AgentOptions = {}) {
    return this.request<JobHandle>("POST", "/api/v1/agent", { prompt, ...options });
  }
  getAgent(jobId: string) {
    return this.request<Record<string, unknown>>("GET", `/api/v1/agent/${jobId}`);
  }
  agentAndWait(prompt: string, options: AgentOptions = {}, poll?: PollOptions) {
    return this.startAndWait(
      () => this.agent(prompt, options),
      (id) => this.getAgent(id),
      poll,
    );
  }

  // ── Credits ─────────────────────────────────────────────────
  credits() {
    return this.request<{
      balance: number;
      plan: string;
      recentLedger: unknown[];
    }>("GET", "/api/v1/credits");
  }

  // ── Internals ───────────────────────────────────────────────
  private async startAndWait(
    start: () => Promise<JobHandle>,
    getStatus: (jobId: string) => Promise<Record<string, unknown>>,
    poll: PollOptions = {},
  ): Promise<Record<string, unknown>> {
    const { jobId } = await start();
    const intervalMs = poll.intervalMs ?? 2500;
    const deadline = Date.now() + (poll.timeoutMs ?? 300_000);

    let last = await getStatus(jobId);
    while (Date.now() < deadline) {
      if (TERMINAL.test(String(last.status ?? ""))) return last;
      await sleep(intervalMs);
      last = await getStatus(jobId);
    }
    return last; // timed out — return the latest snapshot
  }
}

export default Peep;
