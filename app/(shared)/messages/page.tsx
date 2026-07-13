import type { Metadata } from "next";
import Link from "next/link";

import { SamplePreviewBanner } from "@/components/sample-preview-banner";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import {
  demoConversation,
  demoMessagesFor,
  getDemoPreview,
} from "@/lib/demo/sample-preview";
import { getUnreadSummary } from "@/lib/messaging/unread";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Messages" };

type ConversationRow = {
  id: string;
  customer_id: string;
  provider_id: string;
  booking_id: string | null;
  created_at: string;
  customer: { full_name: string } | null;
  provider: { display_name: string } | null;
  booking: { scheduled_at: string; service: { name: string } | null } | null;
};

type Thread = {
  id: string;
  label: string;
  preview: string;
  activityAt: string;
  unread: number;
};

/** One person, with every thread the caller shares with them. */
type PersonGroup = {
  key: string;
  name: string;
  threads: Thread[];
  unread: number;
  activityAt: string;
};

/**
 * Messages inbox: every thread the signed-in user is part of, grouped by the
 * person on the other side. There's one thread per booking now, so the same
 * person can appear with several — each labelled by its job, plus at most one
 * booking-less "General inquiry". RLS scopes conversations (and messages) to
 * members, so this only ever lists the caller's own threads.
 */
export default async function MessagesPage() {
  const user = await requireUser("/messages");
  const demoPreview =
    (await getDemoPreview("customer")) ?? (await getDemoPreview("provider"));
  if (demoPreview) {
    const latest = demoMessagesFor(demoPreview.role).at(-1);
    const otherName =
      demoPreview.role === "customer"
        ? demoConversation.providerName
        : demoConversation.customerName;

    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <PageHeader
          title="Messages"
          description="Your conversations with customers and providers."
        />
        <SamplePreviewBanner role={demoPreview.role} />
        <ul className="mt-6 space-y-3">
          <li>
            <Card className="overflow-hidden p-0">
              <p className="border-b border-line px-4 py-3 font-display font-semibold text-ink">
                {otherName}
              </p>
              <Link
                href="/messages/demo"
                className="block px-4 py-3 transition-colors hover:bg-crew-50"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-semibold text-ink">
                    Sample conversation
                  </p>
                  {latest ? (
                    <span className="shrink-0 text-xs text-mist">
                      {formatDateTime(latest.created_at)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 truncate text-sm text-ink-soft">
                  {latest?.body || "No messages yet"}
                </p>
              </Link>
            </Card>
          </li>
        </ul>
      </div>
    );
  }

  const supabase = await createClient();

  // conversation_reads also links conversations↔profiles, so the customer
  // embed must name its FK or PostgREST rejects the query as ambiguous.
  const { data: conversationData, error } = await supabase
    .from("conversations")
    .select(
      "id, customer_id, provider_id, booking_id, created_at, customer:profiles!conversations_customer_id_fkey(full_name), provider:provider_profiles(display_name), booking:bookings(scheduled_at, service:services(name))",
    );
  if (error) throw new Error(`Could not load conversations: ${error.message}`);
  const conversations = (conversationData ?? []) as unknown as ConversationRow[];

  // Latest message per thread, in one query, for the preview + sort order.
  const ids = conversations.map((c) => c.id);
  const latest = new Map<string, { body: string; created_at: string }>();
  if (ids.length > 0) {
    const { data: messages } = await supabase
      .from("messages")
      .select("conversation_id, body, image_path, created_at")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false });
    for (const m of messages ?? []) {
      if (latest.has(m.conversation_id)) continue; // desc order → first is newest
      latest.set(m.conversation_id, {
        body: m.body || (m.image_path ? "📷 Photo" : ""),
        created_at: m.created_at,
      });
    }
  }

  const { byConversation: unreadByConversation } =
    await getUnreadSummary(supabase);

  // Group by the other party. A group's unread count is the sum of its threads',
  // and both people and threads sort by latest activity, newest first.
  const groups = new Map<string, PersonGroup>();
  for (const conversation of conversations) {
    const isCustomer = conversation.customer_id === user.id;
    const key = isCustomer ? conversation.provider_id : conversation.customer_id;
    const name =
      (isCustomer
        ? conversation.provider?.display_name
        : conversation.customer?.full_name) || "Conversation";

    const preview = latest.get(conversation.id);
    const activityAt = preview?.created_at ?? conversation.created_at;
    const unread = unreadByConversation.get(conversation.id) ?? 0;
    const booking = conversation.booking;

    const thread: Thread = {
      id: conversation.id,
      label: booking
        ? `${booking.service?.name ?? "Booking"} · ${formatDate(booking.scheduled_at)}`
        : "General inquiry",
      preview: preview?.body || "No messages yet",
      activityAt,
      unread,
    };

    const group = groups.get(key);
    if (group) {
      group.threads.push(thread);
      group.unread += unread;
      if (Date.parse(activityAt) > Date.parse(group.activityAt)) {
        group.activityAt = activityAt;
      }
    } else {
      groups.set(key, {
        key,
        name,
        threads: [thread],
        unread,
        activityAt,
      });
    }
  }

  const sortByActivity = <T extends { activityAt: string }>(a: T, b: T) =>
    Date.parse(b.activityAt) - Date.parse(a.activityAt);
  const people = [...groups.values()].sort(sortByActivity);
  for (const person of people) person.threads.sort(sortByActivity);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <PageHeader
        title="Messages"
        description="Your conversations with customers and providers."
      />

      {people.length === 0 ? (
        <EmptyState title="No conversations yet">
          Each booking gets its own chat. Request a job — or message a provider
          from their profile — and the conversation shows up here.
        </EmptyState>
      ) : (
        <ul className="mt-6 space-y-3">
          {people.map((person) => (
            <li key={person.key}>
              <Card className="overflow-hidden p-0">
                <div className="flex items-center gap-2 border-b border-line px-4 py-3">
                  <p className="font-display font-semibold text-ink">
                    {person.name}
                  </p>
                  {person.unread > 0 ? (
                    <UnreadBadge count={person.unread} />
                  ) : null}
                </div>

                <ul className="divide-y divide-line">
                  {person.threads.map((thread) => (
                    <li key={thread.id}>
                      <Link
                        href={`/messages/${thread.id}`}
                        className="block px-4 py-3 transition-colors hover:bg-crew-50"
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                            {thread.label}
                            {thread.unread > 0 ? (
                              <UnreadBadge count={thread.unread} />
                            ) : null}
                          </p>
                          <span className="shrink-0 text-xs text-mist">
                            {formatDateTime(thread.activityAt)}
                          </span>
                        </div>
                        <p
                          className={cn(
                            "mt-1 truncate text-sm",
                            thread.unread > 0
                              ? "font-semibold text-ink"
                              : "text-ink-soft",
                          )}
                        >
                          {thread.preview}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UnreadBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold leading-none text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}
