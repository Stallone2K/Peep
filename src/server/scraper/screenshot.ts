import type { Page } from "playwright";

export type ScreenshotOpts = {
  fullPage?: boolean;
  quality?: number;
  viewport?: { width: number; height: number };
};

// Capture a screenshot from a Playwright page. Returns a JPEG buffer
// by default (smaller than PNG, fine for preview/archival). The buffer
// is uploaded to R2 by the caller.
export async function captureScreenshot(
  page: Page,
  opts: ScreenshotOpts = {},
): Promise<Buffer> {
  // Apply custom viewport if requested
  if (opts.viewport) {
    await page.setViewportSize(opts.viewport);
    // Wait a beat for reflow
    await page.waitForTimeout(300);
  }

  const buf = await page.screenshot({
    type: "jpeg",
    quality: opts.quality ?? 80,
    fullPage: opts.fullPage ?? false,
  });

  return Buffer.from(buf);
}
