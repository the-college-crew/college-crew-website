"use client";

import { usePathname, useRouter } from "next/navigation";

/**
 * Universal back button for the app headers. Shows on every page except the
 * homepage and steps back through history (falling back to the homepage on a
 * direct load). Styled for the forest (`bg-viridian`) header — light text, so
 * it stays visible; deliberately not `buttonClasses` since the `secondary`
 * variant's dark colors would win over an override (cn concatenates, it does
 * not tailwind-merge).
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
      className="inline-flex items-center gap-1.5 rounded-xl border border-shell/30 px-3 py-1.5 text-xs font-semibold text-shell transition-colors hover:bg-shell/10"
    >
      <span aria-hidden="true">←</span>
      <span className="hidden sm:inline">Back</span>
      <span className="sr-only">Go back</span>
    </button>
  );
}
