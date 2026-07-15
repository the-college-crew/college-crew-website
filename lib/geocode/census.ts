import "server-only";

/**
 * US Census geocoder (free, no API key, US-only). Called once whenever an
 * address is saved — signup, account settings, booking submission — and the
 * resulting coordinates are stored, never re-fetched per page view.
 *
 * Best-effort by design: any failure (no match, network, timeout) returns
 * null and the UI degrades to town-only display without miles.
 */

export type GeocodeAddress = {
  line1: string;
  city: string;
  state: string;
  zip: string;
};

export type GeocodeResult = {
  latitude: number;
  longitude: number;
};

const CENSUS_ENDPOINT =
  "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

export async function geocodeAddress(
  address: GeocodeAddress,
): Promise<GeocodeResult | null> {
  // Unit/apt lines confuse the matcher, so only line1 + city/state/zip go in.
  const oneline = [address.line1, address.city, `${address.state} ${address.zip}`]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
  if (!oneline) return null;

  const url = new URL(CENSUS_ENDPOINT);
  url.searchParams.set("address", oneline);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("format", "json");

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!response.ok) return null;

    const body = (await response.json()) as {
      result?: {
        addressMatches?: Array<{
          coordinates?: { x?: number; y?: number };
        }>;
      };
    };
    const coordinates = body.result?.addressMatches?.[0]?.coordinates;
    if (
      typeof coordinates?.y !== "number" ||
      typeof coordinates.x !== "number"
    ) {
      return null;
    }
    return { latitude: coordinates.y, longitude: coordinates.x };
  } catch {
    return null;
  }
}
