import type { createClient } from "@/lib/supabase/server";
import { attachmentPreviewText } from "@/lib/messaging/attachments";
import { getUnreadSummary } from "@/lib/messaging/unread";
import { formatDate } from "@/lib/utils";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

type ConversationRow = {
  id: string;
  customer_id: string;
  provider_id: string;
  booking_id: string | null;
  created_at: string;
  customer: { full_name: string } | null;
  provider: { display_name: string } | null;
  booking: { scheduled_at: string; service: { name: string } | null } | null;
};

export type Thread = {
  id: string;
  label: string;
  preview: string;
  activityAt: string;
  unread: number;
};

/** One person, with every thread the caller shares with them. */
export type PersonGroup = {
  key: string;
  name: string;
  threads: Thread[];
  unread: number;
  activityAt: string;
};

/**
 * Every thread the signed-in user is part of, grouped by the person on the
 * other side. There's one thread per booking, so the same person can appear
 * with several — each labelled by its job, plus at most one booking-less
 * "General inquiry". RLS scopes conversations (and messages) to members, so
 * this only ever returns the caller's own threads.
 */
export async function getConversationGroups(
  supabase: ServerClient,
  userId: string,
): Promise<PersonGroup[]> {
  // conversation_reads also links conversations↔profiles, so the customer
  // embed must name its FK or PostgREST rejects the query as ambiguous.
  const { data: conversationData, error } = await supabase
    .from("conversations")
    .select(
      "id, customer_id, provider_id, booking_id, created_at, customer:profiles!conversations_customer_id_fkey(full_name), provider:provider_profiles(display_name), booking:bookings(scheduled_at, service:services(name))",
    );
  if (error) throw new Error(`Could not load conversations: ${error.message}`);
  const conversations = (conversationData ?? []) as unknown as ConversationRow[];

  // Latest message per thread, in one query, for the preview + sort order.
  const ids = conversations.map((c) => c.id);
  const latest = new Map<string, { body: string; created_at: string }>();
  if (ids.length > 0) {
    const { data: messages } = await supabase
      .from("messages")
      .select("conversation_id, body, image_path, attachments, created_at")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false });
    for (const m of messages ?? []) {
      if (latest.has(m.conversation_id)) continue; // desc order → first is newest
      latest.set(m.conversation_id, {
        body: m.body || attachmentPreviewText(m),
        created_at: m.created_at,
      });
    }
  }

  const { byConversation: unreadByConversation } =
    await getUnreadSummary(supabase);

  // Group by the other party. A group's unread count is the sum of its threads',
  // and both people and threads sort by latest activity, newest first.
  const groups = new Map<string, PersonGroup>();
  for (const conversation of conversations) {
    const isCustomer = conversation.customer_id === userId;
    const key = isCustomer ? conversation.provider_id : conversation.customer_id;
    const name =
      (isCustomer
        ? conversation.provider?.display_name
        : conversation.customer?.full_name) || "Conversation";

    const preview = latest.get(conversation.id);
    const activityAt = preview?.created_at ?? conversation.created_at;
    const unread = unreadByConversation.get(conversation.id) ?? 0;
    const booking = conversation.booking;

    const thread: Thread = {
      id: conversation.id,
      label: booking
        ? `${booking.service?.name ?? "Booking"} · ${formatDate(booking.scheduled_at)}`
        : "General inquiry",
      preview: preview?.body || "No messages yet",
      activityAt,
      unread,
    };

    const group = groups.get(key);
    if (group) {
      group.threads.push(thread);
      group.unread += unread;
      if (Date.parse(activityAt) > Date.parse(group.activityAt)) {
        group.activityAt = activityAt;
      }
    } else {
      groups.set(key, {
        key,
        name,
        threads: [thread],
        unread,
        activityAt,
      });
    }
  }

  const sortByActivity = <T extends { activityAt: string }>(a: T, b: T) =>
    Date.parse(b.activityAt) - Date.parse(a.activityAt);
  const people = [...groups.values()].sort(sortByActivity);
  for (const person of people) person.threads.sort(sortByActivity);

  return people;
}
