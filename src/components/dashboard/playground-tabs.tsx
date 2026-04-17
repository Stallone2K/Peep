"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { Globe, Map as MapIcon, Search, Telescope } from "lucide-react";

import { cn } from "@/lib/utils";

// Top pill shown on every /dashboard/playground/* page so callers can
// jump between Search / Scrape / Map / Crawl without routing back
// through the sidebar. Icons intentionally match the sidebar's
// Playground section so the two controls feel like one surface.
type Tab = {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
};

const TABS: Tab[] = [
  { label: "Search", href: "/dashboard/playground/search", icon: Search },
  { label: "Scrape", href: "/dashboard/playground/scrape", icon: Telescope },
  { label: "Map", href: "/dashboard/playground/map", icon: MapIcon },
  { label: "Crawl", href: "/dashboard/playground/crawl", icon: Globe },
];

export function PlaygroundTabs() {
  const pathname = usePathname();

  return (
    <div className="flex justify-center">
      <div
        role="tablist"
        aria-label="Playground endpoints"
        className="border-border/60 bg-card/60 inline-flex items-center gap-1 rounded-full border p-1 shadow-sm backdrop-blur-sm"
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active =
            pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              role="tab"
              aria-selected={active}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-muted/60 text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-3.5",
                  active ? "text-orange-400" : "",
                )}
              />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
