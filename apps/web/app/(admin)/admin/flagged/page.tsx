import type { Metadata } from "next";
import Link from "next/link";

import { resolveConversationFlags, resolveProfileFlag } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import type { Json, ProfileTextField } from "@/lib/db/types";
import { attachmentPreviewText } from "@/lib/messaging/attachments";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate, formatTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Flagged" };

type FlagEvent = {
  id: string;
  matched_patterns: string[];
  created_at: string;
  message: {
    id: string;
    conversation_id: string;
    sender: { full_name: string } | null;
  } | null;
};

type ProfileFlagEvent = {
  id: string;
  field: ProfileTextField;
  flagged_text: string;
  matched_patterns: string[];
  created_at: string;
  provider: { id: string; display_name: string } | null;
  user: { full_name: string } | null;
};

const PROFILE_FIELD_LABEL: Record<ProfileTextField, string> = {
  display_name: "Display name",
  bio: "Bio",
  company_name: "Company name",
};

type ThreadMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  image_path: string | null;
  attachments: Json;
  created_at: string;
  sender: { full_name: string } | null;
};

type ConversationMeta = {
  id: string;
  customer: { full_name: string } | null;
  provider: { display_name: string } | null;
};

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
  // moderation_events, messages, conversations, and profiles.
  const supabase = await createClient();

  // Open (unresolved) flags only. Resolving a chat sets resolved_at on all of
  // its events, dropping the whole conversation off this list.
  const { data: eventData } = await supabase
    .from("moderation_events")
    .select(
      "id, matched_patterns, created_at, message:messages(id, conversation_id, sender:profiles(full_name))",
    )
    .is("resolved_at", null)
    .order("created_at", { ascending: false });

  const events = (eventData ?? []) as unknown as FlagEvent[];

  // Profile-text flags: a bio or display name that tripped the scan. Flag-only,
  // like chat — the text below is LIVE on the provider's public profile until an
  // admin edits it on /admin/providers.
  const { data: profileEventData } = await supabase
    .from("profile_moderation_events")
    .select(
      "id, field, flagged_text, matched_patterns, created_at, provider:provider_profiles(id, display_name), user:profiles(full_name)",
    )
    .is("resolved_at", null)
    .order("created_at", { ascending: false });

  const profileEvents = (profileEventData ?? []) as unknown as ProfileFlagEvent[];

  // Group flags by conversation: which messages tripped the scan (+ why), how
  // many flags, and the most recent flag time (for ordering).
  const patternsByMessage = new Map<string, Set<string>>();
  const flagCountByConversation = new Map<string, number>();
  const latestFlagByConversation = new Map<string, string>();
  for (const event of events) {
    const conversationId = event.message?.conversation_id;
    const messageId = event.message?.id;
    if (!conversationId || !messageId) continue;
    const patterns = patternsByMessage.get(messageId) ?? new Set<string>();
    event.matched_patterns.forEach((tag) => patterns.add(tag));
    patternsByMessage.set(messageId, patterns);
    flagCountByConversation.set(
      conversationId,
      (flagCountByConversation.get(conversationId) ?? 0) + 1,
    );
    const previous = latestFlagByConversation.get(conversationId);
    if (!previous || event.created_at > previous) {
      latestFlagByConversation.set(conversationId, event.created_at);
    }
  }

  const conversationIds = [...flagCountByConversation.keys()];

  // Pull each flagged conversation's FULL, current thread + participant names,
  // so review sees the whole exchange — including anything said after the flag.
  const [{ data: messageData }, { data: conversationData }] =
    conversationIds.length > 0
      ? await Promise.all([
          supabase
            .from("messages")
            .select(
              "id, conversation_id, sender_id, body, image_path, attachments, created_at, sender:profiles(full_name)",
            )
            .in("conversation_id", conversationIds)
            .order("created_at", { ascending: true }),
          supabase
            .from("conversations")
            // conversation_reads also links conversations↔profiles; the FK
            // hint keeps the customer embed unambiguous for PostgREST.
            .select(
              "id, customer:profiles!conversations_customer_id_fkey(full_name), provider:provider_profiles(display_name)",
            )
            .in("id", conversationIds),
        ])
      : [{ data: [] }, { data: [] }];

  const threadMessages = (messageData ?? []) as unknown as ThreadMessage[];
  const conversationMeta = (conversationData ?? []) as unknown as ConversationMeta[];

  const messagesByConversation = new Map<string, ThreadMessage[]>();
  for (const message of threadMessages) {
    const list = messagesByConversation.get(message.conversation_id) ?? [];
    list.push(message);
    messagesByConversation.set(message.conversation_id, list);
  }
  const metaById = new Map(conversationMeta.map((c) => [c.id, c]));

  // Most recently flagged conversation first.
  const orderedConversationIds = conversationIds.sort((a, b) =>
    (latestFlagByConversation.get(b) ?? "").localeCompare(
      latestFlagByConversation.get(a) ?? "",
    ),
  );

  return (
    <div className="space-y-8">
      {/* New flags land here live as chat and profile moderation log them. */}
      <RealtimeRefresh channel="admin-flagged" table="moderation_events" />
      <RealtimeRefresh
        channel="admin-flagged-profiles"
        table="profile_moderation_events"
      />
      <PageHeader
        title="Flagged"
        description="Chat messages and provider bios flagged by the regex scan or gpt-5.4-nano. Flag-only moderation — nothing is redacted, blocked, or hidden; flagged content stays live until you change it. Resolving just marks a flag reviewed, it doesn't edit anything."
      />

      <section aria-labelledby="events">
        <h2 id="events" className="font-display text-xl font-semibold">
          Flagged conversations ({orderedConversationIds.length})
        </h2>
        <div className="mt-3 space-y-3">
          {orderedConversationIds.length === 0 ? (
            <EmptyState title="Nothing flagged yet">
              When a chat message trips the contact-info scan, the whole
              conversation shows up here for review.
            </EmptyState>
          ) : (
            orderedConversationIds.map((conversationId) => {
              const meta = metaById.get(conversationId);
              const messages = messagesByConversation.get(conversationId) ?? [];
              const flagCount = flagCountByConversation.get(conversationId) ?? 0;
              const latestFlag = latestFlagByConversation.get(conversationId);
              const customerName = meta?.customer?.full_name || "Customer";
              const providerName = meta?.provider?.display_name || "Provider";

              return (
                <Card key={conversationId} pennant className="relative p-4">
                  {/* Resolve floats outside the <summary> so clicking it submits
                      instead of toggling the collapse. */}
                  <form
                    action={resolveConversationFlags}
                    className="absolute right-4 top-4 z-10"
                  >
                    <input
                      type="hidden"
                      name="conversationId"
                      value={conversationId}
                    />
                    <Button type="submit" variant="success" size="sm">
                      Resolve chat
                    </Button>
                  </form>

                  {/* Collapsed by default; the header (summary) toggles it. */}
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-start gap-2 pr-28 [&::-webkit-details-marker]:hidden">
                      <span
                        aria-hidden
                        className="mt-1 shrink-0 text-mist transition-transform group-open:rotate-90"
                      >
                        ▸
                      </span>
                      <div>
                        <p className="font-display text-lg font-semibold">
                          {customerName} <span className="text-mist">↔</span>{" "}
                          {providerName}
                        </p>
                        <p className="mt-0.5 text-sm text-ink-soft">
                          {flagCount} {flagCount === 1 ? "flag" : "flags"}
                          {latestFlag
                            ? ` · latest ${formatDate(latestFlag)}`
                            : ""}
                        </p>
                      </div>
                    </summary>

                    <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
                      Full conversation
                      <span className="ml-1 font-normal normal-case tracking-normal text-mist">
                        (oldest first · highlighted = flagged)
                      </span>
                    </p>

                    <div className="mt-2 space-y-2 rounded-lg border border-line bg-honeydew/30 p-3">
                    {messages.length === 0 ? (
                      <p className="text-sm text-mist">
                        No messages in this conversation.
                      </p>
                    ) : (
                      messages.map((message) => {
                        const flaggedPatterns = patternsByMessage.get(message.id);
                        const isFlagged = !!flaggedPatterns;
                        return (
                          <div
                            key={message.id}
                            className={cn(
                              "rounded-lg px-3 py-2 text-sm",
                              isFlagged
                                ? "border border-red-300 bg-red-50"
                                : "bg-paper/60",
                            )}
                          >
                            <p className="text-[11px] text-mist">
                              <span className="font-semibold text-ink-soft">
                                {message.sender?.full_name || "Unknown"}
                              </span>{" "}
                              · {formatTime(message.created_at)}
                            </p>
                            {attachmentPreviewText(message) ? (
                              <p className="mt-0.5 text-ink-soft">
                                {attachmentPreviewText(message)} attachment
                              </p>
                            ) : null}
                            {message.body ? (
                              <p className="mt-0.5 whitespace-pre-wrap">
                                {message.body}
                              </p>
                            ) : null}
                            {isFlagged ? (
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {[...flaggedPatterns].map((tag) => (
                                  <Badge
                                    key={tag}
                                    tone={tag.startsWith("model:") ? "red" : "gold"}
                                  >
                                    {patternLabel(tag)}
                                  </Badge>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                    </div>
                  </details>
                </Card>
              );
            })
          )}
        </div>
      </section>

      <section aria-labelledby="profile-events">
        <h2 id="profile-events" className="font-display text-xl font-semibold">
          Flagged profiles ({profileEvents.length})
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Bios and display names that tripped the scan for inappropriate content,
          slander, or off-platform contact info. This text is{" "}
          <strong>live on the public profile</strong> — to remove it, edit the
          provider on Providers, then resolve the flag here.
        </p>
        <div className="mt-3 space-y-3">
          {profileEvents.length === 0 ? (
            <EmptyState title="No flagged profiles">
              When a provider saves a bio or display name that trips the scan, it
              shows up here for review.
            </EmptyState>
          ) : (
            profileEvents.map((event) => {
              const providerName =
                event.provider?.display_name ||
                event.user?.full_name ||
                "Provider";

              return (
                <Card key={event.id} pennant className="relative p-4">
                  <form
                    action={resolveProfileFlag}
                    className="absolute right-4 top-4 z-10"
                  >
                    <input type="hidden" name="eventId" value={event.id} />
                    <Button type="submit" variant="success" size="sm">
                      Resolve profile flag
                    </Button>
                  </form>

                  <div className="pr-24">
                    <p className="font-display text-lg font-semibold">
                      {providerName}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-soft">
                      {PROFILE_FIELD_LABEL[event.field]} ·{" "}
                      {formatDate(event.created_at)}
                    </p>
                  </div>

                  <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3">
                    <p className="whitespace-pre-wrap text-sm">
                      {event.flagged_text}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {event.matched_patterns.map((tag) => (
                        <Badge
                          key={tag}
                          tone={tag.startsWith("model:") ? "red" : "gold"}
                        >
                          {patternLabel(tag)}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {event.provider ? (
                    <Link
                      href="/admin/providers"
                      className="mt-3 inline-block text-sm font-semibold text-viridian underline underline-offset-2"
                    >
                      Edit this provider →
                    </Link>
                  ) : null}
                </Card>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
