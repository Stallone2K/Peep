import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-border/50 border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link
            href="/"
            className="font-mono text-lg font-semibold tracking-tight"
          >
            peep
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              href="/dashboard"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Dashboard
            </Link>
            <Link
              href="/sign-in"
              className={buttonVariants({ size: "sm" })}
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-border/50 border-t">
        <div className="text-muted-foreground mx-auto flex h-14 max-w-5xl items-center justify-between px-6 text-xs">
          <span>© 2026 Peep</span>
          <span className="font-mono">v0.1</span>
        </div>
      </footer>
    </div>
  );
}
