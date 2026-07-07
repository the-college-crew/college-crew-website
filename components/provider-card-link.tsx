"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

/*
 * Slightly longer than the 300ms CSS transition so the navigation snapshot
 * (which the view-transition morph starts from) captures the settled backside,
 * not a mid-flip frame.
 */
const FLIP_MS = 320;

/**
 * Makes an entire provider card a link to the profile. A plain click plays a
 * 3D flip to a branded "card back", then navigates — the profile morph picks
 * up from the backside. Modified clicks, keyboard nav, and prefetch keep
 * native <Link> behavior; reduced-motion skips the flip entirely.
 */
export function ProviderCardLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [flipped, setFlipped] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    // bfcache can restore the page mid-flip on back-nav; land unflipped.
    const reset = () => setFlipped(false);
    window.addEventListener("pageshow", reset);
    return () => {
      window.removeEventListener("pageshow", reset);
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }
    event.preventDefault();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      router.push(href);
      return;
    }
    setFlipped(true);
    timeoutRef.current = window.setTimeout(() => router.push(href), FLIP_MS);
  }

  return (
    <Link
      href={href}
      onClick={handleClick}
      className="group/flip block transition-transform duration-200 hover:-translate-y-0.5 [perspective:1200px]"
    >
      <div
        className={cn(
          "relative transition-transform duration-300 [transform-style:preserve-3d]",
          flipped && "[transform:rotateY(180deg)]",
        )}
      >
        <div className="[backface-visibility:hidden]">{children}</div>
        <div
          aria-hidden
          className="pennant absolute inset-0 flex items-center justify-center overflow-hidden rounded-2xl border border-stone bg-viridian [backface-visibility:hidden] [transform:rotateY(180deg)]"
        >
          <span className="font-display text-lg font-semibold text-shell">
            Opening profile…
          </span>
        </div>
      </div>
    </Link>
  );
}
