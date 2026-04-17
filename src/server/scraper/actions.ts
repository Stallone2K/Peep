import type { Page } from "playwright";

// 9 action types matching Firecrawl v2 (§11.5).
// Max 50 actions per scrape, max 60s total wait time (validated in
// the zod schema). Here we just execute them sequentially.

export type Action = {
  type: string;
  selector?: string;
  milliseconds?: number;
  all?: boolean;
  text?: string;
  key?: string;
  direction?: "up" | "down";
  script?: string;
  fullPage?: boolean;
  quality?: number;
  viewport?: { width: number; height: number };
  landscape?: boolean;
  scale?: number;
  format?: string;
};

export type ActionResult = {
  type: string;
  durationMs: number;
  result?: unknown;
  error?: string;
};

const DEFAULT_ACTION_TIMEOUT = 10_000;

export async function executeActions(
  page: Page,
  actions: Action[],
): Promise<ActionResult[]> {
  const results: ActionResult[] = [];

  for (const action of actions) {
    const start = Date.now();
    try {
      const result = await runAction(page, action);
      results.push({
        type: action.type,
        durationMs: Date.now() - start,
        result,
      });
    } catch (err) {
      results.push({
        type: action.type,
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

async function runAction(page: Page, action: Action): Promise<unknown> {
  switch (action.type) {
    case "wait": {
      if (action.milliseconds) {
        await page.waitForTimeout(action.milliseconds);
      } else if (action.selector) {
        await page.waitForSelector(action.selector, {
          timeout: DEFAULT_ACTION_TIMEOUT,
        });
      }
      return null;
    }

    case "click": {
      if (!action.selector) throw new Error("click requires a selector");
      if (action.all) {
        const elements = await page.$$(action.selector);
        for (const el of elements) {
          await el.click().catch(() => {});
        }
        return { clicked: elements.length };
      }
      await page.click(action.selector, {
        timeout: DEFAULT_ACTION_TIMEOUT,
      });
      return null;
    }

    case "write": {
      if (!action.text) throw new Error("write requires text");
      await page.keyboard.type(action.text, { delay: 30 });
      return null;
    }

    case "press": {
      if (!action.key) throw new Error("press requires a key");
      await page.keyboard.press(action.key);
      return null;
    }

    case "scroll": {
      const dir = action.direction ?? "down";
      const selector = action.selector;
      if (selector) {
        const el = await page.$(selector);
        if (el) {
          await el.evaluate(
            (node, d) =>
              node.scrollBy(0, d === "down" ? 500 : -500),
            dir,
          );
        }
      } else {
        await page.evaluate(
          (d) => window.scrollBy(0, d === "down" ? 500 : -500),
          dir,
        );
      }
      // Let the page settle after scroll
      await page.waitForTimeout(500);
      return null;
    }

    case "scrape": {
      // Intermediate scrape — return the current page HTML
      const html = await page.content();
      return { html: html.slice(0, 500) + "..." }; // abbreviated in action result
    }

    case "executeJavascript": {
      if (!action.script) throw new Error("executeJavascript requires a script");
      const result = await page.evaluate(action.script);
      return result;
    }

    case "screenshot": {
      // Intermediate screenshot — returned in action results, not stored
      const buf = await page.screenshot({
        type: "jpeg",
        quality: action.quality ?? 80,
        fullPage: action.fullPage ?? false,
      });
      return {
        size: buf.byteLength,
        type: "jpeg",
        note: "Intermediate screenshot captured (not persisted — use formats:[screenshot] for stored screenshots)",
      };
    }

    case "pdf": {
      // Render page as PDF — Chrome-only feature
      const pdf = await page.pdf({
        landscape: action.landscape ?? false,
        scale: action.scale ?? 1,
        format: (action.format as "A4" | "Letter") ?? "Letter",
      });
      return {
        size: pdf.byteLength,
        note: "PDF generated (returned as action result, not yet stored)",
      };
    }

    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}
