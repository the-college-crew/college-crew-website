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
import { hasServiceRoleEnv, hasSupabaseEnv } from "@/lib/env";
import {
  toBannerStyle,
  type BannerStyle,
} from "@/lib/media/provider-banners";
import {
  compareDistanceNearestFirst,
  recommendationScore,
  utcDateKey,
} from "@/lib/browse/ranking";
import {
  pilotDateKey,
  type BusyInterval,
  type ScheduleDay,
} from "@/lib/booking/availability-grid";
import { milesBetween, type MaybeCoordinates } from "@/lib/geo/distance";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  getOfferingReadiness,
  type AvailabilityWindow,
  type PricingMode,
} from "@/lib/provider/setup";

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
  pricing_mode: PricingMode;
  average_quote_cents: number | null;
  is_hourly_bookable: boolean;
  is_quote_bookable: boolean;
  is_bookable: boolean;
  service: Pick<Service, "id" | "name" | "slug" | "category" | "is_live">;
};

export type ProviderCard = {
  id: string;
  display_name: string;
  company_name: string | null;
  bio: string;
  provider_type: ProviderType;
  neighborhood: string;
  school_name: string;
  school_domain: string | null;
  greek_organization: string;
  /** Operating-address town; falls back to the legacy neighborhood tag. */
  town: string;
  /** Straight-line miles from the viewer's "booking from" origin, if both sides geocoded. */
  distance_miles: number | null;
  avatar_image_path: string | null;
  avatar_focal_x: number;
  avatar_focal_y: number;
  banner_image_path: string | null;
  banner_style: BannerStyle;
  banner_focal_x: number;
  banner_focal_y: number;
  services: OfferedService[];
  rating: { avg: number; count: number } | null;
  /** Short pull-quote for the Browse card: the best recent 4-5★ review, or null. */
  quote: string | null;
};

/** Viewer origin for distance lines. Null → town-only display. */
export type ViewerOrigin = MaybeCoordinates | null;

type ProviderLocationFacts = {
  city: string;
  latitude: number | null;
  longitude: number | null;
};

/**
 * Town + coordinates of each provider's operating address (their profile
 * address). Server-only via the admin client: raw coordinates never reach the
 * browser — callers pass on only the town string and a computed miles number.
 */
async function getProviderLocationFacts(
  providerIds: string[],
): Promise<Map<string, ProviderLocationFacts>> {
  const facts = new Map<string, ProviderLocationFacts>();
  if (!hasServiceRoleEnv() || providerIds.length === 0) return facts;

  const admin = createAdminClient();
  const { data } = await admin
    .from("provider_profiles")
    .select(
      "id, user:profiles!provider_profiles_user_id_fkey ( city, latitude, longitude )",
    )
    .in("id", providerIds);

  for (const row of data ?? []) {
    facts.set(row.id, {
      city: row.user?.city ?? "",
      latitude: row.user?.latitude ?? null,
      longitude: row.user?.longitude ?? null,
    });
  }
  return facts;
}

/**
 * Completed-job count per provider, for the recommendation ranking. Reads the
 * provider_completed_jobs aggregate view (one row per provider; both
 * fixed-price and hourly work land in the terminal 'completed' state). The view
 * is a SECURITY DEFINER aggregate granted to anon/authenticated, so this exposes
 * only the count — never raw booking rows — and needs no service-role client on
 * the public Browse path. One row per provider means no unbounded read and no
 * row-cap truncation as history grows.
 *
 * On a read error we surface it and return an empty map: the ranking then
 * degrades to quality-without-jobs uniformly for everyone, rather than silently
 * ranking some providers as if they had zero completed jobs.
 */
async function getProviderCompletedJobCounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  providerIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (providerIds.length === 0) return counts;

  const { data, error } = await supabase
    .from("provider_completed_jobs")
    .select("provider_id, completed_jobs")
    .in("provider_id", providerIds);

  if (error) {
    console.error("getProviderCompletedJobCounts failed", error);
    return counts;
  }

  for (const row of data ?? []) {
    if (row.provider_id !== null && row.completed_jobs !== null) {
      counts.set(row.provider_id, row.completed_jobs);
    }
  }
  return counts;
}

