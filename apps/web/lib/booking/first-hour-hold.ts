import "server-only";

import {
  cancelFirstHourAuthorization,
  captureFirstHourPayment,
} from "@/lib/stripe/connect";
import { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Instant-book first-hour hold lifecycle. The first hour is AUTHORIZED at
 * request time (a manual-capture PaymentIntent left in `requires_capture`), then
 * either CAPTURED when the provider accepts or RELEASED when they decline / the
 * 2h response window lapses. Releasing cancels the hold with no charge and no
 * refund — the customer's money never actually moved.
 *
 * Both operations are server-only, admin-scoped (they read a provider-linked
 * payment row), and idempotent so the accept action, the decline action, the
 * scheduler job, and an opportunistic dashboard sweep can all call them safely.
 */

type FirstHourPayment = {
  id: string;
  stripe_payment_intent_id: string | null;
  status: string;
};

async function loadFirstHourPayment(
  bookingId: string,
): Promise<FirstHourPayment | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("booking_payments")
    .select("id, stripe_payment_intent_id, status")
    .eq("booking_id", bookingId)
    .eq("kind", "first_hour")
    .maybeSingle();
  return data ?? null;
}

/**
 * Capture the held first hour when the provider accepts. The
 * `payment_intent.succeeded` webhook then advances accepted → booked via
 * `settle_first_hour_payment`; we do not flip status here.
 */
export async function captureFirstHourHold(
  bookingId: string,
): Promise<"captured" | "already" | "not_found" | "unconfigured"> {
  const payment = await loadFirstHourPayment(bookingId);
  if (!payment?.stripe_payment_intent_id) return "not_found";
  if (payment.status === "succeeded") return "already";

  const result = await captureFirstHourPayment({
    paymentIntentId: payment.stripe_payment_intent_id,
    idempotencyKey: `fhcap_${bookingId}`,
  });
  return result.configured ? "captured" : "unconfigured";
}

/**
 * Release the hold on decline / timeout / cancellation of an unaccepted
 * request. Cancelling the intent drops the authorization; we also mark the
 * payment row cancelled immediately (the `payment_intent.canceled` webhook
 * reconciles the same thing). Never touches an already succeeded/settled hold.
 */
export async function releaseFirstHourHold(
  bookingId: string,
): Promise<"released" | "skip" | "not_found" | "unconfigured"> {
  const payment = await loadFirstHourPayment(bookingId);
  if (!payment?.stripe_payment_intent_id) return "not_found";
  if (
    payment.status === "succeeded" ||
    payment.status === "cancelled" ||
    payment.status === "refunded"
  ) {
    return "skip";
  }

  const result = await cancelFirstHourAuthorization({
    paymentIntentId: payment.stripe_payment_intent_id,
  });
  if (!result.configured) return "unconfigured";

  const admin = createAdminClient();
  await admin
    .from("booking_payments")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", payment.id)
    .neq("status", "succeeded");
  return "released";
}

/**
 * Opportunistic sweep for a dashboard render: expire any hourly request whose
 * 2h response window has lapsed, then release the held first hour for requests
 * that ended without acceptance (expired / declined / cancelled). Idempotent
 * and safe to call on every render; Stripe's 7-day authorization expiry is the
 * final backstop if this never runs.
 */
export async function sweepInstantBookHolds(
  supabase: ServerClient,
  rows: Array<{
    id: string;
    booking_flow: string;
    status: string;
    response_alert_at: string | null;
  }>,
): Promise<Set<string>> {
  const now = Date.now();
  const expired = new Set<string>();
  await Promise.all(
    rows.map(async (row) => {
      if (row.booking_flow !== "hourly_v1") return;
      let status = row.status;
      if (
        status === "requested" &&
        row.response_alert_at != null &&
        new Date(row.response_alert_at).getTime() <= now
      ) {
        const { data } = await supabase.rpc("expire_hourly_booking_request", {
          p_booking_id: row.id,
        });
        if (data) {
          status = "expired";
          expired.add(row.id);
        }
      }
      if (status === "expired" || status === "declined" || status === "cancelled") {
        await releaseFirstHourHold(row.id).catch(() => {});
      }
    }),
  );
  return expired;
}
