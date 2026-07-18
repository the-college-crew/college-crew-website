import type { Metadata } from "next";
import Link from "next/link";

import { StatusPill } from "@/components/status-pill";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
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

  const { data } = await admin
    .from("bookings")
    .select(
      `id, status, scheduled_at, service_name_snapshot,
       customer_name_snapshot, provider_display_name_snapshot,
       dispute:booking_disputes(status)`,
    )
    .eq("booking_flow", "hourly_v1")
    .in("status", OVERSIGHT_STATUSES)
    .order("scheduled_at", { ascending: false })
    .limit(100);

  const bookings = data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Booking oversight"
        description="Active and recently-closed hourly bookings. Open one to review the timeline, money, and any dispute."
      />
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
                          {formatDateTime(booking.scheduled_at)}
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
