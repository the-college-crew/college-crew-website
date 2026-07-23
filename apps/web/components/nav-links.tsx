"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string };

/**
 * Desktop header nav links with a current-page indicator: the active link
 * gets a gold underline (the same accent as the route-change top loader) and
 * aria-current for assistive tech.
 */
export function NavLinks({ nav }: { nav: NavItem[] }) {
  const pathname = usePathname();

  return (
    <>
      {nav.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "underline decoration-gold-400 decoration-[2.5px] underline-offset-[10px]"
                : "transition-colors hover:text-viridian/60"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
