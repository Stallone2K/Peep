import { Worker, Job } from "bullmq";

import { db } from "@/lib/db";
import { getRedisConnection, scrapeQueue } from "@/lib/queue";
import { debitCredits } from "@/lib/credits";
import { CrawlFrontier } from "@/server/crawl/frontier";
import { compileFilter } from "@/server/crawl/filters";
import { discoverSitemap } from "@/server/crawl/sitemap";
import type { CrawlRequestInput } from "@/lib/validators/crawl";
import type { ScrapeRequestInput } from "@/lib/validators/scrape";
import type { ScrapeJobData } from "@/workers/scrape.worker";

// Crawl worker — one BullMQ job per CrawlJob. Orchestrates:
//   1. Optional sitemap seeding
//   2. BFS frontier expansion via child ScrapeJobs on the `scrape` queue
//   3. Redis pub/sub for child completion, link extraction → frontier
//   4. DB roll-up (totalDiscovered/totalCompleted) + per-iteration
//      cancel check (DELETE endpoint sets `status: CANCELLED`)
//
// Concurrency semantics: the BullMQ Worker itself runs at worker-level
// concurrency 1 per Node process (crawls are long-running and own a
// pub/sub connection). Within a crawl, child scrape concurrency is
// capped by `input.maxConcurrency`.

const CONCURRENCY = Number(process.env.CRAWL_CONCURRENCY ?? "1");

export type CrawlJobData = {
  crawlJobId: string;
  input: CrawlRequestInput;
};

export function startCrawlWorker() {
  const worker = new Worker<CrawlJobData>(
    "crawl",
    async (job: Job<CrawlJobData>) => {
      const { crawlJobId, input } = job.data;
      await runCrawlJob(crawlJobId, input);
      return { success: true, crawlJobId };
    },
    {
      connection: getRedisConnection(),
      concurrency: CONCURRENCY,
    },
  );

  worker.on("failed", (job, err) => {
    console.error(`[crawl-worker] Job ${job?.id} failed:`, err.message);
  });
  worker.on("completed", (job) => {
    console.log(`[crawl-worker] Job ${job.id} completed`);
  });

  console.log(`[crawl-worker] Started with concurrency=${CONCURRENCY}`);
  return worker;
}

