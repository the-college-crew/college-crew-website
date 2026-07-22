"use client";

import Link from "next/link";
import { useCallback, useSyncExternalStore } from "react";

import { buttonClasses } from "@/components/ui/button";

const listeners = new Set<() => void>();

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function readDismissed(storageKey: string) {
  try {
    return window.localStorage.getItem(storageKey) === "1";
  } catch {
    // Private-mode storage failures just mean the banner stays visible.
    return false;
  }
}

/**
 * Nudges a provider who hasn't signed the current Provider Addendum toward the
 * acceptance page. Dismissal is keyed by version, so bumping the addendum
 * brings the banner back for everyone who dismissed the previous one.
 */
export function ProviderAgreementBanner({
  version,
  acceptHref,
}: {
  version: string;
  acceptHref: string;
}) {
  const storageKey = `cc:provider-agreement-dismissed:${version}`;
  const dismissed = useSyncExternalStore(
    subscribe,
    useCallback(() => readDismissed(storageKey), [storageKey]),
    // Treated as dismissed on the server so the banner never renders into the
    // HTML and then vanishes on hydration for someone who already dismissed it.
    () => true,
  );

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // Nothing to persist to; the banner simply returns on the next visit.
    }
    for (const listener of listeners) listener();
  }, [storageKey]);

  if (dismissed) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gold-300 bg-gold-100 p-4 text-sm text-gold-800">
      <p>
        You haven&apos;t accepted Provider Addendum version {version}. Customers
        can&apos;t book you until you do.
      </p>
      <div className="flex items-center gap-2">
        <Link href={acceptHref} className={buttonClasses({ size: "sm" })}>
          Review &amp; accept
        </Link>
        <button
          type="button"
          onClick={dismiss}
          className={buttonClasses({ variant: "ghost", size: "sm" })}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
