"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

export type CodeSample = {
  label: string;
  language: string;
  code: string;
};

export function CodeTabs({
  samples,
  className,
}: {
  samples: CodeSample[];
  className?: string;
}) {
  const [active, setActive] = useState(samples[0]?.label ?? "");
  const current = samples.find((s) => s.label === active) ?? samples[0];

  return (
    <div
      className={cn(
        "border-border/80 bg-card/50 overflow-hidden rounded-lg border",
        className,
      )}
    >
      <div className="border-border/80 flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-1">
          {samples.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setActive(s.label)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                s.label === current?.label
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <span className="text-muted-foreground font-mono text-xs">
          {current?.language}
        </span>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
        <code>{current?.code}</code>
      </pre>
    </div>
  );
}
