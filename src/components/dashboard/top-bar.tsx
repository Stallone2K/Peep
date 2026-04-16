import Link from "next/link";
import {
  ArrowUpRight,
  Bell,
  BookOpen,
  ChevronDown,
  HelpCircle,
  Monitor,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export function TopBar({ teamName }: { teamName: string }) {
  return (
    <div className="border-border/60 bg-background/80 sticky top-0 z-30 flex h-14 items-center justify-between border-b px-6 backdrop-blur">
      <button
        type="button"
        className="border-border/60 bg-card/50 hover:bg-card text-foreground inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm transition-colors"
      >
        <span className="bg-orange-500 text-black inline-flex size-5 items-center justify-center rounded font-mono text-[10px] font-bold uppercase">
          {teamName[0]?.toUpperCase() ?? "P"}
        </span>
        <span className="font-medium">{teamName}</span>
        <ChevronDown className="text-muted-foreground size-3.5" />
      </button>

      <div className="flex items-center gap-1">
        <IconButton ariaLabel="Notifications">
          <Bell className="size-4" />
        </IconButton>
        <IconButton ariaLabel="Display">
          <Monitor className="size-4" />
        </IconButton>
        <LabelButton href="/docs/help" icon={HelpCircle}>
          Help
        </LabelButton>
        <LabelButton href="/docs" icon={BookOpen}>
          Docs
        </LabelButton>
        <Link
          href="/pricing"
          className={cn(
            buttonVariants({ size: "sm" }),
            "bg-orange-500 text-black hover:bg-orange-400 gap-1.5 ml-1",
          )}
        >
          <ArrowUpRight className="size-3.5" />
          <span className="font-medium">Upgrade</span>
        </Link>
      </div>
    </div>
  );
}

function IconButton({
  children,
  ariaLabel,
}: {
  children: React.ReactNode;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className="text-muted-foreground hover:text-foreground hover:bg-muted/40 inline-flex size-8 items-center justify-center rounded-md transition-colors"
    >
      {children}
    </button>
  );
}

function LabelButton({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="text-muted-foreground hover:text-foreground hover:bg-muted/40 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors"
    >
      <Icon className="size-4" />
      <span>{children}</span>
    </Link>
  );
}
