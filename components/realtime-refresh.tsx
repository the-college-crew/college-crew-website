"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * Invisible helper that re-fetches the current server component whenever rows
 * in `table` (optionally narrowed by `filter`) change — how server-rendered
 * dashboards stay live without moving their data-loading to the client.
 *
 * Realtime enforces RLS, so a subscriber only ever hears about rows it can
 * already read. That also means the socket MUST carry the user's JWT
 * (setAuth), or `to authenticated` policies deliver nothing and the channel
 * sits silent. Bursts of changes are coalesced into a single refresh.
 */
export function RealtimeRefresh({
  channel,
  table,
  filter,
}: {
  channel: string;
  table: string;
  filter?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const client = createClient();
    let subscription: ReturnType<typeof client.channel> | null = null;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const refreshSoon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 250);
    };

    void (async () => {
      await client.realtime.setAuth();
      if (!active) return;

      subscription = client
        .channel(channel)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table, filter },
          refreshSoon,
        )
        .subscribe();
    })();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      if (subscription) client.removeChannel(subscription);
    };
  }, [channel, table, filter, router]);

  return null;
}
