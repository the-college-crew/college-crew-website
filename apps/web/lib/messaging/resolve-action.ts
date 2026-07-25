"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/** Hide a conversation from the caller's own inbox. */
export async function resolveConversation(conversationId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Never swallow this error: `.upsert()` is INSERT ... ON CONFLICT DO UPDATE,
  // so it needs both the insert AND update privilege/policy. When the update
  // half was missing, every resolve failed silently and the chat just stayed
  // in the inbox with no sign anything had gone wrong.
  const { error } = await supabase.from("conversation_resolutions").upsert(
    {
      conversation_id: conversationId,
      user_id: user.id,
      resolved_at: new Date().toISOString(),
    },
    { onConflict: "conversation_id,user_id" },
  );
  if (error) throw new Error(`Could not resolve the chat: ${error.message}`);

  // "layout" (not the default "page") so the persistent desktop sidebar in
  // messages/layout.tsx — a different segment than the thread page we're
  // resolving from — also drops the newly-hidden conversation immediately.
  revalidatePath("/messages", "layout");
}
