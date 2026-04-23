import { Suspense } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  CrawlPlayground,
  type RecentCrawlRun,
} from "@/components/dashboard/crawl-playground";

export const metadata = { title: "Crawl — Playground" };

export default function CrawlPlaygroundPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-10">
      <Suspense fallback={<CrawlPlayground recentRuns={[]} />}>
        <CrawlPlaygroundContent />
      </Suspense>
    </div>
  );
}

async function CrawlPlaygroundContent() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  // Pull the 12 most recent CrawlJob rows for this user, plus their
  // top-level scrape runs — the grid renders a mixed feed so the
  // user sees context (scrape → map → crawl) on one page.
  const [crawls, scrapes] = await Promise.all([
    db.crawlJob.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        rootUrl: true,
        status: true,
        createdAt: true,
        options: true,
      },
    }),
    db.scrapeJob.findMany({
      where: { userId: session.user.id, crawlJobId: null },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        url: true,
        status: true,
        createdAt: true,
        options: true,
      },
    }),
  ]);

  const crawlRuns: RecentCrawlRun[] = crawls.map((c) => ({
    id: c.id,
    url: c.rootUrl,
    endpoint: "crawl",
    status: c.status,
    startedAt: c.createdAt.toISOString(),
    formats: extractScrapeOptionFormats(c.options),
  }));

  const scrapeRuns: RecentCrawlRun[] = scrapes.map((s) => ({
    id: s.id,
    url: s.url,
    endpoint: "scrape",
    status: s.status,
    startedAt: s.createdAt.toISOString(),
    formats: extractFormatIds(s.options),
  }));

  // Interleave by timestamp so the grid reflects actual activity
  // order, not endpoint-grouped order.
  const recentRuns: RecentCrawlRun[] = [...crawlRuns, ...scrapeRuns]
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
    .slice(0, 12);

  return <CrawlPlayground recentRuns={recentRuns} />;
}

function extractFormatIds(options: unknown): RecentCrawlRun["formats"] {
  if (!options || typeof options !== "object") return [];
  const o = options as { formats?: unknown };
  const f = o.formats;
  if (!Array.isArray(f)) return [];
  const out: RecentCrawlRun["formats"] = [];
  for (const entry of f) {
    if (typeof entry === "string") {
      out.push(entry as RecentCrawlRun["formats"][number]);
    } else if (entry && typeof entry === "object" && "type" in entry) {
      const type = (entry as { type: string; fullPage?: boolean }).type;
      if (type === "screenshot") {
        out.push(
          (entry as { fullPage?: boolean }).fullPage
            ? "screenshotFull"
            : "screenshot",
        );
      } else {
        out.push(type as RecentCrawlRun["formats"][number]);
      }
    }
  }
  return out;
}

function extractScrapeOptionFormats(
  options: unknown,
): RecentCrawlRun["formats"] {
  if (!options || typeof options !== "object") return [];
  const o = options as { scrapeOptions?: { formats?: unknown } };
  return extractFormatIds(o.scrapeOptions ?? {});
}
