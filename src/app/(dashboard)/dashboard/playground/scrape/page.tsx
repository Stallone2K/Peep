import { ScrapePlayground } from "@/components/dashboard/scrape-playground";

export const metadata = { title: "Scrape — Playground" };

export default function ScrapePlaygroundPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Scrape A Web Page
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          HTTP-Only Scraper — Markdown, HTML, Raw HTML, Links, And Images
          Return Today. Screenshots And AI Formats Arrive In Phase 4 / 5.
        </p>
      </div>
      <ScrapePlayground />
    </div>
  );
}
