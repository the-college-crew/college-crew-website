import { supabase } from "./supabase";

/**
 * Read layer for the customer-facing provider directory. Everything here comes
 * from the anon/authenticated-safe VIEWS (public_provider_directory,
 * public_provider_offerings, provider_ratings, provider_reviews) — the base
 * provider_profiles/profiles tables are column-gated, so never query them
 * directly from the app. PostgREST can't join across views, so we fetch each
 * and stitch in JS, exactly like the web (apps/web/lib/db/queries.ts).
 *
 * Distance is deliberately absent: the views expose no coordinates (the web
 * computes miles server-side with a service-role client), so the app sorts by
 * rating / rate / recency instead.
 */

export type OfferedService = {
  id: string;
  service_id: string;
  service_name: string;
  service_slug: string;
  price_cents: number | null;
  hourly_rate_cents: number | null;
  price_type: "fixed" | "quote" | null;
  unit: "per_job" | "per_hour" | null;
  is_hourly_bookable: boolean;
};

export type ProviderCard = {
  id: string;
  display_name: string;
  company_name: string | null;
  bio: string;
  provider_type: "business" | "individual";
  neighborhood: string;
  minimum_notice_hours: number;
  availability_note: string;
  availability_windows: { weekday: number; start_local: string; end_local: string }[];
  services: OfferedService[];
  rating: { avg: number; count: number } | null;
};

export type Review = {
  id: string;
  rating: number;
  text: string;
  created_at: string;
  service_name: string | null;
};

export type ServiceFilter = { id: string; name: string; slug: string; count: number };

export type ProviderSort = "suggested" | "rating" | "rate";

function mapOffering(row: Record<string, unknown>): OfferedService {
  return {
    id: row.provider_service_id as string,
    service_id: row.service_id as string,
    service_name: (row.service_name as string) ?? "Service",
    service_slug: (row.service_slug as string) ?? "",
    price_cents: (row.price_cents as number) ?? null,
    hourly_rate_cents: (row.hourly_rate_cents as number) ?? null,
    price_type: (row.price_type as OfferedService["price_type"]) ?? null,
    unit: (row.unit as OfferedService["unit"]) ?? null,
    is_hourly_bookable: Boolean(row.is_hourly_bookable),
  };
}

function lowestHourly(services: OfferedService[]): number {
  const rates = services
    .filter((s) => s.is_hourly_bookable && s.hourly_rate_cents != null)
    .map((s) => s.hourly_rate_cents as number);
  return rates.length ? Math.min(...rates) : Number.POSITIVE_INFINITY;
}

/** Live services plus a count of approved providers offering each — the chips. */
export async function fetchServiceFilters(): Promise<ServiceFilter[]> {
  const [{ data: services, error: sErr }, { data: offerings, error: oErr }] = await Promise.all([
    supabase.from("services").select("id, name, slug").eq("is_live", true).order("name"),
    supabase.from("public_provider_offerings").select("service_slug, provider_id"),
  ]);
  if (sErr) throw sErr;
  if (oErr) throw oErr;

  const counts = new Map<string, Set<string>>();
  for (const o of offerings ?? []) {
    const slug = o.service_slug as string;
    if (!slug) continue;
    if (!counts.has(slug)) counts.set(slug, new Set());
    counts.get(slug)!.add(o.provider_id as string);
  }
  return (services ?? []).map((s) => ({
    id: s.id as string,
    name: s.name as string,
    slug: s.slug as string,
    count: counts.get(s.slug as string)?.size ?? 0,
  }));
}

