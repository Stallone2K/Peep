import type { Page } from "playwright";

export type ScreenshotOpts = {
  fullPage?: boolean;
  quality?: number;
  viewport?: { width: number; height: number };
};

// Capture a screenshot from a Playwright page. Returns a JPEG buffer by
// default (smaller than PNG, fine for preview/archival). The caller stores it.
export async function captureScreenshot(
  page: Page,
  opts: ScreenshotOpts = {},
): Promise<Buffer> {
  if (opts.viewport) {
    await page.setViewportSize(opts.viewport);
    await page.waitForTimeout(300); // wait for reflow
  }

  // For full-page shots, scroll the whole page first so lazy-loaded images /
  // sections actually render before we capture — otherwise the bottom of the
  // page comes out blank.
  if (opts.fullPage) {
    await autoScroll(page);
  }

  const buf = await page.screenshot({
    type: "jpeg",
    quality: opts.quality ?? 80,
    fullPage: opts.fullPage ?? false,
  });

  return Buffer.from(buf);
}

// Scroll top→bottom in steps (triggering lazy loaders), let images settle,
// then return to the top. Hard-capped so infinite-scroll pages can't loop.
async function autoScroll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let total = 0;
      let ticks = 0;
      const step = 500;
      const timer = setInterval(() => {
        window.scrollBy(0, step);
        total += step;
        ticks += 1;
        if (total >= document.body.scrollHeight || ticks > 40) {
          clearInterval(timer);
          resolve();
        }
      }, 80);
    });
  });
  await page.waitForTimeout(400); // let lazy images decode
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
}
