"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check as CheckIcon,
  Copy,
  FileText,
  Gauge,
  GitBranch,
  Globe,
  Image as ImageIcon,
  Images,
  Languages,
  Link2,
  Loader2,
  Map as MapIcon,
  Newspaper,
  Search as SearchIcon,
  SlidersHorizontal,
  SquareChevronRight,
  Telescope,
  X,
} from "lucide-react";
import type { ComponentType } from "react";
import { toast } from "sonner";

import { PlaygroundTabs } from "@/components/dashboard/playground-tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────

type SourceId = "web" | "images" | "news";
type CategoryId = "github" | "research" | "pdf";

type SearchResultView = {
  url: string;
  title: string;
  description?: string;
  source: SourceId;
  imageUrl?: string;
  thumbnail?: string;
};

export type RecentSearchRun = {
  id: string;
  label: string; // query text or URL
  endpoint: "scrape" | "map" | "crawl" | "search";
  status: "DONE" | "FAILED" | "RUNNING" | "QUEUED" | "CANCELLED";
  startedAt: string;
  formats: string[];
};

type Options = {
  limit: number;
  country: string;
  lang: string;
  tbs: "" | "qdr:h" | "qdr:d" | "qdr:w" | "qdr:m" | "qdr:y";
};

const DEFAULT_OPTIONS: Options = {
  limit: 10,
  country: "",
  lang: "",
  tbs: "",
};

const SOURCES: Array<{
  id: SourceId;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { id: "web", label: "Web", icon: Globe },
  { id: "images", label: "Images", icon: ImageIcon },
  { id: "news", label: "News", icon: Newspaper },
];

const CATEGORIES: Array<{
  id: CategoryId;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { id: "github", label: "Github", icon: GitBranch },
  { id: "research", label: "Research", icon: Images },
  { id: "pdf", label: "PDF", icon: FileText },
];

