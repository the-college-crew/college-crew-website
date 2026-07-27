import type { Metadata } from "next";
import Link from "next/link";

import { StatusPill } from "@/components/status-pill";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { requireRole } from "@/lib/auth/session";
import type { BookingStatus } from "@/lib/db/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Booking oversight" };

const OVERSIGHT_STATUSES: BookingStatus[] = [
  "disputed",
  "in_progress",
  "invoice_review",
  "booked",
  "completed",
  "cancelled",
];

/** Founder oversight of active + recently-closed hourly bookings. */
export default async function AdminBookingsPage() {
  await requireRole("admin");
  const admin = createAdminClient();

  const [{ data }, { data: failedDrafts }] = await Promise.all([
    admin
      .from("bookings")
      .select(
        `id, status, scheduled_at, requested_local_date, service_name_snapshot,
         customer_name_snapshot, provider_display_name_snapshot,
         dispute:booking_disputes(status)`,
      )
      .in("booking_flow", ["hourly_v1", "quote_v2"])
      .in("status", OVERSIGHT_STATUSES)
      .order("scheduled_at", { ascending: false })
      .limit(100),
    admin
      .from("booking_drafts")
      .select("id, expires_at, cleanup_attempt_count, cleanup_last_error")
      .eq("cleanup_status", "failed")
      .order("expires_at", { ascending: false })
      .limit(25),
  ]);

  const bookings = data ?? [];

  return (
    <div className="space-y-6">
      <RealtimeRefresh channel="admin-bookings" table="bookings" />
      <RealtimeRefresh
        channel="admin-booking-disputes"
        table="booking_disputes"
      />
      <PageHeader
        title="Booking oversight"
        description="Active and recently-closed hourly and quote bookings, including payment and cleanup exceptions."
      />
      {failedDrafts?.length ? (
        <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">
            {failedDrafts.length} expired payment hold cleanup
            {failedDrafts.length === 1 ? "" : "s"} need attention
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            {failedDrafts.map((draft) => (
              <li key={draft.id}>
                Draft {draft.id.slice(0, 8)} · {draft.cleanup_attempt_count} attempts
                {draft.cleanup_last_error
                  ? ` · ${draft.cleanup_last_error}`
                  : ""}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {bookings.length === 0 ? (
        <EmptyState title="No hourly bookings yet">
          Active and closed hourly bookings will show up here for oversight.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {bookings.map((booking) => {
            const dispute = Array.isArray(booking.dispute)
              ? booking.dispute[0]
              : booking.dispute;
            return (
              <li key={booking.id}>
                <Link href={`/admin/bookings/${booking.id}`} className="block">
                  <Card className="p-4 transition-colors hover:border-crew-300">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-display text-base font-semibold">
                          {booking.service_name_snapshot ?? "Booking"}
                          {dispute?.status === "open" ? (
                            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                              Disputed
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-sm text-ink-soft">
                          {booking.customer_name_snapshot ?? "Customer"} ·{" "}
                          {booking.provider_display_name_snapshot ?? "Provider"}
                        </p>
                        <p className="mt-0.5 text-xs text-mist">
                          {booking.scheduled_at
                            ? formatDateTime(booking.scheduled_at)
                            : booking.requested_local_date ??
                              "Exact time pending"}
                        </p>
                      </div>
                      <StatusPill status={booking.status} />
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
