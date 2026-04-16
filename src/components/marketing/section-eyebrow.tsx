import type { ComponentType } from "react";

import { cn } from "@/lib/utils";

// `[ 01 / 06 ]  ·  MAIN FEATURES` — numbered section marker with an orange
// accent on the current index. Sits at the top-left of a section.
export function SectionEyebrow({
  index,
  total,
  label,
  className,
}: {
  index: number;
  total: number;
  label: string;
  className?: string;
}) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    <div
      className={cn(
        "text-muted-foreground/70 mb-16 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider",
        className,
      )}
    >
      <span className="bg-orange-500 h-4 w-px" aria-hidden />
      <span>[ </span>
      <span className="text-orange-500">{pad(index)}</span>
      <span> / {pad(total)} ]</span>
      <span className="mx-1">·</span>
      <span>{label}</span>
    </div>
  );
}

// `// 🔧 Developer First //` — centered slash-wrapped eyebrow with icon.
// Sits above a section heading.
export function SlashEyebrow({
  icon: Icon,
  label,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-muted-foreground inline-flex items-center gap-3 text-sm",
        className,
      )}
    >
      <span className="text-muted-foreground/60 font-mono">//</span>
      <span className="inline-flex items-center gap-2">
        <Icon className="size-4 text-orange-500" />
        <span className="text-foreground font-medium">{label}</span>
      </span>
      <span className="text-muted-foreground/60 font-mono">//</span>
    </div>
  );
}
