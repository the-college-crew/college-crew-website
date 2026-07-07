"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { Button, buttonClasses } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";

import { acceptBooking, declineBooking } from "../actions";

type RequestJob = {
  id: string;
  serviceName: string;
  customerName: string;
  whenLabel: string;
  address: string;
};

/**
 * Accept / decline for a pending request. Accept asks the provider to sign off
 * on the job details first; decline collects a note that opens the chat. Both
 * server actions redirect into the conversation, so there's no success state to
 * render here — the page navigates away.
 */
export function RequestActions({ job }: { job: RequestJob }) {
  const [mode, setMode] = useState<"idle" | "accept" | "decline">("idle");

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

  return (
    <div className="mt-3 flex gap-2">
      <Button
        type="button"
        variant="success"
        size="sm"
        onClick={() => setMode("accept")}
      >
        Accept
      </Button>
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
      <form action={acceptBooking} className="mt-3 flex gap-2">
        <input type="hidden" name="bookingId" value={job.id} />
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

  return (
    <form action={declineBooking} className="mt-3 space-y-2">
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
        placeholder="e.g. Can't do that time — could you do Saturday morning instead?"
      />
      <p className="text-xs text-mist">
        This starts a chat with {job.customerName} so you can sort out a time.
      </p>
      <div className="flex gap-2">
        <SubmitButton
          variant="primary"
          pendingLabel="Sending…"
          disabled={note.trim().length === 0}
        >
          Send &amp; decline
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
