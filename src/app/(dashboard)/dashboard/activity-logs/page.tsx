import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Activity } from "lucide-react";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  WidgetCard,
  WidgetHeader,
} from "@/components/dashboard/widget-card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const metadata = { title: "Activity Logs" };

export default function ActivityLogsPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity Logs</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Every Scrape Your Account Has Run, With Status, Duration, And
          Credits. Most Recent First.
        </p>
      </div>
      <Suspense fallback={<ActivitySkeleton />}>
        <ActivityContent />
      </Suspense>
    </div>
  );
}

async function ActivityContent() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const [jobs, crawls, batches] = await Promise.all([
    db.scrapeJob.findMany({
      // Exclude both crawl AND batch children so Recent Scrapes shows
      // only user-initiated one-off scrapes; grouped jobs have their
      // own widgets above.
      where: {
        userId: session.user.id,
        crawlJobId: null,
        batchJobId: null,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        url: true,
        status: true,
        creditsUsed: true,
        error: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        integration: true,
        apiKey: { select: { id: true, name: true, prefix: true } },
      },
    }),
    db.crawlJob.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        rootUrl: true,
        status: true,
        totalDiscovered: true,
        totalCompleted: true,
        createdAt: true,
        completedAt: true,
        _count: { select: { jobs: true } },
      },
    }),
    db.batchJob.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        status: true,
        total: true,
        completed: true,
        failed: true,
        createdAt: true,
        completedAt: true,
        integration: true,
      },
    }),
  ]);

  if (jobs.length === 0 && crawls.length === 0 && batches.length === 0) {
    return (
      <div className="border-border/60 bg-card/20 flex flex-col items-center gap-4 rounded-lg border px-6 py-16 text-center">
        <div className="border-border/60 flex size-12 items-center justify-center rounded-full border">
          <Activity className="text-muted-foreground size-5" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-medium">No Activity Yet</h2>
          <p className="text-muted-foreground max-w-md text-sm">
            Run Your First Scrape From The Playground Or Hit /api/v1/scrape
            With Your API Key. Calls Will Appear Here Within Seconds.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {crawls.length > 0 ? (
        <WidgetCard>
          <WidgetHeader
            title="Recent Crawls"
            subtitle={`Showing ${crawls.length} Most Recent Crawl${crawls.length === 1 ? "" : "s"}. Each Crawl Enqueues Many Child Scrapes.`}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-border/60 text-muted-foreground border-t">
                <tr>
                  <Th>When</Th>
                  <Th>Root URL</Th>
                  <Th>Status</Th>
                  <Th>Progress</Th>
                  <Th className="text-right">Children</Th>
                </tr>
              </thead>
              <tbody className="divide-border/40 divide-y">
                {crawls.map((c) => (
                  <tr key={c.id}>
                    <td className="text-muted-foreground px-4 py-2.5 font-mono text-xs">
                      {c.createdAt.toISOString().slice(0, 19).replace("T", " ")}
                    </td>
                    <td className="max-w-sm truncate px-4 py-2.5 font-mono text-xs">
                      {c.rootUrl}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="text-muted-foreground px-4 py-2.5 font-mono text-xs">
                      {c.totalCompleted}/{c.totalDiscovered}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      {c._count.jobs}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </WidgetCard>
      ) : null}

      {batches.length > 0 ? (
        <WidgetCard>
          <WidgetHeader
            title="Recent Batches"
            subtitle={`Showing ${batches.length} Most Recent Batch${batches.length === 1 ? "" : "es"}. A Batch Scrapes Many URLs In Parallel — Completion Percent Counts Every Child.`}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-border/60 text-muted-foreground border-t">
                <tr>
                  <Th>When</Th>
                  <Th>Batch ID</Th>
                  <Th>Status</Th>
                  <Th>Progress</Th>
                  <Th className="text-right">Failed</Th>
                  <Th>Integration</Th>
                </tr>
              </thead>
              <tbody className="divide-border/40 divide-y">
                {batches.map((b) => {
                  const pct =
                    b.total > 0
                      ? Math.round(
                          ((b.completed + b.failed) / b.total) * 100,
                        )
                      : 0;
                  return (
                    <tr key={b.id}>
                      <td className="text-muted-foreground px-4 py-2.5 font-mono text-xs">
                        {b.createdAt
                          .toISOString()
                          .slice(0, 19)
                          .replace("T", " ")}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs">
                        {b.id.slice(0, 10)}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={b.status} />
                      </td>
                      <td className="text-muted-foreground px-4 py-2.5 font-mono text-xs">
                        {b.completed + b.failed}/{b.total}
                        <span className="ml-2 opacity-60">({pct}%)</span>
                      </td>
                      <td
                        className={cn(
                          "px-4 py-2.5 text-right font-mono text-xs",
                          b.failed > 0
                            ? "text-destructive"
                            : "text-muted-foreground",
                        )}
                      >
                        {b.failed}
                      </td>
                      <td className="text-muted-foreground px-4 py-2.5 font-mono text-xs">
                        {b.integration ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </WidgetCard>
      ) : null}

      <WidgetCard>
      <WidgetHeader
        title="Recent Scrapes"
        subtitle={`Showing ${jobs.length} Most Recent Job${jobs.length === 1 ? "" : "s"}. Child Scrapes From Crawls And Batches Are Grouped Above.`}
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-border/60 text-muted-foreground border-t">
            <tr>
              <Th>When</Th>
              <Th>URL</Th>
              <Th>Status</Th>
              <Th>Duration</Th>
              <Th>Key</Th>
              <Th>Integration</Th>
              <Th className="text-right">Credits</Th>
            </tr>
          </thead>
          <tbody className="divide-border/40 divide-y">
            {jobs.map((j) => {
              const duration =
                j.completedAt && j.startedAt
                  ? j.completedAt.getTime() - j.startedAt.getTime()
                  : null;
              return (
                <tr key={j.id}>
                  <td className="text-muted-foreground px-4 py-2.5 font-mono text-xs">
                    {j.createdAt.toISOString().slice(0, 19).replace("T", " ")}
                  </td>
                  <td className="max-w-sm truncate px-4 py-2.5 font-mono text-xs">
                    {j.url}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={j.status} />
                  </td>
                  <td className="text-muted-foreground px-4 py-2.5 font-mono text-xs">
                    {duration !== null ? `${duration}ms` : "—"}
                  </td>
                  <td className="text-muted-foreground px-4 py-2.5 font-mono text-xs">
                    {j.apiKey?.prefix ?? "—"}
                  </td>
                  <td className="text-muted-foreground px-4 py-2.5 font-mono text-xs">
                    {j.integration ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    {j.creditsUsed}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </WidgetCard>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "DONE"
      ? "bg-emerald-500/15 text-emerald-300"
      : status === "FAILED"
        ? "bg-destructive/15 text-destructive"
        : status === "CANCELLED"
          ? "bg-muted text-muted-foreground"
          : "bg-orange-500/15 text-orange-300"; // QUEUED / RUNNING
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider",
        tone,
      )}
    >
      {status}
    </span>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "px-4 py-2.5 text-left font-mono text-[11px] font-medium uppercase tracking-wider",
        className,
      )}
    >
      {children}
    </th>
  );
}

function ActivitySkeleton() {
  return <Skeleton className="h-96 w-full rounded-lg" />;
}
