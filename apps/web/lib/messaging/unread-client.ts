"use client";

import { useEffect, useState } from "react";

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
 *
 * `createClient` is reached through `loadClient()` below rather than a
 * module-scope import. UserMenu imports this file, SiteHeader imports
 * UserMenu, so a static import parks @supabase/supabase-js in the static
 * client graph of every route segment that renders the header — including the
 * public landing page, where the menu never renders at all. The bundler hands
 * that vendor chunk to every component in the segment's chunk group, so
 * logged-out visitors were downloading ~250 KB of realtime client to look at
 * a nav bar. Conditional rendering does not help; only a dynamic import
 * inside client code moves it to its own async chunk.
 */

const UNREAD_CHANGED_EVENT = "college-crew:unread-changed";

/**
 * Cached so repeated hook mounts share one module fetch. `createClient`
 * itself is cheap to call again — it's the ~250 KB module behind it we only
 * want to pull over the wire once.
 */
let clientModule: Promise<typeof import("@/lib/supabase/client")> | null = null;

function loadClient() {
  clientModule ??= import("@/lib/supabase/client");
  return clientModule.then((m) => m.createClient());
}

type UnreadCounts = Record<string, number>;

export function announceUnreadChanged() {
  window.dispatchEvent(new Event(UNREAD_CHANGED_EVENT));
}

/** Stamp the caller's read marker from the browser, then update badges. */
export async function markConversationReadClient(
  conversationId: string,
): Promise<void> {
  const supabase = await loadClient();
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

/** Live unread counts keyed by conversation id, seeded by the server list. */
export function useLiveUnreadCounts(initial: UnreadCounts): UnreadCounts {
  const initialKey = JSON.stringify(initial);
  const [counts, setCounts] = useState<UnreadCounts>(initial);
  const [previousInitialKey, setPreviousInitialKey] = useState(initialKey);

  // Adopt fresh server-rendered counts after a navigation or refresh.
  if (previousInitialKey !== initialKey) {
    setPreviousInitialKey(initialKey);
    setCounts(initial);
  }

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let teardown: (() => void) | null = null;

    const refetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        const supabase = await loadClient();
        if (cancelled) return;
        const { data } = await supabase.rpc("unread_message_summary");
        if (cancelled) return;
        const next: UnreadCounts = {};
        for (const row of data ?? []) {
          const count = Number(row.unread_count) || 0;
          if (count > 0) next[row.conversation_id] = count;
        }
        setCounts(next);
      }, 250);
    };

    (async () => {
      const supabase = await loadClient();
      if (cancelled) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      await supabase.realtime.setAuth();
      if (cancelled) return;

      const channel = supabase
        .channel("unread-conversation-list")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          (payload) => {
            const senderId = (payload.new as { sender_id?: string }).sender_id;
            if (senderId !== user.id) refetch();
          },
        )
        .subscribe();

      teardown = () => supabase.removeChannel(channel);
      // Unmounting mid-await would otherwise strand a live channel.
      if (cancelled) teardown();
    })();

    window.addEventListener(UNREAD_CHANGED_EVENT, refetch);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener(UNREAD_CHANGED_EVENT, refetch);
      teardown?.();
    };
  }, []);

  return counts;
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
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let teardown: (() => void) | null = null;

    const refetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        const supabase = await loadClient();
        if (cancelled) return;
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

    (async () => {
      const supabase = await loadClient();
      if (cancelled) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      // Realtime enforces RLS; without the user's JWT on the socket the
      // channel joins but never delivers rows (same as chat-thread.tsx).
      await supabase.realtime.setAuth();
      if (cancelled) return;

      const channel = supabase
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

      teardown = () => supabase.removeChannel(channel);
      // Unmounting mid-await would otherwise strand a live channel.
      if (cancelled) teardown();
    })();

    window.addEventListener(UNREAD_CHANGED_EVENT, refetch);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener(UNREAD_CHANGED_EVENT, refetch);
      teardown?.();
    };
  }, []);

  return count;
}
