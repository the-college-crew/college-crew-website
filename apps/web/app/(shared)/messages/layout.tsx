import { ConversationList } from "@/components/messaging/conversation-list";
import { requireUser } from "@/lib/auth/session";
import { getDemoPreview } from "@/lib/demo/sample-preview";
import { getConversationGroups } from "@/lib/messaging/conversation-list";
import { createClient } from "@/lib/supabase/server";

/**
 * Persistent desktop sidebar for /messages and /messages/[conversationId] —
 * mobile keeps the existing single-column list→thread flow (the sidebar is
 * hidden below `lg`). Bypassed entirely for the admin sample-preview demo,
 * which only ever has one hardcoded thread — a sidebar showing that same
 * thread would be redundant.
 */
export default async function MessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser("/messages");
  const demoPreview =
    (await getDemoPreview("customer")) ?? (await getDemoPreview("provider"));

  if (demoPreview) return <>{children}</>;

  const supabase = await createClient();
  const groups = await getConversationGroups(supabase, user.id);

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="hidden w-[22rem] shrink-0 flex-col border-r border-line lg:flex">
        <div className="shrink-0 border-b border-line px-4 py-4">
          <h1 className="font-display text-lg font-semibold text-ink">
            Messages
          </h1>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {groups.length === 0 ? (
            <p className="px-4 py-6 text-sm text-mist">
              No conversations yet.
            </p>
          ) : (
            <ConversationList groups={groups} />
          )}
        </div>
      </aside>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
