import { Suspense } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  MapPlayground,
  type RecentMapRun,
} from "@/components/dashboard/map-playground";

export const metadata = { title: "Map — Playground" };

// Mirrors the scrape page's Suspense-wrapped Cache Components pattern.
export default function MapPlaygroundPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-10">
      <Suspense fallback={<MapPlayground recentRuns={[]} />}>
        <MapPlaygroundContent />
      </Suspense>
    </div>
  );
}

async function MapPlaygroundContent() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  // Recent Runs pulls the last 12 user-initiated scrape/map/crawl/
  // search rows so the grid beneath the mapper stays filled. The
  // card itself hides the Formats row on non-scrape endpoints, so a
  // mixed feed looks clean.
  const rows = await db.scrapeJob.findMany({
    where: { userId: session.user.id, crawlJobId: null },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: {
      id: true,
      url: true,
      status: true,
      createdAt: true,
      integration: true,
      options: true,
    },
  });

  const recentRuns: RecentMapRun[] = rows.map((r) => ({
    id: r.id,
    url: r.url,
    status: r.status,
    endpoint: "scrape",
    startedAt: r.createdAt.toISOString(),
    formats: extractFormatIds(r.options),
  }));

  return <MapPlayground recentRuns={recentRuns} />;
}

function extractFormatIds(options: unknown): RecentMapRun["formats"] {
  if (!options || typeof options !== "object") return [];
  const o = options as { formats?: unknown };
  const f = o.formats;
  if (!Array.isArray(f)) return [];
  const out: RecentMapRun["formats"] = [];
  for (const entry of f) {
    if (typeof entry === "string") {
      out.push(entry as RecentMapRun["formats"][number]);
    } else if (entry && typeof entry === "object" && "type" in entry) {
      const type = (entry as { type: string; fullPage?: boolean }).type;
      if (type === "screenshot") {
        out.push(
          (entry as { fullPage?: boolean }).fullPage
            ? "screenshotFull"
            : "screenshot",
        );
      } else {
        out.push(type as RecentMapRun["formats"][number]);
      }
    }
  }
  return out;
}
