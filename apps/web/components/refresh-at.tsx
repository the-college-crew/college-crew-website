"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const MAX_TIMEOUT_MS = 2_147_000_000;

/** Refresh a server-rendered route when a time-based action becomes available. */
export function RefreshAt({ at }: { at: string }) {
  const router = useRouter();

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const target = new Date(at).getTime();

    const schedule = () => {
      if (cancelled) return;
      const remaining = target - Date.now();
      if (remaining <= 0) {
        router.refresh();
        return;
      }
      timeout = setTimeout(schedule, Math.min(remaining, MAX_TIMEOUT_MS));
    };

    schedule();
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [at, router]);

  return null;
}