/** Approved providers, optionally filtered to one service, then sorted. */
export async function fetchProviders(opts: {
  serviceSlug?: string | null;
  sort?: ProviderSort;
}): Promise<ProviderCard[]> {
  const sort = opts.sort ?? "suggested";

  const { data: directory, error: dErr } = await supabase
    .from("public_provider_directory")
    .select(
      "provider_id, display_name, company_name, bio, provider_type, neighborhood, minimum_notice_hours, availability_note, availability_windows",
    )
    .order("created_at", { ascending: true });
  if (dErr) throw dErr;

  const ids = (directory ?? []).map((d) => d.provider_id as string);
  if (ids.length === 0) return [];

  const [{ data: offerings, error: oErr }, { data: ratings, error: rErr }] = await Promise.all([
    supabase.from("public_provider_offerings").select("*").in("provider_id", ids),
    supabase.from("provider_ratings").select("*").in("provider_id", ids),
  ]);
  if (oErr) throw oErr;
  if (rErr) throw rErr;

  const offeringsByProvider = new Map<string, OfferedService[]>();
  for (const row of offerings ?? []) {
    const pid = row.provider_id as string;
    if (!offeringsByProvider.has(pid)) offeringsByProvider.set(pid, []);
    offeringsByProvider.get(pid)!.push(mapOffering(row));
  }
  const ratingByProvider = new Map<string, { avg: number; count: number }>();
  for (const r of ratings ?? []) {
    ratingByProvider.set(r.provider_id as string, {
      avg: Number(r.avg_rating) || 0,
      count: Number(r.review_count) || 0,
    });
  }

  let cards: ProviderCard[] = (directory ?? []).map((d) => {
    const pid = d.provider_id as string;
    return {
      id: pid,
      display_name: (d.display_name as string) ?? "Student provider",
      company_name: (d.company_name as string) ?? null,
      bio: (d.bio as string) ?? "",
      provider_type: (d.provider_type as ProviderCard["provider_type"]) ?? "individual",
      neighborhood: (d.neighborhood as string) ?? "",
      minimum_notice_hours: (d.minimum_notice_hours as number) ?? 24,
      availability_note: (d.availability_note as string) ?? "",
      availability_windows: parseWindows(d.availability_windows),
      services: offeringsByProvider.get(pid) ?? [],
      rating: ratingByProvider.get(pid) ?? null,
    };
  });

  // A card with no offerings can't be booked — drop it, like the web does.
  cards = cards.filter((c) => c.services.length > 0);

  if (opts.serviceSlug) {
    cards = cards.filter((c) => c.services.some((s) => s.service_slug === opts.serviceSlug));
  }

  cards.sort((a, b) => {
    if (sort === "rate") return lowestHourly(a.services) - lowestHourly(b.services);
    const ar = a.rating?.avg ?? 0;
    const br = b.rating?.avg ?? 0;
    if (br !== ar) return br - ar;
    return (b.rating?.count ?? 0) - (a.rating?.count ?? 0);
  });
  return cards;
}

export type ProviderDetail = ProviderCard & { reviews: Review[] };

export async function fetchProviderDetail(providerId: string): Promise<ProviderDetail | null> {
  const [{ data: dir }, { data: offerings }, { data: rating }, { data: reviews }] =
    await Promise.all([
      supabase
        .from("public_provider_directory")
        .select("*")
        .eq("provider_id", providerId)
        .maybeSingle(),
      supabase.from("public_provider_offerings").select("*").eq("provider_id", providerId),
      supabase.from("provider_ratings").select("*").eq("provider_id", providerId).maybeSingle(),
      supabase
        .from("provider_reviews")
        .select("*")
        .eq("provider_id", providerId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
  if (!dir) return null;

  const services = (offerings ?? []).map(mapOffering);
  const serviceNames = new Map(services.map((s) => [s.service_id, s.service_name]));

  return {
    id: providerId,
    display_name: (dir.display_name as string) ?? "Student provider",
    company_name: (dir.company_name as string) ?? null,
    bio: (dir.bio as string) ?? "",
    provider_type: (dir.provider_type as ProviderCard["provider_type"]) ?? "individual",
    neighborhood: (dir.neighborhood as string) ?? "",
    minimum_notice_hours: (dir.minimum_notice_hours as number) ?? 24,
    availability_note: (dir.availability_note as string) ?? "",
    availability_windows: parseWindows(dir.availability_windows),
    services,
    rating: rating
      ? { avg: Number(rating.avg_rating) || 0, count: Number(rating.review_count) || 0 }
      : null,
    reviews: (reviews ?? []).map((r) => ({
      id: r.id as string,
      rating: Number(r.rating) || 0,
      text: (r.text as string) ?? "",
      created_at: r.created_at as string,
      service_name: serviceNames.get(r.service_id as string) ?? null,
    })),
  };
}

function parseWindows(raw: unknown): ProviderCard["availability_windows"] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((w): w is Record<string, unknown> => typeof w === "object" && w !== null)
    .map((w) => ({
      weekday: Number(w.weekday) || 0,
      start_local: String(w.start_local ?? ""),
      end_local: String(w.end_local ?? ""),
    }));
}

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "12:00" -> "12:00 PM" for availability windows (stored as local HH:MM). */
export function formatLocalTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m ?? 0).padStart(2, "0")} ${period}`;
}
