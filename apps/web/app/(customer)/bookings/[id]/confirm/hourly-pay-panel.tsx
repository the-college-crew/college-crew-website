"use client";

import { Elements } from "@stripe/react-stripe-js";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { HOURLY_PAYMENT_AUTHORIZATION } from "@/lib/legal/waivers";

import { confirmFirstHourPayment, type ConfirmPayState } from "./actions";
import { PaymentForm, appearance, stripePromise } from "./confirm-pay-panel";

/**
 * Hourly first-hour payment panel. Step 1 collects the risk-addendum and the
 * saved-method authorization, then runs the server action to mint the
 * PaymentIntent. Step 2 mounts the shared Payment Element. The booking becomes
 * `booked` only when the webhook confirms the charge.
 */
export function HourlyPayPanel({
  bookingId,
  firstHourLabel,
  estimatedTotalLabel,
  balanceLabel,
  consentLabel,
}: {
  bookingId: string;
  firstHourLabel: string;
  estimatedTotalLabel: string;
  balanceLabel: string;
  consentLabel: string;
}) {
  const [state, formAction, pending] = useActionState<ConfirmPayState, FormData>(
    confirmFirstHourPayment,
    {},
  );

  const unconfigured =
    state.unconfigured || Boolean(state.clientSecret && !stripePromise);

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

  if (unconfigured) {
    return (
      <div className="rounded-lg border border-gold-400/60 bg-gold-100 p-4 text-sm text-gold-800">
        <p className="font-semibold">Payments aren&apos;t live yet.</p>
        <p className="mt-1">
          Stripe isn&apos;t configured in this environment. This button will run
          the real (test-mode) payment once it is.
        </p>
        <FieldError>{state.error}</FieldError>
      </div>
    );
  }

  return (
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

      <label className="flex gap-3 rounded-xl border border-line bg-court p-4 text-sm text-ink-soft">
        <input
          type="checkbox"
          name="authorizePayment"
          className="mt-1 h-4 w-4 rounded border-line"
        />
        <span>
          {HOURLY_PAYMENT_AUTHORIZATION} The displayed first-hour amount is{" "}
          {firstHourLabel}; the current estimate is {estimatedTotalLabel}, with
          an estimated remaining balance of {balanceLabel}.
        </span>
      </label>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Preparing payment…" : `Pay first hour (${firstHourLabel})`}
      </Button>

      <FieldError>{state.error}</FieldError>
    </form>
  );
}
