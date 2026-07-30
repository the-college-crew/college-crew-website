"use client";

import { Elements } from "@stripe/react-stripe-js";
import { useActionState, useState } from "react";

import { useBookingCopy } from "@/components/content/booking-copy-provider";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import {
  MAX_TIP_CENTS,
  TIP_PRESETS_CENTS,
  normalizeTipCents,
} from "@/lib/booking/policy";
import { formatMoney } from "@/lib/utils";

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
 * Optional tip, defaulted to none. Presets are fixed dollar amounts rather than
 * percentages so the choice reads the same on a small job as a large one, and
 * the disclosure states plainly that the student keeps all of it — a tip here is
 * never framed as expected, since paying in person or not at all is equally fine.
 */
function TipPicker({
  tipCents,
  onChange,
  disabled,
}: {
  tipCents: number;
  onChange: (cents: number) => void;
  disabled: boolean;
}) {
  const copy = useBookingCopy();
  const isPreset = tipCents === 0 || TIP_PRESETS_CENTS.includes(tipCents as 500);
  const [custom, setCustom] = useState(!isPreset);
  const options = [{ label: "None", cents: 0 }].concat(
    TIP_PRESETS_CENTS.map((cents) => ({ label: formatMoney(cents), cents })),
  );

  return (
    <div className="rounded-lg border border-line bg-court p-3">
      <p className="text-sm font-semibold text-ink">
        {copy("booking-customer.invoice.tip-prompt")}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = !custom && tipCents === option.cents;
          return (
            <button
              key={option.label}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => {
                setCustom(false);
                onChange(option.cents);
              }}
              className={`min-w-16 rounded-md border px-3 py-1.5 text-sm ${
                selected
                  ? "border-quad-600 bg-quad-50 font-semibold text-quad-800"
                  : "border-line bg-white text-ink-soft"
              }`}
            >
              {option.label}
            </button>
          );
        })}
        <button
          type="button"
          disabled={disabled}
          aria-pressed={custom}
          onClick={() => {
            setCustom(true);
            onChange(0);
          }}
          className={`min-w-16 rounded-md border px-3 py-1.5 text-sm ${
            custom
              ? "border-quad-600 bg-quad-50 font-semibold text-quad-800"
              : "border-line bg-white text-ink-soft"
          }`}
        >
          Other
        </button>
      </div>

      {custom ? (
        <label className="mt-2 flex items-center gap-2 text-sm">
          <span className="text-mist">$</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={MAX_TIP_CENTS / 100}
            step="0.01"
            disabled={disabled}
            defaultValue={tipCents > 0 ? (tipCents / 100).toString() : ""}
            onChange={(event) => {
              const dollars = Number(event.target.value);
              onChange(
                Number.isFinite(dollars)
                  ? normalizeTipCents(Math.round(dollars * 100))
                  : 0,
              );
            }}
            className="w-24 rounded-md border border-line px-2 py-1"
            aria-label="Custom tip amount in dollars"
          />
        </label>
      ) : null}

      <p className="mt-2 text-xs text-mist">
        {copy("booking-customer.invoice.tip-note")}
      </p>
    </div>
  );
}

/**
 * Confirm & pay the remaining balance now (Phase 5). One-click charges the saved
 * method; only a bank authentication requirement mounts the Payment Element. A
 * zero balance with no tip settles the job with no charge. The booking flips to
 * `completed` from the webhook, so success shows a "finishing up" note.
 */
export function InvoicePayPanel({
  bookingId,
  remainingBalanceCents,
  isQuote = false,
}: {
  bookingId: string;
  remainingBalanceCents: number;
  isQuote?: boolean;
}) {
  const copy = useBookingCopy();
  const [tipCents, setTipCents] = useState(0);
  const [state, formAction, pending] = useActionState<InvoicePayState, FormData>(
    confirmInvoiceBalance,
    {},
  );
  const totalCents = remainingBalanceCents + tipCents;
  const isZeroCharge = totalCents === 0;

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
      <input type="hidden" name="tipCents" value={tipCents} />
      <TipPicker tipCents={tipCents} onChange={setTipCents} disabled={pending} />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending
          ? "Processing…"
          : isZeroCharge
            ? copy("booking-customer.invoice.confirm-button")
            : `Confirm & pay ${formatMoney(totalCents)}`}
      </Button>
      {isZeroCharge ? (
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
