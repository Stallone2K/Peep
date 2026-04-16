"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Globe, Link2, Map, Network, Search } from "lucide-react";

import { cn } from "@/lib/utils";

type Mode = "Search" | "Scrape" | "Map" | "Crawl";

const MODES: { name: Mode; icon: React.ComponentType<{ className?: string }> }[] = [
  { name: "Search", icon: Search },
  { name: "Scrape", icon: Link2 },
  { name: "Map", icon: Map },
  { name: "Crawl", icon: Network },
];

export function UrlHeroInput() {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<Mode>("Scrape");
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.push("/sign-in");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-border/70 bg-card/60 shadow-2xl shadow-black/30 flex w-full flex-col gap-3 rounded-2xl border p-3 backdrop-blur"
    >
      <div className="flex items-center gap-2 px-2">
        <Globe className="text-muted-foreground size-4 shrink-0" />
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          className="placeholder:text-muted-foreground flex-1 bg-transparent py-2 text-base outline-none"
        />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-1">
          {MODES.map((m) => {
            const Icon = m.icon;
            const active = mode === m.name;
            return (
              <button
                key={m.name}
                type="button"
                onClick={() => setMode(m.name)}
                className={cn(
                  "group/mode inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "border-orange-500/50 bg-orange-500/15 text-orange-200"
                    : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                aria-pressed={active}
              >
                <Icon className="size-3.5" />
                <span>{m.name}</span>
              </button>
            );
          })}
        </div>
        <button
          type="submit"
          aria-label={`Run ${mode}`}
          className="inline-flex size-9 items-center justify-center rounded-lg bg-orange-500 text-black transition-colors hover:bg-orange-400"
        >
          <ArrowRight className="size-4" />
        </button>
      </div>
    </form>
  );
}
