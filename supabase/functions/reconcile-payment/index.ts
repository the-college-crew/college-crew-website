// reconcile-payment — post-PaymentSheet launch sweep (iOS arch A-4, P-4).
// Contract of record: packages/core/src/contracts/edge.ts (reconcilePayment*).
//
// A cold-started app (or a PaymentSheet completion the webhook hasn't caught
// up with) calls this to force the booking's payment state current: it
// re-reads the live PaymentIntent from Stripe and applies the SAME idempotent
// settlement RPCs the stripe-webhook function uses, then returns the fresh
// booking status. Racing the webhook is safe by design — every RPC is
// state-guarded, and the late-success refund shares the webhook's
// fhr_<bookingId> idempotency key so a double delivery cannot double-refund.
//
// Deliberately conservative mapping of live intent status:
//   succeeded → settle_{first_hour,balance}_payment (success time taken from
//               the charge, NOT now(), so the late-payment refund decision
//               stays correct);
//   canceled  → mark_*_payment_unsuccessful (terminal on Stripe's side);
//   anything else (requires_action, requires_payment_method, processing…)
//             → no-op: the customer may still complete payment.
//
// Caller must be a booking participant (customer or the provider's owner) —
// re-derived server-side. verify_jwt stays ON. Secrets: STRIPE_SECRET_KEY.

import Stripe from "npm:stripe@22";
import { createClient } from "npm:@supabase/supabase-js@2";

const STRIPE_API_VERSION = "2026-06-24.dahlia";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const fail = (code: string, message: string, status: number) =>
  json({ error: { code, message } }, status);

// deno-lint-ignore no-explicit-any — generated Database types aren't
// importable here until packages/db is extracted.
type AdminClient = ReturnType<typeof createClient<any>>;

/** Success time from the intent's charge — never now() (refund decisions). */
function chargeSucceededAtIso(intent: Stripe.PaymentIntent): string {
  const charge =
    intent.latest_charge && typeof intent.latest_charge !== "string"
      ? intent.latest_charge
      : null;
  const epochSeconds = charge?.created ?? intent.created;
  return new Date(epochSeconds * 1000).toISOString();
}

async function reconcileFirstHour(
  admin: AdminClient,
  stripe: Stripe,
  bookingId: string,
  paymentIntentId: string,
) {
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge"],
  });

  if (intent.status === "succeeded") {
    const paymentMethodId =
      typeof intent.payment_method === "string"
        ? intent.payment_method
        : (intent.payment_method?.id ?? undefined);
    const { data: outcome } = await admin.rpc("settle_first_hour_payment", {
      p_stripe_payment_intent_id: intent.id,
      p_stripe_payment_method_id: paymentMethodId,
      p_succeeded_at: chargeSucceededAtIso(intent),
    });
    if (outcome === "refund_owed") {
      // Same key as the webhook path — whichever runs second is a no-op.
      const refund = await stripe.refunds.create(
        {
          payment_intent: intent.id,
          reverse_transfer: true,
          refund_application_fee: true,
        },
        { idempotencyKey: `fhr_${bookingId}` },
      );
      await admin.rpc("record_first_hour_refund", {
        p_stripe_payment_intent_id: intent.id,
        p_reason: "late_success_after_deadline",
        p_stripe_refund_id: refund.id,
        p_amount_cents: refund.amount,
      });
    }
    return;
  }

  if (intent.status === "canceled") {
    await admin.rpc("mark_first_hour_payment_unsuccessful", {
      p_stripe_payment_intent_id: intent.id,
      p_target_status: "cancelled",
      p_failure_code: intent.cancellation_reason ?? "canceled",
      p_failure_message: "PaymentIntent canceled",
    });
  }
}

async function reconcileBalance(
  admin: AdminClient,
  stripe: Stripe,
  paymentIntentId: string,
) {
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge"],
  });

  if (intent.status === "succeeded") {
    await admin.rpc("settle_balance_payment", {
      p_stripe_payment_intent_id: intent.id,
      p_succeeded_at: chargeSucceededAtIso(intent),
    });
    return;
  }

  if (intent.status === "canceled") {
    await admin.rpc("mark_balance_payment_unsuccessful", {
      p_stripe_payment_intent_id: intent.id,
      p_target_status: "cancelled",
      p_failure_code: intent.cancellation_reason ?? "canceled",
      p_failure_message: "PaymentIntent canceled",
    });
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return fail("method_not_allowed", "Use POST.", 405);
  }

  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) return fail("not_signed_in", "Not signed in.", 401);

    const userClient = createClient<any>(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return fail("not_signed_in", "Not signed in.", 401);

    const body = await request.json().catch(() => null);
    const bookingId =
      body && typeof body.bookingId === "string" ? body.bookingId : "";
    if (!UUID_RE.test(bookingId)) {
      return fail("bad_request", "bookingId must be a UUID.", 400);
    }

    const admin = createClient<any>(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Participant check re-derived server-side (provider ownership lives on
    // provider_profiles.user_id, which has no browser grant).
    const { data: booking } = await admin
      .from("bookings")
      .select("id, customer_id, provider_id, booking_flow, status")
      .eq("id", bookingId)
      .maybeSingle();
    if (!booking) return fail("not_found", "Booking not found.", 404);
    let isParticipant = booking.customer_id === user.id;
    if (!isParticipant) {
      const { data: provider } = await admin
        .from("provider_profiles")
        .select("user_id")
        .eq("id", booking.provider_id)
        .maybeSingle();
      isParticipant = provider?.user_id === user.id;
    }
    if (!isParticipant) return fail("not_found", "Booking not found.", 404);

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return fail("unconfigured", "Payments aren’t configured yet.", 503);
    }
    const stripe = new Stripe(stripeKey, { apiVersion: STRIPE_API_VERSION });

    if (booking.booking_flow === "hourly_v1") {
      // Only non-terminal DB rows with a known intent are worth re-reading.
      const { data: payments } = await admin
        .from("booking_payments")
        .select("kind, status, stripe_payment_intent_id")
        .eq("booking_id", booking.id)
        .in("kind", ["first_hour", "balance"]);

      for (const payment of payments ?? []) {
        if (!payment.stripe_payment_intent_id) continue;
        if (!["created", "requires_action", "processing"].includes(payment.status)) {
          continue;
        }
        if (payment.kind === "first_hour" && booking.status === "accepted") {
          await reconcileFirstHour(
            admin,
            stripe,
            booking.id,
            payment.stripe_payment_intent_id,
          );
        } else if (
          payment.kind === "balance" &&
          booking.status === "invoice_review"
        ) {
          await reconcileBalance(admin, stripe, payment.stripe_payment_intent_id);
        }
      }
    }

    const { data: fresh } = await admin
      .from("bookings")
      .select("status")
      .eq("id", booking.id)
      .maybeSingle();

    return json({ status: fresh?.status ?? booking.status });
  } catch (cause) {
    console.error("reconcile-payment failed:", cause);
    return fail("internal", "Unexpected reconcile error.", 500);
  }
});
