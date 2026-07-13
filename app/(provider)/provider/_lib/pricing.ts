import { PROVIDER_SERVICE_IMAGES_BUCKET } from "@/lib/media/provider-service-images";
import {
  buildHourlyOfferingPersistenceRow,
  parseHourlyRateInput,
} from "@/lib/provider/setup";
import { createClient } from "@/lib/supabase/server";

/**
 * Parses the services-pricing form (one row per live service) and replaces
 * the provider's offerings. Shared by the onboarding wizard and Profile &
 * settings — settings is the pricing source of truth after onboarding.
 *
 * Field convention per service id: offer_<id> (checkbox) and rate_<id>
 * (dollars per hour). Legacy price/type/unit columns are retained only for
 * expand/contract compatibility and are never populated from the hourly UI.
 */
export async function savePricingRows(
  providerId: string,
  formData: FormData,
): Promise<{ error?: string; fieldErrors?: Record<string, string> }> {
  const supabase = await createClient();

  const { data: services } = await supabase
    .from("services")
    .select("id")
    .eq("is_live", true);
  if (!services || services.length === 0) {
    return { error: "No live services to offer right now." };
  }

  const selected: Array<
    ReturnType<typeof buildHourlyOfferingPersistenceRow>
  > = [];
  // Collect EVERY offending row so the provider fixes them in one pass,
  // rather than resubmitting once per bad service. Keyed by service id so
  // the form can flag the exact row.
  const fieldErrors: Record<string, string> = {};

  const serviceIds = services.map((service) => service.id);
  const { data: existingRows } = await supabase
    .from("provider_services")
    .select("service_id, price_cents, price_type, unit")
    .eq("provider_id", providerId)
    .in("service_id", serviceIds);
  const existingByServiceId = new Map(
    (existingRows ?? []).map((row) => [row.service_id, row]),
  );

  for (const service of services) {
    if (formData.get(`offer_${service.id}`) !== "on") continue;

    const parsedRate = parseHourlyRateInput(formData.get(`rate_${service.id}`));
    if (!parsedRate.success) {
      fieldErrors[service.id] = parsedRate.error;
      continue;
    }

    const existing = existingByServiceId.get(service.id);

    selected.push(buildHourlyOfferingPersistenceRow({
      providerId,
      serviceId: service.id,
      hourlyRateCents: parsedRate.cents,
      existing,
      // Preserve an existing legacy value byte-for-byte. A new hourly-only
      // offering needs neutral placeholders until Phase 8 drops the legacy
      // non-null columns and their fixed/quote invariant.
    }));
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  if (selected.length === 0) {
    return { error: "Pick at least one service to offer." };
  }

  // Replace only currently-live offerings. Hidden service offerings are
  // preserved so they reappear unchanged if an admin makes the service live.
  const keepIds = selected.map((row) => row.service_id);
  const liveIdsToRemove = services
    .map((service) => service.id)
    .filter((serviceId) => !keepIds.includes(serviceId));

  if (liveIdsToRemove.length > 0) {
    // Remember preview paths while the offerings still exist. The Storage path
    // itself remains owner-scoped after deletion, so cleanup can safely happen
    // after the database operation succeeds.
    const { data: retiredOfferings } = await supabase
      .from("provider_services")
      .select("preview_image_path")
      .eq("provider_id", providerId)
      .in("service_id", liveIdsToRemove);

    const { error: deleteError } = await supabase
      .from("provider_services")
      .delete()
      .eq("provider_id", providerId)
      .in("service_id", liveIdsToRemove);
    if (deleteError) {
      return { error: "Could not save services — try again." };
    }

    const retiredPaths = (retiredOfferings ?? [])
      .map((offering) => offering.preview_image_path)
      .filter((path): path is string => Boolean(path));
    if (retiredPaths.length > 0) {
      await supabase.storage
        .from(PROVIDER_SERVICE_IMAGES_BUCKET)
        .remove(retiredPaths);
    }
  }

  const { error: upsertError } = await supabase
    .from("provider_services")
    .upsert(selected, { onConflict: "provider_id,service_id" });
  if (upsertError) {
    return { error: "Could not save services — try again." };
  }

  return {};
}
