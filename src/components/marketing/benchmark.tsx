import { Flame } from "lucide-react";

import { cn } from "@/lib/utils";

const COMPETITORS = [
  { name: "Peep", pct: 96, brand: true, icon: Flame },
  { name: "Puppeteer", pct: 79 },
  { name: "cURL", pct: 75 },
];

const TIMINGS = [
  { url: "peep.dev/about", crawl: 680, scrape: 660 },
  { url: "peep.dev/faq", crawl: 776, scrape: 741 },
  { url: "peep.dev/careers", crawl: 750, scrape: 740 },
  { url: "peep.dev/features", crawl: 714, scrape: 756 },
  { url: "peep.dev/support", crawl: 702, scrape: 756 },
];

export function Benchmark() {
  return (
    <div className="grid gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60 md:grid-cols-2">
      {/* Left: comparison bars */}
      <div className="bg-background space-y-4 p-8">
        {COMPETITORS.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.name} className="flex items-center gap-4">
              <div className="flex w-32 items-center gap-2.5">
                <span
                  className={cn(
                    "border-border/60 bg-card flex size-8 items-center justify-center rounded-lg border",
                  )}
                >
                  {Icon ? (
                    <Icon className="size-4 fill-orange-500 text-orange-500" />
                  ) : (
                    <span className="text-muted-foreground font-mono text-xs">
                      { }
                    </span>
                  )}
                </span>
                <span className="text-sm font-medium">{c.name}</span>
              </div>
              <div className="bg-muted/40 relative h-7 flex-1 overflow-hidden rounded-md">
                <div
                  className={cn(
                    "flex h-full items-center justify-end pr-3 text-xs font-medium",
                    c.brand
                      ? "bg-orange-500 text-black"
                      : "bg-muted text-foreground",
                  )}
                  style={{ width: `${c.pct}%` }}
                >
                  {c.pct}%
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Right: URL timings table */}
      <div className="bg-background p-6">
        <div className="text-muted-foreground mb-3 grid grid-cols-[1fr_auto_auto] gap-6 border-b border-border/40 pb-2 font-mono text-[10px] uppercase tracking-wider">
          <span>URL</span>
          <span className="text-right">Crawl</span>
          <span className="text-right">Scrape</span>
        </div>
        <ul className="divide-border/40 divide-y">
          {TIMINGS.map((t) => (
            <li
              key={t.url}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-6 py-2.5 font-mono text-[13px]"
            >
              <span className="text-muted-foreground truncate">{t.url}</span>
              <span className="text-right text-orange-400">
                {t.crawl}
                <span className="text-muted-foreground/60"> ms</span>
              </span>
              <span className="text-right text-orange-400">
                {t.scrape}
                <span className="text-muted-foreground/60"> ms</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
