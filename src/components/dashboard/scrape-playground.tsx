"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check as CheckIcon,
  Code2,
  Copy,
  Crop,
  SquareChevronRight,
  Download,
  FileText,
  Globe,
  Image as ImageIcon,
  Images,
  Link2,
  Loader2,
  Map as MapIcon,
  MousePointer,
  Palette,
  Rows3,
  Search as SearchIcon,
  Share,
  SlidersHorizontal,
  Sparkles,
  Table as TableIcon,
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

export type RecentRun = {
  id: string;
  url: string;
  status: "DONE" | "FAILED" | "RUNNING" | "QUEUED" | "CANCELLED";
  endpoint: "scrape" | "map" | "crawl" | "search";
  startedAt: string; // ISO
  formats: FormatId[];
};

type Options = {
  onlyMainContent: boolean;
  parsePdf: boolean;
  enhancedMode: boolean;
  waitMs: number;
  timeoutMs: number;
  maxAgeMs: number;
  includeTags: string[];
  excludeTags: string[];
};

const DEFAULT_OPTIONS: Options = {
  onlyMainContent: true,
  parsePdf: false,
  enhancedMode: false,
  waitMs: 0,
  timeoutMs: 30_000,
  maxAgeMs: 2 * 86_400_000,
  includeTags: [],
  excludeTags: [],
};

// ─── Component ──────────────────────────────────────────────────

type ScrapeResult = {
  url: string;
  data: {
    markdown?: string;
    html?: string;
    rawHtml?: string;
    links?: string[];
    images?: string[];
    screenshot?: string;
    pageStatus?: number;
    durationMs?: number;
    json?: unknown;
    summary?: string;
    branding?: unknown;
    metadata?: Record<string, unknown>;
  };
  creditsUsed: number;
  cached: boolean;
};

