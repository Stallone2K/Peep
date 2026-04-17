import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  ScrapePlayground,
  type RecentRun,
} from "@/components/dashboard/scrape-playground";
import { PlaygroundTabs } from "@/components/dashboard/playground-tabs";

export const metadata = { title: "Scrape — Playground" };

export default async function ScrapePlaygroundPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  // Pull the three most recent user-initiated scrapes (not crawl
  // children) so the "Recent Runs" grid has real content.
  const rows = await db.scrapeJob.findMany({
    where: { userId: session.user.id, crawlJobId: null },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: {
      id: true,
      url: true,
      status: true,
      createdAt: true,
      options: true,
    },
  });

  const recentRuns: RecentRun[] = rows.map((r) => ({
    id: r.id,
    url: r.url,
    status: r.status,
    endpoint: "scrape",
    startedAt: r.createdAt.toISOString(),
    formats: extractFormatIds(r.options),
  }));

  return (
    <div className="flex w-full flex-col">
      <PlaygroundTabs />
      <div className="mx-auto w-full max-w-6xl px-6 pb-10">
        <ScrapePlayground recentRuns={recentRuns} />
      </div>
    </div>
  );
}

function extractFormatIds(options: unknown): RecentRun["formats"] {
  if (!options || typeof options !== "object") return [];
  const o = options as { formats?: unknown };
  const f = o.formats;
  if (!Array.isArray(f)) return [];
  const out: RecentRun["formats"] = [];
  for (const entry of f) {
    if (typeof entry === "string") {
      out.push(entry as RecentRun["formats"][number]);
    } else if (entry && typeof entry === "object" && "type" in entry) {
      const type = (entry as { type: string; fullPage?: boolean }).type;
      if (type === "screenshot") {
        out.push(
          (entry as { fullPage?: boolean }).fullPage
            ? "screenshotFull"
            : "screenshot",
        );
      } else {
        out.push(type as RecentRun["formats"][number]);
      }
    }
  }
  return out;
}
