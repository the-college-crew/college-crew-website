"use client";

import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import { useActionState, useState, useTransition } from "react";

import { FormLoader } from "@/components/form-loader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field";
import { formatMoney } from "@/lib/utils";

import {
  finalizeReplacement,
  startReplacementAuthorization,
  type ReplacementAuthState,
} from "./actions";

export type ReplacementCandidate = {
  providerServiceId: string;
  providerId: string;
  providerName: string;
  hourlyRateCents: number;
  rating: { avg: number; count: number } | null;
};

/** Lazy Stripe.js init — only runs once a hold client secret exists, so pages
 *  that never mount a Payment Element don't load Stripe. */
let stripeJs: Promise<StripeJs | null> | null | undefined;

function getStripePromise() {
  if (stripeJs === undefined) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    stripeJs = key ? loadStripe(key) : null;
  }
  return stripeJs;
}

const appearance = {
  variables: {
    colorPrimary: "#344945",
    colorBackground: "#fffdf8",
    colorText: "#344945",
    colorDanger: "#b3261e",
    borderRadius: "8px",
  },
} as const;

export function ReplacementForm({
  bookingId,
  candidates,
}: {
  bookingId: string;
  candidates: ReplacementCandidate[];
}) {
  const [state, formAction, pending] = useActionState<
    ReplacementAuthState,
    FormData
  >(startReplacementAuthorization, {});
  const [selectedId, setSelectedId] = useState(
    candidates[0]?.providerServiceId ?? "",
  );
  const selected = candidates.find((c) => c.providerServiceId === selectedId);

  const stripePromise = state.clientSecret ? getStripePromise() : null;
  const unconfigured =
    state.unconfigured || Boolean(state.clientSecret && !stripePromise);

  // Hold authorized: mount the Payment Element (with the saved card on file).
  if (state.clientSecret && stripePromise) {
    return (
      <Elements
        stripe={stripePromise}
        options={{
          clientSecret: state.clientSecret,
          customerSessionClientSecret: state.customerSessionClientSecret,
          appearance,
        }}
      >
        <AuthorizeReplacementHold
          paymentIntentId={state.paymentIntentId ?? ""}
          clientSecret={state.clientSecret}
          originalBookingId={bookingId}
          holdLabel={selected ? formatMoney(selected.hourlyRateCents) : ""}
        />
      </Elements>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <FormLoader />
      <input type="hidden" name="originalBookingId" value={bookingId} />

      <div className="space-y-3">
        {candidates.map((candidate) => (
          <label key={candidate.providerServiceId} className="block cursor-pointer">
            <input
              type="radio"
              name="providerServiceId"
              value={candidate.providerServiceId}
              checked={selectedId === candidate.providerServiceId}
              onChange={() => setSelectedId(candidate.providerServiceId)}
              className="peer sr-only"
            />
            <Card className="p-4 peer-checked:border-crew-600 peer-checked:ring-2 peer-checked:ring-crew-200">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-display text-lg font-semibold">
                    {candidate.providerName}
                  </p>
                  <p className="mt-1 text-xs text-mist">
                    {candidate.rating
                      ? `${candidate.rating.avg.toFixed(1)} ★ · ${candidate.rating.count} review${candidate.rating.count === 1 ? "" : "s"}`
                      : "New to the crew"}
                  </p>
                </div>
                <span className="font-semibold text-quad-700">
                  {formatMoney(candidate.hourlyRateCents)}/hr
                </span>
              </div>
            </Card>
          </label>
        ))}
      </div>

      <p className="text-xs text-mist">
        We place a fresh first-hour hold on the provider you choose using the
        card on file. Your original request is withdrawn and its hold released —
        you&apos;re only charged if the new provider accepts within 2 hours.
      </p>

      {unconfigured ? (
        <div className="rounded-lg border border-gold-400/60 bg-gold-100 p-4 text-sm text-gold-800">
          <p className="font-semibold">Payments aren&apos;t live yet.</p>
          <p className="mt-1">
            Stripe isn&apos;t configured in this environment. This will run the
            real (test-mode) authorization once it is.
          </p>
        </div>
      ) : null}

      <FieldError>{state.error}</FieldError>
      <Button type="submit" size="lg" className="w-full" disabled={pending || !selectedId}>
        {pending
          ? "Preparing hold…"
          : selected
            ? `Continue to hold ${formatMoney(selected.hourlyRateCents)}`
            : "Continue"}
      </Button>
    </form>
  );
}

/**
 * Confirm the fresh manual-capture hold on the chosen provider, then finalize —
 * which withdraws the original request and releases its old hold. Mirrors the
 * instant-book pay step; must be a child of <Elements>.
 */
function AuthorizeReplacementHold({
  paymentIntentId,
  clientSecret,
  originalBookingId,
  holdLabel,
}: {
  paymentIntentId: string;
  clientSecret: string;
  originalBookingId: string;
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

    // If a prior attempt already authorized the card but failed to create the
    // booking, don't re-confirm (Stripe rejects re-confirming a held intent) —
    // retry the finalize directly.
    const existing = await stripe.retrievePaymentIntent(clientSecret);
    const alreadyHeld = existing.paymentIntent?.status === "requires_capture";

    if (!alreadyHeld) {
      const result = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
        confirmParams: { return_url: `${window.location.origin}/dashboard` },
      });
      if (result.error) {
        setError(
          result.error.message ?? "Card hold didn't go through. Please try again.",
        );
        setSubmitting(false);
        return;
      }
    }

    startFinalize(async () => {
      const res = await finalizeReplacement(paymentIntentId, originalBookingId);
      if (res?.error) {
        setError(res.error);
        setSubmitting(false);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm text-ink-soft">
        We&apos;ll place a {holdLabel} hold for the first hour with the card on
        file. You&apos;re only charged if your new student accepts.
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
