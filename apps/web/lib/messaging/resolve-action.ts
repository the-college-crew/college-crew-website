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

  await supabase.from("conversation_resolutions").upsert(
    {
      conversation_id: conversationId,
      user_id: user.id,
      resolved_at: new Date().toISOString(),
    },
    { onConflict: "conversation_id,user_id" },
  );

  // "layout" (not the default "page") so the persistent desktop sidebar in
  // messages/layout.tsx — a different segment than the thread page we're
  // resolving from — also drops the newly-hidden conversation immediately.
  revalidatePath("/messages", "layout");
}
