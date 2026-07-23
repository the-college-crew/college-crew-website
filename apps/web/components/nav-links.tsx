"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string };

/**
 * Desktop header nav links with a current-page indicator: the active link
 * gets a gold underline (the same accent as the route-change top loader) and
 * aria-current for assistive tech. Gold reads over both bar colors, so only
 * the hover tint flips with `tone`.
 */
export function NavLinks({
  nav,
  tone = "light",
}: {
  nav: NavItem[];
  /** "dark" for the forest shared-surface bar; "light" for the shell one. */
  tone?: "light" | "dark";
}) {
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
                : tone === "dark"
                  ? "transition-colors hover:text-shell/70"
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
