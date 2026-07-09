import type { createClient } from "@/lib/supabase/server";

/**
 * Unread-message helpers. There's no per-message read flag in `messages`;
 * instead each user keeps a per-conversation "last read" marker in
 * `conversation_reads`, and the `unread_message_summary` RPC counts messages
 * from the other party that arrived after it. Everything runs under the
 * caller's session so RLS keeps it scoped to the caller's own threads.
 */

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type UnreadSummary = {
  total: number;
  byConversation: Map<string, number>;
};

/** Unread counts for the signed-in user, keyed by conversation id. */
export async function getUnreadSummary(
  supabase: ServerClient,
): Promise<UnreadSummary> {
  const { data } = await supabase.rpc("unread_message_summary");
  const byConversation = new Map<string, number>();
  let total = 0;
  for (const row of data ?? []) {
    const count = Number(row.unread_count) || 0;
    byConversation.set(row.conversation_id, count);
    total += count;
  }
  return { total, byConversation };
}

/**
 * Stamp the caller's last-read marker for a conversation to "now", clearing its
 * unread state. Best-effort — failing to record a read should never block
 * rendering the thread the user just opened.
 */
export async function markConversationRead(
  supabase: ServerClient,
  conversationId: string,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("conversation_reads").upsert(
    {
      conversation_id: conversationId,
      user_id: user.id,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "conversation_id,user_id" },
  );
}
