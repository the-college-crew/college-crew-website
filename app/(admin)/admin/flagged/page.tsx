import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import type { ModerationStatus } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Flagged messages" };

type Row = {
  id: string;
  original_body: string;
  matched_patterns: string[];
  created_at: string;
  message: {
    moderation_status: ModerationStatus;
    sender: { full_name: string } | null;
  } | null;
};

const statusTone = {
  clean: "green",
  redacted: "gold",
  flagged: "red",
} as const;

/** Human label for a matched-pattern tag; `model:*` tags come from gpt-5.4-nano. */
function patternLabel(tag: string): string {
  const [scope, name] = tag.startsWith("model:")
    ? ["model", tag.slice("model:".length)]
    : ["regex", tag];
  const readable = name.replace(/_/g, " ");
  return scope === "model" ? `AI · ${readable}` : readable;
}

export default async function AdminFlaggedPage() {
  // Reads run as the signed-in admin — RLS admin policies grant visibility into
  // moderation_events, the linked message, and the sender's profile.
  const supabase = await createClient();
  const { data } = await supabase
    .from("moderation_events")
    .select(
      "id, original_body, matched_patterns, created_at, message:messages(moderation_status, sender:profiles(full_name))",
    )
    .order("created_at", { ascending: false });

  const events = (data ?? []) as unknown as Row[];

  return (
    <div className="space-y-8">
      {/* New flags land here live as chat moderation logs them. */}
      <RealtimeRefresh channel="admin-flagged" table="moderation_events" />
      <PageHeader
        title="Flagged messages"
        description="Messages the regex scan or gpt-5.4-nano flagged for possible off-platform contact info. Each entry shows the whole recent conversation so you can spot contact info split across several messages. Nothing is redacted — messages are always delivered in full; they're logged here for your review."
      />

      <section aria-labelledby="events">
        <h2 id="events" className="font-display text-xl font-semibold">
          Recent flags ({events.length})
        </h2>
        <div className="mt-3 space-y-3">
          {events.length === 0 ? (
            <EmptyState title="Nothing flagged yet">
              When a chat message trips the contact-info scan, the original shows
              up here for review.
            </EmptyState>
          ) : (
            events.map((event) => {
              const status = event.message?.moderation_status ?? "flagged";
              return (
                <Card key={event.id} pennant className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-lg font-semibold">
                        {event.message?.sender?.full_name || "Unknown sender"}
                      </p>
                      <p className="mt-0.5 text-sm text-ink-soft">
                        {formatDate(event.created_at)}
                      </p>
                    </div>
                    <Badge tone={statusTone[status]}>{status}</Badge>
                  </div>

                  <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
                    Flagged conversation
                    <span className="ml-1 font-normal normal-case tracking-normal text-mist">
                      (most recent last · SENDER = {event.message?.sender?.full_name || "flagged user"})
                    </span>
                  </p>
                  <p className="mt-1 whitespace-pre-wrap rounded-lg border border-line bg-honeydew/40 p-3 text-sm">
                    {event.original_body}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {event.matched_patterns.map((tag) => (
                      <Badge key={tag} tone={tag.startsWith("model:") ? "red" : "gold"}>
                        {patternLabel(tag)}
                      </Badge>
                    ))}
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
