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
import { cn, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Messages" };

type ConversationRow = {
  id: string;
  customer_id: string;
  created_at: string;
  customer: { full_name: string };
  provider: { display_name: string };
};

/**
 * Messages inbox: every thread the signed-in user is part of, newest activity
 * first. This is the always-available way back into a conversation — including
 * declined-booking threads that don't surface on either dashboard. RLS scopes
 * conversations (and messages) to members, so this only ever lists the caller's
 * own threads.
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
            <Link href="/messages/demo" className="block">
              <Card className="p-4 transition-colors hover:bg-crew-50">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-display font-semibold text-ink">
                    {otherName}
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
              </Card>
            </Link>
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
      "id, customer_id, created_at, customer:profiles!conversations_customer_id_fkey(full_name), provider:provider_profiles(display_name)",
    );
  if (error) throw new Error(`Could not load conversations: ${error.message}`);
  const conversations = (conversationData ?? []) as ConversationRow[];

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

  const activityAt = (c: ConversationRow) =>
    latest.get(c.id)?.created_at ?? c.created_at;
  const sorted = [...conversations].sort(
    (a, b) => Date.parse(activityAt(b)) - Date.parse(activityAt(a)),
  );

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <PageHeader
        title="Messages"
        description="Your conversations with customers and providers."
      />

      {sorted.length === 0 ? (
        <EmptyState title="No conversations yet">
          Chats open from a booking request. Once you&apos;ve requested or
          accepted a job, the conversation shows up here.
        </EmptyState>
      ) : (
        <ul className="mt-6 space-y-3">
          {sorted.map((conversation) => {
            const isCustomer = conversation.customer_id === user.id;
            const otherName = isCustomer
              ? conversation.provider.display_name
              : conversation.customer.full_name;
            const preview = latest.get(conversation.id);
            const unread = unreadByConversation.get(conversation.id) ?? 0;

            return (
              <li key={conversation.id}>
                <Link href={`/messages/${conversation.id}`} className="block">
                  <Card className="p-4 transition-colors hover:bg-crew-50">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="flex items-center gap-2 font-display font-semibold text-ink">
                        {otherName || "Conversation"}
                        {unread > 0 ? (
                          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold leading-none text-white">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        ) : null}
                      </p>
                      {preview ? (
                        <span className="shrink-0 text-xs text-mist">
                          {formatDateTime(preview.created_at)}
                        </span>
                      ) : null}
                    </div>
                    <p
                      className={cn(
                        "mt-1 truncate text-sm",
                        unread > 0
                          ? "font-semibold text-ink"
                          : "text-ink-soft",
                      )}
                    >
                      {preview?.body || "No messages yet"}
                    </p>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
