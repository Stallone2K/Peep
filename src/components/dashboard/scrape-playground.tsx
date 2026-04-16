"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Check, Copy, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type ScrapeResult = {
  success: true;
  data: Record<string, unknown>;
  jobId: string;
  creditsUsed: number;
  cached: boolean;
};

const FORMATS = [
  { id: "markdown", label: "Markdown" },
  { id: "html", label: "HTML" },
  { id: "rawHtml", label: "Raw HTML" },
  { id: "links", label: "Links" },
  { id: "images", label: "Images" },
  { id: "screenshot", label: "Screenshot" },
] as const;

export function ScrapePlayground() {
  const [url, setUrl] = useState("");
  const [selected, setSelected] = useState<Set<string>>(
    new Set(["markdown", "links"]),
  );
  const [onlyMainContent, setOnlyMainContent] = useState(true);
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleFormat(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size === 0) next.add("markdown"); // require at least one
      return next;
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    setError(null);

    const trimmed = url.trim();
    if (!trimmed) return;

    startTransition(async () => {
      const res = await fetch("/api/dashboard/playground/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: trimmed,
          formats: [...selected],
          onlyMainContent,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        const msg = json?.error?.message ?? "Scrape Failed";
        setError(msg);
        toast.error(msg);
        return;
      }
      setResult(json as ScrapeResult);
      toast.success(
        json.cached ? "Served From Cache" : "Scraped In " +
          ((json.data?.durationMs as number) ?? 0) + "ms",
      );
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={submit}
        className="border-border/60 bg-card/40 flex flex-col gap-4 rounded-lg border p-5"
      >
        <div className="flex items-center gap-2">
          <Link2 className="text-muted-foreground size-4 shrink-0" />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            disabled={pending}
            className="placeholder:text-muted-foreground flex-1 bg-transparent py-2 text-base outline-none disabled:opacity-50"
          />
          <Button type="submit" disabled={pending || !url.trim()}>
            {pending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Scraping
              </>
            ) : (
              <>
                Scrape <ArrowRight className="size-3.5" />
              </>
            )}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {FORMATS.map((f) => {
            const active = selected.has(f.id);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => toggleFormat(f.id)}
                disabled={pending}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  active
                    ? "border-orange-500/50 bg-orange-500/15 text-orange-200"
                    : "border-border/60 bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            );
          })}
          <label className="text-muted-foreground ml-auto inline-flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={onlyMainContent}
              onChange={(e) => setOnlyMainContent(e.target.checked)}
              disabled={pending}
              className="accent-orange-500"
            />
            <span>Only Main Content</span>
          </label>
        </div>
      </form>

      {error ? (
        <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-5 py-3 text-sm">
          {error}
        </div>
      ) : null}

      {result ? <ResultPanel result={result} /> : <EmptyState />}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border-border/60 bg-card/20 text-muted-foreground rounded-lg border px-6 py-16 text-center text-sm">
      Enter A URL Above And Hit Scrape. Each Call Uses 1 Credit.
    </div>
  );
}

function ResultPanel({ result }: { result: ScrapeResult }) {
  const d = result.data;
  const metadata = d.metadata as Record<string, unknown> | undefined;
  const durationMs = typeof d.durationMs === "number" ? d.durationMs : null;

  return (
    <div className="border-border/60 bg-card/30 overflow-hidden rounded-lg border">
      <div className="border-border/60 flex flex-wrap items-center gap-4 border-b px-5 py-3 text-xs">
        <span>
          <span className="text-muted-foreground">Status: </span>
          <span className="font-mono">
            {(d.pageStatus as number | undefined) ?? "—"}
          </span>
        </span>
        <span>
          <span className="text-muted-foreground">Duration: </span>
          <span className="font-mono">
            {durationMs !== null ? `${durationMs}ms` : "—"}
          </span>
        </span>
        <span>
          <span className="text-muted-foreground">Credits: </span>
          <span className="font-mono">{result.creditsUsed}</span>
        </span>
        {result.cached ? (
          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-emerald-300">
            Cached
          </span>
        ) : null}
        <span className="text-muted-foreground ml-auto font-mono">
          Job #{result.jobId.slice(0, 10)}
        </span>
      </div>

      <Tabs defaultValue="markdown" className="p-5">
        <TabsList>
          {d.markdown !== undefined ? (
            <TabsTrigger value="markdown">Markdown</TabsTrigger>
          ) : null}
          {d.html !== undefined ? (
            <TabsTrigger value="html">HTML</TabsTrigger>
          ) : null}
          {d.rawHtml !== undefined ? (
            <TabsTrigger value="rawHtml">Raw HTML</TabsTrigger>
          ) : null}
          {Array.isArray(d.links) ? (
            <TabsTrigger value="links">
              Links ({(d.links as string[]).length})
            </TabsTrigger>
          ) : null}
          {Array.isArray(d.images) ? (
            <TabsTrigger value="images">
              Images ({(d.images as string[]).length})
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="metadata">Metadata</TabsTrigger>
          <TabsTrigger value="raw">Full JSON</TabsTrigger>
        </TabsList>

        {d.markdown !== undefined ? (
          <TabsContent value="markdown">
            <CodeBox content={String(d.markdown)} />
          </TabsContent>
        ) : null}
        {d.html !== undefined ? (
          <TabsContent value="html">
            <CodeBox content={String(d.html)} />
          </TabsContent>
        ) : null}
        {d.rawHtml !== undefined ? (
          <TabsContent value="rawHtml">
            <CodeBox content={String(d.rawHtml)} />
          </TabsContent>
        ) : null}
        {Array.isArray(d.links) ? (
          <TabsContent value="links">
            <CodeBox content={(d.links as string[]).join("\n")} />
          </TabsContent>
        ) : null}
        {Array.isArray(d.images) ? (
          <TabsContent value="images">
            <CodeBox content={(d.images as string[]).join("\n")} />
          </TabsContent>
        ) : null}
        <TabsContent value="metadata">
          <CodeBox content={JSON.stringify(metadata ?? {}, null, 2)} />
        </TabsContent>
        <TabsContent value="raw">
          <CodeBox content={JSON.stringify(d, null, 2)} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CodeBox({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={copy}
        className="text-muted-foreground hover:text-foreground absolute right-2 top-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors"
      >
        {copied ? (
          <>
            <Check className="size-3" /> Copied
          </>
        ) : (
          <>
            <Copy className="size-3" /> Copy
          </>
        )}
      </button>
      <pre className="border-border/60 bg-background/60 max-h-[500px] overflow-auto rounded-md border p-4 font-mono text-[12px] leading-relaxed">
        <code>{content || "(Empty)"}</code>
      </pre>
    </div>
  );
}
