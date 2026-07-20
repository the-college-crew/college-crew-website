import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";

import { ConversationList } from "@/components/messaging/conversation-list";
import { SamplePreviewBanner } from "@/components/sample-preview-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import {
  demoConversation,
  demoMessagesFor,
  getDemoPreview,
} from "@/lib/demo/sample-preview";
import { getConversationGroups, type PersonGroup } from "@/lib/messaging/conversation-list";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Messages" };

/**
 * Messages inbox. On desktop the persistent sidebar in `layout.tsx` already
 * shows the list, so this page only renders a "select a conversation"
 * placeholder there; on mobile (where the sidebar is hidden) it renders the
 * full list. The admin sample-preview demo stays single-column at every
 * width — there's only ever one hardcoded thread, so `layout.tsx` skips the
 * sidebar entirely for it.
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
    const activityAt = latest?.created_at ?? new Date().toISOString();

    const demoGroups: PersonGroup[] = [
      {
        key: "demo",
        name: otherName,
        unread: 0,
        activityAt,
        threads: [
          {
            id: "demo",
            label: "Sample conversation",
            preview: latest?.body || "No messages yet",
            activityAt,
            unread: 0,
          },
        ],
      },
    ];

    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <PageHeader
          title="Messages"
          description="Your conversations with customers and providers."
        />
        <SamplePreviewBanner role={demoPreview.role} />
        <div className="mt-6 overflow-hidden rounded-2xl border border-stone bg-paper">
          <ConversationList groups={demoGroups} />
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const groups = await getConversationGroups(supabase, user.id);

  return (
    <>
      <div className="mx-auto w-full max-w-2xl px-4 py-8 lg:hidden">
        <PageHeader
          title="Messages"
          description="Your conversations with customers and providers."
        />

        {groups.length === 0 ? (
          <div className="mt-6">
            <EmptyState title="No conversations yet">
              Each booking gets its own chat. Request a job (or message a
              provider from their profile) and the conversation shows up
              here.
            </EmptyState>
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-2xl border border-stone bg-paper">
            <ConversationList groups={groups} />
          </div>
        )}
      </div>

      <div className="hidden h-full min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center lg:flex">
        <MessageCircle className="size-10 text-mist" strokeWidth={1.5} />
        {groups.length === 0 ? (
          <div>
            <p className="font-display text-lg font-semibold text-ink">
              No conversations yet
            </p>
            <p className="mt-1 max-w-xs text-sm text-ink-soft">
              Each booking gets its own chat. Request a job (or message a
              provider from their profile) and the conversation shows up
              here.
            </p>
          </div>
        ) : (
          <div>
            <p className="font-display text-lg font-semibold text-ink">
              Select a conversation
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              Choose a thread from the list to see the full conversation.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
