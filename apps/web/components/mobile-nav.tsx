"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

type NavItem = { href: string; label: string };

/**
 * Mobile-only hamburger for the customer site header. Collapses the main nav
 * (and the logged-out auth links) into a dropdown panel that drops below the
 * bar. Hidden from `breakpoint`+ up, where the desktop nav takes over.
 *
 * Interaction mirrors `user-menu.tsx`: toggle state, click-outside + Escape to
 * close, and aria wiring so the button announces the panel.
 */
export function MobileNav({
  nav,
  isAuthed,
  tone = "dark",
  breakpoint = "sm",
}: {
  nav: NavItem[];
  isAuthed: boolean;
  /** "dark" for forest bars (provider/admin); "light" for the shell customer bar. */
  tone?: "light" | "dark";
  /** Width at which the desktop nav takes over. "lg" for bars carrying the
   * signed-in personal links, which need more room than three public ones. */
  breakpoint?: "sm" | "lg";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  const onDark = tone === "dark";

  const linkClass = onDark
    ? "block rounded-lg px-3 py-3 text-base font-semibold text-shell/85 transition-colors hover:bg-shell/10 hover:text-shell"
    : "block rounded-lg px-3 py-3 text-base font-semibold text-viridian/85 transition-colors hover:bg-viridian/5 hover:text-viridian";

  return (
    <div ref={rootRef} className={breakpoint === "lg" ? "lg:hidden" : "sm:hidden"}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={open ? "Close menu" : "Open menu"}
        className={
          onDark
            ? "-ml-1 flex h-10 w-10 items-center justify-center rounded-lg text-shell transition-colors hover:bg-shell/10"
            : "-ml-1 flex h-10 w-10 items-center justify-center rounded-lg text-viridian transition-colors hover:bg-viridian/5"
        }
      >
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          {open ? (
            <>
              <path d="M6 6l12 12" />
              <path d="M18 6L6 18" />
            </>
          ) : (
            <>
              <path d="M4 7h16" />
              <path d="M4 12h16" />
              <path d="M4 17h16" />
            </>
          )}
        </svg>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className={
            onDark
              ? "absolute left-0 right-0 top-full z-50 border-b border-shell/15 bg-viridian px-4 pb-4 pt-1 shadow-lg"
              : "absolute left-0 right-0 top-full z-50 border-b border-viridian/15 bg-shell px-4 pb-4 pt-1 shadow-lg"
          }
        >
          <nav aria-label="Main mobile" className="flex flex-col">
            {nav.map((item) => {
              const active =
                pathname === item.href ||
                pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  aria-current={active ? "page" : undefined}
                  className={`${linkClass} ${
                    active ? (onDark ? "bg-shell/10" : "bg-viridian/5") : ""
                  }`}
                  onClick={close}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {!isAuthed ? (
            <div
              className={
                onDark
                  ? "mt-2 flex flex-col gap-2 border-t border-shell/15 pt-3"
                  : "mt-2 flex flex-col gap-2 border-t border-viridian/15 pt-3"
              }
            >
              <Link
                href="/login"
                onClick={close}
                className={
                  onDark
                    ? "rounded-full border border-shell/30 px-4 py-2.5 text-center text-sm font-semibold text-shell transition-colors hover:bg-shell/10"
                    : "rounded-full border-[1.6px] border-viridian/40 px-4 py-2.5 text-center text-sm font-semibold text-viridian transition-colors hover:bg-viridian/5"
                }
              >
                Log in
              </Link>
              <Link
                href="/signup"
                onClick={close}
                className={
                  onDark
                    ? "rounded-full bg-honeydew px-4 py-2.5 text-center text-sm font-semibold text-viridian transition-colors hover:bg-shell"
                    : "rounded-full bg-viridian px-4 py-2.5 text-center text-sm font-semibold text-shell transition-colors hover:bg-viridian-ink"
                }
              >
                Get started
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
