import { Network } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";

export const metadata = { title: "Crawl — Playground" };

export default function CrawlPlaygroundPage() {
  return (
    <ComingSoon
      title="Crawl Entire Website"
      description="Walk A Whole Site With Path Filters, Webhooks, And WebSocket Streaming."
      phase="Phase 6 (/crawl Endpoint)"
      icon={Network}
    />
  );
}
