import { Suspense } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PLAN_SPEC } from "@/lib/plans";
import { SpendSparkline } from "@/components/dashboard/spend-sparkline";
import {
  WidgetCard,
  WidgetHeader,
} from "@/components/dashboard/widget-card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Usage",
};

const SPEND_DAYS = 30;

export default function UsagePage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usage</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Credit Balance, Recent Activity, And A 30-Day Spend Trend.
        </p>
      </div>
      <Suspense fallback={<UsageSkeleton />}>
        <UsageContent />
      </Suspense>
    </div>
  );
}

async function UsageContent() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (SPEND_DAYS - 1));

  const [user, ledger, spendRows] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user.id },
      select: { creditBalance: true, planTier: true },
    }),
    db.creditLedger.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.creditLedger.findMany({
      where: { userId: session.user.id, createdAt: { gte: start } },
      select: { delta: true, createdAt: true },
    }),
  ]);

  if (!user) redirect("/sign-in");

  // Bucket spend / grant per day for the trend chart.
  const buckets = new Map<string, { spent: number; granted: number }>();
  for (let i = 0; i < SPEND_DAYS; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    buckets.set(d.toISOString().slice(0, 10), { spent: 0, granted: 0 });
  }
  let periodSpend = 0;
  let periodGrant = 0;
  for (const r of spendRows) {
    const key = r.createdAt.toISOString().slice(0, 10);
    const b = buckets.get(key);
    if (!b) continue;
    if (r.delta < 0) {
      b.spent += Math.abs(r.delta);
      periodSpend += Math.abs(r.delta);
    } else {
      b.granted += r.delta;
      periodGrant += r.delta;
    }
  }
  const chartSeries = Array.from(buckets.entries()).map(([date, v]) => ({
    date,
    spent: v.spent,
    granted: v.granted,
  }));

  const planSpec = PLAN_SPEC[user.planTier];
  const monthlyAllotment =
    typeof planSpec.monthlyCredits === "number"
      ? planSpec.monthlyCredits
      : null;

  return (
    <>
      <div className="grid gap-6 md:grid-cols-4">
        <Stat label="Current Balance" value={user.creditBalance.toLocaleString()} />
        <Stat label="Plan" value={planSpec.name} />
        <Stat
          label="Monthly Allotment"
          value={
            monthlyAllotment ? monthlyAllotment.toLocaleString() : "Custom"
          }
          muted
        />
        <Stat
          label={`Spent (Last ${SPEND_DAYS} Days)`}
          value={periodSpend.toLocaleString()}
          muted
        />
      </div>

      <WidgetCard>
        <WidgetHeader
          title="Spend Trend"
          subtitle={`Daily Credit Movement Over The Last ${SPEND_DAYS} Days.`}
          trailing={
            <div className="flex items-center gap-4 text-xs">
              <LegendDot color="rgb(52, 211, 153)" label="Granted" />
              <LegendDot color="rgb(249, 115, 22)" label="Spent" />
            </div>
          }
        />
        <div className="px-6 pb-6">
          {chartSeries.length ? (
            <SpendSparkline series={chartSeries} />
          ) : (
            <p className="text-muted-foreground text-sm">No Activity Yet.</p>
          )}
          <div className="text-muted-foreground mt-2 flex justify-between font-mono text-[11px]">
            <span>{formatShort(chartSeries[0]?.date)}</span>
            <span>
              {formatShort(
                chartSeries[Math.floor(chartSeries.length / 2)]?.date,
              )}
            </span>
            <span>{formatShort(chartSeries[chartSeries.length - 1]?.date)}</span>
          </div>
        </div>
      </WidgetCard>

      <WidgetCard>
        <WidgetHeader
          title="Ledger"
          subtitle="Last 50 Credit Movements. Grants Show As +, Spends As -."
          trailing={
            <span className="text-muted-foreground font-mono text-xs">
              +{periodGrant.toLocaleString()} Granted · -
              {periodSpend.toLocaleString()} Spent (Last {SPEND_DAYS}D)
            </span>
          }
        />
        {ledger.length === 0 ? (
          <div className="px-6 pb-10 text-center">
            <p className="text-muted-foreground text-sm">
              No Ledger Activity Yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-border/60 text-muted-foreground border-t">
                <tr>
                  <Th>When</Th>
                  <Th>Reason</Th>
                  <Th>Ref</Th>
                  <Th className="text-right">Delta</Th>
                </tr>
              </thead>
              <tbody className="divide-border/40 divide-y">
                {ledger.map((row) => (
                  <tr key={row.id}>
                    <td className="text-muted-foreground px-4 py-2.5 font-mono text-xs">
                      {row.createdAt.toISOString().slice(0, 19).replace("T", " ")}
                    </td>
                    <td className="px-4 py-2.5">{humanizeReason(row.reason)}</td>
                    <td className="text-muted-foreground px-4 py-2.5 font-mono text-xs">
                      {row.refType
                        ? `${row.refType}${row.refId ? `#${row.refId.slice(0, 10)}` : ""}`
                        : "—"}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2.5 text-right font-mono",
                        row.delta >= 0 ? "text-emerald-400" : "text-orange-300",
                      )}
                    >
                      {row.delta > 0 ? "+" : ""}
                      {row.delta.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WidgetCard>
    </>
  );
}

function humanizeReason(reason: string) {
  switch (reason) {
    case "signup_grant":
      return "Signup Grant";
    case "monthly_grant":
      return "Monthly Grant";
    case "topup":
      return "Top-Up";
    case "scrape":
      return "Scrape";
    case "crawl":
      return "Crawl";
    case "extract":
      return "Extract";
    case "refund":
      return "Refund";
    default:
      return reason;
  }
}

function formatShort(iso: string | undefined) {
  if (!iso) return "\u00a0";
  // iso looks like "YYYY-MM-DD"
  const parts = iso.split("-");
  return `${parts[1]}/${parts[2]}`;
}

function Stat({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="border-border/60 bg-card/20 rounded-lg border px-5 py-4">
      <div className="text-muted-foreground font-mono text-[11px] uppercase tracking-wider">
        {label}
      </div>
      <div
        className={cn(
          "mt-2 font-mono text-2xl",
          muted && "text-muted-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="inline-block size-2 rounded-full"
        style={{ background: color }}
      />
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "px-4 py-2.5 text-left font-mono text-[11px] font-medium uppercase tracking-wider",
        className,
      )}
    >
      {children}
    </th>
  );
}

function UsageSkeleton() {
  return (
    <>
      <div className="grid gap-6 md:grid-cols-4">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
      <Skeleton className="h-48 rounded-lg" />
      <Skeleton className="h-64 rounded-lg" />
    </>
  );
}
