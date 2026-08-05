/**
 * Rules for blog hero photos, which live in the public `blog-images` bucket
 * rather than in git.
 *
 * The bucket is the pivot the weekly routine depends on: it cannot commit a
 * binary file (GitHub MCP's `content` is text, and `git push` is blocked from
 * the sandbox), so a post's frontmatter carries a **URL** and the bytes never
 * pass through the routine at all. Gianna uploads at `/admin/blog-photos`,
 * copies the key, and pastes it into the Slack canvas.
 *
 * Imported from both the browser and the server, so nothing here may touch
 * Node APIs or secrets.
 */

export const BLOG_IMAGES_BUCKET = "blog-images";

/** Matches the bucket's own ceiling — a larger file is rejected by Storage. */
export const MAX_BLOG_IMAGE_BYTES = 5 * 1024 * 1024;

export const BLOG_IMAGE_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const BLOG_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

/** Validate the photo before it leaves the browser; null when it passes. */
export function validateBlogImage(file: File): string | null {
  if (file.size === 0) return "Choose a photo to upload.";
  if (file.size > MAX_BLOG_IMAGE_BYTES) {
    return "Choose an image smaller than 5 MB.";
  }
  if (!BLOG_IMAGE_EXTENSION[file.type]) {
    return "Use a JPG, PNG, or WebP image.";
  }
  return null;
}

/** Longest slug we keep from the original filename, so keys stay copyable. */
const MAX_SLUG_LENGTH = 40;

function slugifyFilename(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, "");
}

/**
 * Object key for a newly uploaded photo: `YYYY-MM-DD-<slug>-<token>.<ext>`.
 *
 * The date sorts the bucket the way the blog reads. The random token is not
 * decoration — two photos uploaded the same day off the same phone arrive with
 * the same filename, and without it the second would silently replace the
 * first, changing the image on an already-published post.
 */
export function blogImageKey(file: File): string {
  const extension = BLOG_IMAGE_EXTENSION[file.type];
  const date = new Date().toISOString().slice(0, 10);
  const slug = slugifyFilename(file.name) || "photo";
  const token = crypto.randomUUID().slice(0, 6);
  return `${date}-${slug}-${token}.${extension}`;
}

/**
 * The shape the routine must find in the canvas. Deliberately strict: no
 * slashes, no dots beyond the extension, so a pasted path or a traversal
 * attempt can never reach a different object.
 */
export function isBlogImageKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*\.(jpg|png|webp)$/.test(value);
}

function publicBaseUrl(): string | null {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) return null;
  return `${baseUrl.replace(/\/$/, "")}/storage/v1/object/public/${BLOG_IMAGES_BUCKET}`;
}

/**
 * Public URL for a key. Encoded segment-by-segment, the same way
 * `providerAvatarUrl` does it, so a filename can never alter the URL structure.
 */
export function blogImageUrl(key: string): string | null {
  const base = publicBaseUrl();
  if (!base || !key) return null;
  return `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Does this frontmatter `image` value point at our bucket? Used by the post
 * schema, which accepts either a local `/blog/…` path or one of these URLs.
 */
export function isBlogImageUrl(value: string): boolean {
  const base = publicBaseUrl();
  if (!base || !value.startsWith(`${base}/`)) return false;
  return isBlogImageKey(decodeURIComponent(value.slice(base.length + 1)));
}
