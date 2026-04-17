import { Queue } from "bullmq";
import IORedis from "ioredis";

// Shared Redis connection for all BullMQ queues. BullMQ's Queue class
// needs a raw ioredis instance (not Upstash REST). The `REDIS_URL`
// env var points at the Upstash wire-protocol endpoint (rediss://...).
let _connection: IORedis | null = null;

export function getRedisConnection(): IORedis {
  if (_connection) return _connection;
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is required for BullMQ");
  _connection = new IORedis(url, {
    maxRetriesPerRequest: null, // BullMQ requirement
    enableReadyCheck: false,
    lazyConnect: true,
  });
  return _connection;
}

// ─── Queue instances (lazy, created on first use) ─────────────

let _scrapeQueue: Queue | null = null;
let _crawlQueue: Queue | null = null;
let _extractQueue: Queue | null = null;
let _batchQueue: Queue | null = null;

const DEFAULT_JOB_OPTS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 2000 },
  removeOnComplete: { age: 86_400 }, // 24h
  removeOnFail: { age: 604_800 }, // 7d
};

export function scrapeQueue(): Queue {
  if (!_scrapeQueue) {
    _scrapeQueue = new Queue("scrape", {
      connection: getRedisConnection(),
      defaultJobOptions: DEFAULT_JOB_OPTS,
    });
  }
  return _scrapeQueue;
}

export function crawlQueue(): Queue {
  if (!_crawlQueue) {
    _crawlQueue = new Queue("crawl", {
      connection: getRedisConnection(),
      defaultJobOptions: DEFAULT_JOB_OPTS,
    });
  }
  return _crawlQueue;
}

export function extractQueue(): Queue {
  if (!_extractQueue) {
    _extractQueue = new Queue("extract", {
      connection: getRedisConnection(),
      defaultJobOptions: DEFAULT_JOB_OPTS,
    });
  }
  return _extractQueue;
}

export function batchQueue(): Queue {
  if (!_batchQueue) {
    _batchQueue = new Queue("batch", {
      connection: getRedisConnection(),
      defaultJobOptions: DEFAULT_JOB_OPTS,
    });
  }
  return _batchQueue;
}
