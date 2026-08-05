"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check as CheckIcon,
  Code2,
  Copy,
  Download,
  SquareChevronRight,
  Gauge,
  Globe,
  Link2,
  Loader2,
  Map as MapIcon,
  Search as SearchIcon,
  Share,
  SlidersHorizontal,
  TriangleAlert,
  Waypoints,
  X,
} from "lucide-react";
import type { ComponentType } from "react";
import { toast } from "sonner";

import { PlaygroundTabs } from "@/components/dashboard/playground-tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────

export type RecentMapRun = {
  id: string;
  url: string;
  endpoint: "scrape" | "map" | "crawl" | "search";
  status: "DONE" | "FAILED" | "RUNNING" | "QUEUED" | "CANCELLED";
  startedAt: string;
  formats: Array<"markdown" | "summary" | "links" | "html" | "rawHtml" | "screenshot" | "screenshotFull" | "json" | "branding" | "images">;
};

type Options = {
  ignoreSitemap: boolean;
  includeSubdomains: boolean;
  search: string;
  limit: number;
};

const DEFAULT_OPTIONS: Options = {
  ignoreSitemap: false,
  includeSubdomains: false,
  search: "",
  limit: 5000,
};

type MapResult = {
  url: string;
  links: string[];
};

export function MapPlayground({
  recentRuns,
}: {
  recentRuns: RecentMapRun[];
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [options, setOptions] = useState<Options>(DEFAULT_OPTIONS);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<MapResult | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    startTransition(async () => {
      const fullUrl = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
      const payload = {
        url: fullUrl,
        limit: options.limit,
        search: options.search || undefined,
        includeSubdomains: options.includeSubdomains,
        sitemap: options.ignoreSitemap ? "skip" : "include",
      };

      const res = await fetch("/api/dashboard/playground/map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        const msg = json?.error?.message ?? "Map Failed";
        toast.error(msg);
        setResult(null);
        return;
      }
      setResult({ url: fullUrl, links: json.links ?? [] });
      toast.success(`Found ${json.links?.length ?? 0} Links`);
      router.refresh();
    });
  }

  return (
    <div className="flex w-full flex-col">
      <div className="flex w-full justify-center py-20">
        <div className="flex w-full max-w-2xl flex-col items-center gap-3">
          <PlaygroundTabs />

          <form onSubmit={submit} className="flex w-full flex-col gap-3">
            {/* URL pill — same as Scrape */}
            <div className="border-border/60 bg-card/60 flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-sm">
              <span className="bg-muted/70 text-muted-foreground rounded-lg px-3 py-1.5 font-mono text-xs">
                https://
              </span>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="example.com"
                disabled={pending}
                className="placeholder:text-muted-foreground/60 flex-1 bg-transparent py-1 text-base outline-none disabled:opacity-50"
                aria-label="URL to map"
              />
            </div>

            {/* Toolbar — Map has no Format/Enrich; just Options + Get Code + Start Mapping */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <OptionsPopover options={options} onChange={setOptions} />
              </div>
              <div className="flex items-center gap-2">
                <GetCodePopover url={url} options={options} />
                <button
                  type="submit"
                  disabled={pending || !url.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-orange-500/90 disabled:pointer-events-none disabled:opacity-50"
                >
                  {pending ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" /> Mapping
                    </>
                  ) : (
                    <>
                      Start Mapping <ArrowRight className="size-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {result ? (
        <div className="mx-auto w-full max-w-4xl px-2 pb-16">
          <MapResultCard result={result} />
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

  return (
    <Popover>
      <PopoverTrigger
        className="border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40 inline-flex size-8 items-center justify-center rounded-md border transition-colors"
        aria-label="Map options"
      >
        <SlidersHorizontal className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent className="w-[380px]">
        <div className="border-border/60 flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-medium">Options</span>
        </div>
        <div className="flex flex-col gap-4 px-4 py-4">
          <OptionToggle
            icon={Waypoints}
            label="Ignore Sitemap"
            checked={options.ignoreSitemap}
            onChange={(v) => set("ignoreSitemap", v)}
          />
          <OptionToggle
            icon={Link2}
            label="Include Subdomains"
            checked={options.includeSubdomains}
            onChange={(v) => set("includeSubdomains", v)}
          />
          <OptionText
            icon={SearchIcon}
            label="Search"
            beta
            placeholder="blog"
            value={options.search}
            onChange={(v) => set("search", v)}
          />
          <OptionNumber
            icon={Gauge}
            label="Limit"
            value={options.limit}
            onChange={(v) => set("limit", Math.max(1, Math.min(v, 50_000)))}
          />
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

function OptionToggle({
  icon: Icon,
  label,
  checked,
  onChange,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="text-muted-foreground size-4 shrink-0" />
      <span className="text-sm underline decoration-dotted decoration-muted-foreground/40 underline-offset-4">
        {label}
      </span>
      <span className="ml-auto">
        <Switch
          checked={checked}
          onCheckedChange={(v: boolean) => onChange(v)}
        />
      </span>
    </div>
  );
}

function OptionText({
  icon: Icon,
  label,
  beta,
  placeholder,
  value,
  onChange,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  beta?: boolean;
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
      {beta ? (
        <span className="rounded bg-orange-500/20 px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider text-orange-300">
          Beta
        </span>
      ) : null}
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

// ─── Get Code popover ───────────────────────────────────────────

function GetCodePopover({ url, options }: { url: string; options: Options }) {
  const trimmed = url.trim() || "https://example.com";
  const fullUrl = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
  const body = JSON.stringify(
    {
      url: fullUrl,
      limit: options.limit,
      search: options.search || undefined,
      includeSubdomains: options.includeSubdomains,
      sitemap: options.ignoreSitemap ? "skip" : "include",
    },
    null,
    2,
  );
  const curl = `curl -X POST https://api.peep.dev/v1/map \\
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

// ─── Map Result Card ────────────────────────────────────────────

function MapResultCard({ result }: { result: MapResult }) {
  const host = safeHost(result.url) ?? result.url;
  const favicon = `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  const [tab, setTab] = useState<"links" | "json">("links");
  const linksText = result.links.map((l, i) => `${i + 1}  ${l}`).join("\n");
  const jsonText = JSON.stringify(
    result.links.map((url) => ({ url })),
    null,
    2,
  );

  return (
    <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-5 px-2">
      {/* Top row: favicon + host + Share */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={favicon} alt="" className="size-4" />
          <span className="text-foreground">{host}</span>
        </span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(result.url);
            toast.success("Link Copied");
          }}
          className="border-border/60 text-foreground hover:bg-muted/40 inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors"
        >
          <Share className="size-3.5" />
          Share
        </button>
      </div>

      {/* Endpoint / Status grid */}
      <div className="grid grid-cols-2 gap-8">
        <InfoBlock label="Endpoint">
          <span className="inline-flex items-center gap-1.5">
            <MapIcon className="text-orange-400 size-3" />
            <span>Map</span>
          </span>
        </InfoBlock>
        <InfoBlock label="Status">
          <StatusPill status="DONE" />
        </InfoBlock>
      </div>

      {/* URL title block + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">{host}</h3>
          <p className="text-muted-foreground text-xs">
            {result.links.length} URL{result.links.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              toast.info("Report Issue — Coming Soon")
            }
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs"
          >
            <TriangleAlert className="size-3.5" />
            Report Issue
          </button>
          <DownloadButton
            label="JSON"
            onClick={() =>
              downloadFile(`${host}-map.json`, jsonText, "application/json")
            }
          />
        </div>
      </div>

      {/* Tabs — Links / JSON */}
      <div className="border-border/60 flex items-center gap-1 border-b">
        <TabButton active={tab === "links"} onClick={() => setTab("links")}>
          <Link2
            className={cn(
              "size-3.5",
              tab === "links" ? "text-orange-400" : "text-muted-foreground",
            )}
          />
          Links
        </TabButton>
        <TabButton active={tab === "json"} onClick={() => setTab("json")}>
          <span
            className={cn(
              "inline-flex size-4 items-center justify-center rounded font-mono text-[10px]",
              tab === "json"
                ? "bg-muted text-foreground"
                : "bg-muted/50 text-muted-foreground",
            )}
          >
            {"{}"}
          </span>
          JSON
        </TabButton>
      </div>

      <ResultContent
        body={tab === "links" ? linksText : jsonText}
        copyLabel={tab === "links" ? "Copy As String" : "Copy As JSON"}
      />
    </div>
  );
}

function InfoBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative inline-flex items-center gap-2 px-3 py-2 text-sm transition-colors",
        active
          ? "text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-[1.5px] after:bg-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function DownloadButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-border/60 text-foreground hover:bg-muted/40 inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors"
    >
      <Download className="size-3.5" />
      {label}
    </button>
  );
}

function ResultContent({
  body,
  copyLabel,
}: {
  body: string;
  copyLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="border-border/60 bg-background/60 max-h-[520px] overflow-auto rounded-lg border p-5 font-mono text-[12px] leading-relaxed">
        {body || "(Empty)"}
      </pre>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(body);
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
        {copied ? "Copied" : copyLabel}
      </button>
    </div>
  );
}

// ─── Recent Runs ────────────────────────────────────────────────

function RecentRunsCarousel({ runs }: { runs: RecentMapRun[] }) {
  if (runs.length === 0) {
    return (
      <div className="border-border/60 bg-card/20 text-muted-foreground border px-6 py-12 text-center text-sm">
        No Runs Yet. Map A URL Above — Your Recent Runs Will Appear Here.
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

function RecentRunCard({ run }: { run: RecentMapRun }) {
  const host = safeHost(run.url);
  const favicon = host
    ? `https://www.google.com/s2/favicons?domain=${host}&sz=64`
    : null;
  const started = new Date(run.startedAt);
  const showFormats = run.endpoint === "scrape";
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
          {host ?? run.url}
        </span>
        <Link
          href={`/dashboard/activity-logs/${run.id}`}
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
                {run.formats.slice(0, 3).map((fid) => (
                  <span
                    key={fid}
                    className="bg-muted/60 inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px]"
                  >
                    {fid}
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

function EndpointBadge({ endpoint }: { endpoint: RecentMapRun["endpoint"] }) {
  const Icon: ComponentType<{ className?: string }> =
    endpoint === "map"
      ? MapIcon
      : endpoint === "crawl"
        ? Globe
        : endpoint === "search"
          ? SearchIcon
          : Link2;
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

function StatusPill({ status }: { status: RecentMapRun["status"] }) {
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

function safeHost(raw: string): string | null {
  try {
    return new URL(raw).host;
  } catch {
    return null;
  }
}

function downloadFile(name: string, body: string, mime: string) {
  const blob = new Blob([body], { type: mime });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(href);
}
