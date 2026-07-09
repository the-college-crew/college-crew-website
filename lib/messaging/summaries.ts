import type { createClient } from "@/lib/supabase/server";

/**
 * Dashboard conversation lookups. There's one thread per customer+provider pair
 * (schema unique constraint), so a customer's bookings can be matched to their
 * chat by the provider id. Used to resolve a booking's conversation and preview
 * the provider's latest message on a declined card. Mirrors the latest-message
 * pattern in the messages inbox (app/(shared)/messages/page.tsx).
 */

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type ConversationEntry = {
  conversationId: string;
  latest: { body: string; created_at: string; fromOther: boolean } | null;
};

/** Index the customer's conversations by provider id, with a message preview. */
export async function getCustomerConversationIndex(
  supabase: ServerClient,
  customerId: string,
): Promise<Map<string, ConversationEntry>> {
  const byProvider = new Map<string, ConversationEntry>();

  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, provider_id")
    .eq("customer_id", customerId);
  if (!conversations || conversations.length === 0) return byProvider;

  const ids = conversations.map((c) => c.id);
  const latest = new Map<
    string,
    { body: string; created_at: string; fromOther: boolean }
  >();
  const { data: messages } = await supabase
    .from("messages")
    .select("conversation_id, sender_id, body, image_path, created_at")
    .in("conversation_id", ids)
    .order("created_at", { ascending: false });
  for (const m of messages ?? []) {
    if (latest.has(m.conversation_id)) continue; // desc order → first is newest
    latest.set(m.conversation_id, {
      body: m.body || (m.image_path ? "📷 Photo" : ""),
      created_at: m.created_at,
      fromOther: m.sender_id !== customerId,
    });
  }

  for (const c of conversations) {
    byProvider.set(c.provider_id, {
      conversationId: c.id,
      latest: latest.get(c.id) ?? null,
    });
  }
  return byProvider;
}
