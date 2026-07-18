"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import {
  BILLING_INCREMENT_MINUTES,
  PROVIDER_INVOICE_MINUTES,
  calculateInvoiceAllocation,
  isDurationValid,
} from "@/lib/booking/policy";
import { formatMoney } from "@/lib/utils";

import { submitInvoice } from "../../../actions";
import type { BookingRequestActionState } from "../../../actions";

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} hr`;
  return `${hours} hr ${rest} min`;
}

/**
 * Job Complete + invoice (Phase 5). Prefilled from elapsed wall time rounded up
 * to the quarter hour; editable in 15-minute steps within the invoice bounds.
 * Time beyond the customer's estimate requires an explanation. The money preview
 * uses the shared policy math — the server recomputes it authoritatively.
 */
export function ProviderInvoiceForm({
  bookingId,
  prefillMinutes,
  estimatedMinutes,
  rateCents,
}: {
  bookingId: string;
  prefillMinutes: number;
  estimatedMinutes: number;
  rateCents: number;
}) {
  const [state, formAction, pending] = useActionState<
    BookingRequestActionState,
    FormData
  >(submitInvoice, {});
  const [minutes, setMinutes] = useState(prefillMinutes);

  const valid = isDurationValid(minutes, PROVIDER_INVOICE_MINUTES);
  const overEstimate = minutes > estimatedMinutes;
  const allocation = valid ? calculateInvoiceAllocation(rateCents, minutes) : null;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="bookingId" value={bookingId} />

      <div className="rounded-2xl border border-line bg-white p-5">
        <label
          htmlFor="submittedMinutes"
          className="font-display text-sm font-semibold"
        >
          Billable time
        </label>
        <p className="mt-1 text-xs text-mist">
          Prefilled from elapsed time, rounded up to 15 minutes (1-hour minimum).
          Estimate was {formatMinutes(estimatedMinutes)}.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <input
            id="submittedMinutes"
            name="submittedMinutes"
            type="number"
            inputMode="numeric"
            step={BILLING_INCREMENT_MINUTES}
            min={PROVIDER_INVOICE_MINUTES.min}
            max={PROVIDER_INVOICE_MINUTES.max}
            value={minutes}
            onChange={(event) => setMinutes(Number(event.target.value))}
            className="w-28 rounded-lg border border-line bg-court px-3 py-2 text-sm"
          />
          <span className="text-sm text-ink-soft">
            minutes ({formatMinutes(minutes)})
          </span>
        </div>
        {!valid ? (
          <p className="mt-2 text-xs text-red-700">
            Enter 60–1440 minutes in 15-minute steps.
          </p>
        ) : null}
      </div>

      {overEstimate ? (
        <div className="rounded-2xl border border-gold-300 bg-gold-100 p-5">
          <label
            htmlFor="explanation"
            className="font-display text-sm font-semibold text-gold-800"
          >
            Explain the time beyond the estimate
          </label>
          <textarea
            id="explanation"
            name="explanation"
            rows={3}
            maxLength={2000}
            required
            className="mt-2 w-full rounded-lg border border-gold-300 bg-white px-3 py-2 text-sm"
            placeholder="e.g. The yard was larger than described and needed a second pass."
          />
        </div>
      ) : (
        <input type="hidden" name="explanation" value="" />
      )}

      {allocation ? (
        <div className="rounded-2xl border border-line bg-white p-5 text-sm">
          <dl className="space-y-2">
            <div className="flex justify-between gap-4">
              <dt className="text-mist">Invoice total</dt>
              <dd>{formatMoney(allocation.subtotalCents)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-mist">Platform fee (5%)</dt>
              <dd>– {formatMoney(allocation.totalPlatformFeeCents)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-line pt-2">
              <dt className="font-semibold">Your payout</dt>
              <dd className="font-semibold text-quad-700">
                {formatMoney(
                  allocation.subtotalCents - allocation.totalPlatformFeeCents,
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-mist">Customer balance due</dt>
              <dd>{formatMoney(allocation.remainingBalanceCents)}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={pending || !valid}
      >
        {pending ? "Submitting…" : "Submit job complete & invoice"}
      </Button>
      <FieldError>{state.error}</FieldError>
    </form>
  );
}
