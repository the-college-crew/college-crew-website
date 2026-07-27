"use client";

import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import { useActionState, useState, useTransition } from "react";

import { useBookingCopy } from "@/components/content/booking-copy-provider";
import { FormLoader } from "@/components/form-loader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field";
import { QuoteDaypartPicker } from "@/components/scheduling/quote-daypart-picker";
import type { ProviderSchedule } from "@/lib/db/queries";
import type { ReplacementSuggestion } from "@/lib/booking/replacement-ranking";
import {
  QUOTE_DAYPART_LABELS,
  type QuoteDaypart,
} from "@/lib/booking/quote-dayparts";
import { formatDateTime, formatMoney } from "@/lib/utils";

import {
  finalizeReplacement,
  replaceQuoteRequest,
  startReplacementAuthorization,
  type ReplacementAuthState,
} from "./actions";

export function QuoteReplacementForm({
  bookingId,
  originalRequestedDate,
  originalRequestedDaypart,
  candidates,
}: {
  bookingId: string;
  originalRequestedDate: string;
  originalRequestedDaypart: QuoteDaypart;
  candidates: Array<{
    providerServiceId: string;
    providerName: string;
    averageQuoteCents: number | null;
    minimumNoticeHours: number;
    schedule: ProviderSchedule;
  }>;
}) {
  const [state, action, pending] = useActionState(replaceQuoteRequest, {});
  const [selectedId, setSelectedId] = useState(
    candidates[0]?.providerServiceId ?? "",
  );
  const selected = candidates.find(
    (candidate) => candidate.providerServiceId === selectedId,
  );
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="originalBookingId" value={bookingId} />
      <p className="text-sm text-ink-soft">
        Your service, address, details, photos, and duration carry over to the
        new student.
      </p>
      <label className="block text-sm font-medium">
        Replacement student
        <select
          name="providerServiceId"
          required
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          className="mt-1 w-full rounded-lg border border-line bg-white p-3"
        >
          {candidates.map((candidate) => (
            <option
              key={candidate.providerServiceId}
              value={candidate.providerServiceId}
            >
              {candidate.providerName}
              {candidate.averageQuoteCents
                ? ` · average ${formatMoney(candidate.averageQuoteCents)}`
                : ""}
            </option>
          ))}
        </select>
      </label>
      <p className="rounded-lg border border-line bg-court p-3 text-sm">
        Your previous request was {originalRequestedDate} ·{" "}
        {QUOTE_DAYPART_LABELS[originalRequestedDaypart]}; choose any available
        window for the replacement student.
      </p>
      {selected ? (
        <QuoteDaypartPicker
          key={selected.providerServiceId}
          days={selected.schedule.days}
          busy={selected.schedule.busy}
          nowIso={selected.schedule.nowIso}
          minimumNoticeHours={Math.max(12, selected.minimumNoticeHours)}
          horizonStart={selected.schedule.horizonStart}
          horizonEnd={selected.schedule.horizonEnd}
        />
      ) : null}
      <FieldError>{state.error}</FieldError>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send replacement quote request"}
      </Button>
    </form>
  );
}

