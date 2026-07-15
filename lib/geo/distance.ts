export type Coordinates = { latitude: number; longitude: number };

const EARTH_RADIUS_MILES = 3958.7613;

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

/** Straight-line (haversine) distance in miles between two points. */
export function haversineMiles(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Miles for display: one decimal under 10 ("2.3 mi"), whole above ("14 mi").
 * Distances under a tenth of a mile round up so nothing reads "0 mi".
 */
export function formatMiles(miles: number): string {
  if (!Number.isFinite(miles) || miles < 0) return "";
  if (miles < 10) return `${Math.max(0.1, Math.round(miles * 10) / 10)} mi`;
  return `${Math.round(miles)} mi`;
}

export type MaybeCoordinates = {
  latitude?: number | null;
  longitude?: number | null;
};

/**
 * The distance between two possibly-missing coordinate pairs, or null when
 * either side has no geocoded position. Keeps callers to one null check.
 */
export function milesBetween(
  a: MaybeCoordinates | null | undefined,
  b: MaybeCoordinates | null | undefined,
): number | null {
  if (
    a?.latitude == null ||
    a.longitude == null ||
    b?.latitude == null ||
    b.longitude == null
  ) {
    return null;
  }
  return haversineMiles(
    { latitude: a.latitude, longitude: a.longitude },
    { latitude: b.latitude, longitude: b.longitude },
  );
}
