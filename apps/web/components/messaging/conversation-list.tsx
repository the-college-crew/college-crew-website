"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Avatar } from "@/components/ui/avatar";
import type { PersonGroup } from "@/lib/messaging/conversation-list";
import { useLiveUnreadCounts } from "@/lib/messaging/unread-client";
import { cn, formatDateTime } from "@/lib/utils";

/**
 * Shared list markup for both the persistent desktop sidebar and the
 * full-width mobile list — one place to keep them visually in sync. Reads
 * the active thread from the URL so the desktop sidebar can highlight it.
 */
export function ConversationList({ groups }: { groups: PersonGroup[] }) {
  const pathname = usePathname();
  const activeConversationId = pathname.match(
    /^\/messages\/([0-9a-f-]{36})$/i,
  )?.[1];
  const initialUnread = Object.fromEntries(
    groups.flatMap((person) =>
      person.threads.map((thread) => [thread.id, thread.unread]),
    ),
  );
  const liveUnread = useLiveUnreadCounts(initialUnread);

  return (
    <div>
      {groups.map((person) => (
        <div
          key={person.key}
          className="border-t border-line py-1 first:border-t-0"
        >
          <div className="flex items-center gap-2.5 px-4 pt-3 pb-1.5">
            <Avatar name={person.name} size="sm" />
            <p className="truncate font-display text-sm font-semibold text-ink">
              {person.name}
            </p>
            {person.threads.reduce(
              (sum, thread) =>
                sum +
                (thread.id === activeConversationId
                  ? 0
                  : (liveUnread[thread.id] ?? 0)),
              0,
            ) > 0 ? (
              <UnreadBadge
                count={person.threads.reduce(
                  (sum, thread) =>
                    sum +
                    (thread.id === activeConversationId
                      ? 0
                      : (liveUnread[thread.id] ?? 0)),
                  0,
                )}
                className="ml-auto"
              />
            ) : null}
          </div>

          <div className="flex flex-col gap-0.5 pb-2">
            {person.threads.map((thread) => {
              const active = thread.id === activeConversationId;
              const unread = active ? 0 : (liveUnread[thread.id] ?? 0);
              return (
                <Link
                  key={thread.id}
                  href={`/messages/${thread.id}`}
                  className={cn(
                    "mx-2 flex flex-col gap-0.5 rounded-xl border-l-2 border-transparent py-2.5 pl-5 pr-3 transition-colors hover:bg-honeydew/40",
                    active && "border-gold-400 bg-honeydew/60",
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="flex items-center gap-2 truncate text-sm font-semibold text-ink">
                      {thread.label}
                      {unread > 0 ? (
                        <UnreadBadge count={unread} />
                      ) : null}
                    </p>
                    <span className="shrink-0 text-[11px] text-mist">
                      {formatDateTime(thread.activityAt)}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "truncate text-xs",
                      unread > 0
                        ? "font-semibold text-ink"
                        : "text-ink-soft",
                    )}
                  >
                    {thread.preview}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function UnreadBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold leading-none text-white",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
