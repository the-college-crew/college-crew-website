import type {
  PriceType,
  PriceUnit,
  ProviderProfile,
  ProviderRating,
  ProviderReview,
  ProviderType,
  PublicProviderDirectoryRow,
  PublicProviderOfferingRow,
  Service,
  VerificationStatus,
} from "@/lib/db/types";
import { hasSupabaseEnv } from "@/lib/env";
import { getLocationRankedProviderIds } from "@/lib/booking/requests";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getOfferingReadiness } from "@/lib/provider/setup";

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
  preview_image_path: string | null;
  hourly_rate_cents: number | null;
  is_hourly_bookable: boolean;
  service: Pick<Service, "id" | "name" | "slug" | "category" | "is_live">;
};

export type ProviderCard = {
  id: string;
  display_name: string;
  company_name: string | null;
  bio: string;
  provider_type: ProviderType;
  neighborhood: string;
  avatar_image_path: string | null;
  services: OfferedService[];
  rating: { avg: number; count: number } | null;
};

export type ProviderSort = "suggested" | "location" | "rating" | "rate";

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
  id, display_name, company_name, bio, provider_type, neighborhood,
  avatar_image_path,
  provider_services (
    id, price_cents, price_type, unit, preview_image_path, hourly_rate_cents,
    service:services ( id, name, slug, category, is_live )
  )
