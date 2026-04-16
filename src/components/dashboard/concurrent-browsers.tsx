import Link from "next/link";

import { WidgetCard, WidgetHeader } from "@/components/dashboard/widget-card";

// Placeholder. Phase 4 will wire this up to Redis — live count of
// Playwright contexts currently leased by this user's plan tier.
export function ConcurrentBrowsers({
  active,
  cap,
}: {
  active: number;
  cap: number;
}) {
  return (
    <WidgetCard>
      <WidgetHeader
        title={
          <>
            Concurrent Browsers{" "}
            <span className="ml-1 inline-flex items-center gap-1 rounded-md bg-orange-500/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-orange-300">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-orange-500 opacity-60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-orange-500" />
              </span>
              Live
            </span>
          </>
        }
        subtitle={
          <>
            # Of Active Browsers —{" "}
            <Link
              href="/pricing"
              className="text-foreground underline decoration-dotted underline-offset-2"
            >
              Upgrade Plan
            </Link>{" "}
            For Faster Scraping.
          </>
        }
      />
      <div className="flex items-center gap-4 px-6 pb-6">
        <div className="border-border/60 flex size-12 items-center justify-center rounded-full border font-mono text-lg">
          {active}
        </div>
        <div className="text-muted-foreground text-sm">
          Of{" "}
          <span className="text-foreground font-medium">{cap}</span>{" "}
          Active Browsers
        </div>
      </div>
    </WidgetCard>
  );
}
