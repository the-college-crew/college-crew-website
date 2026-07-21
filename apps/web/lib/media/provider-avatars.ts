/** Public bucket that holds each provider's required profile photo. */
export const PROVIDER_AVATARS_BUCKET = "provider-avatars";

/** Matches the bucket's own 5 MB ceiling and MIME allowlist. */
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export const AVATAR_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const AVATAR_ACCEPT = "image/jpeg,image/png,image/webp";

/** Validate the photo before it leaves the browser; null when it passes. */
export function validateAvatarFile(file: File): string | null {
  if (file.size === 0) return "Choose a photo to upload.";
  if (file.size > MAX_AVATAR_BYTES) {
    return "Choose an image smaller than 5 MB.";
  }
  if (!AVATAR_EXTENSION[file.type]) {
    return "Use a JPG, PNG, or WebP image.";
  }
  return null;
}

/** Object key for a new avatar. The user-id folder is what storage RLS scopes on. */
export function providerAvatarPath(userId: string, file: File): string {
  return `${userId}/${crypto.randomUUID()}.${AVATAR_EXTENSION[file.type]}`;
}

/**
 * Server-side guard for the browser-chosen key: same-user folder, UUID name,
 * one of the three allowed extensions. Storage RLS already blocks writes
 * outside `${userId}/`; this rejects malformed or dangling keys.
 */
export function isOwnAvatarPath(path: string, userId: string): boolean {
  const prefix = `${userId}/`;
  if (!userId || !path.startsWith(prefix)) return false;
  return /^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(path.slice(prefix.length));
}

/**
 * Build a public object URL without instantiating a fourth Supabase client.
 * The path is encoded segment-by-segment so an uploaded filename can never
 * alter the URL structure.
 */
export function providerAvatarUrl(path: string | null | undefined) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl || !path) return null;

  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl.replace(/\/$/, "")}/storage/v1/object/public/${PROVIDER_AVATARS_BUCKET}/${encodedPath}`;
}