async function runCrawlJob(
  crawlJobId: string,
  input: CrawlRequestInput,
): Promise<void> {
  const crawlJob = await db.crawlJob.findUnique({
    where: { id: crawlJobId },
  });
  if (!crawlJob) return;

  await db.crawlJob.update({
    where: { id: crawlJobId },
    data: { status: "RUNNING" },
  });

  const filter = compileFilter({
    rootUrl: input.url,
    includePaths: input.includePaths,
    excludePaths: input.excludePaths,
    regexOnFullURL: input.regexOnFullURL,
    crawlEntireDomain: input.crawlEntireDomain,
    allowSubdomains: input.allowSubdomains,
    allowExternalLinks: input.allowExternalLinks,
    allowBinaryFormats: input.allowBinaryFormats,
    ignoreQueryParameters: input.ignoreQueryParameters,
  });

  const frontier = new CrawlFrontier(crawlJobId, {
    ignoreQueryParameters: input.ignoreQueryParameters,
  });

  // ─── Seed ────────────────────────────────────────────────────
  if (input.sitemap !== "skip") {
    const sitemap = await discoverSitemap(input.url);
    for (const u of sitemap.urls) {
      if (filter.shouldVisit(u)) await frontier.add(u);
    }
    console.log(
      `[crawl-worker] ${crawlJobId}: sitemap seeded ${sitemap.urls.length} URLs`,
    );
  }
  if (input.sitemap !== "only") {
    if (filter.shouldVisit(input.url)) await frontier.add(input.url);
  }

  // ─── Child scrape pub/sub ────────────────────────────────────
  // Pattern-subscribe once per crawl; match against our in-flight set.
  const sub = getRedisConnection().duplicate();
  const inFlight = new Set<string>();
  const completions: Array<{
    scrapeJobId: string;
    status: "DONE" | "FAILED";
  }> = [];

  await sub.psubscribe("scrape:done:*");
  sub.on("pmessage", (_pattern: string, channel: string, message: string) => {
    const scrapeJobId = channel.slice("scrape:done:".length);
    if (!inFlight.has(scrapeJobId)) return;
    try {
      const payload = JSON.parse(message);
      completions.push({
        scrapeJobId,
        status: payload.status === "DONE" ? "DONE" : "FAILED",
      });
    } catch {
      /* ignore */
    }
  });

  let totalEnqueued = 0;
  let totalCompleted = 0;
  let cancelled = false;
  let failReason: string | null = null;

  try {
    while (
      (frontier.size > 0 || inFlight.size > 0) &&
      totalEnqueued < input.limit
    ) {
      // Periodic cancel check
      if (totalEnqueued % 10 === 0) {
        const row = await db.crawlJob.findUnique({
          where: { id: crawlJobId },
          select: { status: true },
        });
        if (row?.status === "CANCELLED") {
          cancelled = true;
          break;
        }
      }

      // Drain completions — extract links from finished children.
      while (completions.length > 0) {
        const c = completions.shift()!;
        inFlight.delete(c.scrapeJobId);
        totalCompleted++;
        if (c.status === "DONE") {
          const child = await db.scrapeJob.findUnique({
            where: { id: c.scrapeJobId },
            include: { result: true },
          });
          const links = child?.result?.links ?? [];
          for (const link of links) {
            if (totalEnqueued + frontier.size >= input.limit) break;
            if (!filter.shouldVisit(link)) continue;
            await frontier.add(link);
          }
        }
      }

      // Roll up progress periodically.
      if (totalCompleted > 0 && totalCompleted % 5 === 0) {
        await db.crawlJob
          .update({
            where: { id: crawlJobId },
            data: {
              totalDiscovered: frontier.totalDiscovered,
              totalCompleted,
            },
          })
          .catch(() => {});
      }

      // Capacity to enqueue?
      const canEnqueue =
        inFlight.size < input.maxConcurrency &&
        frontier.size > 0 &&
        totalEnqueued < input.limit;

      if (canEnqueue) {
        const batch = frontier.popBatch(
          Math.min(
            input.maxConcurrency - inFlight.size,
            input.limit - totalEnqueued,
          ),
        );
        for (const url of batch) {
          // Mid-crawl credit check — stop gracefully if the user runs
          // out, so we don't accumulate debt on jobs that never run.
          const user = await db.user.findUnique({
            where: { id: crawlJob.userId },
            select: { creditBalance: true },
          });
          if (!user || user.creditBalance < 1) {
            cancelled = true;
            failReason = "out_of_credits";
            break;
          }

          // Charge the child. Keep to 1 credit per child — AI / proxy
          // surcharges on `scrapeOptions` get layered in by the scrape
          // worker itself when it runs (§11.12).
          try {
            await debitCredits(crawlJob.userId, 1, {
              reason: "crawl",
              refType: "ScrapeJob",
            });
          } catch {
            cancelled = true;
            failReason = "out_of_credits";
            break;
          }

          const childScrapeInput: ScrapeRequestInput = {
            ...(defaultScrapeOptions() as ScrapeRequestInput),
            ...(input.scrapeOptions ?? {}),
            url,
          };

          const child = await db.scrapeJob.create({
            data: {
              userId: crawlJob.userId,
              apiKeyId: null,
              crawlJobId,
              url,
              options: childScrapeInput as never,
              status: "QUEUED",
              creditsUsed: 1,
              integration: input.integration,
            },
          });

          inFlight.add(child.id);
          totalEnqueued++;

          const jobData: ScrapeJobData = {
            scrapeJobId: child.id,
            input: childScrapeInput,
          };
          await scrapeQueue().add(`scrape-${child.id}`, jobData, {
            jobId: child.id,
          });

          // Rate limiting between enqueues
          if (input.delay > 0) {
            await sleep(input.delay * 1000);
          }
        }

        if (cancelled) break;
      } else {
        // Wait for a completion signal or a short timeout before
        // re-checking. Avoids busy-looping while children are running.
        await sleep(500);
      }
    }
  } finally {
    await sub.punsubscribe().catch(() => {});
    sub.disconnect();
    await frontier.dispose().catch(() => {});
  }

  // Final roll-up — wait for remaining in-flight to drain up to a
  // grace period so the DB numbers are accurate on completion.
  const drainDeadline = Date.now() + 30_000;
  while (inFlight.size > 0 && Date.now() < drainDeadline) {
    while (completions.length > 0) {
      const c = completions.shift()!;
      inFlight.delete(c.scrapeJobId);
      totalCompleted++;
    }
    if (inFlight.size > 0) await sleep(500);
  }

  const finalStatus = cancelled ? "CANCELLED" : "DONE";
  await db.crawlJob
    .update({
      where: { id: crawlJobId },
      data: {
        status: finalStatus,
        totalDiscovered: frontier.totalDiscovered,
        totalCompleted,
        completedAt: new Date(),
      },
    })
    .catch(() => {});

  console.log(
    `[crawl-worker] ${crawlJobId}: ${finalStatus} — ${totalCompleted}/${totalEnqueued} completed` +
      (failReason ? ` (reason: ${failReason})` : ""),
  );
}

// Match the scrape validator defaults. Kept narrow so we don't
// accidentally opt a crawl into json/query/audio — those surcharges
// belong to explicit caller intent, not crawl defaults.
function defaultScrapeOptions(): Partial<ScrapeRequestInput> {
  return {
    formats: [{ type: "markdown" }, { type: "links" }],
    onlyMainContent: true,
    onlyCleanContent: false,
    timeout: 30_000,
    waitFor: 0,
    mobile: false,
    removeBase64Images: true,
    fastMode: false,
    blockAds: true,
    proxy: "auto",
    storeInCache: true,
    async: false,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
