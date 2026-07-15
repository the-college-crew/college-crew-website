/** Public bucket that holds each provider's required profile photo. */
export const PROVIDER_AVATARS_BUCKET = "provider-avatars";

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
