"use client";

import { useRouter } from "next/navigation";
import { useTopLoader } from "nextjs-toploader";
import { useCallback, useEffect, type MouseEvent, type ReactNode } from "react";

import { buttonClasses } from "@/components/ui/button";

export function ProviderModal({ children }: { children: ReactNode }) {
  const router = useRouter();
  const loader = useTopLoader();

  // router.back() isn't covered by nextjs-toploader's automatic hooks (only
  // <Link> clicks and push/replace are), so start the site-wide loader by
  // hand; its own popstate listener still ends it.
  const goBack = useCallback(() => {
    loader.start();
    router.back();
  }, [loader, router]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") goBack();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [goBack]);

  function closeOnBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) goBack();
  }

  return (
    <div
      role="presentation"
      onClick={closeOnBackdrop}
      className="fixed inset-0 z-50 overflow-y-auto bg-viridian/40 px-4 py-8 backdrop-blur-sm sm:py-12"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Provider profile"
        className="relative mx-auto max-w-3xl"
      >
        <button
          type="button"
          onClick={goBack}
          className={buttonClasses({
            variant: "ghost",
            size: "sm",
            className:
              "absolute left-4 top-4 z-10 bg-paper/90 shadow-sm shadow-viridian/10 hover:bg-stone/70",
          })}
        >
          ← Back
        </button>
        {children}
      </div>
    </div>
  );
}
