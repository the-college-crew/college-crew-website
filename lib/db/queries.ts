import type {
  PriceType,
  PriceUnit,
  ProviderType,
  Service,
  VerificationStatus,
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
  id, display_name, bio, provider_type, neighborhood,
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
  const liveServices = provider.provider_services.filter(
    (ps) => ps.service.is_live,
  );

  if (liveServices.length === 0) return null;

  return {
    id: provider.id,
    display_name: provider.display_name,
    bio: provider.bio,
    provider_type: provider.provider_type,
    neighborhood: provider.neighborhood,
    services: liveServices,
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

export type AdminProviderProfile = PublicProviderProfile & {
  verification_status: VerificationStatus;
  id_document_url: string | null;
  id_document_back_url: string | null;
  created_at: string;
  full_name: string | null;
};

/**
 * Admin-only variant of getPublicProviderProfile. Unlike the public query it
 * does NOT filter by verification_status or require live services — admins
 * review providers in any state (pending, rejected, or with services the
 * catalog has since retired). Reads run as the signed-in admin (RLS admin
 * policies grant full visibility). Returns null only if the id doesn't exist.
 */
export async function getAdminProviderProfile(
  providerId: string,
): Promise<AdminProviderProfile | null> {
  if (!hasSupabaseEnv()) return null;
  const supabase = await createClient();

  const [{ data: provider }, { data: rating }, { data: reviews }, { data: services }] =
    await Promise.all([
      supabase
        .from("provider_profiles")
        .select(
          `availability, verification_status, id_document_url, id_document_back_url, created_at,
           user:profiles ( full_name ), ${PROVIDER_CARD_SELECT}`,
        )
        .eq("id", providerId)
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
    // Show every service the provider offers, even ones no longer live.
    services: provider.provider_services,
    rating: rating
      ? { avg: Number(rating.avg_rating), count: rating.review_count }
      : null,
    availability,
    verification_status: provider.verification_status,
    id_document_url: provider.id_document_url,
    id_document_back_url: provider.id_document_back_url,
    created_at: provider.created_at,
    full_name: provider.user?.full_name ?? null,
    reviews: (reviews ?? []).map((r) => ({
      id: r.id,
      rating: r.rating,
      text: r.text,
      created_at: r.created_at,
      service_name: serviceNameById.get(r.service_id) ?? null,
    })),
  };
}
