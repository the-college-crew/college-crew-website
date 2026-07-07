import type { PriceType, PriceUnit } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";

/**
 * Parses the services-pricing form (one row per live service) and replaces
 * the provider's offerings. Shared by the onboarding wizard and Profile &
 * settings — settings is the pricing source of truth after onboarding.
 *
 * Field convention per service id: offer_<id> (checkbox), price_<id>
 * (dollars), type_<id> (fixed|quote), unit_<id> (per_job|per_hour).
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

  const selected: Array<{
    provider_id: string;
    service_id: string;
    price_cents: number;
    price_type: PriceType;
    unit: PriceUnit;
  }> = [];
  // Collect EVERY offending row so the provider fixes them in one pass,
  // rather than resubmitting once per bad service. Keyed by service id so
  // the form can flag the exact row.
  const fieldErrors: Record<string, string> = {};

  for (const service of services) {
    if (formData.get(`offer_${service.id}`) !== "on") continue;

    const priceType: PriceType =
      formData.get(`type_${service.id}`) === "quote" ? "quote" : "fixed";
    const unit: PriceUnit =
      formData.get(`unit_${service.id}`) === "per_hour"
        ? "per_hour"
        : "per_job";

    const dollars = Number.parseFloat(
      String(formData.get(`price_${service.id}`) ?? ""),
    );
    const priceCents =
      priceType === "quote" ? 0 : Math.round((dollars || 0) * 100);

    if (priceType === "fixed" && (!Number.isFinite(dollars) || dollars <= 0)) {
      fieldErrors[service.id] = "Enter a price above $0.";
      continue;
    }

    selected.push({
      provider_id: providerId,
      service_id: service.id,
      price_cents: priceCents,
      price_type: priceType,
      unit,
    });
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
    const { error: deleteError } = await supabase
      .from("provider_services")
      .delete()
      .eq("provider_id", providerId)
      .in("service_id", liveIdsToRemove);
    if (deleteError) {
      return { error: "Could not save services — try again." };
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
