import "server-only";

import { hasServiceRoleEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

import { geocodeAddress, type GeocodeAddress } from "./census";

/**
 * Geocode a user's saved profile address and store the coordinates.
 * Best-effort: a failed geocode still stamps geocoded_at with null
 * coordinates (address didn't match), and any storage error is swallowed —
 * distance display simply degrades until the next address save.
 *
 * Coordinates have no client update grant, so this service-role write is the
 * only path that sets them.
 */
export async function geocodeProfileAddress(
  userId: string,
  address: GeocodeAddress,
): Promise<void> {
  if (!hasServiceRoleEnv()) return;
  try {
    const coordinates = await geocodeAddress(address);
    const admin = createAdminClient();
    await admin
      .from("profiles")
      .update({
        latitude: coordinates?.latitude ?? null,
        longitude: coordinates?.longitude ?? null,
        geocoded_at: new Date().toISOString(),
      })
      .eq("id", userId);
  } catch {
    // Non-fatal — the profile keeps its previous coordinates.
  }
}
