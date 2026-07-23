"use client";

import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import { useActionState, useMemo, useState, useTransition } from "react";

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

import {
  createBookingRequest,
  finalizeBooking,
  startBookingAuthorization,
  type AuthorizeState,
  type BookingFormState,
} from "./actions";

const DURATION_OPTIONS = Array.from(
  {
    length:
      (CUSTOMER_ESTIMATE_MINUTES.max - CUSTOMER_ESTIMATE_MINUTES.min) / 15 + 1,
  },
  (_, index) => CUSTOMER_ESTIMATE_MINUTES.min + index * 15,
);

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
  const [quoteState, quoteAction, quotePending] = useActionState<
    BookingFormState,
    FormData
  >(createBookingRequest, {});
  const [authState, authAction, authPending] = useActionState<
    AuthorizeState,
    FormData
  >(startBookingAuthorization, {});

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
          <FieldHint>
            {isQuote
              ? "Central Time"
              : "Central Time · book at least 12 hours ahead"}
          </FieldHint>
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

      {isQuote ? (
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
      ) : (
        <fieldset>
          <legend className="mb-2 block text-sm font-medium text-ink">
            If your student can&apos;t make it
          </legend>
          <div className="space-y-2">
            <label className="flex gap-3 rounded-xl border border-line bg-court p-3 text-sm text-ink-soft">
              <input
                type="radio"
                name="onDeclinePreference"
                value="keep_control"
                defaultChecked
                className="mt-1 h-4 w-4 border-line"
              />
              <span>
                <span className="font-medium text-ink">
                  Let me choose a replacement
                </span>
                <br />
                We free your hold and show other available students to pick from.
              </span>
            </label>
            <label className="flex gap-3 rounded-xl border border-line bg-court p-3 text-sm text-ink-soft">
              <input
                type="radio"
                name="onDeclinePreference"
                value="auto_rematch"
                className="mt-1 h-4 w-4 border-line"
              />
              <span>
                <span className="font-medium text-ink">
                  Suggest the best match automatically
                </span>
                <br />
                We free your hold and surface the top available student to
                re-book in one step.
              </span>
            </label>
          </div>
        </fieldset>
      )}

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
              <span>Held now (first hour)</span>
              <span>
                {selected?.hourly_rate_cents == null
                  ? "-"
                  : formatMoney(selected.hourly_rate_cents)}
              </span>
            </div>
            <p className="border-t border-line pt-3 text-xs text-mist">
              We place a hold for the first hour now. Your student has 2 hours to
              accept — if they accept, the hold is charged; if they decline or
              time out, the hold is released and you&apos;re never charged. Final
              billing uses the provider&apos;s submitted actual time, rounded to
              15-minute increments. College Crew&apos;s fee comes from provider
              earnings; there is no added customer platform fee.
            </p>
          </>
        )}
      </div>

      <FieldError>{error}</FieldError>

      {unconfigured ? (
        <div className="rounded-lg border border-gold-400/60 bg-gold-100 p-4 text-sm text-gold-800">
          <p className="font-semibold">Payments aren&apos;t live yet.</p>
          <p className="mt-1">
            Stripe isn&apos;t configured in this environment. This will run the
            real (test-mode) authorization once it is.
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
          (isQuote && !effectiveResponseHours) ||
          !scheduledLocal
        }
      >
        {pending
          ? isQuote
            ? "Sending request..."
            : "Preparing hold..."
          : isQuote
            ? "Request flat quote"
            : selected?.hourly_rate_cents != null
              ? `Continue to hold ${formatMoney(selected.hourly_rate_cents)}`
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
  holdLabel,
}: {
  paymentIntentId: string;
  holdLabel: string;
}) {
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

    const result = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: {
        return_url: `${window.location.origin}/dashboard`,
      },
    });

    if (result.error) {
      setError(
        result.error.message ?? "Card hold didn't go through. Please try again.",
      );
      setSubmitting(false);
      return;
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
        We&apos;ll place a {holdLabel} hold for the first hour. You&apos;re only
        charged if your student accepts.
      </p>
      <PaymentElement />
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={!stripe || !elements || submitting}
      >
        {submitting ? "Placing hold…" : `Place ${holdLabel} hold & request`}
      </Button>
      <p className="text-center text-xs text-mist">
        Test mode: use card 4242 4242 4242 4242, any future expiry, any CVC.
      </p>
      <FieldError>{error}</FieldError>
    </form>
  );
}
