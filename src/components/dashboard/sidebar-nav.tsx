"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Antenna,
  BadgeDollarSign,
  ChevronDown,
  ChevronLeft,
  FileText,
  Globe,
  HardHat,
  KeyRound,
  LampDesk,
  MousePointer,
  Search,
  Settings,
  Telescope,
} from "lucide-react";
import type { ComponentType } from "react";

import { Logo } from "@/components/marketing/logo";
import { cn } from "@/lib/utils";

type Item = {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  badge?: string;
  disabled?: boolean;
  expandable?: boolean;
};

type Section = {
  label?: string;
  items: Item[];
};

const SECTIONS: Section[] = [
  {
    items: [{ label: "Overview", href: "/dashboard", icon: LampDesk }],
  },
  {
    label: "Playground",
    items: [
      {
        label: "Search The Web",
        href: "/dashboard/playground/search",
        icon: Search,
      },
      {
        label: "Scrape A Web Page",
        href: "/dashboard/playground/scrape",
        icon: Telescope,
      },
      {
        label: "Interact With A Page",
        href: "/dashboard/playground/interact",
        icon: MousePointer,
        badge: "NEW",
      },
      {
        label: "Crawl Entire Website",
        href: "/dashboard/playground/crawl",
        icon: Globe,
        expandable: true,
      },
    ],
  },
  {
    label: "Research Preview",
    items: [
      {
        label: "Agent",
        href: "/dashboard/agent",
        icon: HardHat,
      },
    ],
  },
  {
    label: "Account",
    items: [
      {
        label: "Activity Logs",
        href: "/dashboard/activity-logs",
        icon: Antenna,
      },
      { label: "Usage", href: "/dashboard/usage", icon: BadgeDollarSign },
      { label: "API Keys", href: "/dashboard/api-keys", icon: KeyRound },
      { label: "Settings", href: "/dashboard/settings", icon: Settings },
    ],
  },
];

export function SidebarNav({
  userEmail,
  userName,
  userImage,
}: {
  userEmail: string | null | undefined;
  userName?: string | null;
  userImage?: string | null;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="border-border/60 bg-background sticky top-0 flex h-screen w-60 shrink-0 flex-col self-start border-r">
      <div className="border-border/60 flex h-14 items-center border-b px-4">
        <Link href="/" aria-label="Peep Home">
          <Logo />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {SECTIONS.map((section, si) => (
          <div key={si} className={si === 0 ? "" : "mt-6"}>
            {section.label ? (
              <div className="text-muted-foreground/70 mb-2 px-2 font-mono text-[10px] uppercase tracking-wider">
                {section.label}
              </div>
            ) : null}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.disabled ? "#" : item.href}
                      aria-disabled={item.disabled || undefined}
                      onClick={
                        item.disabled ? (e) => e.preventDefault() : undefined
                      }
                      className={cn(
                        "group/item flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                        active
                          ? "bg-orange-500/10 text-orange-300"
                          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                        item.disabled && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      {item.badge ? (
                        <span className="rounded bg-orange-500/20 px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider text-orange-300">
                          {item.badge}
                        </span>
                      ) : null}
                      {item.expandable ? (
                        <ChevronDown
                          aria-hidden
                          className="size-3.5 opacity-50"
                        />
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-border/60 mt-auto border-t p-3">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground mb-2 inline-flex w-full items-center justify-between rounded-md px-2 py-2 text-sm transition-colors"
        >
          <span className="inline-flex items-center gap-2">
            <FileText className="size-4" />
            <span>What&apos;s New</span>
          </span>
          {/* Pulsing dot when there are unseen changelog entries. Kept
              silent until we have a real changelog feed. */}
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-orange-500 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-orange-500" />
          </span>
        </button>

        <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
          <div className="bg-muted flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium">
            {userImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={userImage}
                alt=""
                className="size-full rounded-full object-cover"
              />
            ) : (
              (userName?.[0] ?? userEmail?.[0] ?? "?").toUpperCase()
            )}
          </div>
          <span className="min-w-0 flex-1 truncate text-xs">
            {userEmail ?? "Signed Out"}
          </span>
        </div>

        <button
          type="button"
          className="text-muted-foreground hover:text-foreground mt-2 inline-flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors"
        >
          <ChevronLeft className="size-3.5" />
          <span>Collapse</span>
        </button>
      </div>
    </aside>
  );
}

