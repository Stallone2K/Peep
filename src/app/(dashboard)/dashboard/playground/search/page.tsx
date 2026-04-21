import { Suspense } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  SearchPlayground,
  type RecentSearchRun,
} from "@/components/dashboard/search-playground";

export const metadata = { title: "Search — Playground" };

export default function SearchPlaygroundPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-10">
      <Suspense fallback={<SearchPlayground recentRuns={[]} />}>
        <SearchPlaygroundContent />
      </Suspense>
    </div>
  );
}

async function SearchPlaygroundContent() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  // Recent Runs feeds from the same ScrapeJob history — search
  // itself doesn't create job rows (it's a synchronous provider
  // call), so for now we show the user's last 12 scrape/map runs
  // here so the grid doesn't stay empty. Once Phase 8 lands dedicated
  // SearchLog rows we can slice to search-only.
  const rows = await db.scrapeJob.findMany({
    where: { userId: session.user.id, crawlJobId: null },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: {
      id: true,
      url: true,
      status: true,
      createdAt: true,
      options: true,
    },
  });

  const recentRuns: RecentSearchRun[] = rows.map((r) => ({
    id: r.id,
    label: r.url,
    endpoint: "scrape",
    status: r.status,
    startedAt: r.createdAt.toISOString(),
    formats: extractFormatStrings(r.options),
  }));

  return <SearchPlayground recentRuns={recentRuns} />;
}

function extractFormatStrings(options: unknown): string[] {
  if (!options || typeof options !== "object") return [];
  const o = options as { formats?: unknown };
  const f = o.formats;
  if (!Array.isArray(f)) return [];
  return f
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry === "object" && "type" in entry) {
        return (entry as { type: string }).type;
      }
      return null;
    })
    .filter((x): x is string => typeof x === "string");
}
