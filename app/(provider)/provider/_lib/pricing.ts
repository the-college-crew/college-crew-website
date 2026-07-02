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
): Promise<{ error?: string }> {
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
      return { error: "Enter a price for every fixed-price service you offer." };
    }

    selected.push({
      provider_id: providerId,
      service_id: service.id,
      price_cents: priceCents,
      price_type: priceType,
      unit,
    });
  }

  if (selected.length === 0) {
    return { error: "Pick at least one service to offer." };
  }

  // Replace: drop deselected offerings, then upsert the current set.
  const keepIds = selected.map((row) => row.service_id);
  const { error: deleteError } = await supabase
    .from("provider_services")
    .delete()
    .eq("provider_id", providerId)
    .not("service_id", "in", `(${keepIds.join(",")})`);
  if (deleteError) {
    return { error: "Could not save services — try again." };
  }

  const { error: upsertError } = await supabase
    .from("provider_services")
    .upsert(selected, { onConflict: "provider_id,service_id" });
  if (upsertError) {
    return { error: "Could not save services — try again." };
  }

  return {};
}
