"use client";

import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import {
  useActionState,
  useCallback,
  useState,
  useTransition,
} from "react";

import { JobPhotoPicker } from "@/components/booking/job-photo-picker";
import { FormLoader } from "@/components/form-loader";
import { useBookingCopy } from "@/components/content/booking-copy-provider";
import { QuoteDaypartPicker } from "@/components/scheduling/quote-daypart-picker";
import { SchedulePicker } from "@/components/scheduling/schedule-picker";
import { Button } from "@/components/ui/button";
import {
  FieldError,
  FieldHint,
  Label,
  Select,
  Textarea,
} from "@/components/ui/field";
import {
  BASIS_POINTS_SCALE,
  BILLING_INCREMENT_MINUTES,
  PLATFORM_FEE_BPS,
  calculateHourlySubtotalCents,
} from "@/lib/booking/policy";
import type { OfferedService, ProviderSchedule } from "@/lib/db/queries";
import type { QuoteDaypart } from "@/lib/booking/quote-dayparts";
import { MIN_JOB_PHOTOS, type JobPhoto } from "@/lib/media/job-photos";
import { formatMoney, formatOfferedPrice } from "@/lib/utils";

import {
  createBookingRequest,
  finalizeBooking,
  startBookingAuthorization,
  type AuthorizeState,
  type BookingFormState,
} from "./actions";

/**
 * Stripe.js is loaded lazily on first use, and deliberately NOT imported from
 * the confirm route's panel. That module calls `loadStripe()` at module scope;
 * importing it from a second route pulls it into a shared chunk, so it runs on
 * pages that never render a Payment Element and breaks their hydration.
 */
let stripeJs: Promise<StripeJs | null> | null | undefined;

function getStripePromise() {
  if (stripeJs === undefined) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    stripeJs = key ? loadStripe(key) : null;
  }
  return stripeJs;
}

/** Match the Payment Element to the cream/forest theme. */
const appearance = {
  variables: {
    colorPrimary: "#344945",
    colorBackground: "#fffdf8",
    colorText: "#344945",
    colorDanger: "#b3261e",
    borderRadius: "8px",
  },
} as const;

/**
 * Prefill for a repeat booking. Date and time are intentionally absent: the old
 * ones are stale, and asking again is the point. The duration carries over as a
 * hint, so opening a day preselects a range the same length as last time.
 */
export type RebookDefaults = {
  /** The service booked last time; resolved to this provider's offering of it. */
  serviceId?: string;
  estimatedMinutes?: number;
  details?: string;
};

