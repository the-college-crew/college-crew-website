/** Public bucket that holds each provider's optional wide banner photo. */
export const PROVIDER_BANNERS_BUCKET = "provider-banners";

/**
 * Built-in banner themes shown when a provider hasn't uploaded their own photo.
 * Kept in sync with the CHECK constraint on provider_profiles.banner_style.
 */
export const BANNER_STYLES = ["forest", "varsity", "pennant"] as const;
export type BannerStyle = (typeof BANNER_STYLES)[number];
export const DEFAULT_BANNER_STYLE: BannerStyle = "forest";

/** Narrow an arbitrary stored value to a known theme, defaulting safely. */
export function toBannerStyle(value: string | null | undefined): BannerStyle {
  return BANNER_STYLES.includes(value as BannerStyle)
    ? (value as BannerStyle)
    : DEFAULT_BANNER_STYLE;
}

/**
 * Build a public object URL without instantiating a fourth Supabase client.
 * The path is encoded segment-by-segment so an uploaded filename can never
 * alter the URL structure.
 */
export function providerBannerUrl(path: string | null | undefined) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl || !path) return null;

  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl.replace(/\/$/, "")}/storage/v1/object/public/${PROVIDER_BANNERS_BUCKET}/${encodedPath}`;
}
