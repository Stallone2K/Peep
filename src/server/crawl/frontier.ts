import { getRedisConnection } from "@/lib/queue";
import { normalizeUrl } from "@/server/crawl/filters";

// Redis-backed BFS frontier for a single crawl job.
//
// Why Redis for dedup and an in-memory queue for order: a crawl job is
// owned by exactly one worker at a time, so we don't need distributed
// dequeue semantics. What we DO need is a crash-resilient "seen" set so
// a retried worker doesn't re-enqueue the same URLs. Redis handles that
// with a single `SADD` → 0/1 return for "already seen".

const SEEN_TTL_SECONDS = 60 * 60 * 24; // 24h

export class CrawlFrontier {
  private queue: string[] = [];
  private discovered = 0;
  private readonly seenKey: string;
  private readonly ignoreQueryParameters: boolean;

  constructor(
    private readonly jobId: string,
    opts: { ignoreQueryParameters?: boolean } = {},
  ) {
    this.seenKey = `crawl:${jobId}:seen`;
    this.ignoreQueryParameters = opts.ignoreQueryParameters ?? false;
  }

  // Register a URL as visitable. Returns true if this is a new URL we
  // haven't seen before (and it passed normalization).
  async add(rawUrl: string): Promise<boolean> {
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

    this.queue.push(normalized);
    this.discovered++;
    return true;
  }

  async addMany(urls: string[]): Promise<number> {
    let fresh = 0;
    for (const u of urls) {
      if (await this.add(u)) fresh++;
    }
    return fresh;
  }

  // Pop up to `count` URLs off the front of the queue (FIFO = BFS).
  popBatch(count: number): string[] {
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
