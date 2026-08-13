import { describe, expect, it } from "vitest";

import { sanitizeHtml } from "@/server/scraper/readability";

// These building blocks are what the strategy's readable-content path
// now runs over (PARITY 🔴 fix): with onlyMainContent:false the tag
// filters + base64 stripping still apply, so includeTags/excludeTags/
// removeBase64Images are honoured even when Readability succeeded.

describe("sanitizeHtml with onlyMainContent:false (readable-content path)", () => {
  const html = `
    <article>
      <h1>Title</h1>
      <p class="keep">Body text</p>
      <div class="ad">buy now</div>
      <img src="data:image/png;base64,AAAA" />
      <img src="https://cdn.example.com/x.png" />
    </article>`;

  it("removes base64 images but leaves real ones", () => {
    const out = sanitizeHtml(html, {
      onlyMainContent: false,
      removeBase64Images: true,
    });
    expect(out).not.toContain("data:image/png;base64");
    expect(out).toContain("https://cdn.example.com/x.png");
  });

  it("drops excludeTags selectors", () => {
    const out = sanitizeHtml(html, {
      onlyMainContent: false,
      excludeTags: [".ad"],
    });
    expect(out).not.toContain("buy now");
    expect(out).toContain("Body text");
  });

  it("keeps only includeTags matches", () => {
    const out = sanitizeHtml(html, {
      onlyMainContent: false,
      includeTags: [".keep"],
    });
    expect(out).toContain("Body text");
    expect(out).not.toContain("Title");
    expect(out).not.toContain("buy now");
  });
});
