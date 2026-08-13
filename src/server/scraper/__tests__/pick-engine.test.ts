import { describe, expect, it } from "vitest";

import { pickEngine } from "@/server/scraper/strategy";
import { scrapeRequestSchema } from "@/lib/validators/scrape";

// Build a fully-defaulted ScrapeRequestInput from just the overrides.
function input(overrides: Record<string, unknown>) {
  return scrapeRequestSchema.parse({
    url: "https://example.com",
    ...overrides,
  });
}

describe("pickEngine", () => {
  it("defaults a plain scrape to the HTTP fast path", () => {
    expect(pickEngine(input({}))).toBe("http");
  });

  it("routes to the browser when waitFor > 0 (PARITY fix)", () => {
    expect(pickEngine(input({ waitFor: 1500 }))).toBe("playwright");
  });

  it("keeps waitFor:0 on the HTTP path", () => {
    expect(pickEngine(input({ waitFor: 0 }))).toBe("http");
  });

  it("fastMode wins over waitFor (explicit opt-out of the browser)", () => {
    expect(pickEngine(input({ fastMode: true, waitFor: 3000 }))).toBe("http");
  });

  it("mobile alone does NOT force the browser (HTTP honours it via UA)", () => {
    expect(pickEngine(input({ mobile: true }))).toBe("http");
  });

  it("still routes screenshots + actions to the browser", () => {
    expect(pickEngine(input({ formats: ["screenshot"] }))).toBe("playwright");
    expect(
      pickEngine(input({ actions: [{ type: "wait", milliseconds: 100 }] })),
    ).toBe("playwright");
  });
});
