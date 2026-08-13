import { getRedisConnection } from "@/lib/queue";
import { normalizeUrl } from "@/server/crawl/filters";

// Redis-backed BFS frontier for a single crawl job.
//
// Why Redis for dedup and an in-memory queue for order: a crawl job is
// owned by exactly one worker at a time, so we don't need distributed
// dequeue semantics. What we DO need is a crash-resilient "seen" set so
// a retried worker doesn't re-enqueue the same URLs. Redis handles that
// with a single `SADD` → 0/1 return for "already seen".
//
// Depth semantics (Firecrawl parity): the root URL and sitemap-seeded
// URLs are depth 0; links discovered on a depth-d page are depth d+1.
// When `maxDepth` is set, anything deeper is rejected at add() time —
// this is what makes crawl `maxDiscoveryDepth` actually bite.

const SEEN_TTL_SECONDS = 60 * 60 * 24; // 24h

export type FrontierEntry = { url: string; depth: number };

export class CrawlFrontier {
  private queue: FrontierEntry[] = [];
  private discovered = 0;
  private readonly seenKey: string;
  private readonly ignoreQueryParameters: boolean;
  private readonly maxDepth: number | null;

  constructor(
    private readonly jobId: string,
    opts: { ignoreQueryParameters?: boolean; maxDepth?: number } = {},
  ) {
    this.seenKey = `crawl:${jobId}:seen`;
    this.ignoreQueryParameters = opts.ignoreQueryParameters ?? false;
    this.maxDepth = opts.maxDepth ?? null;
  }

  // Register a URL as visitable at the given discovery depth. Returns
  // true if this is a new URL we haven't seen before (and it passed
  // normalization + the depth cap).
  async add(rawUrl: string, depth = 0): Promise<boolean> {
    if (this.maxDepth !== null && depth > this.maxDepth) return false;

    const normalized = normalizeUrl(rawUrl, {
      ignoreQueryParameters: this.ignoreQueryParameters,
    });
    if (!normalized) return false;

    const redis = getRedisConnection();
    const added = await redis.sadd(this.seenKey, normalized);
    // `SADD` returns 1 for a new member, 0 for an existing one.
    if (added === 0) return false;

    // Refresh the TTL on every insert — covers long crawls.
    await redis.expire(this.seenKey, SEEN_TTL_SECONDS);

    this.queue.push({ url: normalized, depth });
    this.discovered++;
    return true;
  }

  async addMany(urls: string[], depth = 0): Promise<number> {
    let fresh = 0;
    for (const u of urls) {
      if (await this.add(u, depth)) fresh++;
    }
    return fresh;
  }

  // Pop up to `count` entries off the front of the queue (FIFO = BFS).
  popBatch(count: number): FrontierEntry[] {
    if (count <= 0 || this.queue.length === 0) return [];
    return this.queue.splice(0, count);
  }

  get size(): number {
    return this.queue.length;
  }

  get totalDiscovered(): number {
    return this.discovered;
  }

  // Cleanup — called by the worker on crawl finalize.
  async dispose(): Promise<void> {
    const redis = getRedisConnection();
    await redis.del(this.seenKey).catch(() => {});
  }
}
