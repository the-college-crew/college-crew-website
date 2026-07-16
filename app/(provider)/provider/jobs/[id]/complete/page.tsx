import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusPill } from "@/components/status-pill";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  getOwnProviderProfile,
  requireProviderAccess,
} from "@/lib/auth/session";
import { billableMinutesFromElapsed } from "@/lib/booking/policy";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatMoney } from "@/lib/utils";

import { ProviderInvoiceForm } from "./provider-invoice-form";

export const metadata: Metadata = { title: "Complete job" };

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} hr`;
  return `${hours} hr ${rest} min`;
}

export default async function CompleteJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireProviderAccess(`/provider/jobs/${id}/complete`);
  const profile = await getOwnProviderProfile();
  if (!profile) notFound();

  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      `id, provider_id, status, scheduled_at, arrived_at, work_completed_at,
       estimated_minutes, hourly_rate_cents_snapshot, service:services(name),
       customer:profiles!bookings_customer_id_fkey(full_name)`,
    )
    .eq("id", id)
    .eq("provider_id", profile.id)
    .maybeSingle();
  if (!booking) notFound();

  const { data: invoice } = await supabase
    .from("booking_invoices")
    .select(
      `submitted_minutes, provider_explanation, subtotal_cents,
       total_platform_fee_cents, remaining_balance_cents, status`,
    )
    .eq("booking_id", id)
    .maybeSingle();

  const service = Array.isArray(booking.service)
    ? booking.service[0]
    : booking.service;
  const customer = Array.isArray(booking.customer)
    ? booking.customer[0]
    : booking.customer;
  const estimatedMinutes = booking.estimated_minutes ?? 60;
  const rateCents = booking.hourly_rate_cents_snapshot ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Complete job & invoice"
        description={`${service?.name ?? "Service"} for ${customer?.full_name ?? "your customer"}`}
      />

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 text-sm text-ink-soft">
          <div>
            <p>{formatDateTime(booking.scheduled_at)}</p>
            {booking.arrived_at ? (
              <p className="mt-0.5 text-xs text-mist">
                Arrived {formatDateTime(booking.arrived_at)}
              </p>
            ) : null}
          </div>
          <StatusPill status={booking.status} />
        </div>
      </Card>

      {invoice ? (
        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold">Invoice submitted</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-mist">Billable time</dt>
              <dd>{formatMinutes(invoice.submitted_minutes)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-mist">Invoice total</dt>
              <dd>{formatMoney(invoice.subtotal_cents)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="font-semibold">Your payout</dt>
              <dd className="font-semibold text-quad-700">
                {formatMoney(
                  invoice.subtotal_cents - invoice.total_platform_fee_cents,
                )}
              </dd>
            </div>
          </dl>
          <p className="mt-3 border-t border-line pt-3 text-xs text-mist">
            {booking.status === "completed"
              ? "Paid in full."
              : "The customer has 24 hours to confirm; otherwise the saved card is charged automatically."}
          </p>
          <Link
            href="/provider/jobs"
            className={buttonClasses({ variant: "secondary", size: "sm" })}
            style={{ marginTop: "0.75rem" }}
          >
            Back to jobs
          </Link>
        </Card>
      ) : booking.status === "in_progress" ? (
        <ProviderInvoiceForm
          bookingId={booking.id}
          prefillMinutes={billableMinutesFromElapsed(
            booking.arrived_at
              ? (new Date().getTime() -
                  new Date(booking.arrived_at).getTime()) /
                  60000
              : estimatedMinutes,
          )}
          estimatedMinutes={estimatedMinutes}
          rateCents={rateCents}
        />
      ) : booking.status === "booked" ? (
        <Card className="p-5 text-sm text-ink-soft">
          <p>Mark yourself arrived from Jobs before submitting the invoice.</p>
          <Link
            href="/provider/jobs"
            className={buttonClasses({ variant: "secondary", size: "sm" })}
            style={{ marginTop: "0.75rem" }}
          >
            Back to jobs
          </Link>
        </Card>
      ) : (
        <Card className="p-5 text-sm text-ink-soft">
          <p>This job isn&apos;t ready to invoice.</p>
          <Link
            href="/provider/jobs"
            className={buttonClasses({ variant: "secondary", size: "sm" })}
            style={{ marginTop: "0.75rem" }}
          >
            Back to jobs
          </Link>
        </Card>
      )}
    </div>
  );
}
