"use client";

import { useEffect, useState } from "react";

import { WidgetCard, WidgetHeader } from "@/components/dashboard/widget-card";

// 7-day sparkline of scraped-page counts, bucketed per day.
// `series` is an array of length `days` with oldest→newest daily totals.
// Labels are populated client-side (useEffect) — Next 16 cacheComponents
// rejects `new Date()` in server-rendered code, even inside a "use
// client" component.
export function ScrapedPagesWidget({
  total,
  series,
  days = 7,
}: {
  total: number;
  series: number[];
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
        <SparklineSvg series={series} />
        <div className="text-muted-foreground mt-2 flex justify-between font-mono text-[11px]">
          <span>{labels[0] || "\u00a0"}</span>
          <span>{labels[Math.floor(days / 2)] || "\u00a0"}</span>
          <span>{labels[days - 1] || "\u00a0"}</span>
        </div>
      </div>
    </WidgetCard>
  );
}

function SparklineSvg({ series }: { series: number[] }) {
  const W = 300;
  const H = 60;
  const PAD_TOP = 6;
  const PAD_BOTTOM = 8;
  const n = series.length;
  const max = Math.max(1, ...series);
  const stepX = n > 1 ? W / (n - 1) : W;

  // Map each datapoint to SVG coordinates. When max == 1 and all zeros,
  // we still want a flat line glued to the baseline (not a degenerate
  // at y=0).
  const points = series.map((v, i) => {
    const x = i * stepX;
    const yRange = H - PAD_TOP - PAD_BOTTOM;
    const y = H - PAD_BOTTOM - (v / max) * yRange;
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");

  const areaPath =
    points.length > 0
      ? `${linePath} L ${W} ${H - PAD_BOTTOM} L 0 ${H - PAD_BOTTOM} Z`
      : "";

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="block h-24 w-full"
      aria-hidden
    >
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(249, 115, 22)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="rgb(249, 115, 22)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Baseline */}
      <line
        x1="0"
        y1={H - PAD_BOTTOM}
        x2={W}
        y2={H - PAD_BOTTOM}
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="1"
      />
      {areaPath ? <path d={areaPath} fill="url(#spark-fill)" /> : null}
      {linePath ? (
        <path
          d={linePath}
          fill="none"
          stroke="rgb(249, 115, 22)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  );
}
