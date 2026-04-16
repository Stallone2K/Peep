import { Link2 } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";

export const metadata = { title: "Scrape — Playground" };

export default function ScrapePlaygroundPage() {
  return (
    <ComingSoon
      title="Scrape A Web Page"
      description="Point At Any URL — Markdown, HTML, Screenshot, Links, And Structured JSON Come Back."
      phase="Phase 3 (/scrape Endpoint)"
      icon={Link2}
    />
  );
}
