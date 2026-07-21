"use client";

import { Paperclip, SendHorizontal, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as tus from "tus-js-client";

import { Button } from "@/components/ui/button";
import type { Message } from "@/lib/db/types";
import {
  CHAT_IMAGE_MIME_TYPES,
  CHAT_MEDIA_BUCKET,
  CHAT_VIDEO_MIME_TYPES,
  RESUMABLE_UPLOAD_THRESHOLD_BYTES,
  messageAttachments,
  toAttachmentJson,
  type ChatAttachment,
  validateChatFiles,
} from "@/lib/messaging/attachments";
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
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
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
      // Pass the session token explicitly (a no-arg setAuth() does not reliably
      // pick up the session across supabase-js versions) before subscribing.
      const { data: sessionData } = await client.auth.getSession();
      await client.realtime.setAuth(sessionData.session?.access_token ?? null);
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
    if ((!body && mediaFiles.length === 0) || sending) return;

    const files = [...mediaFiles];
    const localId = `local-${crypto.randomUUID()}`;
    const localMessage: DisplayMessage = {
      id: localId,
      conversation_id: conversationId,
      sender_id: currentUserId,
      body,
      image_path: null,
      attachments: [],
      moderation_status: "clean",
      created_at: new Date().toISOString(),
      optimistic: true,
    };

    // The sender sees their message immediately. It does not become visible
    // to the provider until the existing Edge Function finishes moderation.
    setMessages((current) => [...current, localMessage]);
    setDraft("");
    setMediaFiles([]);
    setSending(true);
    setError(null);
    try {
      const attachments: ChatAttachment[] = [];
      for (let index = 0; index < files.length; index += 1) {
        const attachment = await uploadChatFile(
          supabase(),
          conversationId,
          files[index],
          (fileProgress) => {
            setUploadProgress(
              Math.round(((index + fileProgress) / files.length) * 100),
            );
          },
        );
        attachments.push(attachment);
        setMessages((current) =>
          current.map((message) =>
            message.id === localId
              ? {
                  ...message,
                  image_path:
                    attachments.find((item) => item.kind === "image")?.path ??
                    null,
                  attachments: toAttachmentJson(attachments),
                }
              : message,
          ),
        );
      }

      const imagePath =
        attachments.find((attachment) => attachment.kind === "image")?.path ??
        null;

      const { data, error: invokeError } = await supabase().functions.invoke(
        "moderate-message",
        {
          body: {
            conversation_id: conversationId,
            body,
            image_path: imagePath,
            attachments,
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
      setMediaFiles(files);
      setError(
        cause instanceof Error
          ? `Message not sent: ${cause.message}`
          : "Message not sent. Try again.",
      );
    } finally {
      setSending(false);
      setUploadProgress(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div
        ref={messagesViewportRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4"
      >
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

        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-mist">
            No messages yet. Job details, images, video, and scheduling all
            belong here.
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
                        ? "rounded-br-md bg-viridian text-shell"
                        : "rounded-bl-md border border-line bg-paper text-ink",
                      message.optimistic && "message-swoop opacity-90",
                      message.failed && "bg-red-700 text-white",
                    )}
                  >
                    <ChatMediaGrid attachments={messageAttachments(message)} />
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
          <p role="alert" className="mb-2 text-xs font-medium text-red-700">
            {error}
          </p>
        ) : null}
        {mediaFiles.length > 0 ? (
          <SelectedMedia
            files={mediaFiles}
            disabled={sending}
            onRemove={(index) =>
              setMediaFiles((current) =>
                current.filter((_, fileIndex) => fileIndex !== index),
              )
            }
          />
        ) : null}
        {uploadProgress !== null ? (
          <div className="mb-2" aria-live="polite">
            <div className="flex justify-between text-[11px] text-mist">
              <span>Uploading private media</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-court">
              <div
                className="h-full rounded-full bg-viridian transition-[width]"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        ) : null}
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <label className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line bg-paper text-ink-soft transition-colors hover:bg-honeydew/40 hover:text-viridian focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-viridian">
            <Paperclip className="size-[18px]" strokeWidth={1.75} />
            <span className="sr-only">Attach images or a video</span>
            <input
              type="file"
              accept={[...CHAT_IMAGE_MIME_TYPES, ...CHAT_VIDEO_MIME_TYPES].join(",")}
              multiple
              disabled={sending}
              className="sr-only"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                const next = [...mediaFiles, ...files];
                const validationError = validateChatFiles(next);
                if (validationError) {
                  setError(validationError);
                } else {
                  setMediaFiles(next);
                  setError(null);
                }
                event.target.value = "";
              }}
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
            className="block w-full resize-none rounded-2xl border border-line bg-paper px-4 py-2.5 text-sm placeholder:text-mist"
          />
          <Button
            type="submit"
            size="sm"
            disabled={sending || (!draft.trim() && mediaFiles.length === 0)}
            aria-label={sending ? "Sending…" : "Send message"}
          >
            {sending ? (
              <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <SendHorizontal className="size-4" strokeWidth={2} />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}

type BrowserSupabaseClient = ReturnType<typeof createClient>;

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

async function uploadChatFile(
  client: BrowserSupabaseClient,
  conversationId: string,
  file: File,
  onProgress: (progress: number) => void,
): Promise<ChatAttachment> {
  const kind = file.type.startsWith("video/") ? "video" : "image";
  const extension = EXTENSION_BY_MIME[file.type];
  if (!extension) throw new Error("Unsupported media type.");

  const path = `${conversationId}/${crypto.randomUUID()}.${extension}`;
  const resumable = kind === "video" || file.size > RESUMABLE_UPLOAD_THRESHOLD_BYTES;

  if (resumable) {
    const {
      data: { session },
    } = await client.auth.getSession();
    if (!session) throw new Error("Your session expired. Log in and try again.");

    const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!projectUrl) throw new Error("Media storage is not configured.");
    const parsedUrl = new URL(projectUrl);
    const uploadOrigin = parsedUrl.hostname.endsWith(".supabase.co")
      ? `${parsedUrl.protocol}//${parsedUrl.hostname.replace(
          ".supabase.co",
          ".storage.supabase.co",
        )}`
      : parsedUrl.origin;
    const endpoint = `${uploadOrigin}/storage/v1/upload/resumable`;

    await new Promise<void>((resolve, reject) => {
      const upload = new tus.Upload(file, {
        endpoint,
        retryDelays: [0, 1_000, 3_000, 5_000],
        headers: {
          authorization: `Bearer ${session.access_token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        chunkSize: 6 * 1024 * 1024,
        metadata: {
          bucketName: CHAT_MEDIA_BUCKET,
          objectName: path,
          contentType: file.type,
          cacheControl: "3600",
        },
        onError: (uploadError) => reject(uploadError),
        onProgress: (uploaded, total) =>
          onProgress(total === 0 ? 0 : uploaded / total),
        onSuccess: () => resolve(),
      });
      upload.start();
    });
  } else {
    const { error: uploadError } = await client.storage
      .from(CHAT_MEDIA_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw new Error(uploadError.message);
    onProgress(1);
  }

  return {
    path,
    kind,
    mimeType: file.type,
    sizeBytes: file.size,
    name: file.name.slice(0, 160),
  };
}

function SelectedMedia({
  files,
  disabled,
  onRemove,
}: {
  files: File[];
  disabled: boolean;
  onRemove: (index: number) => void;
}) {
  return (
    <ul className="mb-2 flex gap-2 overflow-x-auto pb-1">
      {files.map((file, index) => (
        <li
          key={`${file.name}-${file.lastModified}-${index}`}
          className="relative h-20 w-24 shrink-0 overflow-hidden rounded-lg border border-line bg-court"
        >
          <SelectedMediaPreview file={file} />
          <button
            type="button"
            disabled={disabled}
            onClick={() => onRemove(index)}
            aria-label={`Remove ${file.name}`}
            className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-ink/80 text-sm font-semibold text-white disabled:opacity-50"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

function SelectedMediaPreview({ file }: { file: File }) {
  const [url] = useState(() => URL.createObjectURL(file));
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  return file.type.startsWith("video/") ? (
    <video src={url} muted className="h-full w-full object-cover" />
  ) : (
    // Local object URLs do not benefit from Next image optimization.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="Selected attachment preview"
      className="h-full w-full object-cover"
    />
  );
}

function ChatMediaGrid({ attachments }: { attachments: ChatAttachment[] }) {
  if (attachments.length === 0) return null;
  return (
    <div
      className={cn(
        "mb-2 grid gap-1 overflow-hidden rounded-lg",
        attachments.length > 1 && "grid-cols-2",
      )}
    >
      {attachments.map((attachment) => (
        <ChatMedia key={attachment.path} attachment={attachment} />
      ))}
    </div>
  );
}

/** Private-bucket media: resolve a short-lived signed URL, then render. */
function ChatMedia({ attachment }: { attachment: ChatAttachment }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .storage.from(CHAT_MEDIA_BUCKET)
      .createSignedUrl(attachment.path, 3600)
      .then(({ data }) => {
        if (!cancelled && data?.signedUrl) setUrl(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [attachment.path]);

  if (!url) {
    return <div className="h-32 min-w-40 animate-pulse bg-court" />;
  }
  if (attachment.kind === "video") {
    return (
      <video
        src={url}
        controls
        preload="metadata"
        className="max-h-72 w-full bg-black object-contain"
      >
        Your browser does not support this video.
      </video>
    );
  }
  return (
    // Signed URLs are short-lived and per-user; next/image optimization
    // would cache/proxy them and break access control.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={attachment.name || "Attached image"}
      className="max-h-72 w-full object-cover"
    />
  );
}
