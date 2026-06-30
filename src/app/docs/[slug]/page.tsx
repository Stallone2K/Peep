import type { Metadata } from "next";

import { DocArticle } from "@/components/docs/doc-article";
import { DOCS } from "@/lib/docs/registry";
import { DOCS_FLAT } from "@/lib/docs/nav";

// Prerender every non-index doc page.
export function generateStaticParams() {
  return DOCS_FLAT.filter((i) => i.slug).map((i) => ({ slug: i.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = DOCS[slug];
  if (!entry) return { title: "Not Found — Peep Docs" };
  return {
    title: `${entry.title} — Peep Docs`,
    description: entry.description,
  };
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <DocArticle slug={slug} />;
}
