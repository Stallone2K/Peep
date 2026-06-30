"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { DOCS_NAV, docHref } from "@/lib/docs/nav";
import { cn } from "@/lib/utils";

export function DocsSidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-7 text-sm">
      {DOCS_NAV.map((group) => (
        <div key={group.title}>
          <p className="text-muted-foreground/60 mb-2 px-2.5 text-xs font-medium tracking-wider uppercase">
            {group.title}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const href = docHref(item.slug);
              const active = pathname === href;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className={cn(
                      "block rounded-md px-2.5 py-1.5 transition-colors",
                      active
                        ? "bg-orange-500/10 font-medium text-orange-400"
                        : "text-muted-foreground hover:text-foreground hover:bg-card/60",
                    )}
                  >
                    {item.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