export function ScrapePlayground({
  recentRuns,
}: {
  recentRuns: RecentRun[];
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [formats, setFormats] = useState<Set<FormatId>>(
    new Set(["markdown"]),
  );
  const [options, setOptions] = useState<Options>(DEFAULT_OPTIONS);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ScrapeResult | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    startTransition(async () => {
      const fullUrl = trimmed.startsWith("http")
        ? trimmed
        : `https://${trimmed}`;
      const payload = buildApiPayload(trimmed, formats, options);
      const res = await fetch("/api/dashboard/playground/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        const msg = json?.error?.message ?? "Scrape Failed";
        toast.error(msg);
        setResult(null);
        return;
      }
      setResult({
        url: fullUrl,
        data: json.data,
        creditsUsed: json.creditsUsed,
        cached: json.cached,
      });
      toast.success(
        json.cached
          ? "Served From Cache"
          : `Scraped In ${(json.data?.durationMs as number) ?? 0}ms`,
      );
      // Refresh so the server component pulls the fresh row into
      // Recent Runs.
      router.refresh();
    });
  }

  return (
    <div className="flex w-full flex-col">
      {/* Centered stack: pill tabs → URL input → toolbar. No frame,
          no lines. Pill sits tight above the input, input is wider
          and taller than before. */}
      <div className="flex w-full justify-center py-20">
        <div className="flex w-full max-w-2xl flex-col items-center gap-3">
          <PlaygroundTabs />

          <form onSubmit={submit} className="flex w-full flex-col gap-3">
            {/* URL input — scaled up */}
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
                aria-label="URL to scrape"
              />
            </div>

            {/* Toolbar — independent buttons on background, no card */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <OptionsPopover options={options} onChange={setOptions} />
                <EnrichButton />
                <FormatPopover formats={formats} onChange={setFormats} />
              </div>
              <div className="flex items-center gap-2">
                <GetCodePopover url={url} formats={formats} options={options} />
                <button
                  type="submit"
                  disabled={pending || !url.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-orange-500/90 disabled:pointer-events-none disabled:opacity-50"
                >
                  {pending ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" /> Scraping
                    </>
                  ) : (
                    <>
                      Start Scraping <ArrowRight className="size-3.5" />
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
          <ScrapeResultCard result={result} />
        </div>
      ) : null}

      <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 pb-12">
        <h2 className="text-lg font-medium">Recent Runs</h2>
        <RecentRunsCarousel runs={recentRuns} />
      </section>
    </div>
  );
}

// ─── Scrape Result Card ─────────────────────────────────────────

function ScrapeResultCard({ result }: { result: ScrapeResult }) {
  const host = safeHost(result.url) ?? result.url;
  const favicon = `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  const metadata = (result.data.metadata ?? {}) as Record<string, unknown>;
  const title =
    (metadata.title as string | undefined) ??
    (metadata.readabilityTitle as string | undefined) ??
    host;

  const images = result.data.images ?? [];
  const html = result.data.html ?? "";
  const summary = result.data.summary ?? "";
  const hasBranding =
    result.data.branding != null &&
    Object.keys(result.data.branding as object).length > 0;
  const screenshot = result.data.screenshot;
  const [tab, setTab] = useState<
    "markdown" | "json" | "images" | "html" | "summary" | "branding" | "screenshot"
  >(images.length > 0 && !result.data.markdown ? "images" : "markdown");
  const markdown = result.data.markdown ?? "";
  const jsonBody = JSON.stringify(
    {
      ...result.data,
    },
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
          <EndpointBadge endpoint="scrape" />
        </InfoBlock>
        <InfoBlock label="Status">
          <StatusPill status="DONE" />
        </InfoBlock>
      </div>

      {/* Title + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
          <p className="text-muted-foreground text-xs">{host}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/dashboard/playground/interact?url=${encodeURIComponent(result.url)}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-orange-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-orange-500/90"
          >
            <MousePointer className="size-3.5" />
            Interact With This Page
            <span className="rounded bg-white/20 px-1 py-0.5 font-mono text-[9px] uppercase tracking-wider">
              New
            </span>
            <ArrowRight className="size-3" />
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
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
        <div className="flex items-center gap-2">
          <DownloadButton
            label="JSON"
            disabled={!result.data.json && !markdown}
            onClick={() =>
              downloadFile(
                `${host}.json`,
                JSON.stringify(result.data, null, 2),
                "application/json",
              )
            }
          />
          <DownloadButton
            label="Markdown"
            disabled={!markdown}
            onClick={() => downloadFile(`${host}.md`, markdown, "text/markdown")}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-border/60 flex items-center gap-1 border-b">
        <TabButton
          active={tab === "markdown"}
          onClick={() => setTab("markdown")}
        >
          <FormatIconMarkdown active={tab === "markdown"} />
          Markdown
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
        {images.length > 0 && (
          <TabButton active={tab === "images"} onClick={() => setTab("images")}>
            <Images
              className={cn(
                "size-4",
                tab === "images" ? "text-foreground" : "text-muted-foreground",
              )}
            />
            Images ({images.length})
          </TabButton>
        )}
        {html && (
          <TabButton active={tab === "html"} onClick={() => setTab("html")}>
            <span
              className={cn(
                "inline-flex h-4 items-center justify-center rounded px-1 font-mono text-[10px]",
                tab === "html"
                  ? "bg-muted text-foreground"
                  : "bg-muted/50 text-muted-foreground",
              )}
            >
              {"</>"}
            </span>
            HTML
          </TabButton>
        )}
        {summary && (
          <TabButton active={tab === "summary"} onClick={() => setTab("summary")}>
            <FileText
              className={cn(
                "size-4",
                tab === "summary" ? "text-foreground" : "text-muted-foreground",
              )}
            />
            Summary
          </TabButton>
        )}
        {hasBranding && (
          <TabButton
            active={tab === "branding"}
            onClick={() => setTab("branding")}
          >
            <Palette
              className={cn(
                "size-4",
                tab === "branding"
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
            />
            Branding
          </TabButton>
        )}
        {screenshot && (
          <TabButton
            active={tab === "screenshot"}
            onClick={() => setTab("screenshot")}
          >
            <Images
              className={cn(
                "size-4",
                tab === "screenshot"
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
            />
            Screenshot
          </TabButton>
        )}
      </div>

      {tab === "images" ? (
        <ImageGallery images={images} />
      ) : tab === "screenshot" && screenshot ? (
        <div className="border-border/60 bg-muted/20 flex justify-center rounded-lg border p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={screenshot}
            alt="Page screenshot"
            className="max-h-[640px] w-auto rounded"
          />
        </div>
      ) : tab === "branding" ? (
        <BrandingView branding={result.data.branding} />
      ) : (
        <ResultContent
          body={
            tab === "markdown"
              ? markdown
              : tab === "html"
                ? html
                : tab === "summary"
                  ? summary
                  : jsonBody
          }
          copyLabel={
            tab === "markdown"
              ? "Copy As Markdown"
              : tab === "html"
                ? "Copy HTML"
                : tab === "summary"
                  ? "Copy Summary"
                  : "Copy JSON"
          }
        />
      )}
    </div>
  );
}

// Render the `images` format as an actual thumbnail grid (not raw URLs).
// Broken/hotlink-blocked images hide themselves so the grid stays clean.
function ImageGallery({ images }: { images: string[] }) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs">
          {images.length} Image{images.length === 1 ? "" : "s"} Found
        </span>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
          onClick={() => navigator.clipboard.writeText(images.join("\n"))}
        >
          Copy All URLs
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {images.map((src, i) => (
          <a
            key={`${src}-${i}`}
            href={src}
            target="_blank"
            rel="noreferrer"
            title={src}
            className="border-border/60 bg-muted/30 group relative aspect-square overflow-hidden rounded-lg border"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              loading="lazy"
              className="size-full object-cover transition group-hover:scale-105"
              onError={(e) => {
                (e.currentTarget.parentElement as HTMLElement).style.display =
                  "none";
              }}
            />
          </a>
        ))}
      </div>
    </div>
  );
}

// Visual render of the AI `branding` format: colours as swatches, fonts +
// typography + UI components. Falls back to a JSON dump for anything unexpected.
function BrandingView({ branding }: { branding: unknown }) {
  const b = (branding ?? {}) as {
    colors?: {
      primary?: string | null;
      background?: string | null;
      text?: string | null;
      accent?: string[] | null;
    };
    fonts?: { sans?: string | null; serif?: string | null; mono?: string | null };
    typography?: { h1?: string | null; h2?: string | null; body?: string | null };
    ui?: string[] | null;
    brandName?: string | null;
    tagline?: string | null;
  };

  const swatches: Array<{ name: string; hex: string }> = [];
  const c = b.colors ?? {};
  if (c.primary) swatches.push({ name: "Primary", hex: c.primary });
  if (c.background) swatches.push({ name: "Background", hex: c.background });
  if (c.text) swatches.push({ name: "Text", hex: c.text });
  (c.accent ?? []).forEach((hex, i) =>
    hex ? swatches.push({ name: `Accent ${i + 1}`, hex }) : null,
  );

  const fonts = Object.entries(b.fonts ?? {}).filter(([, v]) => v) as Array<
    [string, string]
  >;
  const typo = Object.entries(b.typography ?? {}).filter(([, v]) => v) as Array<
    [string, string]
  >;
  const ui = (b.ui ?? []).filter(Boolean);
  const empty =
    !b.brandName &&
    !b.tagline &&
    swatches.length === 0 &&
    fonts.length === 0 &&
    typo.length === 0 &&
    ui.length === 0;

  if (empty) {
    return (
      <p className="text-muted-foreground p-6 text-center text-sm">
        No Branding Could Be Inferred From This Page.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      {(b.brandName || b.tagline) && (
        <div className="flex flex-col gap-1">
          {b.brandName && (
            <h3 className="text-lg font-semibold">{b.brandName}</h3>
          )}
          {b.tagline && (
            <p className="text-muted-foreground text-sm">{b.tagline}</p>
          )}
        </div>
      )}

      {swatches.length > 0 && (
        <BrandSection title="Colors">
          <div className="flex flex-wrap gap-4">
            {swatches.map((s) => (
              <div key={s.name} className="flex flex-col items-center gap-1.5">
                <span
                  className="border-border/60 size-14 rounded-lg border shadow-sm"
                  style={{ backgroundColor: s.hex }}
                />
                <span className="text-[11px] font-medium">{s.name}</span>
                <span className="text-muted-foreground font-mono text-[10px] uppercase">
                  {s.hex}
                </span>
              </div>
            ))}
          </div>
        </BrandSection>
      )}

      {fonts.length > 0 && (
        <BrandSection title="Fonts">
          <div className="flex flex-col gap-2">
            {fonts.map(([k, v]) => (
              <div key={k} className="flex items-baseline gap-3">
                <span className="text-muted-foreground w-12 text-xs capitalize">
                  {k}
                </span>
                <span className="text-base" style={{ fontFamily: v }}>
                  {v}
                </span>
              </div>
            ))}
          </div>
        </BrandSection>
      )}

      {typo.length > 0 && (
        <BrandSection title="Typography">
          <dl className="flex flex-col gap-1.5 text-sm">
            {typo.map(([k, v]) => (
              <div key={k} className="flex gap-3">
                <dt className="text-muted-foreground w-12 uppercase">{k}</dt>
                <dd className="flex-1">{v}</dd>
              </div>
            ))}
          </dl>
        </BrandSection>
      )}

      {ui.length > 0 && (
        <BrandSection title="UI Components">
          <div className="flex flex-wrap gap-1.5">
            {ui.map((u) => (
              <span
                key={u}
                className="bg-muted/60 rounded px-2 py-0.5 font-mono text-xs"
              >
                {u}
              </span>
            ))}
          </div>
        </BrandSection>
      )}
    </div>
  );
}

function BrandSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
        {title}
      </span>
      {children}
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
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="border-border/60 text-foreground hover:bg-muted/40 inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors disabled:pointer-events-none disabled:opacity-50"
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

function FormatIconMarkdown({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex size-4 items-center justify-center rounded font-mono text-[9px] font-bold",
        active ? "bg-orange-500 text-white" : "bg-muted/60 text-muted-foreground",
      )}
    >
      M↓
    </span>
  );
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
        className={cn(
          "border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40 inline-flex size-8 items-center justify-center rounded-md border transition-colors",
        )}
        aria-label="Scrape options"
      >
        <SlidersHorizontal className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent className="w-[380px]">
        <div className="border-border/60 flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-medium">Options</span>
          <Popover>
            <PopoverTrigger
              aria-label="Close"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </PopoverTrigger>
          </Popover>
        </div>
        <div className="flex flex-col gap-4 px-4 py-4">
          <ToggleRow
            icon={FileText}
            label="Main Content Only"
            checked={options.onlyMainContent}
            onChange={(v) => set("onlyMainContent", v)}
          />
          <ToggleRow
            icon={BookOpen}
            label="Parse PDF"
            hint="1 Credit / PDF Page"
            checked={options.parsePdf}
            onChange={(v) => set("parsePdf", v)}
          />
          <ToggleRow
            icon={Sparkles}
            label="Enhanced Mode"
            hint="5 Credits / Page"
            checked={options.enhancedMode}
            onChange={(v) => set("enhancedMode", v)}
          />
          <TagRow
            label="Exclude Tags"
            values={options.excludeTags}
            onAdd={(v) => set("excludeTags", [...options.excludeTags, v])}
            onRemove={(v) =>
              set(
                "excludeTags",
                options.excludeTags.filter((x) => x !== v),
              )
            }
          />
          <TagRow
            label="Include Tags"
            values={options.includeTags}
            onAdd={(v) => set("includeTags", [...options.includeTags, v])}
            onRemove={(v) =>
              set(
                "includeTags",
                options.includeTags.filter((x) => x !== v),
              )
            }
          />
          <NumberRow
            label="Wait"
            unit="ms"
            placeholder="5 Seconds"
            value={options.waitMs}
            onChange={(v) => set("waitMs", v)}
          />
          <NumberRow
            label="Timeout"
            unit="ms"
            placeholder="30 Seconds"
            value={options.timeoutMs}
            onChange={(v) => set("timeoutMs", v)}
          />
          <NumberRow
            label="Max Age"
            unit="ms"
            placeholder="2 Days"
            value={options.maxAgeMs}
            onChange={(v) => set("maxAgeMs", v)}
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

function ToggleRow({
  icon: Icon,
  label,
  hint,
  checked,
  onChange,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="text-muted-foreground size-4 shrink-0" />
      <span className="text-sm underline decoration-dotted decoration-muted-foreground/40 underline-offset-4">
        {label}
      </span>
      <span className="ml-auto flex items-center gap-3">
        {hint ? (
          <span className="text-muted-foreground text-[11px]">{hint}</span>
        ) : null}
        <Switch
          checked={checked}
          onCheckedChange={(v: boolean) => onChange(v)}
        />
      </span>
    </div>
  );
}

function TagRow({
  label,
  values,
  onAdd,
  onRemove,
}: {
  label: string;
  values: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-start gap-3">
      <Rows3 className="text-muted-foreground mt-0.5 size-4 shrink-0" />
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <span className="text-sm underline decoration-dotted decoration-muted-foreground/40 underline-offset-4">
            {label}
          </span>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
          >
            + Add
          </button>
        </div>
        {open ? (
          <input
            type="text"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim()) {
                onAdd(draft.trim());
                setDraft("");
              } else if (e.key === "Escape") {
                setOpen(false);
                setDraft("");
              }
            }}
            placeholder="E.g. article, main, nav — Enter To Add"
            className="border-border/60 bg-background/80 mt-2 w-full rounded-md border px-2 py-1 text-xs outline-none"
          />
        ) : null}
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

function NumberRow({
  label,
  unit,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  placeholder: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Rows3 className="text-muted-foreground size-4 shrink-0 opacity-0" />
      <span className="text-sm underline decoration-dotted decoration-muted-foreground/40 underline-offset-4">
        {label}
      </span>
      <div className="border-border/60 bg-background/60 ml-auto flex w-40 items-center rounded-md border">
        <input
          type="number"
          value={value || ""}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          placeholder={placeholder}
          className="placeholder:text-muted-foreground/50 flex-1 bg-transparent px-2 py-1 text-xs outline-none"
        />
        <span className="text-muted-foreground pr-2 font-mono text-[11px]">
          {unit}
        </span>
      </div>
    </div>
  );
}

// ─── Enrich (stubbed) ───────────────────────────────────────────

function EnrichButton() {
  return (
    <button
      type="button"
      onClick={() =>
        toast.info("Enrich Table Coming Soon — Batch Scrape Is On The Way.")
      }
      className="border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40 inline-flex size-8 items-center justify-center rounded-md border transition-colors"
      aria-label="Enrich from a table"
    >
      <TableIcon className="size-3.5" />
    </button>
  );
}

// ─── Format picker ──────────────────────────────────────────────

type FormatSpec = {
  id: FormatId;
  label: string;
  icon: ComponentType<{ className?: string }>;
  hint?: { left: string; right: string }; // Screenshot & HTML have dual mode
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

// Formats with a dual mode → [defaultVariantId, alternateVariantId]. The hint
// labels become clickable pills that switch between the two underlying ids.
const VARIANTS: Partial<Record<FormatId, [FormatId, FormatId]>> = {
  screenshot: ["screenshot", "screenshotFull"], // Viewport · Full Page
  html: ["html", "rawHtml"], // Cleaned · Raw
};

// Which variant gets added when you first tick the format. Screenshots
// default to full-page (what you usually want from a scraper); HTML defaults
// to the left (cleaned) variant.
const VARIANT_DEFAULT: Partial<Record<FormatId, FormatId>> = {
  screenshot: "screenshotFull",
};

function FormatPopover({
  formats,
  onChange,
}: {
  formats: Set<FormatId>;
  onChange: (next: Set<FormatId>) => void;
}) {
  const activeList = Array.from(formats);
  const primary =
    activeList[0] === "rawHtml" || activeList[0] === "screenshotFull"
      ? activeList[0]
      : activeList[0] ?? "markdown";
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
        <ArrowDown className="size-3" />
      </PopoverTrigger>
      <PopoverContent className="w-[320px]">
        <div className="border-border/60 flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-medium">Format</span>
        </div>
        <div className="flex flex-col gap-1 p-2">
          {FORMATS.map((f) => {
            const variant = VARIANTS[f.id];
            const leftId = variant ? variant[0] : f.id;
            const rightId = variant ? variant[1] : f.id;
            const active = variant
              ? formats.has(leftId) || formats.has(rightId)
              : formats.has(f.id);
            const toggle = () => {
              const next = new Set(formats);
              if (active) {
                next.delete(leftId);
                next.delete(rightId);
              } else {
                next.add(VARIANT_DEFAULT[f.id] ?? leftId);
              }
              if (next.size === 0) next.add("markdown");
              onChange(next);
            };
            const pickVariant = (addId: FormatId, removeId: FormatId) => {
              const next = new Set(formats);
              next.delete(removeId);
              next.add(addId);
              onChange(next);
            };
            return (
              <div
                key={f.id}
                role="button"
                tabIndex={0}
                onClick={toggle}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggle();
                  }
                }}
                className={cn(
                  "hover:bg-muted/40 flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors",
                )}
              >
                <span
                  className={cn(
                    "border-border/60 flex size-4 shrink-0 items-center justify-center rounded border",
                    active && "border-orange-500 bg-orange-500 text-white",
                  )}
                  aria-hidden
                >
                  {active ? <Check className="size-3" /> : null}
                </span>
                <f.icon className="text-muted-foreground size-4" />
                <span className="flex-1 text-left underline decoration-dotted decoration-muted-foreground/40 underline-offset-4">
                  {f.label}
                </span>
                {f.id === "json" ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toast.info("JSON Schema Editor Coming Soon.");
                    }}
                    className="bg-muted/60 hover:bg-muted inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] transition-colors"
                  >
                    <Code2 className="size-3" />
                    Edit Options
                  </button>
                ) : null}
                {f.hint && variant ? (
                  <span className="flex items-center gap-1 text-[11px]">
                    <VariantPill
                      label={f.hint.left}
                      active={formats.has(leftId)}
                      onClick={(e) => {
                        e.stopPropagation();
                        pickVariant(leftId, rightId);
                      }}
                    />
                    <VariantPill
                      label={f.hint.right}
                      active={formats.has(rightId)}
                      onClick={(e) => {
                        e.stopPropagation();
                        pickVariant(rightId, leftId);
                      }}
                    />
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function VariantPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded px-1.5 py-0.5 transition-colors",
        active
          ? "bg-orange-500/15 text-orange-300"
          : "text-muted-foreground/60 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

// ─── Get code popover ───────────────────────────────────────────

function GetCodePopover({
  url,
  formats,
  options,
}: {
  url: string;
  formats: Set<FormatId>;
  options: Options;
}) {
  const trimmed = url.trim() || "https://example.com";
  const payload = buildApiPayload(trimmed, formats, options);
  const body = JSON.stringify(payload, null, 2);
  const curl = `curl -X POST https://api.peep.dev/v1/scrape \\
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

// ─── Recent Runs ────────────────────────────────────────────────

function RecentRunsCarousel({ runs }: { runs: RecentRun[] }) {
  if (runs.length === 0) {
    return (
      <div className="border-border/60 bg-card/20 text-muted-foreground border px-6 py-12 text-center text-sm">
        No Runs Yet. Scrape A URL Above — Your Recent Runs Will Appear Here.
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

function RecentRunCard({ run }: { run: RecentRun }) {
  const host = safeHost(run.url);
  const favicon = host
    ? `https://www.google.com/s2/favicons?domain=${host}&sz=64`
    : null;
  const started = new Date(run.startedAt);
  // Formats row is only meaningful for scrape runs; map/crawl/search
  // don't expose one in the reference design.
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
          href={`/dashboard/activity-logs`}
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

function EndpointBadge({ endpoint }: { endpoint: RecentRun["endpoint"] }) {
  const Icon =
    endpoint === "scrape"
      ? Rows3
      : endpoint === "map"
        ? MapIcon
        : endpoint === "crawl"
          ? Globe
          : SearchIcon;
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

function StatusPill({ status }: { status: RecentRun["status"] }) {
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
          <Check className="size-2.5" />
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

function safeHost(raw: string): string | null {
  try {
    return new URL(raw).host;
  } catch {
    return null;
  }
}

function buildApiPayload(
  urlInput: string,
  formats: Set<FormatId>,
  options: Options,
) {
  const fixed = urlInput.startsWith("http")
    ? urlInput
    : `https://${urlInput}`;
  const apiFormats: Array<Record<string, unknown>> = [];
  for (const f of formats) {
    if (f === "screenshot") apiFormats.push({ type: "screenshot", fullPage: false });
    else if (f === "screenshotFull")
      apiFormats.push({ type: "screenshot", fullPage: true });
    else if (f === "rawHtml") apiFormats.push({ type: "rawHtml" });
    else apiFormats.push({ type: f });
  }
  return {
    url: fixed,
    formats: apiFormats,
    onlyMainContent: options.onlyMainContent,
    waitFor: options.waitMs,
    timeout: options.timeoutMs,
    maxAge: options.maxAgeMs,
    includeTags: options.includeTags.length ? options.includeTags : undefined,
    excludeTags: options.excludeTags.length ? options.excludeTags : undefined,
  };
}

// Smaller helpers that aren't in lucide's default set
function ArrowDown({ className }: { className?: string }) {
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
function Check({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// Suppress unused warning — ImageIcon is reserved for a future image
// preview tile.
void ImageIcon;
