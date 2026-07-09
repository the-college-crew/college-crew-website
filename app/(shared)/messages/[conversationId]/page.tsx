import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BackButton } from "@/components/back-button";
import { ChatThread } from "@/components/chat/chat-thread";
import { DemoChatThread } from "@/components/demo-chat-thread";
import { SamplePreviewBanner } from "@/components/sample-preview-banner";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import {
  demoConversation,
  demoMessagesFor,
  getDemoPreview,
} from "@/lib/demo/sample-preview";
import type { Message } from "@/lib/db/types";
import { markConversationRead } from "@/lib/messaging/unread";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Messages" };

/**
 * Per provider+customer thread (SPEC §8, shared ownership). RLS decides
 * membership — non-members simply see a 404.
 */
export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const user = await requireUser(`/messages/${conversationId}`);
  const demoPreview =
    (await getDemoPreview("customer")) ?? (await getDemoPreview("provider"));

  if (conversationId === "demo" && demoPreview) {
    const otherName =
      demoPreview.role === "customer"
        ? demoConversation.providerName
        : demoConversation.customerName;

    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="font-display text-xs font-semibold text-mist">
              Sample conversation
            </p>
            <h1 className="font-display text-2xl font-semibold">
              {otherName}
            </h1>
          </div>
          <BackButton />
        </div>
        <div className="mb-4">
          <SamplePreviewBanner role={demoPreview.role} />
        </div>

        <Card pennant className="flex min-h-[60vh] flex-1 flex-col p-0">
          <DemoChatThread
            currentUserId="demo-current-user"
            messages={demoMessagesFor(demoPreview.role)}
          />
        </Card>
      </div>
    );
  }

  if (conversationId === "demo") notFound();

  const supabase = await createClient();
  const { data: conversation } = await supabase
    .from("conversations")
    .select(
      "id, customer_id, booking_id, customer:profiles(full_name), provider:provider_profiles(display_name)",
    )
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation) notFound();

  // Opening the thread clears its unread badge. Best-effort; never blocks render.
  await markConversationRead(supabase, conversation.id);

  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(200);

  const isCustomer = conversation.customer_id === user.id;
  const otherName = isCustomer
    ? conversation.provider.display_name
    : conversation.customer.full_name;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-xs font-semibold text-mist">
            Conversation
          </p>
          <h1 className="font-display text-2xl font-semibold">
            {otherName || "Conversation"}
          </h1>
        </div>
        <BackButton />
      </div>

      <Card pennant className="flex min-h-[60vh] flex-1 flex-col p-0">
        <ChatThread
          conversationId={conversation.id}
          currentUserId={user.id}
          initialMessages={(messages ?? []) as Message[]}
        />
      </Card>
    </div>
  );
}
