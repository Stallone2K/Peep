"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Copy, Eye, EyeOff, KeyRound } from "lucide-react";

import { WidgetCard, WidgetHeader } from "@/components/dashboard/widget-card";
import { cn } from "@/lib/utils";

// The dashboard widget shows a masked view of the most recent active
// API key. We never store plaintext — the DB has only prefix + hash —
// so "Show" reveals the prefix, padded out with asterisks. Users who
// need the full plaintext must create a new key from /api-keys (the
// plaintext is shown exactly once there, at creation time).

export function ApiKeyWidget({ prefix }: { prefix: string | null }) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!prefix) {
    return (
      <WidgetCard>
        <WidgetHeader
          title="API Key"
          subtitle="Start Scraping Right Away"
        />
        <div className="flex flex-col items-start gap-3 px-6 pb-6">
          <p className="text-muted-foreground text-sm">
            You Don&apos;t Have An API Key Yet. Create One To Start Making
            Requests.
          </p>
          <Link
            href="/dashboard/api-keys"
            className="text-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-3 py-1.5 text-xs font-medium transition-colors"
          >
            <KeyRound className="size-3.5" />
            Create API Key
          </Link>
        </div>
      </WidgetCard>
    );
  }

  const p = prefix;
  // Example display: peep_live_abcd1234********************************
  const display = visible
    ? `${p}${"*".repeat(Math.max(0, 53 - p.length))}`
    : `${p.slice(0, 6)}${"*".repeat(28)}${p.slice(-4)}`;

  function copy() {
    void navigator.clipboard.writeText(p);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <WidgetCard>
      <WidgetHeader title="API Key" subtitle="Start Scraping Right Away" />
      <div className="px-6 pb-6">
        <div className="border-border/60 bg-background/60 flex items-center gap-2 rounded-md border px-3 py-2">
          <code className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-sm text-orange-300">
            {display}
          </code>
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide" : "Show"}
            className="text-muted-foreground hover:text-foreground inline-flex size-7 items-center justify-center rounded transition-colors"
          >
            {visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
          <button
            type="button"
            onClick={copy}
            aria-label="Copy prefix"
            className={cn(
              "inline-flex size-7 items-center justify-center rounded transition-colors",
              copied
                ? "text-emerald-400"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </button>
        </div>
        <Link
          href="/dashboard/api-keys"
          className="text-muted-foreground hover:text-foreground mt-3 inline-flex items-center gap-1 text-xs transition-colors"
        >
          Manage Keys <ArrowRight className="size-3" />
        </Link>
      </div>
    </WidgetCard>
  );
}
