"use client";

import { useRef, useState, useTransition } from "react";

import { buttonClasses } from "@/components/ui/button";

import { dismissDeclinedBooking } from "./actions";

const EXIT_DURATION_MS = 180;

/** Dismisses a declined booking after its card has visibly exited the list. */
export function DismissDeclinedBookingButton({
  bookingId,
}: {
  bookingId: string;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isDismissing, setIsDismissing] = useState(false);
  const [, startTransition] = useTransition();

  function dismiss() {
    if (isDismissing) return;

    const card = buttonRef.current?.closest("[data-declined-booking]");
    card?.classList.add("-translate-y-1", "scale-[0.98]", "opacity-0");
    setIsDismissing(true);

    window.setTimeout(() => {
      startTransition(async () => {
        try {
          const formData = new FormData();
          formData.set("bookingId", bookingId);
          await dismissDeclinedBooking(formData);
        } catch {
          card?.classList.remove("-translate-y-1", "scale-[0.98]", "opacity-0");
          setIsDismissing(false);
        }
      });
    }, EXIT_DURATION_MS);
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={dismiss}
      disabled={isDismissing}
      className={buttonClasses({ variant: "secondary", size: "sm" })}
    >
      {isDismissing ? "Dismissing..." : "Dismiss"}
    </button>
  );
}
