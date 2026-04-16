import { Suspense } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
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

// Hard-coded for Phase 2 — replace when billing lands in Phase 9.
// Matches Firecrawl's Free-tier concurrency cap shown on /pricing.
const CONCURRENCY_CAP = 2;

export default function DashboardPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <ExploreEndpoints />

      <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          {/* Static on server render. Real daily totals arrive in Phase 3. */}
          <ScrapedPagesWidget total={0} days={7} />
          <ConcurrentBrowsers active={0} cap={CONCURRENCY_CAP} />
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
// Data-fetching boundaries (Suspense-wrapped so Next 16
// cacheComponents doesn't flag the route as blocking)
// ──────────────────────────────────────────────────────────────

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
