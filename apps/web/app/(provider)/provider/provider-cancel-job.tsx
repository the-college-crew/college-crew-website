"use client";

import { useActionState, useState } from "react";

import { useBookingCopy } from "@/components/content/booking-copy-provider";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

import { cancelBookingAsProvider } from "./actions";

/**
 * Provider-side cancel for an accepted/booked job before Arrived. Requires a
 * short reason; a captured first hour is always fully refunded to the customer.
 * The reason is revealed on click so the danger action is deliberate.
 */
export function ProviderCancelJob({ bookingId }: { bookingId: string }) {
  const copy = useBookingCopy();
  const [state, formAction, pending] = useActionState(
    cancelBookingAsProvider,
    {},
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
      >
        Cancel job
      </Button>
    );
  }

  return (
    <form action={formAction} className="w-full space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
      <input type="hidden" name="bookingId" value={bookingId} />
      <label className="block text-xs font-semibold text-red-800" htmlFor={`reason-${bookingId}`}>
        Cancelling refunds the customer in full. Add a short reason:
      </label>
      <textarea
        id={`reason-${bookingId}`}
        name="reason"
        required
        minLength={3}
        maxLength={500}
        rows={2}
        className="w-full rounded-md border border-line bg-white p-2 text-sm"
        placeholder={copy("booking-provider.jobs.cancel-placeholder")}
      />
      <div className="flex items-center gap-2">
        <Button type="submit" variant="danger" size="sm" disabled={pending}>
          {pending
            ? "Cancelling…"
            : copy("booking-provider.jobs.cancel-submit")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
        >
          Keep job
        </Button>
      </div>
      <FieldError>{state.error}</FieldError>
    </form>
  );
}
