"use client";

import { useActionState, useState } from "react";

import {
  proposeChatReschedule,
  respondToChatReschedule,
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
}: {
  bookingId: string;
  conversationId: string;
  currentUserId: string;
  otherName: string;
  schedule: ProviderSchedule;
  estimatedMinutes: number;
  proposal: ChatRescheduleProposal | null;
}) {
  const [slot, setSlot] = useState<{
    scheduledLocal: string;
    estimatedMinutes: number;
  } | null>(null);
  const [proposalState, propose] = useActionState(proposeChatReschedule, {});
  const [responseState, respond] = useActionState(respondToChatReschedule, {});
  const awaitingMe = proposal?.proposer_id !== currentUserId;

  return (
    <section className="border-b border-line bg-honeydew/30 p-4">
      <div className="mx-auto max-w-xl rounded-xl border border-viridian/25 bg-paper p-4">
        <p className="font-display text-sm font-semibold text-ink">
          Find a new time together
        </p>
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">
          There&apos;s no response deadline. A new suggestion replaces any earlier
          pending suggestion, and the time is checked again when accepted.
        </p>

        {proposal ? (
          <div className="mt-3 rounded-lg border border-line bg-court/60 p-3 text-sm">
            <p className="font-medium text-ink">
              {awaitingMe ? `${otherName} suggested` : "You suggested"} {formatDateTime(proposal.proposed_start_at)}
            </p>
            {awaitingMe ? (
              <div className="mt-3 flex flex-wrap gap-2">
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
              <p className="mt-1 text-xs text-mist">Waiting for {otherName} to accept, decline, or suggest another time.</p>
            )}
            <FieldError>{responseState.error}</FieldError>
          </div>
        ) : null}

        <form action={propose} className="mt-4 space-y-3">
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
            gridLabel="Choose a new date and time"
            onChange={setSlot}
          />
          <FieldError>{proposalState.error}</FieldError>
          <Button type="submit" size="sm" disabled={!slot}>
            Suggest this time
          </Button>
        </form>
      </div>
    </section>
  );
}
