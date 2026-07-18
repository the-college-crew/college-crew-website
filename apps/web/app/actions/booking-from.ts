"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { geocodeAddress } from "@/lib/geocode/census";
import {
  BOOKING_FROM_COOKIE,
  type OtherLocation,
} from "@/lib/location/booking-from";
import { addressSchema } from "@/lib/validation/auth";

/**
 * "Booking from" selector actions, shared by Browse and the booking form.
 * The other-address variant is geocoded here (server-side, US Census) before
 * the cookie is written, so distance lines update as soon as the feed reloads.
 */

export type BookingFromState = {
  error?: string;
  /** Bumped on success so the popover knows to close. */
  savedAt?: number;
};

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
} as const;

function revalidateLocationSurfaces() {
  revalidatePath("/browse");
  revalidatePath("/", "layout");
}

export async function setBookingFromHome(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(BOOKING_FROM_COOKIE);
  revalidateLocationSurfaces();
}

export async function setBookingFromOther(
  _prev: BookingFromState,
  formData: FormData,
): Promise<BookingFromState> {
  const parsed = addressSchema.safeParse({
    address_line1: formData.get("address_line1"),
    address_line2: formData.get("address_line2") ?? "",
    city: formData.get("city"),
    state: formData.get("state"),
    postal_code: formData.get("postal_code"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const coordinates = await geocodeAddress({
    line1: parsed.data.address_line1,
    city: parsed.data.city,
    state: parsed.data.state,
    zip: parsed.data.postal_code,
  });

  const location: OtherLocation = {
    kind: "other",
    line1: parsed.data.address_line1,
    line2: parsed.data.address_line2,
    city: parsed.data.city,
    state: parsed.data.state,
    zip: parsed.data.postal_code,
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null,
  };

  const cookieStore = await cookies();
  cookieStore.set(BOOKING_FROM_COOKIE, JSON.stringify(location), COOKIE_OPTIONS);
  revalidateLocationSurfaces();
  return { savedAt: Date.now() };
}
