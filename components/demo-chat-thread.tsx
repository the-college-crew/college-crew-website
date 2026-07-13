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
      <div className="shrink-0 border-b border-line bg-court px-4 py-3 text-[11px] leading-relaxed text-mist">
        College Crew monitors chats to help stop off-platform contact info.
        Please don&apos;t send phone numbers, email addresses, social handles, or
        payment details. Job details and addresses are okay.
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
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
                      ? "rounded-br-sm bg-crew-600 text-white"
                      : "rounded-bl-sm border border-line bg-paper text-ink",
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
          <label className="cursor-not-allowed rounded-lg border border-line bg-paper px-3 py-2 text-sm text-mist">
            Photo
            <span className="sr-only">Attach a photo disabled in sample mode</span>
          </label>
          <textarea
            rows={1}
            disabled
            placeholder="Sample mode — messages are not sent"
            className="block max-h-32 w-full resize-y rounded-lg border border-line bg-paper px-3 py-2 text-sm placeholder:text-mist disabled:opacity-70"
          />
          <Button type="button" disabled>
            Send
          </Button>
        </form>
      </div>
    </div>
  );
}