export function SearchPlayground({
  recentRuns,
}: {
  recentRuns: RecentSearchRun[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sources, setSources] = useState<Set<SourceId>>(new Set(["web"]));
  const [categories, setCategories] = useState<Set<CategoryId>>(new Set());
  const [options, setOptions] = useState<Options>(DEFAULT_OPTIONS);
  const [pending, startTransition] = useTransition();
  const [results, setResults] = useState<SearchResultView[] | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    startTransition(async () => {
      const payload = {
        query: q,
        limit: options.limit,
        country: options.country || undefined,
        lang: options.lang || undefined,
        tbs: options.tbs || undefined,
        sources: Array.from(sources),
      };

      const res = await fetch("/api/dashboard/playground/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        const msg = json?.error?.message ?? "Search Failed";
        toast.error(msg);
        setResults(null);
        return;
      }
      setResults(json.data as SearchResultView[]);
      toast.success(`Found ${json.data?.length ?? 0} Results`);
      router.refresh();
    });
  }

  return (
    <div className="flex w-full flex-col">
      <div className="flex w-full justify-center py-20">
        <div className="flex w-full max-w-2xl flex-col items-center gap-3">
          <PlaygroundTabs />

          <form onSubmit={submit} className="flex w-full flex-col gap-3">
            {/* Query textarea — multi-line, matches the URL pill's
                rounded container but taller. */}
            <div className="border-border/60 bg-card/60 flex flex-col gap-0 rounded-2xl border px-4 py-3 shadow-sm">
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Top Restaurants In San Francisco"
                disabled={pending}
                rows={2}
                className="placeholder:text-muted-foreground/60 min-h-[3rem] resize-none bg-transparent text-base outline-none disabled:opacity-50"
                aria-label="Search query"
              />
            </div>

            {/* Toolbar — Options / Source / Format (stubbed) / Category
                (client-only) on the left; Get Code + Start Searching on
                the right. */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <OptionsPopover options={options} onChange={setOptions} />
                <SourcePopover sources={sources} onChange={setSources} />
                <CategoryPopover
                  categories={categories}
                  onChange={setCategories}
                />
              </div>
              <div className="flex items-center gap-2">
                <GetCodePopover
                  query={query}
                  sources={sources}
                  options={options}
                />
                <button
                  type="submit"
                  disabled={pending || !query.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-orange-500/90 disabled:pointer-events-none disabled:opacity-50"
                >
                  {pending ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" /> Searching
                    </>
                  ) : (
                    <>
                      Start Searching <ArrowRight className="size-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {results ? (
        <div className="mx-auto w-full max-w-4xl px-2 pb-16">
          <SearchResultsList results={results} />
        </div>
      ) : null}

      <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 pb-12">
        <h2 className="text-lg font-medium">Recent Runs</h2>
        <RecentRunsCarousel runs={recentRuns} />
      </section>
    </div>
  );
}

// ─── Options popover ────────────────────────────────────────────

function OptionsPopover({
  options,
  onChange,
}: {
  options: Options;
  onChange: (next: Options) => void;
}) {
  function set<K extends keyof Options>(key: K, value: Options[K]) {
    onChange({ ...options, [key]: value });
  }
  const FRESHNESS: Array<{ value: Options["tbs"]; label: string }> = [
    { value: "", label: "Any Time" },
    { value: "qdr:d", label: "Past Day" },
    { value: "qdr:w", label: "Past Week" },
    { value: "qdr:m", label: "Past Month" },
    { value: "qdr:y", label: "Past Year" },
  ];

  return (
    <Popover>
      <PopoverTrigger
        className="border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40 inline-flex size-8 items-center justify-center rounded-md border transition-colors"
        aria-label="Search options"
      >
        <SlidersHorizontal className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent className="w-[380px]">
        <div className="border-border/60 flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-medium">Options</span>
        </div>
        <div className="flex flex-col gap-4 px-4 py-4">
          <OptionNumber
            icon={Gauge}
            label="Limit"
            value={options.limit}
            onChange={(v) => set("limit", Math.max(1, Math.min(v, 20)))}
          />
          <OptionText
            icon={Globe}
            label="Country"
            placeholder="us"
            value={options.country}
            onChange={(v) => set("country", v.slice(0, 2).toLowerCase())}
          />
          <OptionText
            icon={Languages}
            label="Language"
            placeholder="en"
            value={options.lang}
            onChange={(v) => set("lang", v.slice(0, 5).toLowerCase())}
          />
          <div className="flex items-start gap-3">
            <SquareChevronRight className="text-muted-foreground mt-1 size-4 shrink-0 opacity-0" />
            <span className="text-sm underline decoration-dotted decoration-muted-foreground/40 underline-offset-4">
              Time Filter
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-1">
              {FRESHNESS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => set("tbs", f.value)}
                  className={cn(
                    "rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors",
                    options.tbs === f.value
                      ? "border-orange-500/50 bg-orange-500/15 text-orange-200"
                      : "border-border/60 bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="border-border/60 flex justify-end border-t px-4 py-3">
          <button
            type="button"
            onClick={() => onChange(DEFAULT_OPTIONS)}
            className="bg-muted/60 hover:bg-muted inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
          >
            Reset Settings
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function OptionNumber({
  icon: Icon,
  label,
  value,
  onChange,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="text-muted-foreground size-4 shrink-0" />
      <span className="text-sm underline decoration-dotted decoration-muted-foreground/40 underline-offset-4">
        {label}
      </span>
      <div className="border-border/60 bg-background/60 ml-auto flex w-44 items-center rounded-md border">
        <input
          type="number"
          value={value || ""}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="flex-1 bg-transparent px-2 py-1 text-xs outline-none"
        />
      </div>
    </div>
  );
}

function OptionText({
  icon: Icon,
  label,
  placeholder,
  value,
  onChange,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="text-muted-foreground size-4 shrink-0" />
      <span className="text-sm underline decoration-dotted decoration-muted-foreground/40 underline-offset-4">
        {label}
      </span>
      <div className="border-border/60 bg-background/60 ml-auto flex w-44 items-center rounded-md border">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="placeholder:text-muted-foreground/50 flex-1 bg-transparent px-2 py-1 text-xs outline-none"
        />
      </div>
    </div>
  );
}

// ─── Source popover (Web / Images / News) ───────────────────────

function SourcePopover({
  sources,
  onChange,
}: {
  sources: Set<SourceId>;
  onChange: (next: Set<SourceId>) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger className="border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40 inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors">
        <span className="bg-muted/60 inline-flex size-4 items-center justify-center rounded-sm font-mono text-[9px]">
          +
        </span>
        <span className="text-foreground">
          Source: <span className="font-medium">{sources.size}</span>
        </span>
        <ChevronDownIcon className="size-3" />
      </PopoverTrigger>
      <PopoverContent className="w-[300px]">
        <div className="border-border/60 flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-medium">Source</span>
        </div>
        <div className="flex flex-col gap-1 p-2">
          {SOURCES.map((s) => {
            const active = sources.has(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  const next = new Set(sources);
                  if (active) next.delete(s.id);
                  else next.add(s.id);
                  if (next.size === 0) next.add("web");
                  onChange(next);
                }}
                className="hover:bg-muted/40 flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors"
              >
                <span
                  className={cn(
                    "border-border/60 flex size-4 shrink-0 items-center justify-center rounded border",
                    active && "border-orange-500 bg-orange-500 text-white",
                  )}
                  aria-hidden
                >
                  {active ? <CheckIcon className="size-3" /> : null}
                </span>
                <s.icon className="text-muted-foreground size-4" />
                <span className="flex-1 text-left underline decoration-dotted decoration-muted-foreground/40 underline-offset-4">
                  {s.label}
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Category popover (Github / Research / PDF) ─────────────────
// Client-only — the Brave adapter doesn't yet forward `categories`.
// Phase 7 follow-on will wire it to Brave's `result_filter`.

function CategoryPopover({
  categories,
  onChange,
}: {
  categories: Set<CategoryId>;
  onChange: (next: Set<CategoryId>) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        className="border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40 inline-flex size-8 items-center justify-center rounded-md border transition-colors"
        aria-label="Search categories"
      >
        <FileText className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent className="w-[300px]">
        <div className="border-border/60 flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-medium">Category</span>
        </div>
        <div className="flex flex-col gap-1 p-2">
          {CATEGORIES.map((c) => {
            const active = categories.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  const next = new Set(categories);
                  if (active) next.delete(c.id);
                  else next.add(c.id);
                  onChange(next);
                }}
                className="hover:bg-muted/40 flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors"
              >
                <span
                  className={cn(
                    "border-border/60 flex size-4 shrink-0 items-center justify-center rounded border",
                    active && "border-orange-500 bg-orange-500 text-white",
                  )}
                  aria-hidden
                >
                  {active ? <CheckIcon className="size-3" /> : null}
                </span>
                <c.icon className="text-muted-foreground size-4" />
                <span className="flex-1 text-left underline decoration-dotted decoration-muted-foreground/40 underline-offset-4">
                  {c.label}
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Get Code popover ───────────────────────────────────────────

function GetCodePopover({
  query,
  sources,
  options,
}: {
  query: string;
  sources: Set<SourceId>;
  options: Options;
}) {
  const body = JSON.stringify(
    {
      query: query || "example query",
      limit: options.limit,
      country: options.country || undefined,
      lang: options.lang || undefined,
      tbs: options.tbs || undefined,
      sources: Array.from(sources),
    },
    null,
    2,
  );
  const curl = `curl -X POST https://api.peep.dev/v1/search \\
  -H "Authorization: Bearer peep_live_..." \\
  -H "Content-Type: application/json" \\
  -d '${body}'`;

  return (
    <Popover>
      <PopoverTrigger className="border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40 inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors">
        <SquareChevronRight className="size-3.5" />
        Get Code
      </PopoverTrigger>
      <PopoverContent className="w-[520px]">
        <div className="border-border/60 flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-medium">cURL</span>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(curl);
              toast.success("Copied");
            }}
            className="text-muted-foreground hover:text-foreground text-xs"
          >
            Copy
          </button>
        </div>
        <pre className="bg-background/60 max-h-80 overflow-auto p-4 font-mono text-[11px] leading-relaxed">
          {curl}
        </pre>
      </PopoverContent>
    </Popover>
  );
}

// ─── Results list — one card per result with its own JSON block ─

function SearchResultsList({ results }: { results: SearchResultView[] }) {
  if (results.length === 0) {
    return (
      <div className="border-border/60 bg-card/20 text-muted-foreground border px-6 py-12 text-center text-sm">
        No Results. Try A Different Query Or Source.
      </div>
    );
  }
  // Image results render as a thumbnail gallery, not text cards.
  const isImages = results.every((r) => r.source === "images" || !!r.imageUrl);
  if (isImages) return <ImageResultsGrid results={results} />;
  return (
    <div className="flex flex-col gap-6">
      {results.map((r, i) => (
        <SearchResultBlock key={`${i}-${r.url}`} result={r} position={i + 1} />
      ))}
    </div>
  );
}

// Thumbnail gallery for image-source results — click opens the full image;
// hover shows the source page host. Broken hotlinks hide themselves.
function ImageResultsGrid({ results }: { results: SearchResultView[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs">
          {results.length} Image{results.length === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
          onClick={() =>
            navigator.clipboard.writeText(
              results.map((r) => r.imageUrl ?? r.url).join("\n"),
            )
          }
        >
          <Copy className="size-3" /> Copy All URLs
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {results.map((r, i) => {
          const full = r.imageUrl ?? r.url;
          const thumb = r.thumbnail ?? full;
          return (
            <a
              key={`${i}-${full}`}
              href={full}
              target="_blank"
              rel="noreferrer"
              title={`${r.title || ""}\n${safeHost(r.url) ?? r.url}`}
              className="border-border/60 bg-muted/30 group relative aspect-square overflow-hidden rounded-lg border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumb}
                alt={r.title || ""}
                loading="lazy"
                className="size-full object-cover transition group-hover:scale-105"
                onError={(e) => {
                  (e.currentTarget.parentElement as HTMLElement).style.display =
                    "none";
                }}
              />
            </a>
          );
        })}
      </div>
    </div>
  );
}

function SearchResultBlock({
  result,
  position,
}: {
  result: SearchResultView;
  position: number;
}) {
  const [copied, setCopied] = useState(false);
  const host = safeHost(result.url);
  const favicon = host
    ? `https://www.google.com/s2/favicons?domain=${host}&sz=64`
    : null;
  const json = JSON.stringify(
    { url: result.url, title: result.title, description: result.description, position },
    null,
    2,
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <span className="bg-muted/60 flex size-6 shrink-0 items-center justify-center overflow-hidden rounded">
          {favicon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={favicon} alt="" className="size-4" />
          ) : (
            <Globe className="text-muted-foreground size-3.5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <Link
            href={result.url}
            target="_blank"
            rel="noreferrer noopener"
            className="hover:underline"
          >
            <span className="text-orange-400 mr-1 font-semibold">
              #{position}
            </span>
            <span className="text-foreground">{result.title}</span>
          </Link>
          <p className="text-muted-foreground mt-0.5 truncate text-xs">
            {result.url}
          </p>
        </div>
      </div>

      <div className="relative">
        <pre className="border-border/60 bg-background/60 max-h-80 overflow-auto rounded-lg border p-4 font-mono text-[12px] leading-relaxed">
          {json}
        </pre>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(json);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="border-border/60 bg-card/80 text-foreground hover:bg-muted absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors"
        >
          {copied ? (
            <CheckIcon className="size-3.5" />
          ) : (
            <Copy className="size-3.5" />
          )}
          {copied ? "Copied" : "Copy As JSON"}
        </button>
      </div>
    </div>
  );
}

// ─── Recent Runs (same pattern as Scrape / Map) ─────────────────

function RecentRunsCarousel({ runs }: { runs: RecentSearchRun[] }) {
  if (runs.length === 0) {
    return (
      <div className="border-border/60 bg-card/20 text-muted-foreground border px-6 py-12 text-center text-sm">
        No Runs Yet. Search Something Above — Your Recent Runs Will Appear Here.
      </div>
    );
  }
  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {runs.map((run) => (
        <RecentRunCard key={run.id} run={run} />
      ))}
    </div>
  );
}

function RecentRunCard({ run }: { run: RecentSearchRun }) {
  const started = new Date(run.startedAt);
  // Search cards DO show the Formats row (mirroring Firecrawl) —
  // usually "No formats selected" unless scrapeOptions was passed.
  const showFormats = run.endpoint === "scrape" || run.endpoint === "search";
  const host = safeHost(run.label);
  const favicon =
    run.endpoint !== "search" && host
      ? `https://www.google.com/s2/favicons?domain=${host}&sz=64`
      : null;

  return (
    <div className="border-border/60 bg-card/30 hover:border-border flex flex-col border transition-colors">
      <div className="border-border/60 flex items-center gap-3 border-b px-5 py-4">
        <span className="bg-muted/60 flex size-7 shrink-0 items-center justify-center overflow-hidden rounded">
          {favicon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={favicon} alt="" className="size-4" />
          ) : run.endpoint === "search" ? (
            <SearchIcon className="size-3.5 text-orange-400" />
          ) : (
            <Globe className="text-muted-foreground size-3.5" />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {host ?? run.label}
        </span>
        <Link
          href="/dashboard/activity-logs"
          aria-label="Open run"
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowUpRight className="size-4" />
        </Link>
      </div>
      <dl className="divide-border/40 flex flex-1 flex-col divide-y text-sm">
        <InfoRow label="Endpoint">
          <EndpointBadge endpoint={run.endpoint} />
        </InfoRow>
        <InfoRow label="Status">
          <StatusPill status={run.status} />
        </InfoRow>
        <InfoRow label="Started">
          <span className="text-muted-foreground">
            {started.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
            <br />
            {started.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        </InfoRow>
        {showFormats ? (
          <InfoRow label="Formats" align="start">
            {run.formats.length === 0 ? (
              <span className="text-muted-foreground">No Formats Selected</span>
            ) : (
              <span className="flex flex-wrap justify-end gap-1.5">
                {run.formats.slice(0, 3).map((f) => (
                  <span
                    key={f}
                    className="bg-muted/60 inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px]"
                  >
                    {f}
                  </span>
                ))}
              </span>
            )}
          </InfoRow>
        ) : null}
      </dl>
    </div>
  );
}

function InfoRow({
  label,
  children,
  align = "end",
}: {
  label: string;
  children: React.ReactNode;
  align?: "start" | "end";
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 py-4">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd
        className={cn(
          "text-sm",
          align === "end" ? "text-right" : "text-left",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

function EndpointBadge({ endpoint }: { endpoint: RecentSearchRun["endpoint"] }) {
  const Icon: ComponentType<{ className?: string }> =
    endpoint === "search"
      ? SearchIcon
      : endpoint === "map"
        ? MapIcon
        : endpoint === "crawl"
          ? Globe
          : Telescope;
  const label =
    endpoint === "scrape"
      ? "Scrape"
      : endpoint === "map"
        ? "Map"
        : endpoint === "crawl"
          ? "Crawl"
          : "Search";
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="text-orange-400 size-3" />
      <span>{label}</span>
    </span>
  );
}

function StatusPill({ status }: { status: RecentSearchRun["status"] }) {
  const isDone = status === "DONE";
  const isFailed = status === "FAILED";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "inline-flex size-3.5 items-center justify-center rounded-full",
          isDone && "bg-orange-500/20 text-orange-400",
          isFailed && "bg-destructive/20 text-destructive",
          !isDone && !isFailed && "bg-muted text-muted-foreground",
        )}
        aria-hidden
      >
        {isDone ? (
          <CheckIcon className="size-2.5" />
        ) : isFailed ? (
          <X className="size-2.5" />
        ) : null}
      </span>
      <span>
        {isDone
          ? "Success"
          : isFailed
            ? "Failed"
            : status.charAt(0) + status.slice(1).toLowerCase()}
      </span>
    </span>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function safeHost(raw: string): string | null {
  try {
    return new URL(raw).host;
  } catch {
    return null;
  }
}

// Suppress Link2 import-unused if bundlers strip it — it's here in
// case we later show a link icon on a result.
void Link2;
