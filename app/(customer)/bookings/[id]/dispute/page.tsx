import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { StatusPill } from "@/components/status-pill";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";

import { DisputeForm, type DisputeCategory } from "./dispute-form";

export const metadata: Metadata = { title: "Report a problem" };

const LATE_WINDOW_MS = 7 * 24 * 3_600_000;

const RESOLUTION_COPY: Record<string, string> = {
  approve_submitted_hours: "The submitted hours were approved.",
  reduce_billable_minutes: "The billable time was reduced.",
  waive_remaining_balance: "The remaining balance was waived.",
  cancel_and_refund: "The booking was cancelled and refunded.",
};

export default async function DisputePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ category?: string; opened?: string }>;
}) {
  const [{ id }, { category: categoryParam, opened }] = await Promise.all([
    params,
    searchParams,
  ]);
  const user = await requireUser();
  const supabase = await createClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select(
      `id, customer_id, booking_flow, status, scheduled_at, arrived_at,
       service:services(name), provider:provider_profiles(display_name)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!booking || booking.customer_id !== user.id) notFound();
  if (booking.booking_flow !== "hourly_v1") redirect("/dashboard");

  const service = Array.isArray(booking.service)
    ? booking.service[0]
    : booking.service;
  const provider = Array.isArray(booking.provider)
    ? booking.provider[0]
    : booking.provider;
  const heading = `${service?.name ?? "Booking"} with ${provider?.display_name ?? "your provider"}`;

  const { data: dispute } = await supabase
    .from("booking_disputes")
    .select(
      "id, category, narrative, status, opened_at, resolution_kind, audit_note, resolved_at",
    )
    .eq("booking_id", id)
    .maybeSingle();

  // Existing case: show it (customers can view but never re-open a duplicate).
  if (dispute) {
    return (
      <div className="space-y-6">
        <PageHeader title="Your dispute" description={heading} />
        {opened ? (
          <div className="rounded-lg border border-quad-200 bg-quad-50 p-4 text-sm text-quad-800">
            Thanks. A founder will review this and follow up. Payment is paused
            while it’s open.
          </div>
        ) : null}
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="font-display text-lg font-semibold">
              {dispute.status === "resolved" ? "Resolved" : "Under review"}
            </p>
            <StatusPill status={booking.status} />
          </div>
          <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-mist">Opened</dt>
              <dd>{formatDateTime(dispute.opened_at)}</dd>
            </div>
          </dl>
          <div className="mt-4 border-t border-line pt-4 text-sm">
            <p className="text-mist">Your report</p>
            <p className="mt-1 whitespace-pre-wrap">{dispute.narrative}</p>
          </div>
          {dispute.status === "resolved" ? (
            <div className="mt-4 rounded-lg border border-quad-200 bg-quad-50 p-3 text-sm text-quad-800">
              <p className="font-semibold">
                {RESOLUTION_COPY[dispute.resolution_kind ?? ""] ??
                  "This dispute was resolved."}
              </p>
            </div>
          ) : null}
          <Link
            href="/dashboard"
            className={buttonClasses({ variant: "secondary", size: "sm" })}
            style={{ marginTop: "1rem" }}
          >
            Back to bookings
          </Link>
        </Card>
      </div>
    );
  }

  // No existing dispute — derive eligibility and the offered categories exactly
  // as open_booking_dispute does, so the page never offers an impossible action.
  const now = new Date().getTime();
  const startPassed = new Date(booking.scheduled_at).getTime() <= now;

  let categories: DisputeCategory[] | null = null;

  if (booking.status === "booked" && startPassed && !booking.arrived_at) {
    categories = ["provider_no_show", "other"];
  } else if (
    booking.status === "in_progress" ||
    booking.status === "invoice_review"
  ) {
    categories = ["hours", "service", "payment", "cancellation", "other"];
  } else if (booking.status === "completed") {
    const { data: invoice } = await supabase
      .from("booking_invoices")
      .select("resolved_at")
      .eq("booking_id", id)
      .maybeSingle();
    const finalChargeAt = invoice?.resolved_at
      ? new Date(invoice.resolved_at).getTime()
      : null;
    if (finalChargeAt != null && now <= finalChargeAt + LATE_WINDOW_MS) {
      categories = ["hours", "service", "payment", "other"];
    }
  }

  if (!categories) {
    return (
      <div className="space-y-6">
        <PageHeader title="Report a problem" description={heading} />
        <Card className="p-5 text-sm text-ink-soft">
          <p>
            This booking can’t be disputed right now. Disputes are available
            while a job is underway, during invoice review, for a no-show after
            the start time, or for seven days after the final payment.
          </p>
          <Link
            href="/dashboard"
            className={buttonClasses({ variant: "secondary", size: "sm" })}
            style={{ marginTop: "0.75rem" }}
          >
            Back to bookings
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Report a problem" description={heading} />
      <Card className="p-5">
        <DisputeForm
          bookingId={booking.id}
          categories={categories}
          defaultCategory={categoryParam as DisputeCategory | undefined}
        />
      </Card>
      <p className="text-xs text-mist">
        This is separate from{" "}
        <Link href="/support" className="underline">
          general support
        </Link>
        . Opening a dispute pauses any pending final charge while a founder
        reviews it.
      </p>
    </div>
  );
}
