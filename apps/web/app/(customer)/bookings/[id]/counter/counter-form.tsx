"use client";

import { useActionState } from "react";

import { useBookingCopy } from "@/components/content/booking-copy-provider";
import { FormLoader } from "@/components/form-loader";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

import {
  acceptCounterOffer,
  rejectCounterOffer,
  type CounterOfferState,
} from "./actions";

export function CounterOfferActions({ bookingId }: { bookingId: string }) {
  const copy = useBookingCopy();
  const [acceptState, acceptAction, acceptPending] = useActionState<
    CounterOfferState,
    FormData
  >(acceptCounterOffer, {});
  const [rejectState, rejectAction, rejectPending] = useActionState<
    CounterOfferState,
    FormData
  >(rejectCounterOffer, {});
  const pending = acceptPending || rejectPending;

  return (
    <div className="space-y-3">
      <form action={acceptAction}>
        <FormLoader />
        <input type="hidden" name="bookingId" value={bookingId} />
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {acceptPending
            ? "Confirming…"
            : copy("booking-customer.counter.accept")}
        </Button>
      </form>
      <form action={rejectAction}>
        <input type="hidden" name="bookingId" value={bookingId} />
        <Button
          type="submit"
          variant="secondary"
          size="lg"
          className="w-full"
          disabled={pending}
        >
          {rejectPending
            ? "Updating…"
            : copy("booking-customer.counter.reject")}
        </Button>
      </form>
      <FieldError>{acceptState.error ?? rejectState.error}</FieldError>
    </div>
  );
}
