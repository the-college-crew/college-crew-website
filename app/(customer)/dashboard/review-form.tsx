"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";

import { submitReview, type ReviewFormState } from "./actions";

/** Inline review prompt on Past bookings (SPEC §8, customer dashboard). */
export function ReviewForm({ bookingId }: { bookingId: string }) {
  const [state, formAction, pending] = useActionState<
    ReviewFormState,
    FormData
  >(submitReview, {});
  const [rating, setRating] = useState(0);

  if (state.success) {
    return (
      <p className="text-sm font-medium text-quad-700">
        Thanks — your review is live on the provider&apos;s profile.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="rating" value={rating} />

      <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={rating === value}
            aria-label={`${value} star${value === 1 ? "" : "s"}`}
            onClick={() => setRating(value)}
            className={cn(
              "text-2xl leading-none transition-colors",
              value <= rating ? "text-gold-400" : "text-line hover:text-gold-300",
            )}
          >
            ★
          </button>
        ))}
        <span className="ml-2 text-xs text-mist">How did it go?</span>
      </div>

      <Textarea
        name="text"
        rows={2}
        placeholder="A sentence or two helps the next neighbor…"
      />

      <FieldError>{state.error}</FieldError>

      <Button
        type="submit"
        variant="secondary"
        size="sm"
        disabled={pending || rating === 0}
      >
        {pending ? "Saving…" : "Leave review"}
      </Button>
    </form>
  );
}
