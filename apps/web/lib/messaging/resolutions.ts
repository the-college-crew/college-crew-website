import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { createClient as createClientType } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClientType>>;

/**
 * Per-user "hide this chat" markers (conversation_resolutions). A row means
 * the conversation is hidden from that user's inbox — either because they
 * hit "Resolve" or because the job it's tied to completed (both sides get a
 * row). A trigger on `messages` deletes the recipient's row whenever the
 * other party sends a new message, so a hidden thread reappears on its own.
 */
export async function getOwnResolvedIds(
  supabase: ServerClient,
  userId: string,
): Promise<Set<string>> {
  const { data } = await supabase
    .from("conversation_resolutions")
    .select("conversation_id")
    .eq("user_id", userId);
  return new Set((data ?? []).map((r) => r.conversation_id));
}

/** Hide a conversation from the caller's own inbox. */
export async function resolveConversation(conversationId: string): Promise<void> {
  "use server";

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

  revalidatePath("/messages");
}
