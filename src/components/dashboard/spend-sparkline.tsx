"use client";

// Two-series sparkline used on the Usage page: orange = credits spent,
// emerald = credits granted, with a shared x-axis (one point per day).
// Accepts the exact shape returned by
// GET /api/dashboard/credit-usage/historical.
export function SpendSparkline({
  series,
}: {
  series: { date: string; spent: number; granted: number }[];
}) {
  const W = 600;
  const H = 100;
  const PAD_TOP = 8;
  const PAD_BOTTOM = 12;

  const n = series.length;
  const values = series.flatMap((s) => [s.spent, s.granted]);
  const max = Math.max(1, ...values);
  const stepX = n > 1 ? W / (n - 1) : W;
  const yRange = H - PAD_TOP - PAD_BOTTOM;

  function pathFor(key: "spent" | "granted") {
    return series
      .map((s, i) => {
        const x = i * stepX;
        const y = H - PAD_BOTTOM - (s[key] / max) * yRange;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="block h-32 w-full"
      aria-hidden
    >
      <line
        x1="0"
        y1={H - PAD_BOTTOM}
        x2={W}
        y2={H - PAD_BOTTOM}
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="1"
      />
      <path
        d={pathFor("granted")}
        fill="none"
        stroke="rgb(52, 211, 153)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={pathFor("spent")}
        fill="none"
        stroke="rgb(249, 115, 22)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
