"use client";

import { Elements } from "@stripe/react-stripe-js";
import { useActionState } from "react";

import { useBookingCopy } from "@/components/content/booking-copy-provider";
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
  const copy = useBookingCopy();
  return (
    <div className="rounded-lg border border-gold-400/60 bg-gold-100 p-4 text-sm text-gold-800">
      <p className="font-semibold">
        {copy("booking-customer.confirm.payments-title")}
      </p>
      <p className="mt-1">
        {copy("booking-customer.confirm.payments-body")}
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
  isQuote = false,
}: {
  bookingId: string;
  payLabel: string;
  isZeroBalance: boolean;
  isQuote?: boolean;
}) {
  const copy = useBookingCopy();
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
        <p className="font-semibold">
          {copy("booking-customer.invoice.complete")}
        </p>
        <p className="mt-1">
          {copy("booking-customer.invoice.complete-body")}
        </p>
      </div>
    );
  }
  if (state.processing) {
    return (
      <div className="rounded-lg border border-quad-200 bg-quad-50 p-4 text-sm text-quad-800">
        <p className="font-semibold">Payment submitted.</p>
        <p className="mt-1">
          We&apos;re finishing up. This page updates to Completed once the
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
            ? copy("booking-customer.invoice.confirm-button")
            : `Confirm & pay ${payLabel}`}
      </Button>
      {isZeroBalance ? (
        <p className="text-center text-xs text-mist">
          {isQuote
            ? "Your deposit already covers this invoice; no additional charge."
            : "The first hour already covers this invoice; no additional charge."}
        </p>
      ) : (
        <p className="text-center text-xs text-mist">
          Charges the card you saved when you {isQuote ? "paid the deposit" : "authorized the first hour"}.
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
  const copy = useBookingCopy();
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
        <p className="font-semibold">
          {copy("booking-customer.invoice.payment-failed")}
        </p>
        <p className="mt-1">
          Update or re-authorize your card to finish paying this invoice.
        </p>
      </div>
      <form action={formAction}>
        <input type="hidden" name="bookingId" value={bookingId} />
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending
            ? "Preparing…"
            : copy("booking-customer.invoice.update-payment")}
        </Button>
      </form>
      <FieldError>{state.error}</FieldError>
    </div>
  );
}
