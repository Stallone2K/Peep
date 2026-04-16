import type { PlanTier } from "@prisma/client";

// Plan-tier attributes used by the dashboard + worker. Mirrors the
// Firecrawl-parity pricing in PLAN.md §11 / §7 (Phase 9 Stripe).
//
// These are *source of truth* for concurrency caps and monthly credit
// allotments until Stripe lands in Phase 9 — billing logic there will
// cross-reference the same table.

export type PlanSpec = {
  name: string;
  priceUsd: number | "custom";
  monthlyCredits: number | "custom";
  concurrentBrowsers: number | "custom";
  requestsPerMinute: number | "custom";
};

export const PLAN_SPEC: Record<PlanTier, PlanSpec> = {
  FREE: {
    name: "Free",
    priceUsd: 0,
    monthlyCredits: 500,
    concurrentBrowsers: 2,
    requestsPerMinute: 10,
  },
  HOBBY: {
    name: "Hobby",
    priceUsd: 19,
    monthlyCredits: 3_000,
    concurrentBrowsers: 5,
    requestsPerMinute: 60,
  },
  STANDARD: {
    name: "Standard",
    priceUsd: 99,
    monthlyCredits: 100_000,
    concurrentBrowsers: 50,
    requestsPerMinute: 300,
  },
  GROWTH: {
    name: "Growth",
    priceUsd: 399,
    monthlyCredits: 500_000,
    concurrentBrowsers: 100,
    requestsPerMinute: 600,
  },
  SCALE: {
    name: "Scale",
    priceUsd: 749,
    monthlyCredits: 1_000_000,
    concurrentBrowsers: 150,
    requestsPerMinute: 900,
  },
  ENTERPRISE: {
    name: "Enterprise",
    priceUsd: "custom",
    monthlyCredits: "custom",
    concurrentBrowsers: "custom",
    requestsPerMinute: "custom",
  },
};

export function concurrencyCap(tier: PlanTier): number {
  const v = PLAN_SPEC[tier].concurrentBrowsers;
  return typeof v === "number" ? v : 500; // enterprise fallback
}
