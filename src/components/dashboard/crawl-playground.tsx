"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check as CheckIcon,
  Code2,
  Copy,
  Crop,
  FileText,
  Gauge,
  GitBranch,
  Globe,
  Images,
  Link2,
  Loader2,
  Map as MapIcon,
  Palette,
  Rows3,
  Search as SearchIcon,
  SlidersHorizontal,
  Sparkles,
  SquareChevronRight,
  Telescope,
  TriangleAlert,
  X,
} from "lucide-react";
import type { ComponentType } from "react";
import { toast } from "sonner";

import { PlaygroundTabs } from "@/components/dashboard/playground-tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────

type FormatId =
  | "markdown"
  | "summary"
  | "links"
  | "html"
  | "rawHtml"
  | "screenshot"
  | "screenshotFull"
  | "json"
  | "branding"
  | "images";

export type RecentCrawlRun = {
  id: string;
  url: string;
  endpoint: "scrape" | "map" | "crawl" | "search";
  status: "DONE" | "FAILED" | "RUNNING" | "QUEUED" | "CANCELLED";
  startedAt: string;
  formats: FormatId[];
};

type Options = {
  limit: number;
  maxDiscoveryDepth: number | null;
  includePaths: string[];
  excludePaths: string[];
  crawlEntireDomain: boolean;
  allowSubdomains: boolean;
  allowExternalLinks: boolean;
  sitemap: "include" | "skip" | "only";
};

const DEFAULT_OPTIONS: Options = {
  limit: 100,
  maxDiscoveryDepth: null,
  includePaths: [],
  excludePaths: [],
  crawlEntireDomain: false,
  allowSubdomains: false,
  allowExternalLinks: false,
  sitemap: "include",
};

type CrawlStart = {
  jobId: string;
  streamUrl: string;
  aiSuggested?: Record<string, unknown>;
};

type CrawlStatus = {
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  rootUrl: string;
  total: number;
  completed: number;
  failed: number;
  creditsUsed: number;
  recent: Array<{
    jobId: string;
    url: string;
    status: "done" | "failed";
    error: string | null;
    title: string | null;
  }>;
};

// ─── Main component ─────────────────────────────────────────────

