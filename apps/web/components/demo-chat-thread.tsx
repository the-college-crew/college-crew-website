import { Paperclip, SendHorizontal, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Message } from "@/lib/db/types";
import { cn, formatTime } from "@/lib/utils";

export function DemoChatThread({
  currentUserId,
  messages,
}: {
  currentUserId: string;
  messages: Message[];
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
        <div className="mx-auto mb-1 flex max-w-md items-start gap-2 rounded-xl border border-line bg-court/60 px-3 py-2 text-center text-[11px] leading-relaxed text-ink-soft">
          <ShieldCheck
            className="mt-0.5 size-3.5 shrink-0 text-mist"
            strokeWidth={1.75}
          />
          <span>
            College Crew monitors chats to help stop off-platform contact
            info. Please don&apos;t send phone numbers, email addresses,
            social handles, or payment details. Job details and addresses are
            okay.
          </span>
        </div>
        {messages.map((message) => {
          const mine = message.sender_id === currentUserId;
          return (
            <div
              key={message.id}
              className={cn("flex", mine ? "justify-end" : "justify-start")}
            >
              <div className="max-w-[80%]">
                <div
                  className={cn(
                    "rounded-2xl px-4 py-2 text-sm",
                    mine
                      ? "rounded-br-md bg-viridian text-shell"
                      : "rounded-bl-md border border-line bg-paper text-ink",
                  )}
                >
                  <p className="whitespace-pre-wrap">{message.body}</p>
                </div>
                <p
                  className={cn(
                    "mt-1 text-[11px] text-mist",
                    mine && "text-right",
                  )}
                >
                  {formatTime(message.created_at)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="shrink-0 border-t border-line bg-paper p-3">
        <form className="flex items-end gap-2">
          <label className="flex size-10 shrink-0 cursor-not-allowed items-center justify-center rounded-full border border-line bg-paper text-mist opacity-60">
            <Paperclip className="size-[18px]" strokeWidth={1.75} />
            <span className="sr-only">
              Attach a photo disabled in sample mode
            </span>
          </label>
          <textarea
            rows={1}
            disabled
            placeholder="Sample mode: messages are not sent"
            className="block max-h-32 w-full resize-y rounded-2xl border border-line bg-paper px-4 py-2.5 text-sm placeholder:text-mist disabled:opacity-70"
          />
          <Button type="button" size="sm" disabled aria-label="Send message">
            <SendHorizontal className="size-4" strokeWidth={2} />
          </Button>
        </form>
      </div>
    </div>
  );
}
