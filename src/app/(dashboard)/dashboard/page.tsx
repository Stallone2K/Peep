import { Suspense } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { concurrencyCap } from "@/lib/plans";
import { ApiKeyWidget } from "@/components/dashboard/api-key-widget";
import { AgentIntegrations } from "@/components/dashboard/agent-integrations";
import { ConcurrentBrowsers } from "@/components/dashboard/concurrent-browsers";
import { ExploreEndpoints } from "@/components/dashboard/explore-endpoints";
import { ScrapedPagesWidget } from "@/components/dashboard/scraped-pages-widget";
import {
  WidgetCard,
  WidgetHeader,
} from "@/components/dashboard/widget-card";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "Overview",
};

const SCRAPE_DAYS = 7;

export default function DashboardPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <ExploreEndpoints />

      <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          <Suspense fallback={<ChartSkeleton />}>
            <ScrapedPagesWidgetServer />
          </Suspense>
          <Suspense fallback={<ConcurrentBrowsersSkeleton />}>
            <ConcurrentBrowsersServer />
          </Suspense>
        </div>
        <div className="flex flex-col gap-6">
          <Suspense fallback={<ApiKeyWidgetSkeleton />}>
            <ApiKeyWidgetServer />
          </Suspense>
          <AgentIntegrations />
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Hydrated widgets
// ──────────────────────────────────────────────────────────────

async function ScrapedPagesWidgetServer() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const series = await loadDailyScrapes(session.user.id, SCRAPE_DAYS);
  const total = series.reduce((a, b) => a + b, 0);

  return <ScrapedPagesWidget total={total} series={series} days={SCRAPE_DAYS} />;
}

async function ConcurrentBrowsersServer() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { planTier: true },
  });
  const cap = user ? concurrencyCap(user.planTier) : 2;

  // Real live count arrives in Phase 4 via Redis. For now it's always 0.
  return <ConcurrentBrowsers active={0} cap={cap} />;
}

async function ApiKeyWidgetServer() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const key = await db.apiKey.findFirst({
    where: { userId: session.user.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { prefix: true },
  });

  return <ApiKeyWidget prefix={key?.prefix ?? null} />;
}

// ──────────────────────────────────────────────────────────────
// Data access
// ──────────────────────────────────────────────────────────────

// Bucket ScrapeJob.createdAt per day for the last N days (oldest first).
// Returns a length-N array of integers. All zeros until Phase 3 ships
// /api/v1/scrape and jobs start landing in the table.
async function loadDailyScrapes(
  userId: string,
  days: number,
): Promise<number[]> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  const rows = await db.scrapeJob.findMany({
    where: { userId, createdAt: { gte: start } },
    select: { createdAt: true },
  });

  const buckets: number[] = Array(days).fill(0);
  for (const r of rows) {
    const diff = Math.floor(
      (r.createdAt.getTime() - start.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (diff >= 0 && diff < days) buckets[diff]!++;
  }
  return buckets;
}

// ──────────────────────────────────────────────────────────────
// Skeletons
// ──────────────────────────────────────────────────────────────

function ChartSkeleton() {
  return (
    <WidgetCard>
      <WidgetHeader
        title={`Scraped Pages — Last ${SCRAPE_DAYS} Days`}
        subtitle="Credit Usage Differs"
      />
      <div className="px-6 pb-6">
        <Skeleton className="h-24 w-full" />
      </div>
    </WidgetCard>
  );
}

function ConcurrentBrowsersSkeleton() {
  return (
    <WidgetCard>
      <WidgetHeader title="Concurrent Browsers" subtitle="# Of Active Browsers" />
      <div className="px-6 pb-6">
        <Skeleton className="h-12 w-40" />
      </div>
    </WidgetCard>
  );
}

function ApiKeyWidgetSkeleton() {
  return (
    <WidgetCard>
      <WidgetHeader title="API Key" subtitle="Start Scraping Right Away" />
      <div className="px-6 pb-6">
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
    </WidgetCard>
  );
}