export type ProviderSort = "suggested" | "location" | "rating";

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
  school_name, school_scorecard_id, school_domain, greek_organization,
  avatar_image_path, banner_image_path, banner_style,
  avatar_focal_x, avatar_focal_y, banner_focal_x, banner_focal_y,
  provider_services (
    id, price_cents, price_type, unit, preview_image_path, hourly_rate_cents,
    pricing_mode, average_quote_cents,
    service:services ( id, name, slug, category, is_live )
  )
` as const;

type SafePublicProviderRow = PublicProviderDirectoryRow & {
  provider_id: string;
  display_name: string;
  bio: string;
  provider_type: ProviderType;
  neighborhood: string;
  school_name: string;
  greek_organization: string;
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
  pricing_mode: PricingMode;
  average_quote_cents: number | null;
  service_name: string;
  service_slug: string;
  service_category: string;
  service_is_live: boolean;
  is_hourly_bookable: boolean;
  is_quote_bookable: boolean;
};

function isSafePublicProviderRow(
  row: PublicProviderDirectoryRow,
): row is SafePublicProviderRow {
  return Boolean(
    row.provider_id &&
      row.display_name !== null &&
      row.bio !== null &&
      row.provider_type &&
      row.neighborhood !== null &&
      row.school_name !== null &&
      row.greek_organization !== null,
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
      row.is_hourly_bookable !== null &&
      row.is_quote_bookable !== null &&
      (row.pricing_mode === "hourly" || row.pricing_mode === "quote"),
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
    pricing_mode: row.pricing_mode,
    average_quote_cents: row.average_quote_cents,
    is_hourly_bookable: row.is_hourly_bookable,
    is_quote_bookable: row.is_quote_bookable,
    is_bookable: row.is_hourly_bookable || row.is_quote_bookable,
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
 * Best recent positive review line for card pull-quotes: highest rating wins,
 * recency breaks ties (callers pass rows newest-first). Ratings under 4 never
 * surface here; a card with no glowing review simply shows no quote.
 */
function pickQuote(reviews: { rating: number; text: string }[]): string | null {
  let best: { rating: number; text: string } | null = null;
  for (const review of reviews) {
    const text = review.text.trim();
    if (review.rating < 4 || !text) continue;
    if (!best || review.rating > best.rating) best = { rating: review.rating, text };
  }
  return best?.text ?? null;
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
    origin?: ViewerOrigin;
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
  const [{ data: offeringRows }, { data: ratings }, { data: reviewRows }, locationFacts] =
    await Promise.all([
      supabase
        .from("public_provider_offerings")
        .select("*")
        .in("provider_id", providerIds),
      supabase.from("provider_ratings").select("*"),
      // Newest-first so pickQuote's tie-break lands on the most recent review.
      // The cap keeps the read bounded as history grows; older reviews stop
      // being quote candidates, which is fine — quotes should feel current.
      supabase
        .from("provider_reviews")
        .select("provider_id, rating, text, created_at")
        .in("provider_id", providerIds)
        .order("created_at", { ascending: false })
        .limit(200),
      getProviderLocationFacts(providerIds),
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

  const reviewsByProvider = new Map<string, { rating: number; text: string }[]>();
  for (const row of reviewRows ?? []) {
    if (!row.provider_id || row.rating === null || row.text === null) continue;
    const list = reviewsByProvider.get(row.provider_id) ?? [];
    list.push({ rating: row.rating, text: row.text });
    reviewsByProvider.set(row.provider_id, list);
  }

  const cards: ProviderCard[] = safeProviders.map((p) => {
    const facts = locationFacts.get(p.provider_id);
    return {
      id: p.provider_id,
      display_name: p.display_name,
      company_name: p.company_name,
      bio: p.bio,
      provider_type: p.provider_type,
      neighborhood: p.neighborhood,
      school_name: p.school_name,
      school_domain: p.school_domain,
      greek_organization: p.greek_organization,
      town: facts?.city || p.neighborhood,
      distance_miles: milesBetween(options.origin, facts),
      avatar_image_path: p.avatar_image_path,
      avatar_focal_x: p.avatar_focal_x ?? 50,
      avatar_focal_y: p.avatar_focal_y ?? 50,
      banner_image_path: p.banner_image_path,
      banner_style: toBannerStyle(p.banner_style),
      banner_focal_x: p.banner_focal_x ?? 50,
      banner_focal_y: p.banner_focal_y ?? 50,
      services: offeringsByProvider.get(p.provider_id) ?? [],
      rating: ratingByProvider.get(p.provider_id) ?? null,
      quote: pickQuote(reviewsByProvider.get(p.provider_id) ?? []),
    };
  });

  const filtered = cards.filter(
    (card) =>
      card.services.length > 0 &&
      (!options.serviceSlug ||
        card.services.some((s) => s.service.slug === options.serviceSlug)),
  );

  const relevantOfferings = (card: ProviderCard) =>
    card.services.filter(
      (offering) =>
        offering.is_bookable &&
        (!options.serviceSlug || offering.service.slug === options.serviceSlug),
    );
  const lowestRate = (card: ProviderCard) =>
    Math.min(
      ...relevantOfferings(card).map(
        (offering) =>
          offering.pricing_mode === "quote"
            ? (offering.average_quote_cents ?? Number.POSITIVE_INFINITY)
            : (offering.hourly_rate_cents ?? Number.POSITIVE_INFINITY),
      ),
      Number.POSITIVE_INFINITY,
    );
  const stableTieBreak = (a: ProviderCard, b: ProviderCard) =>
    a.display_name.localeCompare(b.display_name) || a.id.localeCompare(b.id);
  const ratingThenRate = (a: ProviderCard, b: ProviderCard) =>
    (b.rating?.avg ?? 0) - (a.rating?.avg ?? 0) ||
    lowestRate(a) - lowestRate(b) ||
    stableTieBreak(a, b);

  if (options.sort === "location") {
    return filtered.toSorted(
      (a, b) =>
        compareDistanceNearestFirst(a.distance_miles, b.distance_miles) ||
        ratingThenRate(a, b),
    );
  }
  if (options.sort === "rating") {
    return filtered.toSorted(ratingThenRate);
  }

  // Default "suggested" sort: the recommendation engine. Quality (smoothed
  // rating, log-scaled completed jobs, profile completeness) with 20% daily
  // exploration noise, then a distance demotion. Distance stays neutral when
  // the viewer has no origin, so this degrades to pure quality + noise for
  // logged-out browsing.
  const jobCounts = await getProviderCompletedJobCounts(
    supabase,
    filtered.map((card) => card.id),
  );
  const dateKey = utcDateKey();
  const scoreById = new Map(
    filtered.map((card) => [
      card.id,
      recommendationScore({
        providerId: card.id,
        avgRating: card.rating?.avg ?? 0,
        reviewCount: card.rating?.count ?? 0,
        completedJobs: jobCounts.get(card.id) ?? 0,
        hasBio: card.bio.trim().length > 0,
        hasPreview: card.services.some((s) => Boolean(s.preview_image_path)),
        distanceMiles: card.distance_miles,
        dateKey,
      }),
    ]),
  );
  return filtered.toSorted(
    (a, b) =>
      (scoreById.get(b.id) ?? 0) - (scoreById.get(a.id) ?? 0) ||
      stableTieBreak(a, b),
  );
}

/** Provider counts for the Browse filter chips (plain object: crosses to a client component). */
export type ServiceProviderCounts = {
  /** Distinct listed providers with at least one service. */
  total: number;
  /** Distinct listed providers per service slug; missing slug = 0. */
  bySlug: Record<string, number>;
};

/**
 * Distinct approved-provider count per live service, for the Browse chips.
 * Reads the same public views with the same row guards as
 * getApprovedProviders, so a chip's number always matches the list the chip
 * filters to. Duplicates that function's two selects rather than entangling
 * its return shape — cheap at pilot scale.
 */
export async function getServiceProviderCounts(): Promise<ServiceProviderCounts> {
  if (!hasSupabaseEnv()) return { total: 0, bySlug: {} };
  const supabase = await createClient();

  const [{ data: providers }, { data: offeringRows }] = await Promise.all([
    supabase.from("public_provider_directory").select("*"),
    supabase.from("public_provider_offerings").select("*"),
  ]);

  const listed = new Set(
    (providers ?? []).filter(isSafePublicProviderRow).map((p) => p.provider_id),
  );
  const all = new Set<string>();
  const providersBySlug = new Map<string, Set<string>>();
  for (const row of (offeringRows ?? []).filter(isSafePublicOfferingRow)) {
    if (!listed.has(row.provider_id)) continue;
    all.add(row.provider_id);
    const set = providersBySlug.get(row.service_slug) ?? new Set<string>();
    set.add(row.provider_id);
    providersBySlug.set(row.service_slug, set);
  }

  const bySlug: Record<string, number> = {};
  for (const [slug, ids] of providersBySlug) bySlug[slug] = ids.size;
  return { total: all.size, bySlug };
}

export type PublicReview = {
  id: string;
  rating: number;
  text: string;
  created_at: string;
  service_name: string | null;
};

export type PublicProviderProfile = ProviderCard & {
  availability_windows: AvailabilityWindow[];
  availability_note: string;
  minimum_notice_hours: number;
  reviews: PublicReview[];
};

/**
 * Parse the jsonb-aggregated availability_windows column exposed on the
 * public directory view (null when a provider has no windows yet).
 */
function mapAvailabilityWindowsJson(value: unknown): AvailabilityWindow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const { weekday, start_local, end_local } = entry as Record<string, unknown>;
    if (
      typeof weekday !== "number" ||
      typeof start_local !== "string" ||
      typeof end_local !== "string"
    ) {
      return [];
    }
    return [{ weekday, start_local, end_local }];
  });
}

/**
 * Flat per-provider windows read (no PostgREST embeds). Uses the cookie-based
 * server client: RLS grants owners/admins their own rows and everyone the
 * rows of approved providers.
 */
export async function getProviderAvailabilityWindows(
  providerId: string,
): Promise<AvailabilityWindow[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("provider_availability_windows")
    .select("weekday, start_local, end_local")
    .eq("provider_id", providerId)
    .order("weekday");
  return data ?? [];
}

export type ProviderSchedule = {
  /** Open days with their effective window, per-date overrides applied. */
  days: ScheduleDay[];
  /** Reserved ranges. Times only: the RPC exposes no job details. */
  busy: BusyInterval[];
  /** Dates carrying a per-date override, for marking them in the provider's own view. */
  overrideDates: string[];
  /** Inclusive `YYYY-MM-DD` bounds of the range that was fetched. */
  horizonStart: string;
  horizonEnd: string;
  /** The instant the page was rendered, so the client can't drift on first paint. */
  nowIso: string;
};

/** How far ahead the booking calendar loads. The RPCs cap the range at 120. */
export const SCHEDULE_HORIZON_DAYS = 90;

function addDaysToDateKey(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/**
 * Everything the booking calendar needs for one provider, in two round trips.
 * Fetching the whole horizon up front means month navigation and day selection
 * never wait on the network, which matters because this sits in front of a card
 * authorization.
 */
export async function getProviderSchedule(
  providerId: string,
  options: {
    /** Days before today to include; the provider's own view looks back. */
    lookBackDays?: number;
    days?: number;
    now?: Date;
  } = {},
): Promise<ProviderSchedule> {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const today = pilotDateKey(now);
  const horizonStart = addDaysToDateKey(today, -(options.lookBackDays ?? 0));
  const horizonEnd = addDaysToDateKey(
    today,
    options.days ?? SCHEDULE_HORIZON_DAYS,
  );
  const empty: ProviderSchedule = {
    days: [],
    busy: [],
    overrideDates: [],
    horizonStart,
    horizonEnd,
    nowIso,
  };
  if (!hasSupabaseEnv()) return empty;

  const supabase = await createClient();
  const [
    { data: days, error: daysError },
    { data: busy, error: busyError },
    { data: overrides },
  ] = await Promise.all([
    supabase.rpc("provider_schedule_days", {
      p_provider_id: providerId,
      p_from: horizonStart,
      p_to: horizonEnd,
    }),
    supabase.rpc("provider_busy_intervals", {
      p_provider_id: providerId,
      p_from: `${horizonStart}T00:00:00.000Z`,
      // The busy window has to cover the last bookable day in full, not just
      // its midnight boundary.
      p_to: `${addDaysToDateKey(horizonEnd, 1)}T00:00:00.000Z`,
    }),
    // Which dates were overridden, so the provider's own calendar can mark
    // them. Customers never need this: the override is already baked into the
    // window `provider_schedule_days` returns.
    supabase
      .from("provider_availability_overrides")
      .select("local_date")
      .eq("provider_id", providerId)
      .gte("local_date", horizonStart)
      .lte("local_date", horizonEnd),
  ]);

  if (daysError || busyError) return empty;

  return {
    days: (days ?? []).map((day) => ({
      date: day.local_date,
      startLocal: day.start_local,
      endLocal: day.end_local,
    })),
    busy: (busy ?? []).map((interval) => ({
      start: interval.start_at,
      end: interval.end_at,
    })),
    overrideDates: (overrides ?? []).map((row) => row.local_date),
    horizonStart,
    horizonEnd,
    nowIso,
  };
}

/** Everything the public provider profile page needs, or null if not visible. */
export async function getPublicProviderProfile(
  providerId: string,
  origin: ViewerOrigin = null,
): Promise<PublicProviderProfile | null> {
  if (!hasSupabaseEnv()) return null;
  const supabase = await createClient();

  const [
    { data: provider },
    { data: offeringRows },
    { data: rating },
    { data: reviews },
    { data: services },
    locationFacts,
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
      getProviderLocationFacts([providerId]),
    ]);

  if (!provider || !isSafePublicProviderRow(provider)) return null;

  const serviceNameById = new Map((services ?? []).map((s) => [s.id, s.name]));
  const liveServices = (offeringRows ?? [])
    .filter(isSafePublicOfferingRow)
    .map(mapPublicOffering);

  if (liveServices.length === 0) return null;

  const facts = locationFacts.get(providerId);
  const publicReviews = mapReviews(reviews ?? [], serviceNameById);
  return {
    id: provider.provider_id,
    display_name: provider.display_name,
    company_name: provider.company_name,
    bio: provider.bio,
    provider_type: provider.provider_type,
    neighborhood: provider.neighborhood,
    school_name: provider.school_name,
    school_domain: provider.school_domain,
    greek_organization: provider.greek_organization,
    town: facts?.city || provider.neighborhood,
    distance_miles: milesBetween(origin, facts),
    avatar_image_path: provider.avatar_image_path,
    avatar_focal_x: provider.avatar_focal_x ?? 50,
    avatar_focal_y: provider.avatar_focal_y ?? 50,
    banner_image_path: provider.banner_image_path,
    banner_style: toBannerStyle(provider.banner_style),
    banner_focal_x: provider.banner_focal_x ?? 50,
    banner_focal_y: provider.banner_focal_y ?? 50,
    services: liveServices,
    rating: mapRating(rating),
    quote: pickQuote(publicReviews),
    availability_windows: mapAvailabilityWindowsJson(provider.availability_windows),
    availability_note: provider.availability_note ?? "",
    minimum_notice_hours: provider.minimum_notice_hours ?? 24,
    reviews: publicReviews,
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
  verification_bypassed: boolean;
  verification_bypassed_at: string | null;
  verification_bypassed_by_name: string | null;
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

  const [
    { data: provider },
    { data: windows },
    { data: rating },
    { data: reviews },
    { data: services },
  ] =
    await Promise.all([
      supabase
        .from("provider_profiles")
        .select(
          `availability, availability_note, minimum_notice_hours,
           service_zip, stripe_account_id, stripe_transfers_active,
           stripe_transfers_checked_at, verification_status, id_document_url,
           id_document_back_url, verification_bypassed, verification_bypassed_at,
           created_at,
           user:profiles!provider_profiles_user_id_fkey ( full_name ),
           bypassed_by_admin:profiles!provider_profiles_verification_bypassed_by_fkey ( full_name ),
           ${PROVIDER_CARD_SELECT}`,
        )
        .eq("id", providerId)
        .maybeSingle(),
      supabase
        .from("provider_availability_windows")
        .select("weekday, start_local, end_local")
        .eq("provider_id", providerId)
        .order("weekday"),
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

  const availabilityWindows = windows ?? [];
  const serviceNameById = new Map((services ?? []).map((s) => [s.id, s.name]));
  const adminOfferings: OfferedService[] = provider.provider_services.map(
    (offering) => {
      const readiness = getOfferingReadiness(
        provider,
        {
          hourly_rate_cents: offering.hourly_rate_cents,
          pricing_mode:
            offering.pricing_mode === "quote" ? "quote" : "hourly",
          average_quote_cents: offering.average_quote_cents,
          service_slug: offering.service.slug,
          service_is_live: offering.service.is_live,
        },
        availabilityWindows,
      ).bookable;
      const isQuote = offering.pricing_mode === "quote";
      return {
        ...offering,
        pricing_mode: isQuote ? "quote" : "hourly",
        is_hourly_bookable: !isQuote && readiness,
        is_quote_bookable: isQuote && readiness,
        is_bookable: readiness,
      };
    },
  );

  const locationFacts = await getProviderLocationFacts([providerId]);
  const facts = locationFacts.get(providerId);

  const adminReviews = mapReviews(reviews ?? [], serviceNameById);

  return {
    id: provider.id,
    display_name: provider.display_name,
    company_name: provider.company_name,
    bio: provider.bio,
    provider_type: provider.provider_type,
    neighborhood: provider.neighborhood,
    school_name: provider.school_name,
    school_domain: provider.school_domain,
    greek_organization: provider.greek_organization,
    town: facts?.city || provider.neighborhood,
    distance_miles: null,
    avatar_image_path: provider.avatar_image_path,
    avatar_focal_x: provider.avatar_focal_x,
    avatar_focal_y: provider.avatar_focal_y,
    banner_image_path: provider.banner_image_path,
    banner_style: toBannerStyle(provider.banner_style),
    banner_focal_x: provider.banner_focal_x,
    banner_focal_y: provider.banner_focal_y,
    // Show every service the provider offers, even ones no longer live.
    services: adminOfferings,
    rating: mapRating(rating),
    quote: pickQuote(adminReviews),
    availability_windows: availabilityWindows,
    availability_note: provider.availability_note,
    minimum_notice_hours: provider.minimum_notice_hours,
    service_zip: provider.service_zip,
    stripe_account_id: provider.stripe_account_id,
    stripe_transfers_active: provider.stripe_transfers_active,
    stripe_transfers_checked_at: provider.stripe_transfers_checked_at,
    verification_status: provider.verification_status,
    id_document_url: provider.id_document_url,
    id_document_back_url: provider.id_document_back_url,
    verification_bypassed: provider.verification_bypassed,
    verification_bypassed_at: provider.verification_bypassed_at,
    verification_bypassed_by_name: provider.bypassed_by_admin?.full_name ?? null,
    created_at: provider.created_at,
    full_name: provider.user?.full_name ?? null,
    reviews: adminReviews,
  };
}
