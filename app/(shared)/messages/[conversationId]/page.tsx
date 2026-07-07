import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ChatThread } from "@/components/chat/chat-thread";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getSession, homePathFor, requireUser } from "@/lib/auth/session";
import type { Message } from "@/lib/db/types";
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

  const supabase = await createClient();
  const { data: conversation } = await supabase
    .from("conversations")
    .select(
      "id, customer_id, booking_id, customer:profiles(full_name), provider:provider_profiles(display_name)",
    )
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation) notFound();

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

  const session = await getSession();
  const backHref = session ? homePathFor(session.profile.role) : "/";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="font-display text-xs font-semibold text-mist">
            Conversation
          </p>
          <h1 className="font-display text-2xl font-semibold">
            {otherName || "Conversation"}
          </h1>
        </div>
        <Link
          href={backHref}
          className={buttonClasses({ variant: "ghost", size: "sm" })}
        >
          ← Dashboard
        </Link>
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
