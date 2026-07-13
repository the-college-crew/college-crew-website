/** Public bucket that holds opt-in provider storefront photos. */
export const PROVIDER_SERVICE_IMAGES_BUCKET = "provider-service-images";

/**
 * Build a public object URL without instantiating a fourth Supabase client.
 * The path is encoded segment-by-segment so an uploaded filename can never
 * alter the URL structure.
 */
export function providerServiceImageUrl(path: string | null | undefined) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl || !path) return null;

  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl.replace(/\/$/, "")}/storage/v1/object/public/${PROVIDER_SERVICE_IMAGES_BUCKET}/${encodedPath}`;
}