export type ReplacementCandidate = ReplacementSuggestion;

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
  originalStartAt,
  candidates,
  preselectedProviderServiceId,
  preselectedStartAt,
}: {
  bookingId: string;
  originalStartAt: string;
  candidates: ReplacementCandidate[];
  /** Verified server-side before being passed in. */
  preselectedProviderServiceId?: string;
  preselectedStartAt?: string;
}) {
  const copy = useBookingCopy();
  const [state, formAction, pending] = useActionState<
    ReplacementAuthState,
    FormData
  >(startReplacementAuthorization, {});
  const [selectedId, setSelectedId] = useState(
    preselectedProviderServiceId ?? candidates[0]?.providerServiceId ?? "",
  );
  const selected = candidates.find((c) => c.providerServiceId === selectedId);
  // The chosen student's own alternative time, if they can't make the original.
  const newStartAt =
    selected?.suggestedStartAt ??
    (selected && preselectedProviderServiceId === selected.providerServiceId
      ? preselectedStartAt
      : undefined) ??
    null;

  const exact = candidates.filter((c) => c.suggestedStartAt == null);
  const timeShift = candidates.filter((c) => c.suggestedStartAt != null);

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
          newStartAt={newStartAt}
        />
      </Elements>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <FormLoader />
      <input type="hidden" name="originalBookingId" value={bookingId} />
      {/* Re-validated server-side against the database's own suggestions. */}
      {newStartAt ? (
        <input type="hidden" name="scheduledAt" value={newStartAt} />
      ) : null}

      <p className="text-sm text-ink-soft">
        Your address, duration, and job notes carry over — you only pick a
        student and confirm the hold.
      </p>

      {exact.length > 0 ? (
        <div className="space-y-3">
          <h2 className="font-display text-sm font-semibold text-ink">
            Available at your original time
          </h2>
          {exact.map((candidate) => (
            <CandidateOption
              key={candidate.providerServiceId}
              candidate={candidate}
              selected={selectedId === candidate.providerServiceId}
              onSelect={() => setSelectedId(candidate.providerServiceId)}
            />
          ))}
        </div>
      ) : null}

      {timeShift.length > 0 ? (
        <div className="space-y-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-ink">
              Available at a different time
            </h2>
            <p className="mt-0.5 text-xs text-mist">
              You asked for {formatDateTime(originalStartAt)} and said a
              different time was okay. Picking one of these moves the job to
              their time.
            </p>
          </div>
          {timeShift.map((candidate) => (
            <CandidateOption
              key={candidate.providerServiceId}
              candidate={candidate}
              selected={selectedId === candidate.providerServiceId}
              onSelect={() => setSelectedId(candidate.providerServiceId)}
            />
          ))}
        </div>
      ) : null}

      {newStartAt ? (
        <div
          role="status"
          className="rounded-lg border border-gold-300 bg-gold-100 p-4 text-sm text-gold-900"
        >
          <p className="font-semibold">
            {copy("booking-customer.replace.time-change-title")}
          </p>
          <p className="mt-1">
            {formatDateTime(originalStartAt)} →{" "}
            <span className="font-semibold">{formatDateTime(newStartAt)}</span>
          </p>
        </div>
      ) : null}

      <p className="text-xs text-mist">
        We place a fresh first-hour hold on the student you choose using the card
        on file. Your original request is withdrawn and its hold released —
        you&apos;re only charged if the new student accepts within 2 hours.
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
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={pending || !selectedId}
      >
        {pending
          ? "Preparing hold…"
          : selected
            ? `Continue to hold ${formatMoney(selected.hourlyRateCents)}`
            : copy("booking-customer.replace.continue")}
      </Button>
    </form>
  );
}

function CandidateOption({
  candidate,
  selected,
  onSelect,
}: {
  candidate: ReplacementCandidate;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label className="block cursor-pointer">
      <input
        type="radio"
        name="providerServiceId"
        value={candidate.providerServiceId}
        checked={selected}
        onChange={onSelect}
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
            {candidate.suggestedStartAt ? (
              <p className="mt-1.5 inline-flex items-center rounded-full border border-gold-300 bg-gold-100 px-2 py-0.5 text-[11px] font-medium text-gold-900">
                {formatDateTime(candidate.suggestedStartAt)}
              </p>
            ) : null}
          </div>
          <span className="font-semibold text-quad-700">
            {formatMoney(candidate.hourlyRateCents)}/hr
          </span>
        </div>
      </Card>
    </label>
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
  newStartAt,
}: {
  paymentIntentId: string;
  clientSecret: string;
  originalBookingId: string;
  holdLabel: string;
  newStartAt: string | null;
}) {
  const copy = useBookingCopy();
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
          result.error.message ??
            copy("booking-customer.replace.hold-error"),
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
      {newStartAt ? (
        <p className="rounded-lg border border-gold-300 bg-gold-100 p-3 text-sm text-gold-900">
          Booking for{" "}
          <span className="font-semibold">{formatDateTime(newStartAt)}</span>.
        </p>
      ) : null}
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
        {submitting
          ? "Placing hold…"
          : copy("booking-customer.replace.hold-submit", {
              hold_amount: holdLabel,
            })}
      </Button>
      <p className="text-center text-xs text-mist">
        Test mode: use card 4242 4242 4242 4242, any future expiry, any CVC.
      </p>
      <FieldError>{error}</FieldError>
    </form>
  );
}
