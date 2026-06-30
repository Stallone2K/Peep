import type { Metadata } from "next";

import { DocArticle } from "@/components/docs/doc-article";
import { DOCS } from "@/lib/docs/registry";

export const metadata: Metadata = {
  title: `${DOCS[""].title} — Peep Docs`,
  description: DOCS[""].description,
};

export default function DocsIndexPage() {
  return <DocArticle slug="" />;
}
