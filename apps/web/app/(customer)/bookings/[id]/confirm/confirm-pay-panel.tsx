"use client";

import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useActionState, useState } from "react";

import { useBookingCopy } from "@/components/content/booking-copy-provider";
import { FormLoader } from "@/components/form-loader";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { BOOKING_CONSENT_LABEL } from "@/lib/legal/waivers";

import {
  confirmAndPay,
  declineQuoteOffer,
  simulatePayment,
  type ConfirmPayState,
} from "./actions";

/**
 * Module-level so the Stripe.js script loads once per session, not per
 * render. Null when the publishable key is absent (keyless checkout) — the
 * panel then degrades to the same "payments aren't live" notice the server
 * action returns for a missing secret key.
 */
const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
export const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

/** Match the Payment Element to the cream/forest theme. */
export const appearance = {
  variables: {
    colorPrimary: "#344945",
    colorBackground: "#fffdf8",
    colorText: "#344945",
    colorDanger: "#b3261e",
    borderRadius: "8px",
  },
} as const;

export function ConfirmPayPanel({
  bookingId,
  simulateAllowed,
  consentLabel = BOOKING_CONSENT_LABEL,
  requiresAuthorization = false,
}: {
  bookingId: string;
  simulateAllowed: boolean;
  consentLabel?: string;
  requiresAuthorization?: boolean;
}) {
  const copy = useBookingCopy();
  const [state, formAction, pending] = useActionState<
    ConfirmPayState,
    FormData
  >(confirmAndPay, {});

  const unconfigured =
    state.unconfigured || Boolean(state.clientSecret && !stripePromise);

  // Step 2: the intent exists — collect payment details.
  if (state.clientSecret && stripePromise) {
    return (
      <Elements
        stripe={stripePromise}
        options={{ clientSecret: state.clientSecret, appearance }}
      >
        <PaymentForm bookingId={bookingId} />
      </Elements>
    );
  }

  // Step 1: confirm the booking, which creates the PaymentIntent.
  return (
    <div className="space-y-3">
      {!unconfigured ? (
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="bookingId" value={bookingId} />
          <label className="flex gap-3 rounded-xl border border-line bg-court p-4 text-sm text-ink-soft">
            <input
              type="checkbox"
              name="acceptAddendum"
              className="mt-1 h-4 w-4 rounded border-line"
            />
            <span>{consentLabel}</span>
          </label>
          {requiresAuthorization ? (
            <label className="flex gap-3 rounded-xl border border-line bg-court p-4 text-sm text-ink-soft">
              <input
                type="checkbox"
                name="authorizePayment"
                className="mt-1 h-4 w-4 rounded border-line"
              />
              <span>
                I authorize the 20% deposit now and allow this saved payment
                method to be charged for the fixed remaining balance after the
                invoice review period for this booking only.
              </span>
            </label>
          ) : null}
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending
              ? "Preparing payment…"
              : requiresAuthorization
                ? "Pay 20% deposit"
                : "Confirm & pay"}
          </Button>
        </form>
      ) : (
        <div className="rounded-lg border border-gold-400/60 bg-gold-100 p-4 text-sm text-gold-800">
          <p className="font-semibold">
            {copy("booking-customer.confirm.payments-title")}
          </p>
          <p className="mt-1">
            {copy("booking-customer.confirm.payments-body")}
          </p>
          {simulateAllowed ? (
            <form action={simulatePayment} className="mt-3">
              <FormLoader />
              <input type="hidden" name="bookingId" value={bookingId} />
              <Button type="submit" variant="secondary" size="sm">
                Simulate payment (dev only)
              </Button>
            </form>
          ) : null}
        </div>
      )}

      <FieldError>{state.error}</FieldError>
    </div>
  );
}

export function DeclineQuoteOffer({ bookingId }: { bookingId: string }) {
  const [state, action, pending] = useActionState(declineQuoteOffer, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      <Button
        type="submit"
        variant="secondary"
        size="lg"
        className="w-full"
        disabled={pending}
      >
        {pending ? "Declining…" : "Decline quote and choose another provider"}
      </Button>
      <FieldError>{state.error}</FieldError>
    </form>
  );
}

/**
 * Inner form — must be a child of <Elements> so the hooks can reach the
 * Stripe context. On success Stripe redirects to the confirm page, which
 * shows "finalizing" until the webhook flips the booking to `paid`.
 */
export function PaymentForm({
  bookingId,
  returnPath = "confirm",
}: {
  bookingId: string;
  /** Path segment under /bookings/[id] to return to after Stripe redirects. */
  returnPath?: "confirm" | "invoice";
}) {
  const copy = useBookingCopy();
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setError(undefined);

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/bookings/${bookingId}/${returnPath}`,
      },
    });

    // Only validation/card errors land here — success navigates away.
    setError(
      result.error.message ?? copy("booking-customer.confirm.card-error"),
    );
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <PaymentElement />
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={!stripe || !elements || submitting}
      >
        {submitting ? "Paying…" : copy("booking-customer.confirm.pay-now")}
      </Button>
      <p className="text-center text-xs text-mist">
        Test mode: use card 4242 4242 4242 4242, any future expiry, any CVC.
      </p>
      <FieldError>{error}</FieldError>
    </form>
  );
}
