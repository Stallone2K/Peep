import type { Metadata } from "next";

import { CHANGELOG, type ChangelogEntry } from "@/lib/changelog";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Changelog — Peep",
  description: "What's new in Peep — features, improvements, and fixes.",
};

const TAG_STYLE: Record<ChangelogEntry["tags"][number], string> = {
  New: "bg-orange-500/15 text-orange-300 ring-orange-500/30",
  Improved: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  Fixed: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  Security: "bg-red-500/15 text-red-300 ring-red-500/30",
};

export default function ChangelogPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <header className="mb-12">
        <h1 className="text-3xl font-semibold tracking-tight">Changelog</h1>
        <p className="text-muted-foreground mt-2">
          New features, improvements, and fixes — newest first.
        </p>
      </header>

      <div className="flex flex-col gap-12">
        {CHANGELOG.map((entry, i) => (
          <article key={i} className="relative flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <time className="text-muted-foreground font-mono text-xs">
                {new Date(entry.date + "T00:00:00").toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>
              {entry.tags.map((t) => (
                <span
                  key={t}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                    TAG_STYLE[t],
                  )}
                >
                  {t}
                </span>
              ))}
            </div>
            <h2 className="text-xl font-semibold tracking-tight">
              {entry.title}
            </h2>
            <ul className="text-muted-foreground flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-7">
              {entry.items.map((it, j) => (
                <li key={j}>{it}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}
