"use client";

import { useActionState } from "react";

import { useBookingCopy } from "@/components/content/booking-copy-provider";
import { FormLoader } from "@/components/form-loader";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

import {
  acceptCounterOffer,
  rejectQuoteCounter,
  rejectCounterOffer,
  selectQuoteCounterOption,
  type CounterOfferState,
} from "./actions";
import {
  QUOTE_DAYPART_LABELS,
  type QuoteDaypart,
} from "@/lib/booking/quote-dayparts";

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

export function QuoteCounterOptionActions({
  bookingId,
  options,
}: {
  bookingId: string;
  options: Array<{
    id: string;
    local_date: string;
    daypart: QuoteDaypart;
  }>;
}) {
  const [selectState, selectAction, selectPending] = useActionState<
    CounterOfferState,
    FormData
  >(selectQuoteCounterOption, {});
  const [rejectState, rejectAction, rejectPending] = useActionState<
    CounterOfferState,
    FormData
  >(rejectQuoteCounter, {});
  const pending = selectPending || rejectPending;

  return (
    <div className="space-y-3">
      {options.map((option) => (
        <form action={selectAction} key={option.id}>
          <FormLoader />
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="optionId" value={option.id} />
          <Button
            type="submit"
            size="lg"
            variant="secondary"
            className="w-full justify-between"
            disabled={pending}
          >
            <span>{option.local_date}</span>
            <span>{QUOTE_DAYPART_LABELS[option.daypart]}</span>
          </Button>
        </form>
      ))}
      <form action={rejectAction}>
        <input type="hidden" name="bookingId" value={bookingId} />
        <Button
          type="submit"
          variant="danger"
          size="lg"
          className="w-full"
          disabled={pending}
        >
          Choose a different provider
        </Button>
      </form>
      <FieldError>{selectState.error ?? rejectState.error}</FieldError>
    </div>
  );
}
