"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError, Textarea } from "@/components/ui/field";
import { submitReview, type ReviewFormState } from "./actions";

/**
 * Inline review prompt for a completed booking.
 *
 * Collapsed by default: four expanded forms stacked on the dashboard buried
 * everything else on the page. Picking a star is the entry point — it both
 * records the rating and reveals the optional written note, so the common case
 * (rate and go) is one tap and two clicks.
 */
export function ReviewForm({
  bookingId,
  collapsible = false,
}: {
  bookingId: string;
  /** Start collapsed and expand on first interaction. */
  collapsible?: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    ReviewFormState,
    FormData
  >(submitReview, {});
  const [rating, setRating] = useState(0);
  const [expanded, setExpanded] = useState(!collapsible);
  const showDetails = expanded || rating > 0;

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
                onChange={() => {
                  setRating(value);
                  setExpanded(true);
                }}
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
            {rating ? `${rating} out of 5` : "Tap a star to review"}
          </span>
        </div>
      </fieldset>

      {showDetails ? (
        <>
          <Textarea
            name="text"
            rows={2}
            maxLength={2000}
            aria-label="Written review (optional)"
            placeholder="A sentence or two helps the next neighbor…"
          />
          <p className="text-xs text-mist">
            Written review optional · 2,000 characters maximum
          </p>

          <FieldError>{state.error}</FieldError>

          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={pending || rating === 0}
          >
            {pending ? "Saving…" : "Leave review"}
          </Button>
        </>
      ) : (
        <FieldError>{state.error}</FieldError>
      )}
    </form>
  );
}
