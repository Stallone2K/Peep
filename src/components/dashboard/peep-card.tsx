import type { PlanTier } from "@prisma/client";

import { PLAN_SPEC } from "@/lib/plans";

// Peep Card — metallic "credit card" for the Usage page.
// Visual language lifted from Khabri's card; swapped silver Credits
// number for orange to match Peep's brand accent.
export function PeepCard({
  userId,
  name,
  email,
  creditBalance,
  planTier,
  memberSince,
}: {
  userId: string;
  name: string | null;
  email: string | null;
  creditBalance: number;
  planTier: PlanTier;
  memberSince: Date;
}) {
  const cardNumber = formatAsCardNumber(userId);
  const holderName = (name || email || "Peep User").toUpperCase();
  const memberSinceStr = memberSince.toLocaleDateString("en-US", {
    month: "2-digit",
    year: "2-digit",
  });
  const planName = PLAN_SPEC[planTier].name;

  return (
    <div className="relative mx-auto aspect-[1.586/1] w-full max-w-xl select-none overflow-hidden rounded-2xl border border-zinc-400/40">
      {/* Platinum metallic base — Amex Platinum palette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, #8a8d93 0%, #c8ccd1 25%, #e5e7eb 50%, #a3a7ad 75%, #6b6e74 100%)",
        }}
      />

      {/* Diagonal sheen slash */}
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          background:
            "linear-gradient(135deg, transparent 40%, #f4f4f5 50%, transparent 60%)",
        }}
      />

      {/* Bottom metallic edge */}
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-zinc-700/15 to-transparent" />

      {/* Content */}
      <div className="relative flex h-full flex-col justify-between p-6 md:p-7">
        {/* Top row: chip + wordmark */}
        <div className="flex items-start justify-between">
          <SilverChip />
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="inline-block size-8 rounded-full bg-zinc-900"
            />
            <span className="bg-gradient-to-b from-zinc-800 to-zinc-600 bg-clip-text text-3xl font-semibold tracking-tight text-transparent">
              Peep
            </span>
          </div>
        </div>

        {/* Card number */}
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-widest text-zinc-600">
            Card Number
          </p>
          <p className="bg-gradient-to-r from-zinc-800 to-zinc-600 bg-clip-text font-mono text-lg tracking-[0.15em] text-transparent md:text-xl">
            {cardNumber}
          </p>
        </div>

        {/* Bottom row */}
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0 space-y-0.5">
            <p className="text-[9px] uppercase tracking-widest text-zinc-600">
              Card Holder
            </p>
            <p className="truncate text-sm font-medium tracking-wide text-zinc-800">
              {holderName}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[9px] uppercase tracking-widest text-zinc-600">
              Plan
            </p>
            <p className="font-mono text-sm text-zinc-700">{planName}</p>
          </div>
          <div className="text-center">
            <p className="text-[9px] uppercase tracking-widest text-zinc-600">
              Since
            </p>
            <p className="font-mono text-sm text-zinc-700">{memberSinceStr}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-widest text-zinc-600">
              Credits
            </p>
            <p className="bg-gradient-to-b from-orange-600 to-orange-800 bg-clip-text font-mono text-lg font-semibold tabular-nums text-transparent">
              {creditBalance.toLocaleString()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatAsCardNumber(id: string): string {
  const cleaned = id
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .padEnd(16, "0")
    .slice(0, 16);
  return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 8)} ${cleaned.slice(8, 12)} ${cleaned.slice(12, 16)}`;
}

function SilverChip() {
  return (
    <svg
      width="52"
      height="40"
      viewBox="0 0 36 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect
        x="0.5"
        y="0.5"
        width="35"
        height="27"
        rx="3.5"
        fill="url(#peep-chip-gold)"
        stroke="#8a6a1f"
        strokeWidth="0.5"
      />
      <line x1="12" y1="0" x2="12" y2="28" stroke="#8a6a1f" strokeWidth="0.5" opacity="0.55" />
      <line x1="24" y1="0" x2="24" y2="28" stroke="#8a6a1f" strokeWidth="0.5" opacity="0.55" />
      <line x1="0" y1="9" x2="36" y2="9" stroke="#8a6a1f" strokeWidth="0.5" opacity="0.55" />
      <line x1="0" y1="19" x2="36" y2="19" stroke="#8a6a1f" strokeWidth="0.5" opacity="0.55" />
      <rect
        x="12"
        y="9"
        width="12"
        height="10"
        rx="1"
        fill="none"
        stroke="#8a6a1f"
        strokeWidth="0.5"
        opacity="0.75"
      />
      <defs>
        <linearGradient
          id="peep-chip-gold"
          x1="0"
          y1="0"
          x2="36"
          y2="28"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#8a6a1f" />
          <stop offset="0.3" stopColor="#c9a24a" />
          <stop offset="0.5" stopColor="#f2d98a" />
          <stop offset="0.7" stopColor="#c9a24a" />
          <stop offset="1" stopColor="#8a6a1f" />
        </linearGradient>
      </defs>
    </svg>
  );
}
