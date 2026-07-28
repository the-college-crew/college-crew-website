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
  QUOTE_DAYPARTS,
  type QuoteDaypart,
} from "@/lib/booking/quote-dayparts";
import { formatLocalDate } from "@/lib/utils";

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
  const error = selectState.error ?? rejectState.error;

  return (
    <div className="space-y-3">
      {options.map((option) => (
        <form action={selectAction} key={option.id}>
          <FormLoader />
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="optionId" value={option.id} />
          {option.daypart === "either" ? (
            <fieldset className="space-y-3 rounded-xl border border-line bg-court p-4">
              <legend className="px-1 text-sm font-semibold text-ink">
                {formatLocalDate(option.local_date)} · choose what works for you
              </legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {QUOTE_DAYPARTS.map((daypart) => (
                  <label
                    key={daypart}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink-soft"
                  >
                    <input
                      type="radio"
                      name="requestedDaypart"
                      value={daypart}
                      required
                    />
                    {QUOTE_DAYPART_LABELS[daypart]}
                  </label>
                ))}
              </div>
              <Button
                type="submit"
                size="lg"
                variant="secondary"
                className="w-full"
                disabled={pending}
              >
                Re-request this day
              </Button>
            </fieldset>
          ) : (
            <>
              <input
                type="hidden"
                name="requestedDaypart"
                value={option.daypart}
              />
              <Button
                type="submit"
                size="lg"
                variant="secondary"
                className="w-full justify-between"
                disabled={pending}
              >
                <span>{formatLocalDate(option.local_date)}</span>
                <span>{QUOTE_DAYPART_LABELS[option.daypart]}</span>
              </Button>
            </>
          )}
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
      {error ? (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800"
        >
          {error} Your saved request has not changed.
        </div>
      ) : null}
    </div>
  );
}
