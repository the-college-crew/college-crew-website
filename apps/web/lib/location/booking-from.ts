import { cookies } from "next/headers";
import { z } from "zod";

import type { Profile } from "@/lib/db/types";

/**
 * "Booking from" — the customer's chosen origin for distance display and
 * booking submission. Defaults to their saved home address; an "other"
 * address (already server-geocoded when the cookie was set) rides in a
 * cookie so it follows them from Browse to the booking form.
 *
 * Trust level: the cookie is client-editable, so its contents are treated
 * exactly like the free-text address customers have always typed into the
 * booking form — display-only facts, never authorization or money math.
 * The "home" variant is always re-resolved server-side from the profile.
 */

export const BOOKING_FROM_COOKIE = "cc-booking-from";

const otherLocationSchema = z.object({
  kind: z.literal("other"),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).catch(""),
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().min(2).max(60),
  zip: z.string().regex(/^\d{5}$/),
  latitude: z.number().gte(-90).lte(90).nullable().catch(null),
  longitude: z.number().gte(-180).lte(180).nullable().catch(null),
});

export type OtherLocation = z.infer<typeof otherLocationSchema>;
export type BookingFrom = { kind: "home" } | OtherLocation;

export function parseBookingFrom(raw: string | undefined): BookingFrom {
  if (!raw) return { kind: "home" };
  try {
    const parsed = otherLocationSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : { kind: "home" };
  } catch {
    return { kind: "home" };
  }
}

export async function getBookingFrom(): Promise<BookingFrom> {
  const cookieStore = await cookies();
  return parseBookingFrom(cookieStore.get(BOOKING_FROM_COOKIE)?.value);
}

/** The resolved origin every location-aware surface works from. */
export type BookingOrigin = {
  kind: "home" | "other";
  /** Town for the selector chip and distance lines; "" when unknown. */
  town: string;
  /** Single-line address for booking submission; "" when unknown. */
  addressLine: string;
  zip: string;
  latitude: number | null;
  longitude: number | null;
  /** False when the viewer has no usable origin yet (logged out, blank profile). */
  isSet: boolean;
};

type ProfileAddress = Pick<
  Profile,
  | "address_line1"
  | "address_line2"
  | "city"
  | "state"
  | "postal_code"
  | "latitude"
  | "longitude"
>;

export function formatAddressLine(parts: {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
}): string {
  return [
    parts.line1,
    parts.line2,
    [parts.city, [parts.state, parts.zip].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(", "),
  ]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join(", ");
}

/**
 * Resolve the effective origin. Home always re-reads the profile (the cookie
 * never overrides server truth); "other" uses the cookie's snapshot.
 */
/** Serializable summary the "Booking from" selector renders from. */
export type BookingFromSummary = {
  kind: "home" | "other";
  town: string;
  home: { town: string; addressLine: string } | null;
  other: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    zip: string;
  } | null;
};

export function buildBookingFromSummary(
  bookingFrom: BookingFrom,
  profile: ProfileAddress | null,
): BookingFromSummary {
  const origin = resolveBookingOrigin(bookingFrom, profile);
  const hasHome = Boolean(profile?.address_line1 && profile.city);
  return {
    kind: origin.kind,
    town: origin.town,
    home:
      hasHome && profile
        ? {
            town: profile.city,
            addressLine: formatAddressLine({
              line1: profile.address_line1,
              line2: profile.address_line2,
              city: profile.city,
              state: profile.state,
              zip: profile.postal_code,
            }),
          }
        : null,
    other:
      bookingFrom.kind === "other"
        ? {
            line1: bookingFrom.line1,
            line2: bookingFrom.line2,
            city: bookingFrom.city,
            state: bookingFrom.state,
            zip: bookingFrom.zip,
          }
        : null,
  };
}

export function resolveBookingOrigin(
  bookingFrom: BookingFrom,
  profile: ProfileAddress | null,
): BookingOrigin {
  if (bookingFrom.kind === "other") {
    return {
      kind: "other",
      town: bookingFrom.city,
      addressLine: formatAddressLine(bookingFrom),
      zip: bookingFrom.zip,
      latitude: bookingFrom.latitude,
      longitude: bookingFrom.longitude,
      isSet: true,
    };
  }

  const hasHome = Boolean(profile?.address_line1 && profile.city);
  return {
    kind: "home",
    town: profile?.city ?? "",
    addressLine:
      hasHome && profile
        ? formatAddressLine({
            line1: profile.address_line1,
            line2: profile.address_line2,
            city: profile.city,
            state: profile.state,
            zip: profile.postal_code,
          })
        : "",
    zip: profile?.postal_code ?? "",
    latitude: profile?.latitude ?? null,
    longitude: profile?.longitude ?? null,
    isSet: hasHome,
  };
}
