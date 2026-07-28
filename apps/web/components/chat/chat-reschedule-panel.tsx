"use client";

import { X } from "lucide-react";
import { useActionState, useEffect, useState } from "react";

import {
  proposeChatReschedule,
  proposeQuoteChatReschedule,
  respondToChatReschedule,
  respondToQuoteChatReschedule,
} from "@/app/(shared)/messages/reschedule-actions";
import { SchedulePicker } from "@/components/scheduling/schedule-picker";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import type { ProviderSchedule } from "@/lib/db/queries";
import { formatDateTime } from "@/lib/utils";

export type ChatRescheduleProposal = {
  id: string;
  proposer_id: string;
  proposed_start_at: string;
};

export function ChatReschedulePanel({
  bookingId,
  conversationId,
  currentUserId,
  otherName,
  schedule,
  estimatedMinutes,
  proposal,
  quoteCents,
}: {
  bookingId: string;
  conversationId: string;
  currentUserId: string;
  otherName: string;
  schedule: ProviderSchedule;
  estimatedMinutes: number;
  proposal: ChatRescheduleProposal | null;
  quoteCents?: number | null;
}) {
  const [slot, setSlot] = useState<{
    scheduledLocal: string;
    estimatedMinutes: number;
  } | null>(null);
  const quoteMode = quoteCents != null;
  const [proposalState, propose] = useActionState(quoteMode ? proposeQuoteChatReschedule : proposeChatReschedule, {});
  const [responseState, respond] = useActionState(quoteMode ? respondToQuoteChatReschedule : respondToChatReschedule, {});
  const [pickerOpen, setPickerOpen] = useState(false);
  const awaitingMe = proposal?.proposer_id !== currentUserId;

  useEffect(() => {
    if (!pickerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPickerOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [pickerOpen]);

  return (
    <section className="border-b border-line bg-honeydew/30 px-4 py-2.5">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">
          Want to suggest a new time for this booking?{quoteMode ? ` The quote is $${(quoteCents / 100).toFixed(2)}.` : ""}
        </p>
        <Button type="button" size="sm" variant="secondary" onClick={() => setPickerOpen(true)}>
          Suggest new time
        </Button>
      </div>

      {proposal ? (
        <div className="mx-auto mt-2 max-w-3xl rounded-lg border border-line bg-court/60 px-3 py-2 text-sm">
          <p className="font-medium text-ink">
            {awaitingMe ? `${otherName} suggested` : "You suggested"} {formatDateTime(proposal.proposed_start_at)}
          </p>
          {awaitingMe ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <form action={respond}>
                <input type="hidden" name="proposalId" value={proposal.id} />
                <input type="hidden" name="bookingId" value={bookingId} />
                <input type="hidden" name="conversationId" value={conversationId} />
                <input type="hidden" name="accept" value="true" />
                <Button type="submit" size="sm" variant="success">Accept this time</Button>
              </form>
              <form action={respond}>
                <input type="hidden" name="proposalId" value={proposal.id} />
                <input type="hidden" name="bookingId" value={bookingId} />
                <input type="hidden" name="conversationId" value={conversationId} />
                <input type="hidden" name="accept" value="false" />
                <Button type="submit" size="sm" variant="secondary">Decline</Button>
              </form>
            </div>
          ) : (
            <p className="mt-1 text-xs text-mist">Waiting for {otherName} to respond.</p>
          )}
          <FieldError>{responseState.error}</FieldError>
        </div>
      ) : null}

      {pickerOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reschedule-dialog-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPickerOpen(false);
          }}
        >
          <div className="max-h-[min(48rem,calc(100dvh-2rem))] w-full max-w-4xl overflow-y-auto rounded-2xl border border-line bg-paper p-5 shadow-2xl shadow-ink/15 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="reschedule-dialog-title" className="font-display text-xl font-semibold text-ink">
                  Suggest a new time
                </h2>
                <p className="mt-1 max-w-xl text-sm text-ink-soft">
                  Pick a time that works. The other person can accept, decline, or suggest another option.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="rounded-full p-2 text-mist transition-colors hover:bg-court hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-viridian"
                aria-label="Close time picker"
              >
                <X className="size-5" />
              </button>
            </div>
            <form action={propose} className="mt-5 space-y-3">
              <input type="hidden" name="bookingId" value={bookingId} />
              <input type="hidden" name="conversationId" value={conversationId} />
              <input type="hidden" name="scheduledLocal" value={slot?.scheduledLocal ?? ""} />
              <SchedulePicker
                days={schedule.days}
                busy={schedule.busy}
                nowIso={schedule.nowIso}
                minimumNoticeHours={12}
                horizonStart={schedule.horizonStart}
                horizonEnd={schedule.horizonEnd}
                preferredMinutes={estimatedMinutes}
                fixedMinutes={estimatedMinutes}
                startTimeDropdown={quoteMode}
                gridLabel={quoteMode ? "Choose a new date and start time" : "Choose a new date and time"}
                onChange={setSlot}
              />
              <FieldError>{proposalState.error}</FieldError>
              <div className="flex justify-end">
                <Button type="submit" disabled={!slot}>Suggest this time</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
