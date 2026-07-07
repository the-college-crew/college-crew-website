"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

type NavItem = { href: string; label: string };

/**
 * Mobile-only hamburger for the customer site header. Collapses the main nav
 * (and the logged-out auth links) into a dropdown panel that drops below the
 * bar. Hidden at `sm+`, where the desktop nav takes over.
 *
 * Interaction mirrors `user-menu.tsx`: toggle state, click-outside + Escape to
 * close, and aria wiring so the button announces the panel.
 */
export function MobileNav({
  nav,
  isAuthed,
}: {
  nav: NavItem[];
  isAuthed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

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

  const linkClass =
    "block rounded-lg px-3 py-3 text-base font-semibold text-shell/85 transition-colors hover:bg-shell/10 hover:text-shell";

  return (
    <div ref={rootRef} className="sm:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={open ? "Close menu" : "Open menu"}
        className="-ml-1 flex h-10 w-10 items-center justify-center rounded-lg text-shell transition-colors hover:bg-shell/10"
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
          className="absolute left-0 right-0 top-full z-50 border-b border-shell/15 bg-viridian px-4 pb-4 pt-1 shadow-lg"
        >
          <nav aria-label="Main mobile" className="flex flex-col">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                className={linkClass}
                onClick={close}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {!isAuthed ? (
            <div className="mt-2 flex flex-col gap-2 border-t border-shell/15 pt-3">
              <Link
                href="/login"
                onClick={close}
                className="rounded-xl border border-shell/30 px-4 py-2.5 text-center text-sm font-semibold text-shell transition-colors hover:bg-shell/10"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                onClick={close}
                className="rounded-xl bg-honeydew px-4 py-2.5 text-center text-sm font-semibold text-viridian transition-colors hover:bg-shell"
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
