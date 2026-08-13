import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory Redis stand-in — the frontier only uses sadd/expire/del.
const sets = new Map<string, Set<string>>();
vi.mock("@/lib/queue", () => ({
  getRedisConnection: () => ({
    async sadd(key: string, member: string) {
      let s = sets.get(key);
      if (!s) sets.set(key, (s = new Set()));
      if (s.has(member)) return 0;
      s.add(member);
      return 1;
    },
    async expire() {
      return 1;
    },
    async del(key: string) {
      sets.delete(key);
      return 1;
    },
  }),
}));

import { CrawlFrontier } from "@/server/crawl/frontier";

beforeEach(() => sets.clear());

describe("CrawlFrontier depth enforcement", () => {
  it("accepts links up to maxDepth and rejects deeper ones", async () => {
    const f = new CrawlFrontier("job1", { maxDepth: 2 });
    expect(await f.add("https://a.example/0", 0)).toBe(true);
    expect(await f.add("https://a.example/1", 1)).toBe(true);
    expect(await f.add("https://a.example/2", 2)).toBe(true);
    // depth 3 exceeds the cap → rejected, not queued
    expect(await f.add("https://a.example/3", 3)).toBe(false);
    expect(f.size).toBe(3);
  });

  it("treats an unset maxDepth as unbounded", async () => {
    const f = new CrawlFrontier("job2", {});
    expect(await f.add("https://b.example/deep", 9999)).toBe(true);
    expect(f.size).toBe(1);
  });

  it("carries depth through popBatch for depth+1 accounting", async () => {
    const f = new CrawlFrontier("job3", { maxDepth: 5 });
    await f.add("https://c.example/root", 0);
    await f.add("https://c.example/child", 1);
    const batch = f.popBatch(10);
    expect(batch).toEqual([
      { url: "https://c.example/root", depth: 0 },
      { url: "https://c.example/child", depth: 1 },
    ]);
  });

  it("still dedupes regardless of depth", async () => {
    const f = new CrawlFrontier("job4", { maxDepth: 5 });
    expect(await f.add("https://d.example/x", 0)).toBe(true);
    expect(await f.add("https://d.example/x", 1)).toBe(false);
    expect(f.size).toBe(1);
  });
});
