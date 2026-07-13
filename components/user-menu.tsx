"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { signOut } from "@/app/(auth)/actions";
import { setViewAs } from "@/app/actions/view-as";
import { FormLoader } from "@/components/form-loader";
import type { UserRole } from "@/lib/db/types";
import { cn } from "@/lib/utils";

/**
 * Top-right account menu: an initials avatar that opens a dropdown with
 * Account settings, Dashboard, and Sign out. Self-contained styling (a colored
 * circle + a white overlay panel) so it reads correctly in every header —
 * customer (cream/forest), provider, and admin (crew/ink).
 */

// Dark brand tints that all take white text; picked deterministically per user.
const AVATAR_COLORS = [
  "bg-crew-600",
  "bg-quad-600",
  "bg-forest-700",
  "bg-crew-800",
  "bg-quad-700",
  "bg-forest-600",
];

const VIEWS: { role: UserRole; label: string }[] = [
  { role: "admin", label: "Admin" },
  { role: "customer", label: "Customer" },
  { role: "provider", label: "Provider" },
];

function initialsFrom(name: string, email: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1 && parts[0]) return parts[0].slice(0, 2).toUpperCase();
  return (email.trim()[0] ?? "?").toUpperCase();
}

function colorFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function UserMenu({
  name,
  email,
  homePath,
  realRole,
  currentRole,
  accountHref = "/account",
  messagesHref = "/messages",
  supportHref = "/support",
  dashboardLabel = "Dashboard",
  unreadCount = 0,
  badgeRing = "ring-viridian",
}: {
  name: string;
  email: string;
  homePath: string;
  realRole?: UserRole;
  currentRole?: UserRole;
  accountHref?: string;
  messagesHref?: string;
  supportHref?: string;
  dashboardLabel?: string;
  unreadCount?: number;
  /** Ring color around the unread badge — match the header background. */
  badgeRing?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const initials = initialsFrom(name, email);
  const color = colorFor(email || name);
  const displayName = name.trim() || email;

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

  const itemClass =
    "block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-ink transition-colors hover:bg-court";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        className="relative flex items-center gap-1.5 rounded-full p-0.5 transition-opacity hover:opacity-90"
      >
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white",
            color,
          )}
        >
          {initials}
        </span>
        {unreadCount > 0 ? (
          <span
            aria-hidden
            className={cn(
              "absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2",
              badgeRing,
            )}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
        <span className="sr-only">
          Open account menu{unreadCount > 0 ? ` (${unreadCount} unread messages)` : ""}
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={cn(
            "h-4 w-4 text-ink-soft transition-transform",
            open && "rotate-180",
          )}
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-paper p-1.5 shadow-lg"
        >
          <div className="border-b border-line px-3 py-2">
            <p className="truncate text-sm font-semibold text-ink">{displayName}</p>
            <p className="truncate text-xs text-mist">{email}</p>
          </div>

          {realRole === "admin" && currentRole ? (
            <div className="border-b border-line px-3 py-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-mist">
                Viewing as
              </p>
              <form action={setViewAs} className="grid grid-cols-3 gap-1">
                <FormLoader />
                {VIEWS.map((view) => (
                  <button
                    key={view.role}
                    type="submit"
                    name="viewAs"
                    value={view.role}
                    aria-pressed={currentRole === view.role}
                    className={
                      currentRole === view.role
                        ? "rounded-lg bg-crew-600 px-2 py-1.5 text-xs font-semibold text-white"
                        : "rounded-lg border border-line px-2 py-1.5 text-xs font-semibold text-ink-soft hover:bg-court hover:text-crew-700"
                    }
                  >
                    {view.label}
                  </button>
                ))}
              </form>
            </div>
          ) : null}

          <div className="pt-1.5">
            <Link
              href={accountHref}
              role="menuitem"
              className={itemClass}
              onClick={() => setOpen(false)}
            >
              Account settings
            </Link>
            <Link
              href={homePath}
              role="menuitem"
              className={itemClass}
              onClick={() => setOpen(false)}
            >
              {dashboardLabel}
            </Link>
            <Link
              href={messagesHref}
              role="menuitem"
              className={cn(itemClass, "flex items-center justify-between")}
              onClick={() => setOpen(false)}
            >
              <span>Messages</span>
              {unreadCount > 0 ? (
                <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold leading-none text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </Link>
            <Link
              href={supportHref}
              role="menuitem"
              className={itemClass}
              onClick={() => setOpen(false)}
            >
              Feedback &amp; support
            </Link>
          </div>

          <div className="mt-1.5 border-t border-line pt-1.5">
            <form action={signOut}>
              <FormLoader />
              <button
                type="submit"
                role="menuitem"
                className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
