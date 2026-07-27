import type { Json } from "@/lib/db/types";

export const JOB_PHOTOS_BUCKET = "job-photos";
export const MIN_JOB_PHOTOS = 1;
export const MAX_JOB_PHOTOS = 8;
export const MAX_JOB_PHOTO_BYTES = 10 * 1024 * 1024;

export const JOB_PHOTO_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const JOB_PHOTO_EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * One job-site photo attached to a quote request. Same shape as ChatAttachment
 * so the two manifests stay readable side by side, minus the video kind - a
 * quote request is photos only.
 */
export type JobPhoto = {
  path: string;
  kind: "image";
  mimeType: string;
  sizeBytes: number;
  name: string;
};

export function isJobPhoto(value: unknown): value is JobPhoto {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.path === "string" &&
    item.kind === "image" &&
    typeof item.mimeType === "string" &&
    typeof item.sizeBytes === "number" &&
    typeof item.name === "string"
  );
}

/** Read a manifest off a booking row, tolerating nulls and legacy `[]` rows. */
export function bookingJobPhotos(value: Json | null | undefined): JobPhoto[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isJobPhoto);
}

export function toJobPhotoJson(photos: JobPhoto[]): Json {
  return photos as unknown as Json;
}

/**
 * Storage paths are `<user_id>/<uuid>.<ext>` - keyed by uploader, because the
 * booking does not exist yet when the browser uploads. Anything else is either
 * a typo or an attempt to cite someone else's object.
 */
export function isOwnJobPhotoPath(path: string, userId: string) {
  return new RegExp(`^${userId}/[A-Za-z0-9._-]{1,120}$`).test(path);
}

/** Shared by the picker and the Server Action so both reject the same files. */
export function validateJobPhotoFiles(files: File[]): string | null {
  if (files.length < MIN_JOB_PHOTOS) {
    return "Add at least one photo of the job site.";
  }
  if (files.length > MAX_JOB_PHOTOS) {
    return `Attach up to ${MAX_JOB_PHOTOS} photos.`;
  }
  if (
    files.some(
      (file) =>
        !(JOB_PHOTO_MIME_TYPES as readonly string[]).includes(file.type),
    )
  ) {
    return "Use JPEG, PNG, or WebP photos.";
  }
  if (files.some((file) => file.size > MAX_JOB_PHOTO_BYTES)) {
    return "Each photo must be 10 MB or smaller.";
  }
  return null;
}
