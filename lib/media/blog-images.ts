export const BLOG_IMAGES_BUCKET = "blog-images";

/** Legacy seeded posts keep their bundled /blog assets until an admin replaces them. */
export function isManagedBlogImage(path: string) {
  return !path.startsWith("/");
}

/** Build either a bundled public URL or a public Supabase Storage URL. */
export function blogImageUrl(path: string | null | undefined) {
  if (!path) return null;
  if (!isManagedBlogImage(path)) return path;
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) return null;
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl.replace(/\/$/, "")}/storage/v1/object/public/${BLOG_IMAGES_BUCKET}/${encodedPath}`;
}
