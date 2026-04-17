import Link from "next/link";
import { Globe, MousePointer, Search, Telescope } from "lucide-react";

import { cn } from "@/lib/utils";

type Endpoint = {
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  badge?: string;
};

const ENDPOINTS: Endpoint[] = [
  {
    name: "Search",
    description: "Search The Web And Get Full Content From Results.",
    icon: Search,
    href: "/dashboard/playground/search",
  },
  {
    name: "Scrape",
    description:
      "Get LLM-Ready Data From Websites. Markdown, JSON, Screenshot, And More.",
    icon: Telescope,
    href: "/dashboard/playground/scrape",
  },
  {
    name: "Interact",
    description: "Scrape A Page, Then Interact With It Using AI Prompts Or Code.",
    icon: MousePointer,
    href: "/dashboard/playground/interact",
    badge: "NEW",
  },
  {
    name: "Crawl",
    description:
      "Crawl All The Pages On A Website And Get Data For Each Page.",
    icon: Globe,
    href: "/dashboard/playground/crawl",
  },
];

export function ExploreEndpoints() {
  return (
    <div className="border-border/60 bg-card/20 rounded-lg border">
      <div className="px-6 pt-5 pb-4">
        <h2 className="text-lg font-medium">Explore Our Endpoints</h2>
        <p className="text-muted-foreground mt-0.5 text-xs">
          Power Your Applications With Our Comprehensive Scraping API.
        </p>
      </div>
      <div className="border-border/60 grid border-t md:grid-cols-2 lg:grid-cols-4">
        {ENDPOINTS.map((e, i) => {
          const Icon = e.icon;
          return (
            <Link
              key={e.name}
              href={e.href}
              className={cn(
                "group/card flex flex-col gap-2 p-5 transition-colors hover:bg-card/40",
                i > 0 && "lg:border-l",
                i === 2 && "md:border-l lg:border-l",
                "border-border/60",
                i > 1 && "md:border-t lg:border-t-0",
              )}
            >
              <Icon className="text-muted-foreground size-4" />
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{e.name}</span>
                {e.badge ? (
                  <span className="rounded bg-orange-500/15 px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider text-orange-300">
                    {e.badge}
                  </span>
                ) : null}
              </div>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {e.description}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
