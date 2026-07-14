"use client";

import { Elements } from "@stripe/react-stripe-js";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

import {
  PaymentForm,
  appearance,
  stripePromise,
} from "../confirm/confirm-pay-panel";
import {
  confirmInvoiceBalance,
  recoverInvoicePayment,
  type InvoicePayState,
} from "./actions";

function UnconfiguredNotice({ error }: { error?: string }) {
  return (
    <div className="rounded-lg border border-gold-400/60 bg-gold-100 p-4 text-sm text-gold-800">
      <p className="font-semibold">Payments aren&apos;t live yet.</p>
      <p className="mt-1">
        Stripe isn&apos;t configured in this environment — this button will run
        the real (test-mode) payment once it is.
      </p>
      <FieldError>{error}</FieldError>
    </div>
  );
}

/**
 * Confirm & pay the remaining balance now (Phase 5). One-click charges the saved
 * method; only a bank authentication requirement mounts the Payment Element. A
 * zero balance settles the job with no charge. The booking flips to `completed`
 * from the webhook, so success shows a "finishing up" note.
 */
export function InvoicePayPanel({
  bookingId,
  payLabel,
  isZeroBalance,
}: {
  bookingId: string;
  payLabel: string;
  isZeroBalance: boolean;
}) {
  const [state, formAction, pending] = useActionState<InvoicePayState, FormData>(
    confirmInvoiceBalance,
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
        <PaymentForm bookingId={bookingId} returnPath="invoice" />
      </Elements>
    );
  }
  if (unconfigured) return <UnconfiguredNotice error={state.error} />;

  if (state.settled) {
    return (
      <div className="rounded-lg border border-quad-200 bg-quad-50 p-4 text-sm text-quad-800">
        <p className="font-semibold">All set — the job is complete.</p>
        <p className="mt-1">You can leave a review from your bookings.</p>
      </div>
    );
  }
  if (state.processing) {
    return (
      <div className="rounded-lg border border-quad-200 bg-quad-50 p-4 text-sm text-quad-800">
        <p className="font-semibold">Payment submitted.</p>
        <p className="mt-1">
          We&apos;re finishing up — this page updates to Completed once the
          charge settles.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="bookingId" value={bookingId} />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending
          ? "Processing…"
          : isZeroBalance
            ? "Confirm & complete"
            : `Confirm & pay ${payLabel}`}
      </Button>
      {isZeroBalance ? (
        <p className="text-center text-xs text-mist">
          The first hour already covers this invoice — no additional charge.
        </p>
      ) : (
        <p className="text-center text-xs text-mist">
          Charges the card you saved when you paid the first hour.
        </p>
      )}
      <FieldError>{state.error}</FieldError>
    </form>
  );
}

/**
 * Recover a failed / action-required balance charge. Mints a fresh intent and
 * mounts the Payment Element so the customer can re-authenticate the saved card
 * or authorize a different one.
 */
export function InvoiceRecoveryPanel({ bookingId }: { bookingId: string }) {
  const [state, formAction, pending] = useActionState<InvoicePayState, FormData>(
    recoverInvoicePayment,
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
        <PaymentForm bookingId={bookingId} returnPath="invoice" />
      </Elements>
    );
  }
  if (unconfigured) return <UnconfiguredNotice error={state.error} />;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-semibold">That payment didn&apos;t go through.</p>
        <p className="mt-1">
          Update or re-authorize your card to finish paying this invoice.
        </p>
      </div>
      <form action={formAction}>
        <input type="hidden" name="bookingId" value={bookingId} />
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Preparing…" : "Update payment method"}
        </Button>
      </form>
      <FieldError>{state.error}</FieldError>
    </div>
  );
}
