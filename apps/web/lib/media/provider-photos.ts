/**
 * Shared rules for the two public provider photos (avatar + banner). Both
 * buckets enforce the same 5 MB ceiling and MIME allowlist, and both are
 * uploaded browser-direct, so client and server validate through this module.
 */

export const MAX_PROVIDER_PHOTO_BYTES = 5 * 1024 * 1024;

export const PROVIDER_PHOTO_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const PROVIDER_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

/** Validate the photo before it leaves the browser; null when it passes. */
export function validateProviderPhoto(file: File): string | null {
  if (file.size === 0) return "Choose a photo to upload.";
  if (file.size > MAX_PROVIDER_PHOTO_BYTES) {
    return "Choose an image smaller than 5 MB.";
  }
  if (!PROVIDER_PHOTO_EXTENSION[file.type]) {
    return "Use a JPG, PNG, or WebP image.";
  }
  return null;
}

/**
 * Object key for a new photo. A fresh key on every replacement is deliberate:
 * it avoids stale CDN copies of the previous image. The user-id folder is what
 * storage RLS scopes on.
 */
export function providerPhotoPath(userId: string, file: File): string {
  return `${userId}/${crypto.randomUUID()}.${PROVIDER_PHOTO_EXTENSION[file.type]}`;
}

/**
 * Server-side guard for the browser-chosen key: same-user folder, UUID name,
 * one of the three allowed extensions. Storage RLS already blocks writes
 * outside `${userId}/`; this rejects malformed or dangling keys.
 */
export function isOwnProviderPhotoPath(path: string, userId: string): boolean {
  const prefix = `${userId}/`;
  if (!userId || !path.startsWith(prefix)) return false;
  return /^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(path.slice(prefix.length));
}
