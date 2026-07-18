"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Pilot-only shortcut kept outside the individual route-group shells so it is
 * available before signup and throughout both customer and provider flows.
 */
export function FeedbackLauncher() {
  const pathname = usePathname();

  if (pathname === "/support" || pathname.startsWith("/admin")) {
    return null;
  }

  return (
    <Link
      href={{ pathname: "/support", query: { from: pathname } }}
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-30 inline-flex items-center gap-2 rounded-full bg-viridian px-4 py-2.5 text-sm font-semibold text-shell shadow-lg shadow-viridian/20 transition-colors hover:bg-viridian-ink"
      aria-label="Send feedback or get support"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
      </svg>
      Feedback
    </Link>
  );
}

