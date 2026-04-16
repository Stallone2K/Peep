"use client";

import { useEffect, useState } from "react";

import { WidgetCard, WidgetHeader } from "@/components/dashboard/widget-card";

// Placeholder chart. When Phase 3 lands, replace the static <SparklineSvg />
// with real daily totals queried from ScrapeJob.createdAt over the last
// 7 days, binned per day.
//
// Labels are computed client-side (useEffect) because Next 16
// cacheComponents rejects `new Date()` during server-rendering, even
// inside "use client" components (they still SSR the first paint).
export function ScrapedPagesWidget({
  total,
  days = 7,
}: {
  total: number;
  days?: number;
}) {
  const [labels, setLabels] = useState<string[]>(() => Array(days).fill(""));

  useEffect(() => {
    const today = new Date();
    setLabels(
      Array.from({ length: days }).map((_, i) => {
        const d = new Date(today);
        d.setDate(d.getDate() - (days - 1 - i));
        return `${(d.getMonth() + 1).toString().padStart(2, "0")}/${d
          .getDate()
          .toString()
          .padStart(2, "0")}`;
      }),
    );
  }, [days]);

  return (
    <WidgetCard>
      <WidgetHeader
        title={`Scraped Pages — Last ${days} Days`}
        subtitle="Credit Usage Differs"
        trailing={
          <div className="text-3xl font-mono font-medium">
            {total.toLocaleString()}
          </div>
        }
      />
      <div className="relative flex-1 px-6 pb-6">
        <SparklineSvg />
        <div className="text-muted-foreground mt-2 flex justify-between font-mono text-[11px]">
          <span>{labels[0] || "\u00a0"}</span>
          <span>{labels[Math.floor(days / 2)] || "\u00a0"}</span>
          <span>{labels[days - 1] || "\u00a0"}</span>
        </div>
      </div>
    </WidgetCard>
  );
}

function SparklineSvg() {
  return (
    <svg
      viewBox="0 0 300 60"
      preserveAspectRatio="none"
      className="block h-24 w-full"
      aria-hidden
    >
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(249, 115, 22)" stopOpacity="0.12" />
          <stop offset="100%" stopColor="rgb(249, 115, 22)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line
        x1="0"
        y1="55"
        x2="300"
        y2="55"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="1"
      />
      <path d="M 0 55 L 300 55 L 300 60 L 0 60 Z" fill="url(#spark-fill)" />
      <line
        x1="0"
        y1="55"
        x2="300"
        y2="55"
        stroke="rgb(249, 115, 22)"
        strokeWidth="1.5"
      />
    </svg>
  );
}
