"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { openConversationForBooking } from "@/app/actions/messaging";
import { FormLoader } from "@/components/form-loader";
import { Button, buttonClasses } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Textarea } from "@/components/ui/field";
import type { BookingFlow } from "@/lib/db/types";

import {
  acceptBooking,
  counterBooking,
  declineBooking,
  sendQuote,
} from "../actions";

type RequestJob = {
  id: string;
  serviceName: string;
  customerName: string;
  whenLabel: string;
  address: string;
  bookingFlow: BookingFlow;
  /** "flexible" means the customer allows a different time to be suggested. */
  timeFlexibility: "flexible" | "fixed";
};

/**
 * Accept / decline for a pending request. Accept asks the provider to sign off
 * on the job details first; decline collects a note that opens the chat. Both
 * server actions redirect into the conversation, so there's no success state to
 * render here — the page navigates away.
 */
export function RequestActions({ job }: { job: RequestJob }) {
  const [mode, setMode] = useState<
    "idle" | "accept" | "quote" | "decline" | "counter"
  >("idle");

  // Only offered when the customer said a different time may be suggested; the
  // RPC enforces the same rule server-side.
  const canCounter =
    job.bookingFlow === "hourly_v1" && job.timeFlexibility === "flexible";

  if (mode === "accept") {
    return (
      <ConfirmPanel job={job} onCancel={() => setMode("idle")} />
    );
  }
  if (mode === "decline") {
    return (
      <DeclinePanel job={job} onCancel={() => setMode("idle")} />
    );
  }
  if (mode === "counter") {
    return <CounterPanel job={job} onCancel={() => setMode("idle")} />;
  }
  if (mode === "quote") {
    return <SendQuotePanel job={job} onCancel={() => setMode("idle")} />;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Button
        type="button"
        variant="success"
        size="sm"
        onClick={() =>
          setMode(job.bookingFlow === "quote_v1" ? "quote" : "accept")
        }
      >
        {job.bookingFlow === "quote_v1" ? "Send quote" : "Accept"}
      </Button>
      {canCounter ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setMode("counter")}
        >
          Suggest another time
        </Button>
      ) : null}
      <Button
        type="button"
        variant="danger"
        size="sm"
        onClick={() => setMode("decline")}
      >
        Decline
      </Button>
    </div>
  );
}

/**
 * Propose a different start time. The customer keeps control — their hold stays
 * as-is and nothing is charged unless they accept the new time.
 */
function CounterPanel({
  job,
  onCancel,
}: {
  job: RequestJob;
  onCancel: () => void;
}) {
  const [state, formAction] = useActionState(counterBooking, {});

  return (
    <form action={formAction} className="mt-3 space-y-2">
      <FormLoader />
      <input type="hidden" name="bookingId" value={job.id} />
      <label
        htmlFor={`counter-${job.id}`}
        className="block text-sm font-medium text-ink"
      >
        When could you do it?
      </label>
      <Input
        id={`counter-${job.id}`}
        name="proposedLocal"
        type="datetime-local"
        required
      />
      <FieldHint>
        They asked for {job.whenLabel}. Suggest the closest time that works for
        you.
      </FieldHint>
      <Textarea
        name="note"
        rows={2}
        maxLength={500}
        placeholder="Optional: a quick word on why this time works better"
      />
      <p className="text-xs text-mist">
        {job.customerName} chooses whether to take it. Nothing is charged unless
        they accept.
      </p>
      <FieldError>{state.error}</FieldError>
      <div className="flex gap-2">
        <SubmitButton variant="primary" pendingLabel="Sending…">
          Suggest this time
        </SubmitButton>
        <button
          type="button"
          onClick={onCancel}
          className={buttonClasses({ variant: "ghost", size: "sm" })}
        >
          Back
        </button>
      </div>
    </form>
  );
}

