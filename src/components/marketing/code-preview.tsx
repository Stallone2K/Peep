"use client";

import { useState } from "react";
import { Check, Code2, Copy, FileCode, Terminal } from "lucide-react";

import { cn } from "@/lib/utils";

type Tab = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  code: string;
};

const TABS: Tab[] = [
  {
    label: "Python",
    icon: FileCode,
    code: `# pip install peep
from peep import Peep

peep = Peep(api_key="peep_live_...")

# Scrape a website:
peep.scrape("peep.dev")`,
  },
  {
    label: "Node.js",
    icon: Code2,
    code: `// npm i @peep/sdk
import { Peep } from "@peep/sdk";

const peep = new Peep({ apiKey: "peep_live_..." });

// Scrape a website:
await peep.scrape("peep.dev");`,
  },
  {
    label: "cURL",
    icon: Terminal,
    code: `curl -X POST https://api.peep.dev/v1/scrape \\
  -H "Authorization: Bearer peep_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"url":"peep.dev","formats":["markdown"]}'`,
  },
  {
    label: "CLI",
    icon: Terminal,
    code: `# npm i -g @peep/cli
peep scrape peep.dev --format markdown`,
  },
];

const MARKDOWN_PREVIEW = `# Peep

Peep Helps AI Systems Search, Scrape,
And Extract From Any Website.

## Features

- Search: Find Information Across The Web
- Scrape: Clean Data From Any Page
- Crawl: Walk Whole Sites With Filters
- Extract: Typed JSON With A Schema`;

export function CodePreview() {
  const [active, setActive] = useState(TABS[0].label);
  const [copied, setCopied] = useState(false);
  const current = TABS.find((t) => t.label === active) ?? TABS[0];

  function copy() {
    void navigator.clipboard.writeText(current.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="border-border/60 bg-card/30 overflow-hidden rounded-xl border">
      {/* Tab bar */}
      <div className="border-border/60 flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = t.label === active;
            return (
              <button
                key={t.label}
                type="button"
                onClick={() => setActive(t.label)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-pressed={isActive}
              >
                <Icon className="size-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={copy}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors"
        >
          {copied ? (
            <>
              <Check className="size-3.5" /> Copied
            </>
          ) : (
            <>
              <Copy className="size-3.5" /> Copy Code
            </>
          )}
        </button>
      </div>

      {/* Panes */}
      <div className="grid gap-px bg-border/60 md:grid-cols-2">
        <pre className="bg-background overflow-x-auto p-5 font-mono text-[13px] leading-relaxed">
          <code>
            {current.code.split("\n").map((line, i) => (
              <span key={i} className="flex gap-4">
                <span className="text-muted-foreground/40 w-6 shrink-0 select-none text-right">
                  {i + 1}
                </span>
                <span className="whitespace-pre">{line}</span>
              </span>
            ))}
          </code>
        </pre>
        <div className="bg-background relative">
          <div className="text-muted-foreground/60 border-border/50 absolute top-0 right-0 z-10 rounded-bl-md border-b border-l px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider">
            [ .MD ]
          </div>
          <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed">
            <code>
              {MARKDOWN_PREVIEW.split("\n").map((line, i) => (
                <span key={i} className="flex gap-4">
                  <span className="text-muted-foreground/40 w-6 shrink-0 select-none text-right">
                    {i + 1}
                  </span>
                  <span className="whitespace-pre">{line}</span>
                </span>
              ))}
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
}
