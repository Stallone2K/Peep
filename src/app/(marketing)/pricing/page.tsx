import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";

import { PLAN_SPEC } from "@/lib/plans";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pricing — Peep",
  description: "Simple, credit-based pricing for the Peep web scraping API.",
};

const ORDER = ["FREE", "HOBBY", "STANDARD", "GROWTH", "SCALE", "ENTERPRISE"] as const;
const HIGHLIGHT = "STANDARD";

const FEATURES: Record<string, string[]> = {
  FREE: ["All endpoints", "Community support", "Fair-use rate limits"],
  HOBBY: ["Everything in Free", "Higher rate limits", "Email support"],
  STANDARD: ["Everything in Hobby", "Stealth proxy add-on", "Priority support"],
  GROWTH: ["Everything in Standard", "Higher concurrency", "SLA on request"],
  SCALE: ["Everything in Growth", "Max concurrency", "Dedicated support"],
  ENTERPRISE: ["Custom credits & limits", "SSO / ZDR", "Dedicated engineer"],
};

function fmt(v: number | "custom"): string {
  if (v === "custom") return "Custom";
  return v.toLocaleString();
}

export default function PricingPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-16">
      <header className="mb-12 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">Pricing</h1>
        <p className="text-muted-foreground mx-auto mt-3 max-w-xl">
          Credit-based, no surprises. Every account starts with{" "}
          <strong>500 free credits</strong> on the Peep Card. Scale up when you
          need more.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {ORDER.map((tier) => {
          const spec = PLAN_SPEC[tier];
          const featured = tier === HIGHLIGHT;
          return (
            <div
              key={tier}
              className={cn(
                "flex flex-col rounded-xl border p-6",
                featured
                  ? "border-orange-500/50 bg-orange-500/[0.04]"
                  : "border-border/60 bg-card/20",
              )}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{spec.name}</h2>
                {featured ? (
                  <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[11px] font-medium text-orange-300">
                    Popular
                  </span>
                ) : null}
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-semibold tracking-tight">
                  {spec.priceUsd === "custom"
                    ? "Custom"
                    : spec.priceUsd === 0
                      ? "$0"
                      : `$${spec.priceUsd}`}
                </span>
                {typeof spec.priceUsd === "number" && spec.priceUsd > 0 ? (
                  <span className="text-muted-foreground text-sm">/mo</span>
                ) : null}
              </div>

              <dl className="text-muted-foreground mt-5 flex flex-col gap-1.5 text-sm">
                <Stat label="Credits / mo" value={fmt(spec.monthlyCredits)} />
                <Stat label="Concurrent browsers" value={fmt(spec.concurrentBrowsers)} />
                <Stat label="Requests / min" value={fmt(spec.requestsPerMinute)} />
              </dl>

              <ul className="mt-5 flex flex-1 flex-col gap-2 text-sm">
                {(FEATURES[tier] ?? []).map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-orange-400" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={
                  tier === "ENTERPRISE"
                    ? "mailto:dev@shownomore.com?subject=Peep%20Enterprise"
                    : "/sign-in"
                }
                className={cn(
                  buttonVariants({ size: "sm" }),
                  "mt-6 w-full",
                  featured
                    ? "bg-orange-500 text-black hover:bg-orange-400"
                    : "",
                )}
              >
                {tier === "FREE"
                  ? "Start Free"
                  : tier === "ENTERPRISE"
                    ? "Contact Sales"
                    : "Get Started"}
              </Link>
            </div>
          );
        })}
      </div>

      <p className="text-muted-foreground/70 mt-10 text-center text-sm">
        Credit costs: scrape 1 · map 1 · search 2/10 results · extract 5/URL ·
        crawl &amp; batch 1/page · +4 for AI or stealth. See the{" "}
        <Link href="/docs/credits" className="text-orange-400 hover:underline">
          docs
        </Link>
        .
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt>{label}</dt>
      <dd className="text-foreground font-medium">{value}</dd>
    </div>
  );
}
