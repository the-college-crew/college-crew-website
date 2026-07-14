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
import { cn, formatDateTime, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Disputes" };

type DisputeRow = {
  id: string;
  booking_id: string;
  category: string;
  status: string;
  opened_at: string;
  resolution_kind: string | null;
  booking: {
    service_name_snapshot: string | null;
    provider_display_name_snapshot: string | null;
    customer_name_snapshot: string | null;
    status: BookingStatus;
  } | null;
};

export default async function AdminDisputesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  await requireRole("admin");
  const showResolved = status === "resolved";
  const admin = createAdminClient();

  const [{ data: disputesData }, { data: cardData }] = await Promise.all([
    admin
      .from("booking_disputes")
      .select(
        `id, booking_id, category, status, opened_at, resolution_kind,
         booking:bookings(service_name_snapshot, provider_display_name_snapshot,
           customer_name_snapshot, status)`,
      )
      .eq("status", showResolved ? "resolved" : "open")
      .order("opened_at", { ascending: false }),
    admin
      .from("stripe_disputes")
      .select("id, stripe_dispute_id, status, reason, amount_cents, booking_id, created_at")
      .order("created_at", { ascending: false }),
  ]);

  const disputes = (disputesData ?? []) as unknown as DisputeRow[];
  const cardDisputes = cardData ?? [];

  const tabClass = (active: boolean) =>
    cn(
      "rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
      active ? "bg-crew-600 text-white" : "text-ink-soft hover:bg-crew-50",
    );

  return (
    <div className="space-y-6">
      <RealtimeRefresh channel="admin-disputes" table="booking_disputes" />
      <PageHeader
        title="Disputes"
        description="Founder-reviewed booking disputes. Card-network disputes are tracked separately below."
      />

      <div
        role="tablist"
        aria-label="Dispute filters"
        className="inline-flex gap-1 rounded-xl border border-line bg-court p-1"
      >
        <Link role="tab" aria-selected={!showResolved} href="/admin/disputes" className={tabClass(!showResolved)}>
          Open
        </Link>
        <Link
          role="tab"
          aria-selected={showResolved}
          href="/admin/disputes?status=resolved"
          className={tabClass(showResolved)}
        >
          Resolved
        </Link>
      </div>

      {disputes.length === 0 ? (
        <EmptyState title={showResolved ? "No resolved disputes" : "No open disputes"}>
          {showResolved
            ? "Resolved disputes will show up here with their audited outcome."
            : "When a customer reports a problem, it appears here for review."}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {disputes.map((dispute) => (
            <li key={dispute.id}>
              <Link href={`/admin/bookings/${dispute.booking_id}`} className="block">
                <Card className="p-4 transition-colors hover:border-crew-300">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-display text-base font-semibold">
                        {dispute.booking?.service_name_snapshot ?? "Booking"}
                      </p>
                      <p className="mt-0.5 text-sm text-ink-soft">
                        {dispute.booking?.customer_name_snapshot ?? "Customer"} ·{" "}
                        {dispute.booking?.provider_display_name_snapshot ?? "Provider"}
                      </p>
                      <p className="mt-0.5 text-xs text-mist">
                        {dispute.category} · opened {formatDateTime(dispute.opened_at)}
                        {dispute.resolution_kind
                          ? ` · ${dispute.resolution_kind}`
                          : ""}
                      </p>
                    </div>
                    {dispute.booking ? (
                      <StatusPill status={dispute.booking.status} />
                    ) : null}
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="card-disputes" className="space-y-3">
        <h2 id="card-disputes" className="font-display text-lg font-semibold">
          Card-network disputes
        </h2>
        {cardDisputes.length === 0 ? (
          <p className="text-sm text-mist">
            No external card disputes. These are recorded from Stripe and kept
            separate from internal disputes — resolving one never touches the other.
          </p>
        ) : (
          <ul className="space-y-2">
            {cardDisputes.map((card) => (
              <li key={card.id}>
                <Card className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                  <div>
                    <p className="font-medium">
                      {card.stripe_dispute_id}{" "}
                      <span className="text-mist">· {card.reason ?? "—"}</span>
                    </p>
                    <p className="text-xs text-mist">
                      {card.amount_cents != null
                        ? formatMoney(card.amount_cents)
                        : "—"}{" "}
                      · {formatDateTime(card.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold">
                      {card.status ?? "unknown"}
                    </span>
                    {card.booking_id ? (
                      <Link
                        href={`/admin/bookings/${card.booking_id}`}
                        className="text-xs underline"
                      >
                        View booking
                      </Link>
                    ) : null}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
