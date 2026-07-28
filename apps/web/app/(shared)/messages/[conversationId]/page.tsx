import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BackButton } from "@/components/back-button";
import {
  ChatReschedulePanel,
  type ChatRescheduleProposal,
} from "@/components/chat/chat-reschedule-panel";
import { ChatThread } from "@/components/chat/chat-thread";
import { DemoChatThread } from "@/components/demo-chat-thread";
import { ResolveButton } from "@/components/messaging/resolve-button";
import { SamplePreviewBanner } from "@/components/sample-preview-banner";
import { StatusPill } from "@/components/status-pill";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import {
  demoConversation,
  demoMessagesFor,
  getDemoPreview,
} from "@/lib/demo/sample-preview";
import type { BookingStatus, Message } from "@/lib/db/types";
import { getProviderSchedule } from "@/lib/db/queries";
import { getOwnResolvedIds } from "@/lib/messaging/resolutions";
import { markConversationRead } from "@/lib/messaging/unread";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Messages" };

type ConversationRow = {
  id: string;
  customer_id: string;
  booking_id: string | null;
  customer: { full_name: string } | null;
  provider: { display_name: string } | null;
  booking: {
    id: string;
    status: BookingStatus;
    scheduled_at: string;
    provider_id: string;
    estimated_minutes: number | null;
    booking_flow: string;
    rescheduling_started_at: string | null;
    service: { name: string } | null;
  } | null;
};

/**
 * One thread per booking (SPEC §8, shared ownership) — the header names the job
 * it's about, since the same two people may have several. A booking-less thread
 * is the pre-booking inquiry opened from a provider's profile. RLS decides
 * membership — non-members simply see a 404.
 *
 * On desktop this page is the right pane of the two-pane layout in
 * layout.tsx (sidebar always visible, so it fills the pane rather than
 * centering as its own column); on mobile it's the full-width thread screen
 * reached by tapping a conversation.
 */
export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const user = await requireUser(`/messages/${conversationId}`);
  const demoPreview =
    (await getDemoPreview("customer")) ?? (await getDemoPreview("provider"));

  if (conversationId === "demo" && demoPreview) {
    const otherName =
      demoPreview.role === "customer"
        ? demoConversation.providerName
        : demoConversation.customerName;

    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col px-4 py-4 sm:py-6">
        <div className="mb-3 shrink-0 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar name={otherName} size="lg" />
            <div>
              <p className="font-display text-xs font-semibold uppercase tracking-wide text-mist">
                Sample conversation
              </p>
              <h1 className="font-display text-xl font-semibold text-ink lg:text-2xl">
                {otherName}
              </h1>
            </div>
          </div>
          <BackButton />
        </div>
        <div className="mb-4">
          <SamplePreviewBanner role={demoPreview.role} />
        </div>

        <Card pennant className="flex h-[min(34rem,calc(100dvh-10rem))] min-h-0 flex-col p-0">
          <DemoChatThread
            currentUserId="demo-current-user"
            messages={demoMessagesFor(demoPreview.role)}
          />
        </Card>
      </div>
    );
  }

  if (conversationId === "demo") notFound();
  // Garbage ids would fail the uuid cast below and read as a server error.
  if (!/^[0-9a-f-]{36}$/i.test(conversationId)) notFound();

  const supabase = await createClient();
  // conversation_reads also links conversations↔profiles, so the customer
  // embed must name its FK or PostgREST rejects the query as ambiguous.
  const { data: conversationData, error } = await supabase
    .from("conversations")
    .select(
      "id, customer_id, booking_id, customer:profiles!conversations_customer_id_fkey(full_name), provider:provider_profiles(display_name), booking:bookings(id, status, scheduled_at, provider_id, estimated_minutes, booking_flow, rescheduling_started_at, service:services(name))",
    )
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw new Error(`Could not load the conversation: ${error.message}`);
  if (!conversationData) notFound();
  const conversation = conversationData as unknown as ConversationRow;

  // Opening the thread clears its unread badge. Best-effort; never blocks render.
  await markConversationRead(supabase, conversation.id);
  const resolvedIds = await getOwnResolvedIds(supabase, user.id);

  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(200);

  const isCustomer = conversation.customer_id === user.id;
  const otherName = isCustomer
    ? conversation.provider?.display_name
    : conversation.customer?.full_name;
  const booking = conversation.booking;
  const reschedulingActive =
    booking?.status === "requested" && booking.rescheduling_started_at != null;
  const untyped = supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => {
            maybeSingle: () => Promise<{ data: ChatRescheduleProposal | null }>;
          };
        };
      };
    };
  };
  const proposal = reschedulingActive && booking
    ? await untyped
        .from("booking_reschedule_proposals")
        .select("id, proposer_id, proposed_start_at")
        .eq("booking_id", booking.id)
        .eq("status", "pending")
        .maybeSingle()
    : { data: null };
  const schedule = reschedulingActive && booking
    ? await getProviderSchedule(booking.provider_id)
    : null;
  const quoteClient = supabase as unknown as {
    from: (table: string) => { select: (columns: string) => { eq: (column: string, value: string) => { maybeSingle: () => Promise<{ data: { quote_cents: number; estimated_minutes: number } | null }> } } };
  };
  const quoteReschedule = reschedulingActive && booking?.booking_flow === "quote_v2"
    ? await quoteClient.from("booking_quote_chat_reschedules").select("quote_cents, estimated_minutes").eq("booking_id", booking.id).maybeSingle()
    : { data: null as { quote_cents: number; estimated_minutes: number } | null };
  // Job-linked threads can't be reinitiated by whoever resolved them — see
  // moderate-message's matching guard. General threads have no such lock.
  const lockedForMe = Boolean(booking) && resolvedIds.has(conversation.id);

  return (
    <div className="flex h-full min-h-0 w-full flex-col px-4 py-4 sm:py-6 lg:px-6">
      <div className="mb-3 shrink-0 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar name={otherName || "Conversation"} size="lg" />
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-wide text-mist">
              {booking
                ? `${booking.service?.name ?? "Booking"} · ${formatDateTime(booking.scheduled_at)}`
                : "General (no booking yet)"}
            </p>
            <h1 className="font-display text-xl font-semibold text-ink lg:text-2xl">
              {otherName || "Conversation"}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {booking ? <StatusPill status={booking.status} /> : null}
          <ResolveButton
            conversationId={conversation.id}
            alreadyResolved={resolvedIds.has(conversation.id)}
          />
          <div className="lg:hidden">
            <BackButton />
          </div>
        </div>
      </div>

      <Card pennant className="flex h-[min(34rem,calc(100dvh-10rem))] min-h-0 flex-col p-0 lg:h-full">
        {reschedulingActive && booking && schedule ? (
          <ChatReschedulePanel
            bookingId={booking.id}
            conversationId={conversation.id}
            currentUserId={user.id}
            otherName={otherName || "the other person"}
            schedule={schedule}
            estimatedMinutes={quoteReschedule.data?.estimated_minutes ?? booking.estimated_minutes ?? 60}
            quoteCents={quoteReschedule.data?.quote_cents ?? null}
            proposal={proposal.data}
          />
        ) : null}
        <ChatThread
          conversationId={conversation.id}
          currentUserId={user.id}
          initialMessages={(messages ?? []) as Message[]}
          locked={lockedForMe}
        />
      </Card>
    </div>
  );
}