` as const;

type SafePublicProviderRow = PublicProviderDirectoryRow & {
  provider_id: string;
  display_name: string;
  bio: string;
  provider_type: ProviderType;
  neighborhood: string;
};

type SafePublicOfferingRow = PublicProviderOfferingRow & {
  provider_service_id: string;
  provider_id: string;
  service_id: string;
  price_cents: number;
  price_type: PriceType;
  unit: PriceUnit;
  preview_image_path: string | null;
  hourly_rate_cents: number | null;
  service_name: string;
  service_slug: string;
  service_category: string;
  service_is_live: boolean;
  is_hourly_bookable: boolean;
};

function isSafePublicProviderRow(
  row: PublicProviderDirectoryRow,
): row is SafePublicProviderRow {
  return Boolean(
    row.provider_id &&
      row.display_name !== null &&
      row.bio !== null &&
      row.provider_type &&
      row.neighborhood !== null,
  );
}

function isSafePublicOfferingRow(
  row: PublicProviderOfferingRow,
): row is SafePublicOfferingRow {
  return Boolean(
    row.provider_service_id &&
      row.provider_id &&
      row.service_id &&
      row.price_cents !== null &&
      row.price_type &&
      row.unit &&
      row.service_name !== null &&
      row.service_slug !== null &&
      row.service_category !== null &&
      row.service_is_live !== null &&
      row.is_hourly_bookable !== null,
  );
}

function mapPublicOffering(row: SafePublicOfferingRow): OfferedService {
  return {
    id: row.provider_service_id,
    price_cents: row.price_cents,
    price_type: row.price_type,
    unit: row.unit,
    preview_image_path: row.preview_image_path,
    hourly_rate_cents: row.hourly_rate_cents,
    is_hourly_bookable: row.is_hourly_bookable,
    service: {
      id: row.service_id,
      name: row.service_name,
      slug: row.service_slug,
      category: row.service_category,
      is_live: row.service_is_live,
    },
  };
}

function mapRating(row: ProviderRating | null) {
  if (!row || row.avg_rating === null || row.review_count === null) return null;
  return { avg: Number(row.avg_rating), count: row.review_count };
}

function mapReviews(
  rows: ProviderReview[],
  serviceNameById: Map<string, string>,
): PublicReview[] {
  return rows.flatMap((row) => {
    if (
      row.id === null ||
      row.rating === null ||
      row.text === null ||
      row.created_at === null ||
      row.service_id === null
    ) {
      return [];
    }

    return [
      {
        id: row.id,
        rating: row.rating,
        text: row.text,
        created_at: row.created_at,
        service_name: serviceNameById.get(row.service_id) ?? null,
      },
    ];
  });
}

/**
 * Approved providers for Browse and the landing page. RLS already hides
 * unapproved providers (pilot decision); the filter here is for clarity.
 */
export async function getApprovedProviders(
  options: {
    serviceSlug?: string;
    sort?: ProviderSort;
    jobZip?: string;
  } = {},
): Promise<ProviderCard[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();

  const { data: providers } = await supabase
    .from("public_provider_directory")
    .select("*")
    .order("created_at", { ascending: true });

  const safeProviders = (providers ?? []).filter(isSafePublicProviderRow);
  if (!safeProviders.length) return [];

  const providerIds = safeProviders.map((provider) => provider.provider_id);
  const [{ data: offeringRows }, { data: ratings }] = await Promise.all([
    supabase
      .from("public_provider_offerings")
      .select("*")
      .in("provider_id", providerIds),
    supabase.from("provider_ratings").select("*"),
  ]);

  const offeringsByProvider = new Map<string, OfferedService[]>();
  for (const row of (offeringRows ?? []).filter(isSafePublicOfferingRow)) {
    const offerings = offeringsByProvider.get(row.provider_id) ?? [];
    offerings.push(mapPublicOffering(row));
    offeringsByProvider.set(row.provider_id, offerings);
  }

  const ratingByProvider = new Map<string, NonNullable<ProviderCard["rating"]>>();
  for (const rating of ratings ?? []) {
    const mapped = mapRating(rating);
    if (rating.provider_id && mapped) ratingByProvider.set(rating.provider_id, mapped);
  }

  const cards: ProviderCard[] = safeProviders.map((p) => ({
    id: p.provider_id,
    display_name: p.display_name,
    company_name: p.company_name,
    bio: p.bio,
    provider_type: p.provider_type,
    neighborhood: p.neighborhood,
    avatar_image_path: p.avatar_image_path,
    services: offeringsByProvider.get(p.provider_id) ?? [],
    rating: ratingByProvider.get(p.provider_id) ?? null,
  }));

  const filtered = cards.filter(
    (card) =>
      card.services.length > 0 &&
      (!options.serviceSlug ||
        card.services.some((s) => s.service.slug === options.serviceSlug)),
  );

  const relevantOfferings = (card: ProviderCard) =>
    card.services.filter(
      (offering) =>
        offering.is_hourly_bookable &&
        (!options.serviceSlug || offering.service.slug === options.serviceSlug),
    );
  const lowestRate = (card: ProviderCard) =>
    Math.min(
      ...relevantOfferings(card).map(
        (offering) => offering.hourly_rate_cents ?? Number.POSITIVE_INFINITY,
      ),
      Number.POSITIVE_INFINITY,
    );
  const stableTieBreak = (a: ProviderCard, b: ProviderCard) =>
    a.display_name.localeCompare(b.display_name) || a.id.localeCompare(b.id);
  const ratingThenRate = (a: ProviderCard, b: ProviderCard) =>
    (b.rating?.avg ?? 0) - (a.rating?.avg ?? 0) ||
    lowestRate(a) - lowestRate(b) ||
    stableTieBreak(a, b);

  if (options.sort === "location" && /^\d{5}$/.test(options.jobZip ?? "")) {
    const rankedIds = await getLocationRankedProviderIds({
      jobZip: options.jobZip!,
      serviceSlug: options.serviceSlug,
    });
    const rank = new Map(rankedIds.map((id, index) => [id, index]));
    return filtered.toSorted(
      (a, b) =>
        (rank.get(a.id) ?? Number.POSITIVE_INFINITY) -
          (rank.get(b.id) ?? Number.POSITIVE_INFINITY) ||
        ratingThenRate(a, b),
    );
  }
  if (options.sort === "rating") {
    return filtered.toSorted(ratingThenRate);
  }
  if (options.sort === "rate") {
    return filtered.toSorted(
      (a, b) => lowestRate(a) - lowestRate(b) || ratingThenRate(a, b),
    );
  }

  return filtered.toSorted(
    (a, b) =>
      Number(relevantOfferings(b).length > 0) -
        Number(relevantOfferings(a).length > 0) ||
      ratingThenRate(a, b),
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
  availability_weekdays: number[];
  availability_start_local: string | null;
  availability_end_local: string | null;
  availability_note: string;
  minimum_notice_hours: number;
  reviews: PublicReview[];
};

/** Everything the public provider profile page needs, or null if not visible. */
export async function getPublicProviderProfile(
  providerId: string,
): Promise<PublicProviderProfile | null> {
  if (!hasSupabaseEnv()) return null;
  const supabase = await createClient();

  const [
    { data: provider },
    { data: offeringRows },
    { data: rating },
    { data: reviews },
    { data: services },
  ] = await Promise.all([
      supabase
        .from("public_provider_directory")
        .select("*")
        .eq("provider_id", providerId)
        .maybeSingle(),
      supabase
        .from("public_provider_offerings")
        .select("*")
        .eq("provider_id", providerId),
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

  if (!provider || !isSafePublicProviderRow(provider)) return null;

  const serviceNameById = new Map((services ?? []).map((s) => [s.id, s.name]));
  const liveServices = (offeringRows ?? [])
    .filter(isSafePublicOfferingRow)
    .map(mapPublicOffering);

  if (liveServices.length === 0) return null;

  return {
    id: provider.provider_id,
    display_name: provider.display_name,
    company_name: provider.company_name,
    bio: provider.bio,
    provider_type: provider.provider_type,
    neighborhood: provider.neighborhood,
    avatar_image_path: provider.avatar_image_path,
    services: liveServices,
    rating: mapRating(rating),
    availability_weekdays: provider.availability_weekdays ?? [],
    availability_start_local: provider.availability_start_local,
    availability_end_local: provider.availability_end_local,
    availability_note: provider.availability_note ?? "",
    minimum_notice_hours: provider.minimum_notice_hours ?? 24,
    reviews: mapReviews(reviews ?? [], serviceNameById),
  };
}

export type AdminProviderProfile = PublicProviderProfile &
  Pick<
    ProviderProfile,
    | "service_zip"
    | "stripe_account_id"
    | "stripe_transfers_active"
    | "stripe_transfers_checked_at"
  > & {
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
 * catalog has since retired). The caller is responsible for an admin role
 * gate before this server-only service-role read. Returns null only if the id
 * doesn't exist.
 */
export async function getAdminProviderProfile(
  providerId: string,
): Promise<AdminProviderProfile | null> {
  if (!hasSupabaseEnv()) return null;
  const supabase = createAdminClient();

  const [{ data: provider }, { data: rating }, { data: reviews }, { data: services }] =
    await Promise.all([
      supabase
        .from("provider_profiles")
        .select(
          `availability, availability_weekdays, availability_start_local,
           availability_end_local, availability_note, minimum_notice_hours,
           service_zip, stripe_account_id, stripe_transfers_active,
           stripe_transfers_checked_at, verification_status, id_document_url,
           id_document_back_url, created_at,
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
  const adminOfferings: OfferedService[] = provider.provider_services.map(
    (offering) => ({
      ...offering,
      is_hourly_bookable: getOfferingReadiness(provider, {
        hourly_rate_cents: offering.hourly_rate_cents,
        service_is_live: offering.service.is_live,
      }).bookable,
    }),
  );

  return {
    id: provider.id,
    display_name: provider.display_name,
    company_name: provider.company_name,
    bio: provider.bio,
    provider_type: provider.provider_type,
    neighborhood: provider.neighborhood,
    avatar_image_path: provider.avatar_image_path,
    // Show every service the provider offers, even ones no longer live.
    services: adminOfferings,
    rating: mapRating(rating),
    availability_weekdays: provider.availability_weekdays,
    availability_start_local: provider.availability_start_local,
    availability_end_local: provider.availability_end_local,
    availability_note: provider.availability_note,
    minimum_notice_hours: provider.minimum_notice_hours,
    service_zip: provider.service_zip,
    stripe_account_id: provider.stripe_account_id,
    stripe_transfers_active: provider.stripe_transfers_active,
    stripe_transfers_checked_at: provider.stripe_transfers_checked_at,
    verification_status: provider.verification_status,
    id_document_url: provider.id_document_url,
    id_document_back_url: provider.id_document_back_url,
    created_at: provider.created_at,
    full_name: provider.user?.full_name ?? null,
    reviews: mapReviews(reviews ?? [], serviceNameById),
  };
}
