import type { Json, Message } from "@/lib/db/types";

export const CHAT_MEDIA_BUCKET = "chat-images";
export const MAX_CHAT_IMAGES = 4;
export const MAX_CHAT_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_CHAT_VIDEO_BYTES = 50 * 1024 * 1024;
export const RESUMABLE_UPLOAD_THRESHOLD_BYTES = 6 * 1024 * 1024;

export const CHAT_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const CHAT_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

export type ChatAttachment = {
  path: string;
  kind: "image" | "video";
  mimeType: string;
  sizeBytes: number;
  name: string;
};

export function isChatAttachment(value: unknown): value is ChatAttachment {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.path === "string" &&
    (item.kind === "image" || item.kind === "video") &&
    typeof item.mimeType === "string" &&
    typeof item.sizeBytes === "number" &&
    typeof item.name === "string"
  );
}

export function messageAttachments(
  message: Pick<Message, "attachments" | "image_path">,
): ChatAttachment[] {
  const raw = Array.isArray(message.attachments) ? message.attachments : [];
  const parsed = raw.filter(isChatAttachment);
  if (parsed.length > 0) return parsed;

  return message.image_path
    ? [
        {
          path: message.image_path,
          kind: "image",
          mimeType: "image/jpeg",
          sizeBytes: 0,
          name: "Photo",
        },
      ]
    : [];
}

export function attachmentPreviewText(
  message: Pick<Message, "attachments" | "image_path">,
) {
  const attachments = messageAttachments(message);
  if (attachments.length === 0) return "";
  if (attachments[0].kind === "video") return "Video";
  return attachments.length === 1 ? "Image" : `${attachments.length} images`;
}

export function toAttachmentJson(attachments: ChatAttachment[]): Json {
  return attachments as unknown as Json;
}

export function validateChatFiles(files: File[]): string | null {
  if (files.length === 0) return null;

  const videos = files.filter((file) =>
    (CHAT_VIDEO_MIME_TYPES as readonly string[]).includes(file.type),
  );
  const images = files.filter((file) =>
    (CHAT_IMAGE_MIME_TYPES as readonly string[]).includes(file.type),
  );

  if (videos.length > 0) {
    if (files.length !== 1 || videos.length !== 1) {
      return "Attach one video by itself, or up to four images.";
    }
    if (videos[0].size > MAX_CHAT_VIDEO_BYTES) {
      return "Video must be 50 MB or smaller.";
    }
    return null;
  }

  if (images.length !== files.length) {
    return "Use JPEG, PNG, WebP, MP4, WebM, or MOV files.";
  }
  if (images.length > MAX_CHAT_IMAGES) {
    return `Attach up to ${MAX_CHAT_IMAGES} images per message.`;
  }
  if (images.some((file) => file.size > MAX_CHAT_IMAGE_BYTES)) {
    return "Each image must be 10 MB or smaller.";
  }
  return null;
}
