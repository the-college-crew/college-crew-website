export const BLOG_IMAGES_BUCKET = "blog-images";

/** Build a public Storage URL without requiring a browser Supabase client. */
export function blogImageUrl(path: string | null | undefined) {
  if (!path) return null;
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) return null;
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl.replace(/\/$/, "")}/storage/v1/object/public/${BLOG_IMAGES_BUCKET}/${encodedPath}`;
}
