"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

import { cancelBooking } from "./actions";

/** Pre-submit copy for the locked cancellation outcome (the RPC re-checks it). */
const OUTCOME_COPY: Record<string, string> = {
  full_refund: "You’ll be fully refunded.",
  no_refund:
    "Less than 12 hours before the start — the first-hour charge isn’t refundable.",
  no_payment: "Nothing has been charged yet.",
};

export function CancelBookingButton({
  bookingId,
  outcome,
  label = "Cancel request",
}: {
  bookingId: string;
  outcome?: "full_refund" | "no_refund" | "no_payment";
  label?: string;
}) {
  const [state, formAction, pending] = useActionState(cancelBooking, {});
  return (
    <form action={formAction} className="space-y-1">
      <input type="hidden" name="bookingId" value={bookingId} />
      {outcome && !state.policyResult ? (
        <p className="text-xs text-ink-soft">{OUTCOME_COPY[outcome]}</p>
      ) : null}
      {state.policyResult ? (
        <p className="text-xs font-medium text-quad-700">
          {OUTCOME_COPY[state.policyResult] ?? "Booking cancelled."}
        </p>
      ) : (
        <Button type="submit" variant="danger" size="sm" disabled={pending}>
          {pending ? "Cancelling…" : label}
        </Button>
      )}
      <FieldError>{state.error}</FieldError>
    </form>
  );
}
