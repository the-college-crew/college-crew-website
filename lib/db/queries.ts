import type {
  BackgroundCheckStatus,
  PriceType,
  PriceUnit,
  ProviderType,
  Service,
} from "@/lib/db/types";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Shared read models used across route groups. All helpers degrade to empty
 * results when Supabase env vars are missing, so the skeleton renders
 * without .env.local (a dev banner explains why lists are empty).
 */

export type OfferedService = {
  id: string;
  price_cents: number;
  price_type: PriceType;
  unit: PriceUnit;
  service: Pick<Service, "id" | "name" | "slug" | "category" | "is_live">;
};

export type ProviderCard = {
  id: string;
  display_name: string;
  bio: string;
  provider_type: ProviderType;
  neighborhood: string;
  background_check_status: BackgroundCheckStatus;
  services: OfferedService[];
  rating: { avg: number; count: number } | null;
};

export async function getLiveServices(): Promise<Service[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();

  const { data } = await supabase
    .from("services")
    .select("*")
    .eq("is_live", true)
    .order("name");

  return data ?? [];
}

const PROVIDER_CARD_SELECT = `
  id, display_name, bio, provider_type, neighborhood, background_check_status,
  provider_services (
    id, price_cents, price_type, unit,
    service:services ( id, name, slug, category, is_live )
  )
` as const;

/**
 * Approved providers for Browse and the landing page. RLS already hides
 * unapproved providers (pilot decision); the filter here is for clarity.
 */
export async function getApprovedProviders(
  serviceSlug?: string,
): Promise<ProviderCard[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();

  const [{ data: providers }, { data: ratings }] = await Promise.all([
    supabase
      .from("provider_profiles")
      .select(PROVIDER_CARD_SELECT)
      .eq("verification_status", "approved")
      .order("created_at", { ascending: true }),
    supabase.from("provider_ratings").select("*"),
  ]);

  const ratingByProvider = new Map(
    (ratings ?? []).map((r) => [
      r.provider_id,
      { avg: Number(r.avg_rating), count: r.review_count },
    ]),
  );

  const cards: ProviderCard[] = (providers ?? []).map((p) => ({
    id: p.id,
    display_name: p.display_name,
    bio: p.bio,
    provider_type: p.provider_type,
    neighborhood: p.neighborhood,
    background_check_status: p.background_check_status,
    services: p.provider_services.filter((ps) => ps.service.is_live),
    rating: ratingByProvider.get(p.id) ?? null,
  }));

  return cards.filter(
    (card) =>
      card.services.length > 0 &&
      (!serviceSlug || card.services.some((s) => s.service.slug === serviceSlug)),
  );
}

export type PublicReview = {
  id: string;
  rating: number;
  text: string;
  created_at: string;
  service_name: string | null;
};

export type PublicProviderProfile = ProviderCard & {
  availability: { days?: string[]; note?: string };
  reviews: PublicReview[];
};

/** Everything the public provider profile page needs, or null if not visible. */
export async function getPublicProviderProfile(
  providerId: string,
): Promise<PublicProviderProfile | null> {
  if (!hasSupabaseEnv()) return null;
  const supabase = await createClient();

  const [{ data: provider }, { data: rating }, { data: reviews }, { data: services }] =
    await Promise.all([
      supabase
        .from("provider_profiles")
        .select(`availability, verification_status, ${PROVIDER_CARD_SELECT}`)
        .eq("id", providerId)
        .eq("verification_status", "approved")
        .maybeSingle(),
      supabase
        .from("provider_ratings")
        .select("*")
        .eq("provider_id", providerId)
        .maybeSingle(),
      supabase
        .from("provider_reviews")
        .select("*")
        .eq("provider_id", providerId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("services").select("id, name"),
    ]);

  if (!provider) return null;

  const serviceNameById = new Map((services ?? []).map((s) => [s.id, s.name]));
  const availability = (provider.availability ?? {}) as {
    days?: string[];
    note?: string;
  };

  return {
    id: provider.id,
    display_name: provider.display_name,
    bio: provider.bio,
    provider_type: provider.provider_type,
    neighborhood: provider.neighborhood,
    background_check_status: provider.background_check_status,
    services: provider.provider_services.filter((ps) => ps.service.is_live),
    rating: rating
      ? { avg: Number(rating.avg_rating), count: rating.review_count }
      : null,
    availability,
    reviews: (reviews ?? []).map((r) => ({
      id: r.id,
      rating: r.rating,
      text: r.text,
      created_at: r.created_at,
      service_name: serviceNameById.get(r.service_id) ?? null,
    })),
  };
}