export function CrawlPlayground({
  recentRuns,
}: {
  recentRuns: RecentCrawlRun[];
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [prompt, setPrompt] = useState("");
  const [formats, setFormats] = useState<Set<FormatId>>(new Set(["markdown"]));
  const [options, setOptions] = useState<Options>(DEFAULT_OPTIONS);
  const [pending, startTransition] = useTransition();
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    startTransition(async () => {
      const fullUrl = trimmed.startsWith("http")
        ? trimmed
        : `https://${trimmed}`;
      const payload = buildApiPayload({
        url: fullUrl,
        prompt,
        formats,
        options,
      });

      const res = await fetch("/api/dashboard/playground/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        const msg = json?.error?.message ?? "Crawl Failed To Start";
        toast.error(msg);
        return;
      }
      const started = json as CrawlStart & { success: true };
      setActiveJobId(started.jobId);
      toast.success("Crawl Started");
      router.refresh();
    });
  }

  return (
    <div className="flex w-full flex-col">
      <div className="flex w-full justify-center py-20">
        <div className="flex w-full max-w-2xl flex-col items-center gap-3">
          <PlaygroundTabs />

          <form onSubmit={submit} className="flex w-full flex-col gap-3">
            {/* URL pill */}
            <div className="border-border/60 bg-card/60 flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-sm">
              <span className="bg-muted/70 text-muted-foreground rounded-lg px-3 py-1.5 font-mono text-xs">
                https://
              </span>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="example.com"
                disabled={pending || !!activeJobId}
                className="placeholder:text-muted-foreground/60 flex-1 bg-transparent py-1 text-base outline-none disabled:opacity-50"
                aria-label="URL to crawl"
              />
            </div>

            {/* Toolbar — Options · Sparkles (NL prompt) · Format · Get
                Code · Start Crawling */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <OptionsPopover options={options} onChange={setOptions} />
                <PromptPopover prompt={prompt} onChange={setPrompt} />
                <FormatPopover formats={formats} onChange={setFormats} />
              </div>
              <div className="flex items-center gap-2">
                <GetCodePopover
                  url={url}
                  prompt={prompt}
                  formats={formats}
                  options={options}
                />
                <button
                  type="submit"
                  disabled={pending || !url.trim() || !!activeJobId}
                  className="inline-flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-orange-500/90 disabled:pointer-events-none disabled:opacity-50"
                >
                  {pending ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" /> Starting
                    </>
                  ) : (
                    <>
                      Start Crawling <ArrowRight className="size-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {activeJobId ? (
        <div className="mx-auto w-full max-w-4xl px-2 pb-16">
          <CrawlProgressPanel
            jobId={activeJobId}
            onClear={() => {
              setActiveJobId(null);
              router.refresh();
            }}
          />
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
        aria-label="Crawl options"
      >
        <SlidersHorizontal className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent className="w-[420px]">
        <div className="border-border/60 flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-medium">Options</span>
        </div>
        <div className="flex flex-col gap-4 px-4 py-4">
          <OptionNumber
            icon={Gauge}
            label="Limit"
            value={options.limit}
            onChange={(v) => set("limit", Math.max(1, Math.min(v, 50_000)))}
          />
          <OptionNumber
            icon={Rows3}
            label="Max Depth"
            value={options.maxDiscoveryDepth ?? 0}
            onChange={(v) => set("maxDiscoveryDepth", v > 0 ? v : null)}
          />
          <OptionToggle
            icon={Globe}
            label="Crawl Entire Domain"
            checked={options.crawlEntireDomain}
            onChange={(v) => set("crawlEntireDomain", v)}
          />
          <OptionToggle
            icon={Link2}
            label="Allow Subdomains"
            checked={options.allowSubdomains}
            onChange={(v) => set("allowSubdomains", v)}
          />
          <OptionToggle
            icon={ExternalLinkIcon}
            label="Allow External Links"
            checked={options.allowExternalLinks}
            onChange={(v) => set("allowExternalLinks", v)}
          />
          <OptionTagList
            icon={CheckIcon}
            label="Include Paths"
            placeholder="^/docs — Regex, Enter To Add"
            values={options.includePaths}
            onAdd={(v) =>
              set("includePaths", [...options.includePaths, v])
            }
            onRemove={(v) =>
              set(
                "includePaths",
                options.includePaths.filter((x) => x !== v),
              )
            }
          />
          <OptionTagList
            icon={X}
            label="Exclude Paths"
            placeholder="^/changelog — Regex, Enter To Add"
            values={options.excludePaths}
            onAdd={(v) =>
              set("excludePaths", [...options.excludePaths, v])
            }
            onRemove={(v) =>
              set(
                "excludePaths",
                options.excludePaths.filter((x) => x !== v),
              )
            }
          />
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground size-4 shrink-0 opacity-0" />
            <span className="text-sm underline decoration-dotted decoration-muted-foreground/40 underline-offset-4">
              Sitemap
            </span>
            <div className="ml-auto flex items-center gap-1">
              {(["include", "only", "skip"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => set("sitemap", v)}
                  className={cn(
                    "rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors capitalize",
                    options.sitemap === v
                      ? "border-orange-500/50 bg-orange-500/15 text-orange-200"
                      : "border-border/60 bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v}
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

function OptionTagList({
  icon: Icon,
  label,
  placeholder,
  values,
  onAdd,
  onRemove,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  placeholder: string;
  values: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="flex items-start gap-3">
      <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
      <div className="flex-1">
        <span className="text-sm underline decoration-dotted decoration-muted-foreground/40 underline-offset-4">
          {label}
        </span>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              e.preventDefault();
              onAdd(draft.trim());
              setDraft("");
            }
          }}
          placeholder={placeholder}
          className="border-border/60 bg-background/80 placeholder:text-muted-foreground/50 mt-1 w-full rounded-md border px-2 py-1 text-xs outline-none"
        />
        {values.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {values.map((v) => (
              <span
                key={v}
                className="bg-muted/60 inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px]"
              >
                {v}
                <button
                  type="button"
                  onClick={() => onRemove(v)}
                  aria-label={`Remove ${v}`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── NL-prompt popover (sparkles button) ────────────────────────

function PromptPopover({
  prompt,
  onChange,
}: {
  prompt: string;
  onChange: (v: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "border-border/60 inline-flex size-8 items-center justify-center rounded-md border transition-colors",
          prompt
            ? "bg-orange-500/10 text-orange-300"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
        )}
        aria-label="Natural-language crawl prompt"
      >
        <Sparkles className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent className="w-[440px]">
        <div className="border-border/60 flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-medium">Describe What To Crawl</span>
        </div>
        <div className="flex flex-col gap-3 px-4 py-4">
          <p className="text-muted-foreground text-xs">
            Describe The Section You Want — We&apos;ll Turn It Into{" "}
            <span className="font-mono">includePaths</span> /
            <span className="font-mono"> excludePaths</span> Regexes Using
            Gemini. Explicit Fields You&apos;ve Set Still Win.
          </p>
          <textarea
            value={prompt}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Crawl Only The Docs Section, Skip Changelog And Blog Posts"
            rows={4}
            className="border-border/60 bg-background/80 placeholder:text-muted-foreground/50 rounded-md border px-3 py-2 text-sm outline-none resize-none"
          />
          {prompt ? (
            <button
              type="button"
              onClick={() => onChange("")}
              className="text-muted-foreground hover:text-foreground self-start text-xs"
            >
              Clear
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Format picker — reuses Scrape's list (scrapeOptions.formats) ──

type FormatSpec = {
  id: FormatId;
  label: string;
  icon: ComponentType<{ className?: string }>;
  hint?: { left: string; right: string };
};

const FORMATS: FormatSpec[] = [
  { id: "markdown", label: "Markdown", icon: FileText },
  { id: "summary", label: "Summary", icon: Rows3 },
  { id: "links", label: "Links", icon: Link2 },
  {
    id: "html",
    label: "HTML",
    icon: Code2,
    hint: { left: "Cleaned", right: "Raw" },
  },
  {
    id: "screenshot",
    label: "Screenshot",
    icon: Crop,
    hint: { left: "Viewport", right: "Full Page" },
  },
  { id: "json", label: "JSON", icon: Globe },
  { id: "branding", label: "Branding", icon: Palette },
  { id: "images", label: "Images", icon: Images },
];

function FormatPopover({
  formats,
  onChange,
}: {
  formats: Set<FormatId>;
  onChange: (next: Set<FormatId>) => void;
}) {
  const activeList = Array.from(formats);
  const primary = activeList[0] ?? "markdown";
  const primaryLabel =
    FORMATS.find((f) => f.id === primary)?.label ??
    (primary === "rawHtml"
      ? "Raw HTML"
      : primary === "screenshotFull"
        ? "Screenshot"
        : "Markdown");

  return (
    <Popover>
      <PopoverTrigger className="border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40 inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors">
        <FileText className="size-3.5" />
        <span className="text-foreground">
          Format: <span className="font-medium">{primaryLabel}</span>
          {activeList.length > 1 ? (
            <span className="text-muted-foreground ml-1">
              +{activeList.length - 1}
            </span>
          ) : null}
        </span>
        <ChevronDownIcon className="size-3" />
      </PopoverTrigger>
      <PopoverContent className="w-[320px]">
        <div className="border-border/60 flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-medium">Format</span>
        </div>
        <div className="flex flex-col gap-1 p-2">
          {FORMATS.map((f) => {
            const active = formats.has(f.id);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  const next = new Set(formats);
                  if (active) next.delete(f.id);
                  else next.add(f.id);
                  if (next.size === 0) next.add("markdown");
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
                <f.icon className="text-muted-foreground size-4" />
                <span className="flex-1 text-left underline decoration-dotted decoration-muted-foreground/40 underline-offset-4">
                  {f.label}
                </span>
                {f.hint ? (
                  <span className="flex items-center gap-2 text-[11px]">
                    <span className="text-muted-foreground">
                      {f.hint.left}
                    </span>
                    <span className="text-muted-foreground/60">
                      {f.hint.right}
                    </span>
                  </span>
                ) : null}
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
  url,
  prompt,
  formats,
  options,
}: {
  url: string;
  prompt: string;
  formats: Set<FormatId>;
  options: Options;
}) {
  const trimmed = url.trim() || "https://example.com";
  const fullUrl = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
  const payload = buildApiPayload({ url: fullUrl, prompt, formats, options });
  const curl = `curl -X POST https://api.peep.dev/v1/crawl \\
  -H "Authorization: Bearer peep_live_..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(payload, null, 2)}'`;

  return (
    <Popover>
      <PopoverTrigger className="border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40 inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors">
        <SquareChevronRight className="size-3.5" />
        Get Code
      </PopoverTrigger>
      <PopoverContent className="w-[560px]">
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

// ─── Live-progress panel (poll-based placeholder) ───────────────

function CrawlProgressPanel({
  jobId,
  onClear,
}: {
  jobId: string;
  onClear: () => void;
}) {
  const [status, setStatus] = useState<CrawlStatus | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const res = await fetch(`/api/dashboard/playground/crawl/${jobId}`);
        const json = await res.json();
        if (!alive) return;
        if (res.ok && json.success) {
          setStatus(json as CrawlStatus);
          if (
            json.status === "done" ||
            json.status === "failed" ||
            json.status === "cancelled"
          ) {
            return;
          }
        }
      } catch {
        /* keep polling */
      }
      if (alive) timer = setTimeout(poll, 2000);
    };
    void poll();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);

  const terminal =
    status?.status === "done" ||
    status?.status === "failed" ||
    status?.status === "cancelled";

  async function cancel() {
    setCancelling(true);
    try {
      await fetch(`/api/dashboard/playground/crawl/${jobId}`, {
        method: "DELETE",
      });
      toast.success("Crawl Cancelled");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="border-border/60 bg-card/30 flex flex-col gap-4 border p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!terminal ? (
            <Loader2 className="size-4 animate-spin text-orange-400" />
          ) : status?.status === "done" ? (
            <CheckIcon className="size-4 text-orange-400" />
          ) : (
            <TriangleAlert className="size-4 text-destructive" />
          )}
          <span className="text-sm font-medium">
            {status
              ? status.rootUrl
              : "Starting Crawl..."}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!terminal ? (
            <button
              type="button"
              onClick={cancel}
              disabled={cancelling}
              className="border-border/60 text-muted-foreground hover:bg-destructive/10 hover:text-destructive inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-50"
            >
              {cancelling ? "Cancelling" : "Cancel"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClear}
            className="border-border/60 text-muted-foreground hover:bg-muted/40 hover:text-foreground inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Stat label="Status" value={status?.status ?? "queued"} />
        <Stat
          label="Completed"
          value={`${status?.completed ?? 0}/${status?.total ?? 0}`}
        />
        <Stat label="Failed" value={String(status?.failed ?? 0)} />
        <Stat label="Credits" value={String(status?.creditsUsed ?? 0)} />
      </div>

      {status && status.recent.length > 0 ? (
        <div className="border-border/60 flex flex-col divide-y divide-border/40 border-t">
          {status.recent.map((r) => (
            <div
              key={r.jobId}
              className="flex items-center gap-3 px-1 py-2 text-sm"
            >
              <span
                className={cn(
                  "inline-flex size-3 shrink-0 items-center justify-center rounded-full",
                  r.status === "done"
                    ? "bg-orange-500/20 text-orange-400"
                    : "bg-destructive/20 text-destructive",
                )}
                aria-hidden
              >
                {r.status === "done" ? (
                  <CheckIcon className="size-2" />
                ) : (
                  <X className="size-2" />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {r.title ? (
                  <>
                    <span className="text-foreground">{r.title}</span>
                    <span className="text-muted-foreground ml-2 font-mono text-xs">
                      {r.url}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground font-mono text-xs">
                    {r.url}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-[11px] uppercase tracking-wider">
        {label}
      </span>
      <span className="text-foreground text-sm capitalize">{value}</span>
    </div>
  );
}

// ─── Recent Runs ────────────────────────────────────────────────

function RecentRunsCarousel({ runs }: { runs: RecentCrawlRun[] }) {
  if (runs.length === 0) {
    return (
      <div className="border-border/60 bg-card/20 text-muted-foreground border px-6 py-12 text-center text-sm">
        No Runs Yet. Start A Crawl Above — Your Recent Runs Will Appear Here.
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

function RecentRunCard({ run }: { run: RecentCrawlRun }) {
  const host = safeHost(run.url);
  const favicon = host
    ? `https://www.google.com/s2/favicons?domain=${host}&sz=64`
    : null;
  const started = new Date(run.startedAt);
  const showFormats =
    run.endpoint === "scrape" || run.endpoint === "crawl" || run.endpoint === "search";
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
                {run.formats.slice(0, 3).map((fid) => (
                  <FormatChip key={fid} id={fid} />
                ))}
                {run.formats.length > 3 ? (
                  <span className="text-muted-foreground px-1 text-xs">
                    +{run.formats.length - 3}
                  </span>
                ) : null}
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

function EndpointBadge({
  endpoint,
}: {
  endpoint: RecentCrawlRun["endpoint"];
}) {
  const Icon: ComponentType<{ className?: string }> =
    endpoint === "crawl"
      ? Globe
      : endpoint === "map"
        ? MapIcon
        : endpoint === "search"
          ? SearchIcon
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

function StatusPill({ status }: { status: RecentCrawlRun["status"] }) {
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

function FormatChip({ id }: { id: FormatId }) {
  const spec = FORMATS.find((f) => f.id === id);
  const label = spec?.label ?? id;
  const Icon = spec?.icon ?? FileText;
  return (
    <span className="bg-muted/60 inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px]">
      <Icon className="size-3" />
      {label}
    </span>
  );
}

// ─── Helpers ────────────────────────────────────────────────────

function ExternalLinkIcon({ className }: { className?: string }) {
  return <GitBranch className={className} />;
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

function buildApiPayload({
  url,
  prompt,
  formats,
  options,
}: {
  url: string;
  prompt: string;
  formats: Set<FormatId>;
  options: Options;
}) {
  const apiFormats: Array<Record<string, unknown>> = [];
  for (const f of formats) {
    if (f === "screenshot") apiFormats.push({ type: "screenshot", fullPage: false });
    else if (f === "screenshotFull")
      apiFormats.push({ type: "screenshot", fullPage: true });
    else if (f === "rawHtml") apiFormats.push({ type: "rawHtml" });
    else apiFormats.push({ type: f });
  }
  return {
    url,
    prompt: prompt.trim() || undefined,
    limit: options.limit,
    maxDiscoveryDepth: options.maxDiscoveryDepth ?? undefined,
    includePaths:
      options.includePaths.length > 0 ? options.includePaths : undefined,
    excludePaths:
      options.excludePaths.length > 0 ? options.excludePaths : undefined,
    crawlEntireDomain: options.crawlEntireDomain,
    allowSubdomains: options.allowSubdomains,
    allowExternalLinks: options.allowExternalLinks,
    sitemap: options.sitemap,
    scrapeOptions: { formats: apiFormats },
  };
}

// Unused-import suppression for Copy (kept for future result-card work)
void Copy;
