import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusPill } from "@/components/status-pill";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime, formatMoney } from "@/lib/utils";

import { ResolutionPanel } from "./resolution-panel";

export const metadata: Metadata = { title: "Booking oversight" };

function formatMinutes(minutes: number | null) {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h ? `${h} hr ` : ""}${m ? `${m} min` : h ? "" : "0 min"}`.trim();
}

export default async function AdminBookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireRole("admin");
  // booking_payments/refunds/audit are server-only, so oversight reads use the
  // admin client — always after the requireRole("admin") gate above.
  const admin = createAdminClient();

  const { data: booking } = await admin
    .from("bookings")
    .select(
      `id, status, booking_flow, scheduled_at, arrived_at, work_completed_at,
       estimated_minutes, hourly_rate_cents_snapshot, cancellation_reason,
       cancellation_policy_result, cancelled_by_role,
       customer_name_snapshot, provider_display_name_snapshot,
       service_name_snapshot`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!booking) notFound();

  const [
    { data: invoice },
    { data: payments },
    { data: refunds },
    { data: dispute },
    { data: events },
  ] = await Promise.all([
    admin
      .from("booking_invoices")
      .select(
        "submitted_minutes, subtotal_cents, total_platform_fee_cents, remaining_balance_cents, first_hour_credit_cents, status, provider_explanation",
      )
      .eq("booking_id", id)
      .maybeSingle(),
    admin
      .from("booking_payments")
      .select("kind, amount_cents, application_fee_cents, status")
      .eq("booking_id", id)
      .order("created_at", { ascending: true }),
    admin
      .from("booking_refunds")
      .select("amount_cents, reason, status")
      .eq("booking_id", id)
      .order("created_at", { ascending: true }),
    admin
      .from("booking_disputes")
      .select(
        "category, narrative, status, opened_at, resolution_kind, audit_note, resolved_at",
      )
      .eq("booking_id", id)
      .maybeSingle(),
    admin
      .from("booking_audit_events")
      .select("action, actor_kind, from_status, to_status, created_at")
      .eq("booking_id", id)
      .order("created_at", { ascending: true }),
  ]);

  const overEstimate =
    invoice?.submitted_minutes != null &&
    booking.estimated_minutes != null &&
    invoice.submitted_minutes > booking.estimated_minutes;

  return (
    <div className="space-y-6">
      <PageHeader
        title={booking.service_name_snapshot ?? "Booking"}
        description={`${booking.customer_name_snapshot ?? "Customer"} · ${booking.provider_display_name_snapshot ?? "Provider"}`}
        actions={
          <Link
            href="/admin/disputes"
            className={buttonClasses({ variant: "ghost", size: "sm" })}
          >
            ← Disputes
          </Link>
        }
      />

      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-ink-soft">
            {formatDateTime(booking.scheduled_at)}
          </p>
          <StatusPill status={booking.status} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
          <div>
            <dt className="text-mist">Estimated</dt>
            <dd>{formatMinutes(booking.estimated_minutes)}</dd>
          </div>
          <div>
            <dt className="text-mist">Submitted</dt>
            <dd className={overEstimate ? "font-semibold text-gold-800" : ""}>
              {formatMinutes(invoice?.submitted_minutes ?? null)}
            </dd>
          </div>
          <div>
            <dt className="text-mist">Arrived</dt>
            <dd>{booking.arrived_at ? formatDateTime(booking.arrived_at) : "—"}</dd>
          </div>
          <div>
            <dt className="text-mist">Completed</dt>
            <dd>
              {booking.work_completed_at
                ? formatDateTime(booking.work_completed_at)
                : "—"}
            </dd>
          </div>
        </dl>
        {overEstimate && invoice?.provider_explanation ? (
          <div className="mt-4 rounded-lg border border-gold-300 bg-gold-100 p-3 text-sm text-gold-800">
            <p className="font-semibold">Overage explanation</p>
            <p className="mt-1">{invoice.provider_explanation}</p>
          </div>
        ) : null}
        {booking.cancellation_reason ? (
          <p className="mt-4 border-t border-line pt-3 text-sm text-ink-soft">
            Cancelled by {booking.cancelled_by_role ?? "—"} ·{" "}
            {booking.cancellation_policy_result ?? "—"} —{" "}
            {booking.cancellation_reason}
          </p>
        ) : null}
      </Card>

      <Card className="p-5">
        <h2 className="font-display text-lg font-semibold">Money</h2>
        {invoice ? (
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-mist">Invoice subtotal</dt>
              <dd>{formatMoney(invoice.subtotal_cents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-mist">Remaining balance</dt>
              <dd>{formatMoney(invoice.remaining_balance_cents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-mist">Invoice status</dt>
              <dd>{invoice.status}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-mist">No invoice submitted.</p>
        )}
        <div className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
          {(payments ?? []).map((p, i) => (
            <div key={`p${i}`} className="flex justify-between">
              <dt className="text-mist">
                {p.kind === "first_hour" ? "First hour" : "Balance"} payment
              </dt>
              <dd>
                {formatMoney(p.amount_cents)} · {p.status}
              </dd>
            </div>
          ))}
          {(refunds ?? []).map((r, i) => (
            <div key={`r${i}`} className="flex justify-between text-quad-700">
              <dt>Refund ({r.reason})</dt>
              <dd>
                – {formatMoney(r.amount_cents)} · {r.status}
              </dd>
            </div>
          ))}
        </div>
      </Card>

      {dispute ? (
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Dispute</h2>
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              {dispute.category} · {dispute.status}
            </span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm">{dispute.narrative}</p>
          <p className="mt-2 text-xs text-mist">
            Opened {formatDateTime(dispute.opened_at)}
          </p>

          {dispute.status === "open" ? (
            <div className="mt-4 border-t border-line pt-4">
              <ResolutionPanel
                bookingId={booking.id}
                submittedMinutes={invoice?.submitted_minutes ?? null}
              />
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-quad-200 bg-quad-50 p-3 text-sm text-quad-800">
              <p className="font-semibold">
                Resolved: {dispute.resolution_kind}
              </p>
              {dispute.audit_note ? (
                <p className="mt-1">{dispute.audit_note}</p>
              ) : null}
              <p className="mt-1 text-xs text-quad-700">
                {dispute.resolved_at
                  ? formatDateTime(dispute.resolved_at)
                  : null}
              </p>
            </div>
          )}
        </Card>
      ) : null}

      <Card className="p-5">
        <h2 className="font-display text-lg font-semibold">Timeline</h2>
        <ol className="mt-3 space-y-2 text-sm">
          {(events ?? []).map((e, i) => (
            <li key={i} className="flex justify-between gap-4">
              <span>
                <span className="font-medium">{e.action}</span>{" "}
                <span className="text-mist">({e.actor_kind})</span>
              </span>
              <span className="text-mist">{formatDateTime(e.created_at)}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
