"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { Message } from "@/lib/db/types";
import {
  announceUnreadChanged,
  markConversationReadClient,
} from "@/lib/messaging/unread-client";
import { createClient } from "@/lib/supabase/client";
import { cn, formatTime } from "@/lib/utils";

type DisplayMessage = Message & {
  optimistic?: boolean;
  failed?: boolean;
};

/**
 * Live conversation thread (SPEC §7/§8). Sending goes through the
 * moderate-message Edge Function — never a direct insert (RLS blocks those),
 * so every message is moderated server-side before delivery. New messages
 * arrive over Supabase Realtime.
 */
export function ChatThread({
  conversationId,
  currentUserId,
  initialMessages,
}: {
  conversationId: string;
  currentUserId: string;
  initialMessages: Message[];
}) {
  const [messages, setMessages] = useState<DisplayMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesViewportRef = useRef<HTMLDivElement | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  function supabase() {
    supabaseRef.current ??= createClient();
    return supabaseRef.current;
  }

  useEffect(() => {
    const client = supabase();
    let channel: ReturnType<typeof client.channel> | null = null;
    let active = true;

    (async () => {
      // Realtime enforces RLS, and messages are readable only `to
      // authenticated`. Without the user's JWT on the socket, the channel
      // joins but never delivers a row — messages appear only on reload.
      // Set the token before subscribing so inserts stream in live.
      await client.realtime.setAuth();
      if (!active) return;

      channel = client
        .channel(`messages:${conversationId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => {
            const incoming = payload.new as Message;
            setMessages((current) => {
              if (current.some((message) => message.id === incoming.id)) {
                return current;
              }

              // Only one outgoing message can be in flight at a time. Match
              // its content to replace the instant local bubble if Realtime
              // beats the Edge Function response back to this client.
              const pendingIndex = current.findIndex(
                (message) =>
                  message.optimistic &&
                  message.sender_id === incoming.sender_id &&
                  message.body === incoming.body &&
                  message.image_path === incoming.image_path,
              );
              if (pendingIndex < 0) return [...current, incoming];

              const next = [...current];
              next[pendingIndex] = incoming;
              return next;
            });
            // The user is looking at this thread, so the message is read the
            // moment it lands — keep the header badge from counting it.
            if (incoming.sender_id !== currentUserId) {
              void markConversationReadClient(conversationId);
            }
          },
        )
        .subscribe();
    })();

    return () => {
      active = false;
      if (channel) client.removeChannel(channel);
    };
  }, [conversationId, currentUserId]);

  // The server marked this thread read while rendering the page, but the
  // header badge may have been computed before that write — resync it.
  useEffect(() => {
    announceUnreadChanged();
  }, [conversationId]);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  async function send() {
    const body = draft.trim();
    if ((!body && !imageFile) || sending) return;

    const file = imageFile;
    const localId = `local-${crypto.randomUUID()}`;
    const localMessage: DisplayMessage = {
      id: localId,
      conversation_id: conversationId,
      sender_id: currentUserId,
      body,
      image_path: null,
      moderation_status: "clean",
      created_at: new Date().toISOString(),
      optimistic: true,
    };

    // The sender sees their message immediately. It does not become visible
    // to the provider until the existing Edge Function finishes moderation.
    setMessages((current) => [...current, localMessage]);
    setDraft("");
    setImageFile(null);
    setSending(true);
    setError(null);
    try {
      let imagePath: string | null = null;

      if (file) {
        const extension = file.name.split(".").pop() ?? "jpg";
        imagePath = `${conversationId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase()
          .storage.from("chat-images")
          .upload(imagePath, file);
        if (uploadError) throw new Error(uploadError.message);

        setMessages((current) =>
          current.map((message) =>
            message.id === localId ? { ...message, image_path: imagePath } : message,
          ),
        );
      }

      const { data, error: invokeError } = await supabase().functions.invoke(
        "moderate-message",
        {
          body: {
            conversation_id: conversationId,
            body,
            image_path: imagePath,
          },
        },
      );
      if (invokeError) throw new Error(invokeError.message);

      const message = (data as { message?: Message })?.message;
      if (message) {
        setMessages((current) => {
          const withoutLocal = current.filter((item) => item.id !== localId);
          return withoutLocal.some((item) => item.id === message.id)
            ? withoutLocal
            : [...withoutLocal, message];
        });
      }
    } catch (cause) {
      setMessages((current) =>
        current.map((message) =>
          message.id === localId
            ? { ...message, optimistic: false, failed: true }
            : message,
        ),
      );
      setDraft((current) => current || body);
      setImageFile(file);
      setError(
        cause instanceof Error
          ? `Message not sent: ${cause.message}`
          : "Message not sent. Try again.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div
        ref={messagesViewportRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4"
      >
        <div className="mx-auto max-w-md border-b border-line px-2 pb-3 text-center text-[11px] leading-relaxed text-mist">
          College Crew monitors chats to help stop off-platform contact info.
          Please don&apos;t send phone numbers, email addresses, social handles,
          or payment details. Job details and addresses are okay.
        </div>

        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-mist">
            No messages yet. Say hello: job details, photos, and scheduling
            all belong here.
          </p>
        ) : (
          messages.map((message) => {
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
                      message.optimistic && "message-swoop opacity-90",
                      message.failed && "bg-red-700 text-white",
                    )}
                  >
                    {message.image_path ? (
                      <ChatImage path={message.image_path} />
                    ) : null}
                    {message.body ? (
                      <p className="whitespace-pre-wrap">{message.body}</p>
                    ) : null}
                  </div>
                  <p
                    className={cn(
                      "mt-1 text-[11px] text-mist",
                      mine && "text-right",
                    )}
                  >
                    {message.failed
                      ? "Not sent"
                      : message.optimistic
                        ? "Sending…"
                        : formatTime(message.created_at)}
                    {/* Moderation is flag-only and SILENT: a flagged message is
                        delivered in full with no signal to either participant.
                        Flags surface only to admins on /admin/flagged. */}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="shrink-0 border-t border-line bg-paper p-3">
        {error ? (
          <p className="mb-2 text-xs font-medium text-red-700">{error}</p>
        ) : null}
        {imageFile ? (
          <p className="mb-2 text-xs text-ink-soft">
            Attached: {imageFile.name}{" "}
            <button
              type="button"
              className="font-semibold text-crew-700"
              onClick={() => setImageFile(null)}
            >
              Remove
            </button>
          </p>
        ) : null}
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <label className="cursor-pointer rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink-soft hover:bg-crew-50">
            📷
            <span className="sr-only">Attach a photo (for quotes)</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) =>
                setImageFile(event.target.files?.[0] ?? null)
              }
            />
          </label>
          <textarea
            aria-label="Message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder="Write a message…"
            className="block w-full resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm placeholder:text-mist"
          />
          <Button type="submit" disabled={sending}>
            {sending ? "Sending…" : "Send"}
          </Button>
        </form>
      </div>
    </div>
  );
}

/** Private-bucket image: resolve a short-lived signed URL, then render. */
function ChatImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .storage.from("chat-images")
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (!cancelled && data?.signedUrl) setUrl(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!url) {
    return (
      <div className="mb-1 h-32 w-48 animate-pulse rounded-lg bg-court" />
    );
  }
  return (
    // Signed URLs are short-lived and per-user; next/image optimization
    // would cache/proxy them and break access control.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="Attached photo"
      className="mb-1 max-h-64 rounded-lg"
    />
  );
}
