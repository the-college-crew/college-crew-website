"use client";

import { usePathname, useRouter } from "next/navigation";

/**
 * Universal back button, rendered top-right of a page's `PageHeader` (aligned
 * with the title) on the light content surface. Shows on every page except the
 * homepage and steps back through history, falling back to the homepage on a
 * direct load.
 */
export function BackButton() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/") return null;

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  };

  return (
    <button
      type="button"
      onClick={goBack}
      className="inline-flex items-center gap-1.5 rounded-xl border border-viridian/25 px-3 py-1.5 text-xs font-semibold text-viridian transition-colors hover:bg-viridian/5"
    >
      <span aria-hidden="true">←</span>
      <span className="hidden sm:inline">Back</span>
      <span className="sr-only">Go back</span>
    </button>
  );
}
