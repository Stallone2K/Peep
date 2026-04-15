import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col items-center px-6 py-24 text-center">
      <span className="border-border bg-card text-muted-foreground mb-6 rounded-full border px-3 py-1 font-mono text-xs">
        v0.1 — private alpha
      </span>

      <h1 className="text-balance text-5xl font-semibold tracking-tight sm:text-6xl">
        Point at a URL.
        <br />
        Get clean markdown and structured JSON.
      </h1>

      <p className="text-muted-foreground mt-6 max-w-xl text-balance text-lg">
        An AI-native web scraper for developers. One endpoint handles rendered
        SPAs, sitemaps, change tracking, and structured extraction — no proxy
        configuration required.
      </p>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <Link href="/sign-in" className={buttonVariants({ size: "lg" })}>
          Get an API key
        </Link>
        <Link
          href="/dashboard"
          className={buttonVariants({ size: "lg", variant: "outline" })}
        >
          Open dashboard
        </Link>
      </div>

      <pre className="border-border bg-card mt-12 w-full max-w-2xl overflow-x-auto rounded-lg border p-4 text-left font-mono text-xs leading-relaxed">
        <span className="text-muted-foreground"># Scrape any page to markdown</span>
        {"\n"}
        <span>curl -X POST https://peep.dev/api/v1/scrape \</span>
        {"\n"}
        <span>  -H &quot;Authorization: Bearer peep_live_...&quot; \</span>
        {"\n"}
        <span>  -H &quot;Content-Type: application/json&quot; \</span>
        {"\n"}
        <span>
          {"  "}-d &apos;{'{"url":"https://example.com","formats":["markdown"]}'}&apos;
        </span>
      </pre>
    </main>
  );
}
