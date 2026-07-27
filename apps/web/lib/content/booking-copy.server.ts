import { cache } from "react";

import {
  BOOKING_COPY_BY_KEY,
  type BookingCopyKey,
  type BookingCopyOverrides,
  type BookingCopyPerspective,
} from "@/lib/content/booking-copy";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Booking copy is intentionally fetched by its own namespace. The general
 * marketing-site editor should not pull the much larger booking catalog into
 * every public landing/about render.
 */
export const getBookingCopyOverrides = cache(
  async (
    perspective?: BookingCopyPerspective,
  ): Promise<BookingCopyOverrides> => {
    if (!hasSupabaseEnv()) return {};

    const prefix = perspective ? `booking-${perspective}.%` : "booking-%";
    const supabase = await createClient();
    const { data } = await supabase
      .from("site_content")
      .select("key, value")
      .like("key", prefix);

    return Object.fromEntries(
      (data ?? [])
        .filter((row) => row.key in BOOKING_COPY_BY_KEY)
        .map((row) => [row.key as BookingCopyKey, row.value]),
    ) as BookingCopyOverrides;
  },
);
