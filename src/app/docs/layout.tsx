import Link from "next/link";

import { Logo } from "@/components/marketing/logo";
import { DocsSidebar } from "@/components/docs/docs-sidebar";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="font-display flex min-h-screen flex-col">
      {/* Docs header — distinct from the marketing nav, with a path
          crumb and a direct "Get API Key" CTA. */}
      <header className="border-border/60 bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="Peep Home">
              <Logo />
            </Link>
            <span className="text-muted-foreground/30">/</span>
            <span className="text-muted-foreground text-sm font-medium">
              Docs
            </span>
          </div>
          <nav className="text-muted-foreground hidden items-center gap-6 text-sm md:flex">
            <Link href="/dashboard/playground" className="hover:text-foreground transition-colors">
              Playground
            </Link>
            <Link href="/pricing" className="hover:text-foreground transition-colors">
              Pricing
            </Link>
            <Link href="/changelog" className="hover:text-foreground transition-colors">
              Changelog
            </Link>
          </nav>
          <Link
            href="/dashboard/api-keys"
            className={cn(
              buttonVariants({ size: "sm" }),
              "bg-orange-500 text-black hover:bg-orange-400",
            )}
          >
            Get API Key
          </Link>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1400px] flex-1 gap-10 px-6">
        {/* Sticky sidebar */}
        <aside className="border-border/40 sticky top-16 hidden h-[calc(100vh-4rem)] w-[240px] shrink-0 overflow-y-auto border-r py-10 pr-4 lg:block">
          <DocsSidebar />
        </aside>

        {/* Content column */}
        <main className="min-w-0 flex-1 py-10">
          <div className="mx-auto max-w-3xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