function SendQuotePanel({
  job,
  onCancel,
}: {
  job: RequestJob;
  onCancel: () => void;
}) {
  const [state, formAction] = useActionState(sendQuote, {});

  return (
    <div className="mt-3 rounded-xl border border-viridian/25 bg-honeydew/40 p-3">
      <p className="font-display text-sm font-semibold text-viridian">
        Send a final flat quote
      </p>
      <p className="mt-1 text-xs leading-5 text-ink-soft">
        Review the job and any images or video first. Once sent, this price
        cannot be edited for this request.
      </p>

      <form action={openConversationForBooking} className="mt-3">
        <FormLoader />
        <input type="hidden" name="bookingId" value={job.id} />
        <button
          type="submit"
          className={buttonClasses({ variant: "secondary", size: "sm" })}
        >
          Open chat for media
        </button>
      </form>

      <form action={formAction} className="mt-4 space-y-2">
        <FormLoader />
        <input type="hidden" name="bookingId" value={job.id} />
        <label
          htmlFor={`quote-${job.id}`}
          className="block text-sm font-medium text-ink"
        >
          Final quote
        </label>
        <div className="flex max-w-xs items-center rounded-xl border border-line bg-paper focus-within:border-viridian focus-within:ring-2 focus-within:ring-viridian/15">
          <span aria-hidden className="pl-3 text-sm font-semibold text-ink-soft">
            $
          </span>
          <Input
            id={`quote-${job.id}`}
            name="quoteAmount"
            type="number"
            min={20}
            max={10_000}
            step="0.01"
            inputMode="decimal"
            required
            className="border-0 bg-transparent focus:ring-0"
          />
        </div>
        <FieldHint>
          The customer pays this exact amount. College Crew&apos;s 5% fee comes
          from your payout.
        </FieldHint>
        <FieldError>{state.error}</FieldError>
        <div className="flex gap-2">
          <SubmitButton variant="success" pendingLabel="Sending...">
            Send final quote
          </SubmitButton>
          <button
            type="button"
            onClick={onCancel}
            className={buttonClasses({ variant: "ghost", size: "sm" })}
          >
            Back
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * The signature moment: a little work-order the provider signs off on. The
 * labelled rows restate exactly what they're committing to before it becomes a
 * job on the books.
 */
function ConfirmPanel({
  job,
  onCancel,
}: {
  job: RequestJob;
  onCancel: () => void;
}) {
  const [state, formAction] = useActionState(acceptBooking, {});
  const rows: [string, string][] = [
    ["Service", job.serviceName],
    ["For", job.customerName],
    ["When", job.whenLabel],
    ["Where", job.address],
  ];

  return (
    <div className="mt-3 rounded-xl border border-viridian/25 bg-honeydew/40 p-3">
      <p className="font-display text-sm font-semibold text-viridian">
        Can you make it?
      </p>
      <dl className="mt-2 divide-y divide-viridian/15 text-sm">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-baseline gap-3 py-1.5"
          >
            <dt className="w-14 shrink-0 font-display text-[11px] font-semibold uppercase tracking-wide text-mist">
              {label}
            </dt>
            <dd className="text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <form action={formAction} className="mt-3 space-y-2">
        <FormLoader />
        <input type="hidden" name="bookingId" value={job.id} />
        <FieldError>{state.error}</FieldError>
        <div className="flex gap-2">
          <SubmitButton variant="success" pendingLabel="Accepting…">
            Yes, I&apos;m in
          </SubmitButton>
          <button
            type="button"
            onClick={onCancel}
            className={buttonClasses({ variant: "ghost", size: "sm" })}
          >
            Back
          </button>
        </div>
      </form>
    </div>
  );
}

function DeclinePanel({
  job,
  onCancel,
}: {
  job: RequestJob;
  onCancel: () => void;
}) {
  const [note, setNote] = useState("");
  const [state, formAction] = useActionState(declineBooking, {});

  return (
    <form action={formAction} className="mt-3 space-y-2">
      <FormLoader />
      <input type="hidden" name="bookingId" value={job.id} />
      <label
        htmlFor={`decline-${job.id}`}
        className="block text-sm font-medium text-ink"
      >
        What&apos;s the problem?
      </label>
      <Textarea
        id={`decline-${job.id}`}
        name="message"
        required
        rows={3}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="e.g. I can't make that time. I could do Saturday morning if you want to send a new request."
      />
      <p className="text-xs text-mist">
        This declines the request and opens a chat with {job.customerName} so
        you can explain or discuss another time.
      </p>
      <FieldError>{state.error}</FieldError>
      <div className="flex gap-2">
        <SubmitButton
          variant="primary"
          pendingLabel="Sending…"
          disabled={note.trim().length === 0}
        >
          Send note &amp; decline
        </SubmitButton>
        <button
          type="button"
          onClick={onCancel}
          className={buttonClasses({ variant: "ghost", size: "sm" })}
        >
          Back
        </button>
      </div>
    </form>
  );
}

/** Submit button that reflects the server action's pending state. */
function SubmitButton({
  children,
  pendingLabel,
  variant,
  disabled,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  variant: "primary" | "success";
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      size="sm"
      disabled={pending || disabled}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
