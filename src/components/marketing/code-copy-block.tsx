"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";

export function CodeCopyBlock({
  code,
  label,
  icon,
  className,
  heading,
  description,
}: {
  code: string;
  label: string;
  icon?: React.ReactNode;
  className?: string;
  heading: React.ReactNode;
  description: string;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      className={cn(
        "border-border/60 bg-card/30 flex flex-col rounded-xl border",
        className,
      )}
    >
      <div className="px-6 pt-6 pb-2">
        <div className="text-muted-foreground mb-4 inline-flex items-center gap-2 text-xs">
          {icon}
          <span>{label}</span>
        </div>
        <h3 className="text-lg font-medium">{heading}</h3>
        <p className="text-muted-foreground mt-2 max-w-sm text-sm leading-relaxed">
          {description}
        </p>
      </div>

      <div className="mt-6 flex-1" />

      <div className="border-border/60 flex items-center justify-end border-t px-3 py-2">
        <button
          type="button"
          onClick={copy}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors"
        >
          {copied ? (
            <>
              <Check className="size-3.5" /> Copied
            </>
          ) : (
            <>
              <Copy className="size-3.5" /> Copy
            </>
          )}
        </button>
      </div>
      <pre className="border-border/60 bg-background/60 overflow-x-auto border-t p-5 font-mono text-[13px] leading-relaxed">
        <code>
          {code.split("\n").map((line, i) => (
            <span key={i} className="flex gap-4">
              <span className="text-muted-foreground/40 w-5 shrink-0 select-none text-right">
                {i + 1}
              </span>
              <span className="whitespace-pre">{line}</span>
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
