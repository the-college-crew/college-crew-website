"use client";

import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useActionState, useState } from "react";

import { FormLoader } from "@/components/form-loader";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

import { confirmAndPay, simulatePayment, type ConfirmPayState } from "./actions";

/**
 * Module-level so the Stripe.js script loads once per session, not per
 * render. Null when the publishable key is absent (keyless checkout) — the
 * panel then degrades to the same "payments aren't live" notice the server
 * action returns for a missing secret key.
 */
const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

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

export function ConfirmPayPanel({
  bookingId,
  simulateAllowed,
}: {
  bookingId: string;
  simulateAllowed: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    ConfirmPayState,
    FormData
  >(confirmAndPay, {});

  const unconfigured = state.unconfigured || !stripePromise;

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
        <form action={formAction}>
          <input type="hidden" name="bookingId" value={bookingId} />
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? "Preparing payment…" : "Confirm & pay"}
          </Button>
        </form>
      ) : (
        <div className="rounded-lg border border-gold-400/60 bg-gold-100 p-4 text-sm text-gold-800">
          <p className="font-semibold">Payments aren&apos;t live yet.</p>
          <p className="mt-1">
            Stripe isn&apos;t configured in this environment — this button
            will run the real (test-mode) payment once it is.
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

/**
 * Inner form — must be a child of <Elements> so the hooks can reach the
 * Stripe context. On success Stripe redirects to the confirm page, which
 * shows "finalizing" until the webhook flips the booking to `paid`.
 */
function PaymentForm({ bookingId }: { bookingId: string }) {
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
        return_url: `${window.location.origin}/bookings/${bookingId}/confirm`,
      },
    });

    // Only validation/card errors land here — success navigates away.
    setError(
      result.error.message ?? "Payment didn't go through — please try again.",
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
        {submitting ? "Paying…" : "Pay now"}
      </Button>
      <p className="text-center text-xs text-mist">
        Test mode — use card 4242 4242 4242 4242, any future expiry, any CVC.
      </p>
      <FieldError>{error}</FieldError>
    </form>
  );
}
