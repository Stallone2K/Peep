// Load .env into process.env before anything else imports from it.
// Next.js handles this automatically for the app, but plain `tsx` does
// not, so the worker needs to wire it up itself.
import "dotenv/config";

import { startScrapeWorker } from "./scrape.worker";
import { startExtractWorker } from "./extract.worker";
import { startCrawlWorker } from "./crawl.worker";
import { BrowserPool } from "../server/scraper/browser";

// Worker entry point — runs as a separate Node process via
// `yarn worker` (tsx src/workers/index.ts). Starts all queue
// consumers and handles graceful shutdown.

console.log("[worker] Starting Peep worker process...");

const scrapeWorker = startScrapeWorker();
const extractWorker = startExtractWorker();
const crawlWorker = startCrawlWorker();

// Graceful shutdown on SIGTERM / SIGINT (Fly.io sends SIGTERM on
// deploy, Ctrl+C sends SIGINT locally). Drain in-flight jobs within
// 30s, then force-exit.
async function shutdown(signal: string) {
  console.log(`[worker] ${signal} received — draining...`);

  const timer = setTimeout(() => {
    console.error("[worker] Drain timed out after 30s — force exit");
    process.exit(1);
  }, 30_000);

  try {
    await Promise.all([
      scrapeWorker.close(),
      extractWorker.close(),
      crawlWorker.close(),
    ]);
    await BrowserPool.getInstance().shutdown();
    clearTimeout(timer);
    console.log("[worker] Drained cleanly. Exiting.");
    process.exit(0);
  } catch (err) {
    console.error("[worker] Error during shutdown:", err);
    clearTimeout(timer);
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
