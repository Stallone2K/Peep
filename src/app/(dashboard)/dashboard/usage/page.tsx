import { Suspense } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  WidgetCard,
  WidgetHeader,
} from "@/components/dashboard/widget-card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Usage",
};

export default function UsagePage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usage</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Credit Balance And Recent Ledger Activity.
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

  const [user, ledger] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user.id },
      select: { creditBalance: true, planTier: true },
    }),
    db.creditLedger.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  if (!user) redirect("/sign-in");

  // Totals since creation — cheap for now; when the ledger grows we'll
  // want period-scoped queries (last 30 days, etc.).
  const grants = ledger.filter((r) => r.delta > 0).reduce((a, r) => a + r.delta, 0);
  const spends = ledger
    .filter((r) => r.delta < 0)
    .reduce((a, r) => a + Math.abs(r.delta), 0);

  return (
    <>
      <div className="grid gap-6 md:grid-cols-3">
        <Stat label="Current Balance" value={user.creditBalance.toLocaleString()} />
        <Stat label="Plan" value={user.planTier} />
        <Stat
          label="Spent (All Time)"
          value={spends.toLocaleString()}
          muted
        />
      </div>

      <WidgetCard>
        <WidgetHeader
          title="Ledger"
          subtitle="Last 50 Credit Movements. Grants Show As +, Spends As -."
          trailing={
            <span className="text-muted-foreground font-mono text-xs">
              +{grants.toLocaleString()} Granted · -{spends.toLocaleString()} Spent
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
      <div className="grid gap-6 md:grid-cols-3">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
      <Skeleton className="h-64 rounded-lg" />
    </>
  );
}
