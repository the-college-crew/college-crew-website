"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * Browser-side unread helpers. The header badge starts from the
 * server-rendered total (lib/messaging/unread.ts) and then follows two
 * signals without a page navigation:
 *
 * - Supabase Realtime INSERTs on `messages` (RLS scopes delivery to threads
 *   the user is a member of), for messages from the other party.
 * - A window event fired whenever this tab marks a conversation read, so an
 *   open thread never accumulates a stale badge.
 *
 * Both signals trigger a debounced re-run of the `unread_message_summary`
 * RPC rather than local math, so the count can only ever be what the
 * database says it is.
 */

const UNREAD_CHANGED_EVENT = "college-crew:unread-changed";

export function announceUnreadChanged() {
  window.dispatchEvent(new Event(UNREAD_CHANGED_EVENT));
}

/** Stamp the caller's read marker from the browser, then update badges. */
export async function markConversationReadClient(
  conversationId: string,
): Promise<void> {
  const supabase = createClient();
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
  announceUnreadChanged();
}

/** Live unread total for the signed-in user, seeded by the server count. */
export function useLiveUnreadCount(initial: number): number {
  const [count, setCount] = useState(initial);

  // A server re-render (navigation) delivered a fresh total; adopt it.
  const [prevInitial, setPrevInitial] = useState(initial);
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setCount(initial);
  }

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const refetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        const { data } = await supabase.rpc("unread_message_summary");
        if (cancelled) return;
        setCount(
          (data ?? []).reduce(
            (sum, row) => sum + (Number(row.unread_count) || 0),
            0,
          ),
        );
      }, 250);
    };

    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      // Realtime enforces RLS; without the user's JWT on the socket the
      // channel joins but never delivers rows (same as chat-thread.tsx).
      await supabase.realtime.setAuth();
      if (cancelled) return;

      channel = supabase
        .channel("unread-badge")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          (payload) => {
            const senderId = (payload.new as { sender_id?: string }).sender_id;
            if (senderId !== user.id) refetch();
          },
        )
        .subscribe();
    })();

    window.addEventListener(UNREAD_CHANGED_EVENT, refetch);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener(UNREAD_CHANGED_EVENT, refetch);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return count;
}
