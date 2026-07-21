import { supabase } from "./supabase";
import type { BookingStatus } from "./status";

/**
 * Booking reads for both sides of the app. The bookings RLS policy is
 * `customer_id = auth.uid() OR owns_provider_profile(provider_id)`, so a query
 * with NO provider/customer filter returns every booking the signed-in user is
 * party to. Screens split on `customer_id === myUserId`:
 *   - my customer bookings  -> Bookings tab
 *   - my provider jobs      -> Provider tab
 * This is why the app never needs the caller's own provider_profiles.id (which
 * isn't client-resolvable — user_id has no column grant).
 */

export type BookingInvoice = {
  status: string;
  remaining_balance_cents: number | null;
  resolved_at: string | null;
  submitted_minutes: number | null;
  provider_explanation: string | null;
  subtotal_cents: number | null;
  total_platform_fee_cents: number | null;
} | null;

export type Booking = {
  id: string;
  booking_flow: "legacy" | "hourly_v1";
  status: BookingStatus;
  scheduled_at: string;
  address: string;
  details: string;
  price_cents: number;
  platform_fee_cents: number;
  estimated_minutes: number | null;
  hourly_rate_cents_snapshot: number | null;
  service_name: string;
  provider_name: string;
  customer_name: string;
  customer_id: string;
  provider_id: string;
  arrived_at: string | null;
  work_completed_at: string | null;
  cancelled_by_role: "customer" | "provider" | "admin" | null;
  dismissed_at: string | null;
  created_at: string;
  invoice: BookingInvoice;
};

const SELECT = `
  id, booking_flow, status, scheduled_at, address, details, price_cents,
  platform_fee_cents, estimated_minutes, hourly_rate_cents_snapshot,
  service_name_snapshot, provider_display_name_snapshot, customer_name_snapshot,
  customer_id, provider_id, arrived_at, work_completed_at, cancelled_by_role,
  dismissed_at, created_at,
  service:services(name),
  provider:provider_profiles(display_name),
  customer:profiles!bookings_customer_id_fkey(full_name),
  invoice:booking_invoices(status, remaining_balance_cents, resolved_at, submitted_minutes, provider_explanation, subtotal_cents, total_platform_fee_cents)
`;

function embeddedName(embed: unknown, key: string): string {
  if (embed && typeof embed === "object" && key in embed) {
    const v = (embed as Record<string, unknown>)[key];
    if (typeof v === "string") return v;
  }
  return "";
}

function mapBooking(row: Record<string, unknown>): Booking {
  const invoiceRow = Array.isArray(row.invoice) ? row.invoice[0] : row.invoice;
  return {
    id: row.id as string,
    booking_flow: (row.booking_flow as Booking["booking_flow"]) ?? "hourly_v1",
    status: row.status as BookingStatus,
    scheduled_at: row.scheduled_at as string,
    address: (row.address as string) ?? "",
    details: (row.details as string) ?? "",
    price_cents: (row.price_cents as number) ?? 0,
    platform_fee_cents: (row.platform_fee_cents as number) ?? 0,
    estimated_minutes: (row.estimated_minutes as number) ?? null,
    hourly_rate_cents_snapshot: (row.hourly_rate_cents_snapshot as number) ?? null,
    service_name:
      (row.service_name_snapshot as string) || embeddedName(row.service, "name") || "Service",
    provider_name:
      (row.provider_display_name_snapshot as string) ||
      embeddedName(row.provider, "display_name") ||
      "Provider",
    customer_name:
      (row.customer_name_snapshot as string) ||
      embeddedName(row.customer, "full_name") ||
      "Customer",
    customer_id: row.customer_id as string,
    provider_id: row.provider_id as string,
    arrived_at: (row.arrived_at as string) ?? null,
    work_completed_at: (row.work_completed_at as string) ?? null,
    cancelled_by_role: (row.cancelled_by_role as Booking["cancelled_by_role"]) ?? null,
    dismissed_at: (row.dismissed_at as string) ?? null,
    created_at: row.created_at as string,
    invoice: invoiceRow
      ? {
          status: (invoiceRow as Record<string, unknown>).status as string,
          remaining_balance_cents:
            ((invoiceRow as Record<string, unknown>).remaining_balance_cents as number) ?? null,
          resolved_at: ((invoiceRow as Record<string, unknown>).resolved_at as string) ?? null,
          submitted_minutes:
            ((invoiceRow as Record<string, unknown>).submitted_minutes as number) ?? null,
          provider_explanation:
            ((invoiceRow as Record<string, unknown>).provider_explanation as string) ?? null,
          subtotal_cents: ((invoiceRow as Record<string, unknown>).subtotal_cents as number) ?? null,
          total_platform_fee_cents:
            ((invoiceRow as Record<string, unknown>).total_platform_fee_cents as number) ?? null,
        }
      : null,
  };
}

/** Every booking the caller is party to (both roles), newest first. */
export async function fetchMyBookings(): Promise<Booking[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select(SELECT)
    .order("scheduled_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => mapBooking(r as Record<string, unknown>));
}

export async function fetchBooking(id: string): Promise<Booking | null> {
  const { data, error } = await supabase.from("bookings").select(SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapBooking(data as Record<string, unknown>) : null;
}

/** booking_id -> review_id for the caller's reviewed bookings. */
export async function fetchMyReviewedBookingIds(): Promise<Set<string>> {
  const { data, error } = await supabase.rpc("get_my_booking_reviews");
  if (error) return new Set();
  return new Set((data ?? []).map((r: { booking_id: string }) => r.booking_id));
}

const ACTIVE: BookingStatus[] = [
  "requested",
  "accepted",
  "booked",
  "in_progress",
  "invoice_review",
  "disputed",
  "paid",
];

export function isActive(status: BookingStatus): boolean {
  return ACTIVE.includes(status);
}

/** Open/find the thread for a booking (mirrors the web conversation helper). */
export async function openBookingConversation(booking: {
  id: string;
  customer_id: string;
  provider_id: string;
}): Promise<string | null> {
  const existing = await supabase
    .from("conversations")
    .select("id")
    .eq("booking_id", booking.id)
    .maybeSingle();
  if (existing.data?.id) return existing.data.id as string;

  // Adopt a prior inquiry thread if the DB lets us, else open a fresh one.
  const claimed = await supabase.rpc("claim_conversation_for_booking", {
    target_booking_id: booking.id,
  });
  if (claimed.data) return claimed.data as string;

  const created = await supabase
    .from("conversations")
    .insert({
      customer_id: booking.customer_id,
      provider_id: booking.provider_id,
      booking_id: booking.id,
    })
    .select("id")
    .single();
  if (created.data?.id) return created.data.id as string;
  if (created.error?.code === "23505") {
    const raced = await supabase
      .from("conversations")
      .select("id")
      .eq("booking_id", booking.id)
      .maybeSingle();
    return (raced.data?.id as string) ?? null;
  }
  return null;
}
