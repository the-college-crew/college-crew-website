import { supabase } from "./supabase";
import type { BookingStatus } from "./status";

/**
 * Messaging reads. Conversations RLS scopes rows to the caller (customer or
 * provider), so no explicit filter is needed. The customer embed MUST be
 * FK-qualified (conversation_reads also links conversations->profiles, which
 * makes an unqualified `profiles` embed ambiguous to PostgREST).
 *
 * Writes never go here: messages are written only by the moderate-message edge
 * function (there is no client INSERT policy), so contact-info scanning can't
 * be bypassed. See sendMessage() below.
 */

export type ConversationSummary = {
  id: string;
  counterpartyName: string;
  amCustomer: boolean;
  preview: string;
  lastAt: string;
  unread: number;
  bookingLabel: string | null;
  bookingStatus: BookingStatus | null;
};

export type ChatMessage = {
  id: string;
  body: string;
  sender_id: string;
  created_at: string;
  image_path: string | null;
};

function embedField(embed: unknown, key: string): string {
  const obj = Array.isArray(embed) ? embed[0] : embed;
  if (obj && typeof obj === "object" && key in obj) {
    const v = (obj as Record<string, unknown>)[key];
    if (typeof v === "string") return v;
  }
  return "";
}

export async function fetchConversations(myUserId: string): Promise<ConversationSummary[]> {
  const { data: convos, error } = await supabase
    .from("conversations")
    .select(
      `id, customer_id, provider_id, booking_id, created_at,
       provider:provider_profiles(display_name),
       customer:profiles!conversations_customer_id_fkey(full_name),
       booking:bookings(service_name_snapshot, scheduled_at, status)`,
    );
  if (error) throw error;
  const list = convos ?? [];
  const ids = list.map((c) => c.id as string);

  const [{ data: recent }, unread] = await Promise.all([
    ids.length
      ? supabase
          .from("messages")
          .select("conversation_id, body, image_path, created_at")
          .in("conversation_id", ids)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    supabase.rpc("unread_message_summary"),
  ]);

  const latest = new Map<string, { body: string; image: boolean; at: string }>();
  for (const m of recent ?? []) {
    const cid = m.conversation_id as string;
    if (latest.has(cid)) continue; // ordered desc — first seen is newest
    latest.set(cid, {
      body: (m.body as string) ?? "",
      image: Boolean(m.image_path),
      at: m.created_at as string,
    });
  }
  const unreadMap = new Map<string, number>();
  for (const u of (unread.data as { conversation_id: string; unread_count: number }[]) ?? []) {
    unreadMap.set(u.conversation_id, Number(u.unread_count) || 0);
  }

  return list
    .map((c) => {
      const amCustomer = (c.customer_id as string) === myUserId;
      const last = latest.get(c.id as string);
      const svc = embedField(c.booking, "service_name_snapshot");
      const bStatus = embedField(c.booking, "status") as BookingStatus | "";
      return {
        id: c.id as string,
        amCustomer,
        counterpartyName: amCustomer
          ? embedField(c.provider, "display_name") || "Provider"
          : embedField(c.customer, "full_name") || "Customer",
        preview: last ? (last.body || (last.image ? "📷 Photo" : "")) : "No messages yet",
        lastAt: last?.at ?? (c.created_at as string),
        unread: unreadMap.get(c.id as string) ?? 0,
        bookingLabel: c.booking_id ? svc || "Booking" : null,
        bookingStatus: bStatus || null,
      };
    })
    .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
}

export async function fetchMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, body, sender_id, created_at, image_path")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as ChatMessage[];
}

/** The one write path: the moderate-message edge function (service role). */
export async function sendMessage(conversationId: string, body: string): Promise<string | null> {
  const { error } = await supabase.functions.invoke("moderate-message", {
    body: { conversation_id: conversationId, body, image_path: null },
  });
  return error ? error.message : null;
}

export async function markConversationRead(conversationId: string, userId: string): Promise<void> {
  await supabase
    .from("conversation_reads")
    .upsert(
      { conversation_id: conversationId, user_id: userId, last_read_at: new Date().toISOString() },
      { onConflict: "conversation_id,user_id" },
    );
}
