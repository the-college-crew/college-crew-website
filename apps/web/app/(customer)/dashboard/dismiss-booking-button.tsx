"use client";

import { useRef, useState, useTransition } from "react";

import { buttonClasses } from "@/components/ui/button";

import { dismissBooking, dismissReviewPrompt } from "./actions";

const EXIT_DURATION_MS = 180;

/**
 * Clears a card after it has visibly exited the list, so resolving something
 * feels like resolving it rather than a page flash.
 *
 * `target` picks which thing is being cleared: the whole booking (it moves to
 * Past) or just its review prompt (the job stays in Past and stays reviewable).
 */
export function DismissBookingButton({
  bookingId,
  target = "booking",
  label = "Dismiss",
  pendingLabel = "Dismissing…",
}: {
  bookingId: string;
  target?: "booking" | "review-prompt";
  label?: string;
  pendingLabel?: string;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isDismissing, setIsDismissing] = useState(false);
  const [, startTransition] = useTransition();

  function dismiss() {
    if (isDismissing) return;

    const card = buttonRef.current?.closest("[data-dismissable-card]");
    const exitClasses = ["-translate-y-1", "scale-[0.98]", "opacity-0"];
    card?.classList.add(...exitClasses);
    setIsDismissing(true);

    window.setTimeout(() => {
      startTransition(async () => {
        try {
          const formData = new FormData();
          formData.set("bookingId", bookingId);
          await (target === "review-prompt"
            ? dismissReviewPrompt(formData)
            : dismissBooking(formData));
        } catch {
          card?.classList.remove(...exitClasses);
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
      className={buttonClasses({ variant: "ghost", size: "sm" })}
    >
      {isDismissing ? pendingLabel : label}
    </button>
  );
}
