"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/provider/dashboard", label: "Dashboard" },
  { href: "/provider/jobs", label: "Jobs" },
  { href: "/provider/pricing", label: "Pricing" },
] as const;

export function ProviderNav() {
  const pathname = usePathname();
  const isActive = (href: (typeof navItems)[number]["href"]) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav aria-label="Provider" className="border-b border-viridian/15 bg-shell">
      <div className="mx-auto flex h-11 max-w-[1140px] items-center gap-6 px-5 text-sm font-semibold text-ink sm:px-8">
        <span className="rounded-full border border-viridian/20 bg-viridian/5 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.14em] text-viridian">
          Provider
        </span>
        {navItems.map((item) => {
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "underline decoration-viridian decoration-2 underline-offset-[6px]"
                  : "transition-colors hover:text-viridian/60"
              }
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
