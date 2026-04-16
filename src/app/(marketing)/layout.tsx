import Link from "next/link";
import { ArrowRight, ChevronDown, Star } from "lucide-react";

import { Logo } from "@/components/marketing/logo";
import { PageGrid } from "@/components/marketing/page-grid";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="font-display flex min-h-screen flex-col">
      {/* Top announcement banner */}
      <div className="bg-orange-500 text-black">
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-3 px-6 py-2.5 text-center text-sm">
          <span className="font-medium">
            Introducing Peep V0.1 — 500 Free Credits On Sign Up.
          </span>
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-1 underline decoration-black/40 underline-offset-4 hover:decoration-black"
          >
            Get Early Access <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>

      {/* Nav — exactly one grid cell tall (96px) */}
      <header className="bg-background/70 border-border/60 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex h-24 max-w-6xl items-center justify-between px-6">
          <Link href="/" aria-label="Peep Home">
            <Logo />
          </Link>
          <nav className="text-muted-foreground absolute left-1/2 hidden -translate-x-1/2 items-center gap-6 text-sm md:flex">
            <NavItem label="Products" hasCaret href="/#scrape" />
            <NavItem label="Playground" href="/dashboard/playground" />
            <NavItem label="Docs" href="/docs" />
            <NavItem label="Pricing" href="/pricing" />
            <NavItem label="Integrations" hasCaret href="/#integrations" />
            <NavItem label="Changelog" href="/changelog" />
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="https://github.com/"
              className="border-border/60 bg-card/60 text-muted-foreground hover:text-foreground hidden items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors sm:inline-flex"
            >
              <Star className="size-3.5" />
              <span className="font-mono">0</span>
            </Link>
            <Link
              href="/sign-in"
              className={cn(
                buttonVariants({ size: "sm" }),
                "bg-orange-500 text-black hover:bg-orange-400",
              )}
            >
              Sign Up
            </Link>
          </div>
        </div>
      </header>

      <div className="relative flex-1">
        <PageGrid />
        {children}
      </div>

      {/* Footer */}
      <footer className="border-border/60 border-t">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-4">
          <div className="space-y-3">
            <Logo />
            <p className="text-muted-foreground max-w-xs text-sm">
              The AI-Native Web Scraping API For Developers.
            </p>
          </div>
          <FooterCol
            title="Product"
            links={[
              { href: "/#scrape", label: "Scrape" },
              { href: "/#crawl", label: "Crawl" },
              { href: "/#map", label: "Map" },
              { href: "/#extract", label: "Extract" },
              { href: "/#search", label: "Search" },
              { href: "/pricing", label: "Pricing" },
            ]}
          />
          <FooterCol
            title="Resources"
            links={[
              { href: "/docs", label: "Documentation" },
              { href: "/api-reference", label: "API Reference" },
              { href: "/changelog", label: "Changelog" },
              { href: "/status", label: "Status" },
            ]}
          />
          <FooterCol
            title="Company"
            links={[
              { href: "/about", label: "About" },
              { href: "/contact", label: "Contact" },
              { href: "/terms", label: "Terms" },
              { href: "/privacy", label: "Privacy" },
            ]}
          />
        </div>
        <div className="border-border/60 border-t">
          <div className="text-muted-foreground mx-auto flex h-14 max-w-6xl items-center justify-between px-6 text-xs">
            <span>© 2026 Peep</span>
            <span className="font-mono">v0.1 — Private Alpha</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function NavItem({
  label,
  href,
  hasCaret,
}: {
  label: string;
  href: string;
  hasCaret?: boolean;
}) {
  return (
    <Link
      href={href}
      className="hover:text-foreground inline-flex items-center gap-1 transition-colors"
    >
      <span>{label}</span>
      {hasCaret ? <ChevronDown className="size-3.5 opacity-60" /> : null}
    </Link>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div>
      <h4 className="mb-4 text-sm font-medium">{title}</h4>
      <ul className="space-y-2.5 text-sm">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
