"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError, Textarea } from "@/components/ui/field";
import { submitReview, type ReviewFormState } from "./actions";

/** Persistent inline review prompt for an eligible completed booking. */
export function ReviewForm({ bookingId }: { bookingId: string }) {
  const [state, formAction, pending] = useActionState<
    ReviewFormState,
    FormData
  >(submitReview, {});
  const [rating, setRating] = useState(0);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="bookingId" value={bookingId} />

      <fieldset>
        <legend className="text-sm font-semibold text-ink">
          Rate your experience
        </legend>
        <div className="mt-1.5 flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <label key={value} className="cursor-pointer">
              <input
                type="radio"
                name="rating"
                value={value}
                checked={rating === value}
                onChange={() => setRating(value)}
                aria-label={`${value} star${value === 1 ? "" : "s"}`}
                className="peer sr-only"
                required
              />
              <span
                aria-hidden="true"
                className={`inline-block rounded-sm text-2xl leading-none transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-crew-600 ${
                  value <= rating
                    ? "text-gold-400"
                    : "text-line hover:text-gold-300"
                }`}
              >
                ★
              </span>
            </label>
          ))}
          <span className="ml-2 text-xs text-mist">
            {rating ? `${rating} out of 5` : "Choose 1-5 stars"}
          </span>
        </div>
      </fieldset>

      <Textarea
        name="text"
        rows={2}
        maxLength={2000}
        aria-label="Written review (optional)"
        placeholder="A sentence or two helps the next neighbor…"
      />
      <p className="text-xs text-mist">Written review optional · 2,000 characters maximum</p>

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
