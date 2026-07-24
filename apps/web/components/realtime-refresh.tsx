"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Invisible helper that re-fetches the current server component whenever rows
 * in `table` (optionally narrowed by `filter`) change — how server-rendered
 * dashboards stay live without moving their data-loading to the client.
 *
 * Realtime enforces RLS, so a subscriber only ever hears about rows it can
 * already read. That also means the socket MUST carry the user's JWT
 * (setAuth), or `to authenticated` policies deliver nothing and the channel
 * sits silent. Bursts of changes are coalesced into a single refresh.
 *
 * The Supabase client is imported *inside* the effect, not at module scope.
 * A static import puts @supabase/supabase-js in the static client graph of
 * every route segment that mounts this component, and the bundler then hands
 * that vendor chunk to every component in the segment's chunk group — so
 * visitors who never open a socket still download ~250 KB of it. Deferring to
 * a dynamic import inside client code is what actually moves it into its own
 * async chunk; `next/dynamic` at the call site does not, because a Server
 * Component's conditional render still leaves the module in the static graph.
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
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Set once the channel exists; also the unsubscribe path, since `client`
    // is no longer in scope for the cleanup closure.
    let teardown: (() => void) | null = null;

    const refreshSoon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 250);
    };

    // A reconnect can span changes that Postgres Changes will not replay. The
    // server-rendered query is authoritative, so reconcile whenever the browser
    // comes online and whenever the channel establishes a new subscription.
    const handleOnline = () => refreshSoon();
    window.addEventListener("online", handleOnline);

    void (async () => {
      const { createClient } = await import("@/lib/supabase/client");
      if (!active) return;

      const client = createClient();
      await client.realtime.setAuth();
      if (!active) return;

      const subscription = client
        .channel(channel)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table, filter },
          refreshSoon,
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") refreshSoon();
        });

      teardown = () => client.removeChannel(subscription);
      // Unmounting during either await above leaves a live channel behind.
      if (!active) teardown();
    })();

    return () => {
      active = false;
      window.removeEventListener("online", handleOnline);
      if (timer) clearTimeout(timer);
      teardown?.();
    };
  }, [channel, table, filter, router]);

  return null;
}