export function BookingRequestForm({
  services,
  originReady,
  schedule,
  minimumNoticeHours,
  timeRestrictionsDisabled,
  initial,
  userId,
}: {
  services: OfferedService[];
  /** False until "Booking from" resolves to a usable service address. */
  originReady: boolean;
  /** The provider's open days and reserved ranges over the booking horizon. */
  schedule: ProviderSchedule;
  minimumNoticeHours: number;
  /** Temporary founder-controlled testing override for timing gates only. */
  timeRestrictionsDisabled: boolean;
  /** Set when the customer arrived via "Book again". */
  initial?: RebookDefaults;
  /** Job photos upload to this customer's own storage folder. */
  userId: string;
}) {
  const copy = useBookingCopy();
  const [quoteState, quoteAction, quotePending] = useActionState<
    BookingFormState,
    FormData
  >(createBookingRequest, {});
  const [authState, authAction, authPending] = useActionState<
    AuthorizeState,
    FormData
  >(startBookingAuthorization, {});

  const [selectedId, setSelectedId] = useState(() => {
    const repeated = initial?.serviceId
      ? services.find((offered) => offered.service.id === initial.serviceId)
      : undefined;
    return repeated?.id ?? services[0]?.id ?? "";
  });
  // The picked range is the whole schedule: its start is the booking time and
  // its length is the estimate. Null until the customer has picked both ends.
  const [slot, setSlot] = useState<{
    scheduledLocal: string;
    estimatedMinutes: number;
  } | null>(null);
  const [quoteSchedule, setQuoteSchedule] = useState<{
    requestedDate: string;
    requestedDaypart: QuoteDaypart;
  } | null>(null);
  const [jobPhotoCount, setJobPhotoCount] = useState(0);
  const handleJobPhotosChange = useCallback(
    (photos: JobPhoto[]) => setJobPhotoCount(photos.length),
    [],
  );

  const selected = services.find((service) => service.id === selectedId);
  const isQuote = selected?.pricing_mode === "quote";
  const estimatedMinutes = slot?.estimatedMinutes ?? 0;
  // Only priceable once a full range is picked; the calculation rejects
  // durations outside the bookable band rather than guessing.
  const estimatedSubtotal =
    selected?.hourly_rate_cents != null && estimatedMinutes > 0
      ? calculateHourlySubtotalCents(selected.hourly_rate_cents, estimatedMinutes)
      : null;

  // Instant-book pay step: the hold is authorized, mount the Payment Element.
  const stripePromise = authState.clientSecret ? getStripePromise() : null;
  const unconfigured =
    authState.unconfigured ||
    Boolean(authState.clientSecret && !stripePromise);

  if (!isQuote && authState.clientSecret && stripePromise) {
    return (
      <Elements
        stripe={stripePromise}
        options={{ clientSecret: authState.clientSecret, appearance }}
      >
        <AuthorizeHoldForm
          paymentIntentId={authState.paymentIntentId ?? ""}
          clientSecret={authState.clientSecret}
          holdLabel={
            selected?.hourly_rate_cents != null
              ? formatMoney(selected.hourly_rate_cents)
              : ""
          }
        />
      </Elements>
    );
  }

  const action = isQuote ? quoteAction : authAction;
  const pending = isQuote ? quotePending : authPending;
  const error = isQuote ? quoteState.error : authState.error;

  return (
    <form action={action} className="space-y-5">
      <FormLoader />

      <div>
        <Label htmlFor="providerServiceId">
          {copy("booking-customer.request.service-label")}
        </Label>
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

      <fieldset>
        <legend className="mb-2 block text-sm font-medium text-ink">
          {copy("booking-customer.request.schedule-label")}
        </legend>
        {isQuote ? (
          <QuoteDaypartPicker
            days={schedule.days}
            busy={schedule.busy}
            nowIso={schedule.nowIso}
            minimumNoticeHours={
              timeRestrictionsDisabled ? 0 : Math.max(12, minimumNoticeHours)
            }
            horizonStart={schedule.horizonStart}
            horizonEnd={schedule.horizonEnd}
            onChange={setQuoteSchedule}
          />
        ) : (
          <SchedulePicker
            days={schedule.days}
            busy={schedule.busy}
            nowIso={schedule.nowIso}
            minimumNoticeHours={minimumNoticeHours}
            horizonStart={schedule.horizonStart}
            horizonEnd={schedule.horizonEnd}
            onChange={setSlot}
            preferredMinutes={initial?.estimatedMinutes}
            gridLabel="Choose a date to book"
          />
        )}
        <FieldHint>
          {isQuote
            ? copy("booking-customer.request.quote-schedule-hint")
            : copy("booking-customer.request.schedule-hint")}
        </FieldHint>
      </fieldset>

      {isQuote ? (
        <div className="rounded-xl border border-line bg-court p-4 text-sm">
          <p className="font-medium text-ink">Quote response window: 2 hours</p>
          <FieldHint>
            {timeRestrictionsDisabled
              ? "Testing mode: the usual quote scheduling notice is temporarily disabled."
              : "Quote jobs require at least 12 hours’ notice; if the provider misses the two-hour window, you can choose a replacement."}
          </FieldHint>
        </div>
      ) : (
        <fieldset>
          <legend className="mb-2 block text-sm font-medium text-ink">
            {copy("booking-customer.request.flexibility-label")}
          </legend>
          <div className="space-y-2">
            <label className="flex gap-3 rounded-xl border border-line bg-court p-3 text-sm text-ink-soft">
              <input
                type="radio"
                name="timeFlexibility"
                value="flexible"
                defaultChecked
                className="mt-1 h-4 w-4 border-line"
              />
              <span>
                <span className="font-medium text-ink">
                  {copy("booking-customer.request.flexible-title")}
                </span>
                <br />
                {copy("booking-customer.request.flexible-body")}
              </span>
            </label>
            <label className="flex gap-3 rounded-xl border border-line bg-court p-3 text-sm text-ink-soft">
              <input
                type="radio"
                name="timeFlexibility"
                value="fixed"
                className="mt-1 h-4 w-4 border-line"
              />
              <span>
                <span className="font-medium text-ink">
                  {copy("booking-customer.request.fixed-title")}
                </span>
                <br />
                {copy("booking-customer.request.fixed-body")}
              </span>
            </label>
          </div>
        </fieldset>
      )}

      {isQuote ? (
        <JobPhotoPicker
          userId={userId}
          disabled={pending}
          onChange={handleJobPhotosChange}
        />
      ) : null}

      <div>
        <Label htmlFor="details">
          {copy("booking-customer.request.details-label")}
        </Label>
        <Textarea
          id="details"
          name="details"
          rows={4}
          maxLength={2000}
          defaultValue={initial?.details}
          placeholder={
            isQuote
              ? copy("booking-customer.request.quote-details-placeholder")
              : copy("booking-customer.request.details-placeholder")
          }
        />
      </div>

      <div className="space-y-3 rounded-xl border border-line bg-court p-4 text-sm">
        {isQuote ? (
          <>
            <div className="flex items-center justify-between gap-4 font-semibold">
              <span>
                {copy("booking-customer.request.quote-pricing-label")}
              </span>
              <span className="text-right text-quad-700">
                {selected
                  ? formatOfferedPrice(selected)
                  : copy("booking-customer.request.quote-required")}
              </span>
            </div>
            <div className="rounded-lg border border-gold-300 bg-gold-100 p-3 text-gold-900">
              <p className="font-semibold">
                {copy("booking-customer.request.quote-media-title")}
              </p>
              <p className="mt-1 text-xs leading-5">
                {copy("booking-customer.request.quote-media-body")}
              </p>
            </div>
            <p className="border-t border-line pt-3 text-xs text-mist">
              {copy("booking-customer.request.quote-policy", {
                platform_fee_percent:
                  (PLATFORM_FEE_BPS / BASIS_POINTS_SCALE) * 100,
              })}
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between font-semibold">
              <span>{copy("booking-customer.request.hourly-rate-label")}</span>
              <span className="text-quad-700">
                {selected ? formatOfferedPrice(selected) : "-"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>{copy("booking-customer.request.estimate-label")}</span>
              <span>{estimatedSubtotal == null ? "-" : formatMoney(estimatedSubtotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{copy("booking-customer.request.hold-label")}</span>
              <span>
                {selected?.hourly_rate_cents == null
                  ? "-"
                  : formatMoney(selected.hourly_rate_cents)}
              </span>
            </div>
            <p className="border-t border-line pt-3 text-xs text-mist">
              {copy("booking-customer.request.hold-policy", {
                response_hours: 2,
                billing_increment: BILLING_INCREMENT_MINUTES,
              })}
            </p>
          </>
        )}
      </div>

      <FieldError>{error}</FieldError>

      {unconfigured ? (
        <div className="rounded-lg border border-gold-400/60 bg-gold-100 p-4 text-sm text-gold-800">
          <p className="font-semibold">
            {copy("booking-customer.request.payments-title")}
          </p>
          <p className="mt-1">
            {copy("booking-customer.request.payments-body")}
          </p>
        </div>
      ) : null}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={
          pending ||
          !originReady ||
          (isQuote && jobPhotoCount < MIN_JOB_PHOTOS) ||
          (isQuote ? !quoteSchedule : !slot)
        }
      >
        {pending
          ? isQuote
            ? copy("booking-customer.request.quote-pending")
            : copy("booking-customer.request.continue-pending")
          : isQuote
            ? jobPhotoCount < MIN_JOB_PHOTOS
              ? copy("booking-customer.request.quote-photo-required")
              : copy("booking-customer.request.quote-submit")
            : selected?.hourly_rate_cents != null
              ? copy("booking-customer.request.continue-button", {
                  hold_amount: formatMoney(selected.hourly_rate_cents),
                })
              : "Continue"}
      </Button>
    </form>
  );
}

/**
 * Instant-book pay step. Confirms the manual-capture PaymentIntent (which places
 * the hold — no charge), then finalizes the booking, which creates it and
 * notifies the student. Must be a child of <Elements>.
 */
function AuthorizeHoldForm({
  paymentIntentId,
  clientSecret,
  holdLabel,
}: {
  paymentIntentId: string;
  clientSecret: string;
  holdLabel: string;
}) {
  const copy = useBookingCopy();
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [, startFinalize] = useTransition();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setError(undefined);

    // If the hold is already in place — a previous attempt authorized the card
    // but failed to create the booking — don't confirm again: Stripe rejects
    // re-confirming an authorized intent, which would strand the hold with no
    // way forward. Retry the booking creation directly instead.
    const existing = await stripe.retrievePaymentIntent(clientSecret);
    const alreadyHeld = existing.paymentIntent?.status === "requires_capture";

    if (!alreadyHeld) {
      const result = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
        confirmParams: {
          return_url: `${window.location.origin}/dashboard`,
        },
      });

      if (result.error) {
        setError(
          result.error.message ?? copy("booking-customer.request.hold-error"),
        );
        setSubmitting(false);
        return;
      }
    }

    // Manual-capture intents land in `requires_capture` (authorized, not
    // charged). Create the booking; the action redirects on success.
    startFinalize(async () => {
      const finalizeResult = await finalizeBooking(paymentIntentId);
      if (finalizeResult?.error) {
        setError(finalizeResult.error);
        setSubmitting(false);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm text-ink-soft">
        {copy("booking-customer.request.hold-intro", {
          hold_amount: holdLabel,
        })}
      </p>
      <PaymentElement />
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={!stripe || !elements || submitting}
      >
        {submitting
          ? "Placing hold…"
          : copy("booking-customer.request.hold-submit", {
              hold_amount: holdLabel,
            })}
      </Button>
      <p className="text-center text-xs text-mist">
        Test mode: use card 4242 4242 4242 4242, any future expiry, any CVC.
      </p>
      <FieldError>{error}</FieldError>
    </form>
  );
}
