import type { ComponentType } from "react";
import { Link2, Network, Search } from "lucide-react";

import { cn } from "@/lib/utils";

type Feature = {
  name: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  badge?: "NEW";
  active?: boolean;
};

const FEATURES: Feature[] = [
  {
    name: "Search",
    description: "Search The Web And Get Full Content From Results.",
    icon: Search,
  },
  {
    name: "Scrape",
    description:
      "Get LLM-Ready Data From Websites. Markdown, JSON, Screenshot, And More.",
    icon: Link2,
    active: true,
  },
  {
    name: "Extract",
    description:
      "Pull Typed JSON From Any URL With A Schema Or A Natural-Language Prompt.",
    icon: Network,
    badge: "NEW",
  },
];

export function FeatureCards() {
  return (
    <div className="grid gap-px overflow-hidden border-y border-border/60 bg-border/60 md:grid-cols-3">
      {FEATURES.map((f) => {
        const Icon = f.icon;
        return (
          <div
            key={f.name}
            className={cn(
              "group relative flex flex-col gap-4 bg-background p-10 transition-colors",
              f.active
                ? "bg-card/60 ring-1 ring-orange-500/30 ring-inset"
                : "hover:bg-card/40",
            )}
          >
            <div className="flex items-center justify-center">
              <Icon
                className={cn(
                  "size-6",
                  f.active ? "text-orange-500" : "text-muted-foreground",
                )}
              />
            </div>
            <div className="flex items-center justify-center gap-2">
              <h3 className="text-base font-medium">{f.name}</h3>
              {f.badge ? (
                <span className="rounded-md bg-orange-500/15 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-orange-300">
                  {f.badge}
                </span>
              ) : null}
            </div>
            <p className="text-muted-foreground text-center text-sm leading-relaxed">
              {f.description}
            </p>
          </div>
        );
      })}
    </div>
  );
}
