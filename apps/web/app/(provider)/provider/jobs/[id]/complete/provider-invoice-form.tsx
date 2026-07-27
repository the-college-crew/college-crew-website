"use client";

import { useActionState, useState } from "react";

import { useBookingCopy } from "@/components/content/booking-copy-provider";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import {
  BILLING_INCREMENT_MINUTES,
  PROVIDER_INVOICE_MINUTES,
  calculateInvoiceAllocation,
  isDurationValid,
} from "@/lib/booking/policy";
import { formatMoney } from "@/lib/utils";

import { settleJobInCash, submitInvoice } from "../../../actions";
import type { BookingRequestActionState } from "../../../actions";

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} hr`;
  return `${hours} hr ${rest} min`;
}

function MoneyPreview({
  rateCents,
  minutes,
}: {
  rateCents: number;
  minutes: number;
}) {
  const copy = useBookingCopy();
  const allocation = calculateInvoiceAllocation(rateCents, minutes);
  return (
    <div className="rounded-2xl border border-line bg-white p-5 text-sm">
      <dl className="space-y-2">
        <div className="flex justify-between gap-4">
          <dt className="text-mist">
            {copy("booking-provider.invoice.total-label")}
          </dt>
          <dd>{formatMoney(allocation.subtotalCents)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-mist">Platform fee (5%)</dt>
          <dd>– {formatMoney(allocation.totalPlatformFeeCents)}</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-line pt-2">
          <dt className="font-semibold">
            {copy("booking-provider.invoice.payout-label")}
          </dt>
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
  );
}

/**
 * Job Complete + invoice. The student closes the job out one of two ways:
 * "as planned" bills exactly the estimate the customer agreed to, or "the time
 * changed" opens the editor (prefilled with what the clock measured) and, when
 * it runs over, requires an explanation. Starting from the ESTIMATE rather than
 * measured time is deliberate — the default should be the number the customer
 * already signed off on, so nothing drifts upward without a decision.
 *
 * The money preview uses the shared policy math; the server recomputes it
 * authoritatively in `submit_job_invoice`.
 */
export function ProviderInvoiceForm({
  bookingId,
  estimatedMinutes,
  measuredMinutes,
  rateCents,
}: {
  bookingId: string;
  estimatedMinutes: number;
  /** Elapsed wall time since Arrived, rounded up to the quarter hour. */
  measuredMinutes: number;
  rateCents: number;
}) {
  const copy = useBookingCopy();
  const [state, formAction, pending] = useActionState<
    BookingRequestActionState,
    FormData
  >(submitInvoice, {});
  const [cashState, cashAction, cashPending] = useActionState<
    BookingRequestActionState,
    FormData
  >(settleJobInCash, {});
  const [mode, setMode] = useState<"choose" | "changed" | "cash">("choose");
  const [minutes, setMinutes] = useState(measuredMinutes);
  const [cashMinutes, setCashMinutes] = useState(estimatedMinutes);
  const [cashConfirmed, setCashConfirmed] = useState(false);

  const valid = isDurationValid(minutes, PROVIDER_INVOICE_MINUTES);
  const overEstimate = minutes > estimatedMinutes;
  const measuredDiffers = measuredMinutes !== estimatedMinutes;

  if (mode === "choose") {
    return (
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="bookingId" value={bookingId} />
        <input type="hidden" name="submittedMinutes" value={estimatedMinutes} />
        <input type="hidden" name="explanation" value="" />

        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="font-display text-sm font-semibold">
            How did the job close out?
          </p>
          <p className="mt-1 text-xs text-mist">
            The customer booked {formatMinutes(estimatedMinutes)}.
            {measuredDiffers
              ? ` Your clock shows ${formatMinutes(measuredMinutes)} since you marked Arrived.`
              : ""}
          </p>
        </div>

        <MoneyPreview rateCents={rateCents} minutes={estimatedMinutes} />

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending
            ? "Submitting…"
            : `Ran as planned — bill ${formatMinutes(estimatedMinutes)}`}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="w-full"
          onClick={() => setMode("changed")}
          disabled={pending}
        >
          The time changed
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          className="w-full"
          onClick={() => setMode("cash")}
          disabled={pending}
        >
          They paid me in person
        </Button>
        <p className="text-center text-xs text-mist">
          If you don&apos;t submit anything within 24 hours, we bill the original
          estimate automatically.
        </p>
        <FieldError>{state.error}</FieldError>
      </form>
    );
  }

  if (mode === "cash") {
    const cashValid = isDurationValid(cashMinutes, PROVIDER_INVOICE_MINUTES);
    const cashAllocation = cashValid
      ? calculateInvoiceAllocation(rateCents, cashMinutes)
      : null;
    const cashOverEstimate = cashMinutes > estimatedMinutes;
    return (
      <form action={cashAction} className="space-y-4">
        <input type="hidden" name="bookingId" value={bookingId} />

        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="font-display text-sm font-semibold">
            The customer paid you directly
          </p>
          <p className="mt-1 text-xs text-mist">
            We won&apos;t charge their card for the job. We keep only College
            Crew&apos;s {5}% fee out of the first hour we already collected, and
            send you the rest.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <input
              id="cashMinutes"
              name="submittedMinutes"
              type="number"
              inputMode="numeric"
              step={BILLING_INCREMENT_MINUTES}
              min={PROVIDER_INVOICE_MINUTES.min}
              max={PROVIDER_INVOICE_MINUTES.max}
              value={cashMinutes}
              onChange={(event) => setCashMinutes(Number(event.target.value))}
              className="w-28 rounded-lg border border-line bg-court px-3 py-2 text-sm"
            />
            <span className="text-sm text-ink-soft">
              minutes worked ({formatMinutes(cashMinutes)})
            </span>
          </div>
          {!cashValid ? (
            <p className="mt-2 text-xs text-red-700">
              Enter 60–1440 minutes in 15-minute steps.
            </p>
          ) : null}
        </div>

        {cashOverEstimate ? (
          <div className="rounded-2xl border border-gold-300 bg-gold-100 p-5">
            <label
              htmlFor="cashExplanation"
              className="font-display text-sm font-semibold text-gold-800"
            >
              Explain the time beyond the estimate
            </label>
            <textarea
              id="cashExplanation"
              name="explanation"
              rows={3}
              maxLength={2000}
              required
              className="mt-2 w-full rounded-lg border border-gold-300 bg-white px-3 py-2 text-sm"
              placeholder="e.g. The session ran long to finish the material."
            />
          </div>
        ) : (
          <input type="hidden" name="explanation" value="" />
        )}

        {cashAllocation ? (
          <div className="rounded-2xl border border-line bg-white p-5 text-sm">
            <dl className="space-y-2">
              <div className="flex justify-between gap-4">
                <dt className="text-mist">They paid you directly</dt>
                <dd>{formatMoney(cashAllocation.remainingBalanceCents)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-mist">First hour we already collected</dt>
                <dd>{formatMoney(rateCents)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-mist">College Crew fee (5% of the job)</dt>
                <dd>– {formatMoney(cashAllocation.totalPlatformFeeCents)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-line pt-2">
                <dt className="font-semibold">We send you</dt>
                <dd className="font-semibold text-quad-700">
                  {formatMoney(
                    Math.max(0, rateCents - cashAllocation.totalPlatformFeeCents),
                  )}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}

        <label className="flex gap-3 rounded-2xl border border-gold-300 bg-gold-100 p-4 text-sm text-gold-900">
          <input
            type="checkbox"
            name="confirmed"
            checked={cashConfirmed}
            onChange={(event) => setCashConfirmed(event.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            I confirm the customer paid me in person for this job. College Crew
            will not charge their card for it.
          </span>
        </label>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={cashPending || !cashValid || !cashConfirmed}
        >
          {cashPending
            ? "Recording…"
            : copy("booking-provider.invoice.cash-submit")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={() => setMode("choose")}
          disabled={cashPending}
        >
          Back
        </Button>
        <FieldError>{cashState.error}</FieldError>
      </form>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="bookingId" value={bookingId} />

      <div className="rounded-2xl border border-line bg-white p-5">
        <label
          htmlFor="submittedMinutes"
          className="font-display text-sm font-semibold"
        >
          Actual billable time
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
            placeholder={copy(
              "booking-provider.invoice.overage-placeholder",
            )}
          />
        </div>
      ) : (
        <input type="hidden" name="explanation" value="" />
      )}

      {valid ? <MoneyPreview rateCents={rateCents} minutes={minutes} /> : null}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={pending || !valid}
      >
        {pending
          ? "Submitting…"
          : copy("booking-provider.invoice.submit")}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full"
        onClick={() => setMode("choose")}
        disabled={pending}
      >
        Back
      </Button>
      <FieldError>{state.error}</FieldError>
    </form>
  );
}
