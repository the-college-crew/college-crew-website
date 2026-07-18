"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

import { resolveDispute } from "./actions";

type Resolution =
  | "approve_submitted_hours"
  | "reduce_billable_minutes"
  | "waive_remaining_balance"
  | "cancel_and_refund";

const RESOLUTION_LABELS: Record<Resolution, string> = {
  approve_submitted_hours: "Approve submitted hours (charge/leave paid)",
  reduce_billable_minutes: "Reduce billable time (charge or refund difference)",
  waive_remaining_balance: "Waive the remaining balance",
  cancel_and_refund: "Cancel and refund captured payments",
};

/** Whole-quarter-hour options from 1h to the submitted minutes (exclusive). */
function minuteOptions(submittedMinutes: number): number[] {
  const options: number[] = [];
  for (let m = 60; m < submittedMinutes; m += 15) options.push(m);
  return options;
}

export function ResolutionPanel({
  bookingId,
  submittedMinutes,
}: {
  bookingId: string;
  submittedMinutes: number | null;
}) {
  const [state, formAction, pending] = useActionState(resolveDispute, {});
  const [kind, setKind] = useState<Resolution>("approve_submitted_hours");

  if (state.success) {
    return (
      <div className="rounded-lg border border-quad-200 bg-quad-50 p-4 text-sm text-quad-800">
        <p className="font-semibold">{state.success}</p>
        {state.recovery ? (
          <p className="mt-1">
            The customer will be prompted to re-authenticate the saved card
            before the booking completes.
          </p>
        ) : null}
      </div>
    );
  }

  const reductions = submittedMinutes ? minuteOptions(submittedMinutes) : [];

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="bookingId" value={bookingId} />

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Resolution</legend>
        {(Object.keys(RESOLUTION_LABELS) as Resolution[]).map((option) => (
          <label
            key={option}
            className="flex items-start gap-2 rounded-lg border border-line p-3 text-sm has-[:checked]:border-crew-400 has-[:checked]:bg-crew-50"
          >
            <input
              type="radio"
              name="resolutionKind"
              value={option}
              checked={kind === option}
              onChange={() => setKind(option)}
              className="mt-0.5"
              disabled={option === "reduce_billable_minutes" && reductions.length === 0}
            />
            <span>{RESOLUTION_LABELS[option]}</span>
          </label>
        ))}
      </fieldset>

      {kind === "reduce_billable_minutes" ? (
        <div className="space-y-1">
          <label htmlFor="minutes" className="text-sm font-semibold">
            Reduce billable time to
          </label>
          <select
            id="minutes"
            name="resolvedBillableMinutes"
            required
            className="w-full rounded-lg border border-line bg-white p-2 text-sm"
          >
            {reductions.map((m) => (
              <option key={m} value={m}>
                {Math.floor(m / 60)} hr {m % 60 ? `${m % 60} min` : ""}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="space-y-1">
        <label htmlFor="auditNote" className="text-sm font-semibold">
          Resolution note (required, saved to the audit trail)
        </label>
        <textarea
          id="auditNote"
          name="auditNote"
          required
          minLength={1}
          maxLength={2000}
          rows={3}
          className="w-full rounded-lg border border-line bg-white p-3 text-sm"
          placeholder="Why this resolution — kept as an immutable audit note."
        />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Applying…" : "Apply resolution"}
      </Button>
      <FieldError>{state.error}</FieldError>
    </form>
  );
}
