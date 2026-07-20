import type { createClient } from "@/lib/supabase/server";
import { attachmentPreviewText } from "@/lib/messaging/attachments";

/**
 * Dashboard conversation lookups. There's one thread per booking (schema: unique
 * booking_id), so a booking's chat is found by its own id — which is what keeps a
 * declined card quoting the note from *that* booking's thread instead of
 * whatever the provider last said about some other job. Mirrors the
 * latest-message pattern in the messages inbox (app/(shared)/messages/page.tsx).
 */

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type ConversationEntry = {
  conversationId: string;
  latest: { body: string; created_at: string; fromOther: boolean } | null;
};

/** Index the customer's booking threads by booking id, with a message preview. */
export async function getCustomerConversationIndex(
  supabase: ServerClient,
  customerId: string,
): Promise<Map<string, ConversationEntry>> {
  const byBooking = new Map<string, ConversationEntry>();

  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, booking_id")
    .eq("customer_id", customerId)
    .not("booking_id", "is", null);
  if (!conversations || conversations.length === 0) return byBooking;

  const ids = conversations.map((c) => c.id);
  const latest = new Map<
    string,
    { body: string; created_at: string; fromOther: boolean }
  >();
  const { data: messages } = await supabase
    .from("messages")
    .select(
      "conversation_id, sender_id, body, image_path, attachments, created_at",
    )
    .in("conversation_id", ids)
    .order("created_at", { ascending: false });
  for (const m of messages ?? []) {
    if (latest.has(m.conversation_id)) continue; // desc order → first is newest
    latest.set(m.conversation_id, {
      body: m.body || attachmentPreviewText(m),
      created_at: m.created_at,
      fromOther: m.sender_id !== customerId,
    });
  }

  for (const c of conversations) {
    if (!c.booking_id) continue;
    byBooking.set(c.booking_id, {
      conversationId: c.id,
      latest: latest.get(c.id) ?? null,
    });
  }
  return byBooking;
}
