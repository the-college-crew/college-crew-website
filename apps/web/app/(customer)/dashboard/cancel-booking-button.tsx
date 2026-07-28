"use client";

import { useActionState } from "react";

import { useBookingCopy } from "@/components/content/booking-copy-provider";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { CUSTOMER_REFUND_NOTICE_HOURS } from "@/lib/booking/policy";

import { cancelBooking } from "./actions";

export function CancelBookingButton({
  bookingId,
  outcome,
  label = "Cancel request",
}: {
  bookingId: string;
  outcome?: "full_refund" | "no_refund" | "no_payment";
  label?: string;
}) {
  const copy = useBookingCopy();
  /** Pre-submit copy for the locked outcome (the RPC re-checks it). */
  const outcomeCopy: Record<string, string> = {
    full_refund: copy("booking-customer.dashboard.cancel-full-refund"),
    no_refund: copy("booking-customer.dashboard.cancel-late", {
      cancellation_hours: CUSTOMER_REFUND_NOTICE_HOURS,
    }),
    no_payment: copy("booking-customer.dashboard.cancel-no-payment"),
  };
  const [state, formAction, pending] = useActionState(cancelBooking, {});
  return (
    <>
      <form action={formAction}>
        <input type="hidden" name="bookingId" value={bookingId} />
        {state.policyResult ? (
          <p className="text-xs font-medium text-quad-700">
            {outcomeCopy[state.policyResult] ?? "Booking cancelled."}
          </p>
        ) : (
          <Button type="submit" variant="danger" size="sm" disabled={pending}>
            {pending ? "Cancelling…" : label}
          </Button>
        )}
      </form>
      {outcome && !state.policyResult ? (
        <p className="w-full text-xs text-ink-soft">{outcomeCopy[outcome]}</p>
      ) : null}
      {state.error ? (
        <div className="w-full">
          <FieldError>{state.error}</FieldError>
        </div>
      ) : null}
    </>
  );
}
