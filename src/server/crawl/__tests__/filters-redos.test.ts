import { describe, expect, it } from "vitest";

import { compileFilter } from "@/server/crawl/filters";

// M1 — user-supplied crawl regexes are compiled with RE2 (linear time),
// so a catastrophic-backtracking pattern can't hang the crawl worker.

describe("compileFilter — ReDoS resistance", () => {
  it("evaluates a catastrophic pattern in bounded time", () => {
    const filter = compileFilter({
      rootUrl: "https://example.com",
      // Classic exponential-backtracking pattern in the native engine.
      excludePaths: ["(a+)+$"],
    });
    const evilPath = "/" + "a".repeat(60) + "!";
    const t0 = Date.now();
    const ok = filter.shouldVisit(`https://example.com${evilPath}`);
    const elapsed = Date.now() - t0;
    // Native RegExp would spin for seconds+; RE2 returns effectively
    // instantly. Generous ceiling to stay non-flaky in CI.
    expect(elapsed).toBeLessThan(500);
    expect(typeof ok).toBe("boolean");
  });

  it("many evil patterns across many URLs stay fast", () => {
    const filter = compileFilter({
      rootUrl: "https://example.com",
      includePaths: ["(x+x+)+y", "(.*a){20}"],
    });
    const t0 = Date.now();
    for (let i = 0; i < 200; i++) {
      filter.shouldVisit(`https://example.com/${"x".repeat(40)}${i}`);
    }
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});

describe("compileFilter — matching semantics preserved", () => {
  it("excludePaths does an unanchored (partial) match like RegExp.test", () => {
    const filter = compileFilter({
      rootUrl: "https://example.com",
      excludePaths: ["/admin"],
    });
    expect(filter.shouldVisit("https://example.com/admin/users")).toBe(false);
    expect(filter.shouldVisit("https://example.com/public")).toBe(true);
  });

  it("includePaths keeps only matches", () => {
    const filter = compileFilter({
      rootUrl: "https://example.com",
      includePaths: ["^/blog/"],
    });
    expect(filter.shouldVisit("https://example.com/blog/post-1")).toBe(true);
    expect(filter.shouldVisit("https://example.com/about")).toBe(false);
  });

  it("regexOnFullURL switches the match target to the whole URL", () => {
    const filter = compileFilter({
      rootUrl: "https://example.com",
      regexOnFullURL: true,
      includePaths: ["^https://example\\.com/docs"],
    });
    expect(filter.shouldVisit("https://example.com/docs/intro")).toBe(true);
    expect(filter.shouldVisit("https://example.com/blog")).toBe(false);
  });

  it("falls back to a literal match for unsupported syntax (backrefs)", () => {
    // RE2 rejects backreferences — we treat the pattern as a literal
    // string rather than throwing / hanging.
    const filter = compileFilter({
      rootUrl: "https://example.com",
      excludePaths: ["(foo)\\1"], // backreference — unsupported by RE2
    });
    // Literal "(foo)\1" never appears in a normal URL → nothing excluded.
    expect(filter.shouldVisit("https://example.com/foofoo")).toBe(true);
  });
});
