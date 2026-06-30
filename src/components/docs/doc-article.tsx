import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { DOCS } from "@/lib/docs/registry";
import { DOCS_FLAT, docHref } from "@/lib/docs/nav";

// Renders one docs page by slug: title + description header, the body
// from the registry, and prev/next navigation derived from the flat
// nav order. Shared by the /docs index and the /docs/[slug] route.
export function DocArticle({ slug }: { slug: string }) {
  const entry = DOCS[slug];
  if (!entry) notFound();

  const idx = DOCS_FLAT.findIndex((i) => i.slug === slug);
  const prev = idx > 0 ? DOCS_FLAT[idx - 1] : null;
  const next =
    idx >= 0 && idx < DOCS_FLAT.length - 1 ? DOCS_FLAT[idx + 1] : null;
  const { Body } = entry;

  return (
    <article>
      <header>
        <h1 className="text-foreground text-3xl font-semibold tracking-tight">
          {entry.title}
        </h1>
        <p className="text-muted-foreground mt-2 text-base leading-relaxed">
          {entry.description}
        </p>
      </header>
      <div className="border-border/50 mt-6 mb-2 border-t" />

      <Body />

      <nav className="border-border/50 mt-16 flex items-center justify-between gap-4 border-t pt-6 text-sm">
        {prev ? (
          <Link
            href={docHref(prev.slug)}
            className="text-muted-foreground hover:text-foreground group inline-flex items-center gap-2 transition-colors"
          >
            <ArrowLeft className="size-4" />
            <span>
              <span className="text-muted-foreground/60 block text-xs">
                Previous
              </span>
              {prev.title}
            </span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            href={docHref(next.slug)}
            className="text-muted-foreground hover:text-foreground group inline-flex items-center gap-2 text-right transition-colors"
          >
            <span>
              <span className="text-muted-foreground/60 block text-xs">
                Next
              </span>
              {next.title}
            </span>
            <ArrowRight className="size-4" />
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </article>
  );
}
