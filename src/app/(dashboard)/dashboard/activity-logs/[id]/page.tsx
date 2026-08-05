import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getR2SignedUrl } from "@/lib/storage";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const metadata = { title: "Run Detail" };

// auth()/db access is dynamic — keep it inside a Suspense boundary so
// cacheComponents can still prerender the shell.
export default function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Shell>
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
        <RunDetail params={params} />
      </Suspense>
    </Shell>
  );
}

async function RunDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const job = await db.scrapeJob.findFirst({
    where: { id, userId: session.user.id },
    select: {
      id: true,
      url: true,
      status: true,
      error: true,
      createdAt: true,
      startedAt: true,
      completedAt: true,
      creditsUsed: true,
      result: {
        select: {
          markdown: true,
          links: true,
          images: true,
          metadata: true,
          extracted: true,
          screenshotR2Key: true,
          pageStatus: true,
          durationMs: true,
        },
      },
    },
  });

  if (!job) {
    // Not a scrape — maybe it's a crawl. Show the crawl's discovered pages,
    // each linking to its own page-content view.
    const crawl = await db.crawlJob.findFirst({
      where: { id, userId: session.user.id },
      select: {
        id: true,
        rootUrl: true,
        status: true,
        createdAt: true,
        completedAt: true,
        totalDiscovered: true,
        totalCompleted: true,
        jobs: {
          select: { id: true, url: true, status: true },
          orderBy: { createdAt: "asc" },
          take: 500,
        },
      },
    });
    if (crawl) return <CrawlDetail crawl={crawl} />;

    return (
      <div className="border-border/60 bg-card/20 rounded-lg border px-6 py-16 text-center">
        <h2 className="text-lg font-medium">Run Not Found</h2>
        <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm">
          No Run With This ID Belongs To Your Account (Map/Search Results Aren&apos;t
          Stored As Pages — See Activity Logs).
        </p>
      </div>
    );
  }

  const r = job.result;
  const screenshotUrl = r?.screenshotR2Key
    ? await getR2SignedUrl(r.screenshotR2Key)
    : null;
  const duration =
    job.completedAt && job.startedAt
      ? job.completedAt.getTime() - job.startedAt.getTime()
      : (r?.durationMs ?? null);
  const meta = (r?.metadata ?? {}) as Record<string, unknown>;
  const title = typeof meta.title === "string" ? meta.title : null;

  return (
    <>
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill status={job.status} />
          <a
            href={job.url}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 font-mono text-sm break-all"
          >
            {job.url}
            <ExternalLink className="size-3.5 shrink-0" />
          </a>
        </div>
        {title ? <h1 className="text-xl font-semibold tracking-tight">{title}</h1> : null}
        <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs">
          <span>{job.createdAt.toISOString().slice(0, 19).replace("T", " ")}</span>
          {duration !== null ? <span>{duration}ms</span> : null}
          {r?.pageStatus != null ? <span>HTTP {r.pageStatus}</span> : null}
          <span>{job.creditsUsed} credits</span>
        </div>
        {job.error ? (
          <p className="text-destructive bg-destructive/10 rounded-md px-3 py-2 text-sm">
            {job.error}
          </p>
        ) : null}
      </div>

      {!r ? (
        <p className="text-muted-foreground text-sm">
          No Stored Result — This Run May Still Be In Progress Or Has Been Purged.
        </p>
      ) : (
        <>
          {screenshotUrl ? (
            <Section title="Screenshot">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={screenshotUrl}
                alt="Screenshot"
                className="border-border/60 w-full rounded-lg border"
              />
            </Section>
          ) : null}

          {r.markdown ? (
            <Section title="Markdown">
              <pre className="border-border/60 bg-card/30 max-h-[60vh] overflow-auto rounded-lg border p-4 text-[13px] leading-relaxed whitespace-pre-wrap">
                {r.markdown}
              </pre>
            </Section>
          ) : null}

          {r.extracted ? (
            <Section title="Extracted JSON">
              <pre className="border-border/60 bg-card/30 max-h-[50vh] overflow-auto rounded-lg border p-4 font-mono text-[13px] whitespace-pre-wrap">
                {JSON.stringify(r.extracted, null, 2)}
              </pre>
            </Section>
          ) : null}

          {r.images?.length ? (
            <Section title={`Images (${r.images.length})`}>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {r.images.slice(0, 60).map((src) => (
                  <a key={src} href={src} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt=""
                      className="border-border/60 aspect-square w-full rounded border object-cover"
                    />
                  </a>
                ))}
              </div>
            </Section>
          ) : null}

          {r.links?.length ? (
            <Section title={`Links (${r.links.length})`}>
              <ul className="border-border/60 bg-card/30 max-h-[40vh] divide-y divide-border/40 overflow-auto rounded-lg border text-sm">
                {r.links.slice(0, 500).map((l) => (
                  <li key={l} className="truncate px-3 py-1.5">
                    <a
                      href={l}
                      target="_blank"
                      rel="noreferrer"
                      className="text-orange-300 hover:underline"
                    >
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </>
      )}
    </>
  );
}

function CrawlDetail({
  crawl,
}: {
  crawl: {
    rootUrl: string;
    status: string;
    createdAt: Date;
    totalDiscovered: number;
    totalCompleted: number;
    jobs: { id: string; url: string; status: string }[];
  };
}) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill status={crawl.status} />
          <a
            href={crawl.rootUrl}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 font-mono text-sm break-all"
          >
            {crawl.rootUrl}
            <ExternalLink className="size-3.5 shrink-0" />
          </a>
        </div>
        <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs">
          <span>{crawl.createdAt.toISOString().slice(0, 19).replace("T", " ")}</span>
          <span>Crawl</span>
          <span>
            {crawl.totalCompleted}/{crawl.totalDiscovered} pages
          </span>
        </div>
      </div>

      <Section title={`Pages (${crawl.jobs.length})`}>
        {crawl.jobs.length === 0 ? (
          <p className="text-muted-foreground text-sm">No Pages Scraped Yet.</p>
        ) : (
          <ul className="border-border/60 bg-card/30 divide-border/40 max-h-[65vh] divide-y overflow-auto rounded-lg border text-sm">
            {crawl.jobs.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                <StatusPill status={c.status} />
                <Link
                  href={`/dashboard/activity-logs/${c.id}`}
                  className="min-w-0 flex-1 truncate text-orange-300 hover:underline"
                >
                  {c.url}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8">
      <Link
        href="/dashboard/activity-logs"
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" /> Activity Logs
      </Link>
      {children}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "DONE"
      ? "bg-emerald-500/15 text-emerald-300"
      : status === "FAILED"
        ? "bg-destructive/15 text-destructive"
        : status === "CANCELLED"
          ? "bg-muted text-muted-foreground"
          : "bg-orange-500/15 text-orange-300";
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wider uppercase",
        tone,
      )}
    >
      {status}
    </span>
  );
}
