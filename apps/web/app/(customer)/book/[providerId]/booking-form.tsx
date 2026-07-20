"use client";

import { useActionState, useMemo, useState } from "react";

import { FormLoader } from "@/components/form-loader";
import { Button } from "@/components/ui/button";
import {
  FieldError,
  FieldHint,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui/field";
import {
  CUSTOMER_ESTIMATE_MINUTES,
  DEFAULT_RESPONSE_WINDOW_HOURS,
  RESPONSE_WINDOW_HOURS,
  calculateHourlySubtotalCents,
  eligibleResponseWindowHours,
  pilotLocalDateTimeToUtc,
} from "@/lib/booking/policy";
import type { OfferedService } from "@/lib/db/queries";
import { formatMoney, formatOfferedPrice } from "@/lib/utils";

import { createBookingRequest, type BookingFormState } from "./actions";

const DURATION_OPTIONS = Array.from(
  {
    length:
      (CUSTOMER_ESTIMATE_MINUTES.max - CUSTOMER_ESTIMATE_MINUTES.min) / 15 + 1,
  },
  (_, index) => CUSTOMER_ESTIMATE_MINUTES.min + index * 15,
);

function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours} hr${hours === 1 ? "" : "s"}${remainder ? ` ${remainder} min` : ""}`;
}

export function BookingRequestForm({
  services,
  originReady,
}: {
  services: OfferedService[];
  /** False until "Booking from" resolves to a usable service address. */
  originReady: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    BookingFormState,
    FormData
  >(createBookingRequest, {});
  const [selectedId, setSelectedId] = useState(services[0]?.id ?? "");
  const [scheduledLocal, setScheduledLocal] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState(60);
  const [responseWindowHours, setResponseWindowHours] = useState<number>(
    DEFAULT_RESPONSE_WINDOW_HOURS,
  );

  const selected = services.find((service) => service.id === selectedId);
  const isQuote = selected?.pricing_mode === "quote";
  const scheduled = useMemo(
    () => pilotLocalDateTimeToUtc(scheduledLocal),
    [scheduledLocal],
  );
  const responseOptions = useMemo(
    () =>
      scheduled.ok
        ? eligibleResponseWindowHours(new Date(), scheduled.date)
        : ([] as (typeof RESPONSE_WINDOW_HOURS)[number][]),
    [scheduled],
  );
  const effectiveResponseHours = responseOptions.includes(
    responseWindowHours as (typeof RESPONSE_WINDOW_HOURS)[number],
  )
    ? responseWindowHours
    : responseOptions.includes(DEFAULT_RESPONSE_WINDOW_HOURS)
      ? DEFAULT_RESPONSE_WINDOW_HOURS
      : responseOptions[0];
  const estimatedSubtotal =
    selected?.hourly_rate_cents != null
      ? calculateHourlySubtotalCents(
          selected.hourly_rate_cents,
          estimatedMinutes,
        )
      : null;

  return (
    <form action={formAction} className="space-y-5">
      <FormLoader />

      <div>
        <Label htmlFor="providerServiceId">Service</Label>
        <Select
          id="providerServiceId"
          name="providerServiceId"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          required
        >
          {services.map((offered) => (
            <option key={offered.id} value={offered.id}>
              {offered.service.name} · {formatOfferedPrice(offered)}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="scheduledLocal">Date &amp; time</Label>
          <Input
            id="scheduledLocal"
            name="scheduledLocal"
            type="datetime-local"
            value={scheduledLocal}
            onChange={(event) => setScheduledLocal(event.target.value)}
            required
          />
          <FieldHint>Central Time</FieldHint>
        </div>
        <div>
          <Label htmlFor="estimatedMinutes">Estimated duration</Label>
          <Select
            id="estimatedMinutes"
            name="estimatedMinutes"
            value={estimatedMinutes}
            onChange={(event) => setEstimatedMinutes(Number(event.target.value))}
          >
            {DURATION_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {durationLabel(minutes)}
              </option>
            ))}
          </Select>
          <FieldHint>
            {isQuote
              ? "Used for scheduling only. Your final price is the provider's flat quote."
              : "One-hour minimum; billed in 15-minute increments."}
          </FieldHint>
        </div>
      </div>

      <div>
        <Label htmlFor="responseWindowHours">Provider response window</Label>
        <Select
          id="responseWindowHours"
          name="responseWindowHours"
          value={effectiveResponseHours ?? ""}
          onChange={(event) => setResponseWindowHours(Number(event.target.value))}
          disabled={responseOptions.length === 0}
          required
        >
          {responseOptions.length === 0 ? (
            <option value="">Choose an eligible start time first</option>
          ) : (
            responseOptions.map((hours) => (
              <option key={hours} value={hours}>
                {hours} hour{hours === 1 ? "" : "s"}
              </option>
            ))
          )}
        </Select>
        <FieldHint>
          If there is no response by then, your request stays open and we show
          optional replacements.
        </FieldHint>
      </div>

      <div>
        <Label htmlFor="details">Job details</Label>
        <Textarea
          id="details"
          name="details"
          rows={4}
          maxLength={2000}
          placeholder={
            isQuote
              ? "Describe the size or quantity, surfaces or items, access, and anything that affects the scope..."
              : "Size of the job, access notes, pets, or supplies needed..."
          }
        />
      </div>

      <div className="space-y-3 rounded-xl border border-line bg-court p-4 text-sm">
        {isQuote ? (
          <>
            <div className="flex items-center justify-between gap-4 font-semibold">
              <span>Pricing</span>
              <span className="text-right text-quad-700">
                {selected ? formatOfferedPrice(selected) : "Quote required"}
              </span>
            </div>
            <div className="rounded-lg border border-gold-300 bg-gold-100 p-3 text-gold-900">
              <p className="font-semibold">
                Images or a video may be required for an accurate quote.
              </p>
              <p className="mt-1 text-xs leading-5">
                After you send this request, use the private booking chat to
                share images or a short video if the provider needs them to
                prepare an accurate quote.
              </p>
            </div>
            <p className="border-t border-line pt-3 text-xs text-mist">
              You are not charged when requesting a quote. The provider reviews
              the job and sends a final flat price. You choose whether to
              confirm and pay that price. College Crew&apos;s 5% fee comes from
              provider earnings, with no added customer platform fee.
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between font-semibold">
              <span>Hourly rate</span>
              <span className="text-quad-700">
                {selected ? formatOfferedPrice(selected) : "-"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Estimated subtotal</span>
              <span>{estimatedSubtotal == null ? "-" : formatMoney(estimatedSubtotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Due after provider accepts</span>
              <span>
                {selected?.hourly_rate_cents == null
                  ? "-"
                  : formatMoney(selected.hourly_rate_cents)}
              </span>
            </div>
            <p className="border-t border-line pt-3 text-xs text-mist">
              The first hour is paid only after acceptance. Final billing uses
              the provider&apos;s submitted actual time, rounded to 15-minute
              increments. College Crew&apos;s fee comes from provider earnings.
              There is no added customer platform fee. Cancel before payment and
              there is no charge; the 12-hour cancellation policy applies after
              payment.
            </p>
          </>
        )}
      </div>

      <FieldError>{state.error}</FieldError>

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={pending || !effectiveResponseHours || !originReady}
      >
        {pending
          ? "Sending request..."
          : isQuote
            ? "Request flat quote"
            : "Send hourly request"}
      </Button>
    </form>
  );
}
