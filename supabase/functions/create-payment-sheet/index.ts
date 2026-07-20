// create-payment-sheet — first-hour PaymentSheet bootstrap for mobile
// (iOS arch A-4; hourly_v1 only). Contract of record:
// packages/core/src/contracts/edge.ts (createPaymentSheet*).
//
// Mirrors the privileged tail of the web confirm action
// (apps/web/app/(customer)/bookings/[id]/confirm/actions.ts):
// the mobile app first records BOTH legal acceptances itself via RLS inserts
// (booking_addendum + payment_authorization — content generation stays
// client/core-side, exactly like the web action's own inserts), then calls
// this function, which:
//
//   1. verifies the caller is the booking's customer and the booking is an
//      `accepted` hourly_v1 with an open payment window (all via the caller's
//      JWT-scoped client, so RLS stays the authority);
//   2. verifies both acceptances exist — it never generates their content;
//   3. calls begin_first_hour_payment AS THE USER (persists exactly one
//      attempt before any Stripe call, so retries can't double-charge);
//   4. ensures the platform Stripe Customer, creates the destination-charge
//      PaymentIntent with the DB-issued amounts + idempotency key, attaches
//      the intent id, and returns the PaymentSheet bundle.
//
// Amounts and states ALWAYS come from the DB (begin RPC row), never the
// client. The booking flips accepted → booked only from the stripe-webhook
// function. verify_jwt stays ON (platform default) — this is user-invoked.
//
// Secrets: STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY.

import Stripe from "npm:stripe@22";
import { createClient } from "npm:@supabase/supabase-js@2";

// Pinned to the version the payment code was written against; also the
// apiVersion bound into the ephemeral key handed to PaymentSheet.
const STRIPE_API_VERSION = "2026-06-24.dahlia";

// Mirrors HOURLY_AUTHORIZATION_VERSION in apps/web/lib/booking/policy.ts —
// begin_first_hour_payment records which authorization text version the
// customer accepted. Bump BOTH places together.
const HOURLY_AUTHORIZATION_VERSION = "hourly-v1-saved-method-2026-07-15";

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

/** Row returned by begin_first_hour_payment (lib/db/types.ts is canonical). */
type PaymentAttempt = {
  amount_cents: number;
  application_fee_cents: number;
  idempotency_key: string;
  payment_id: string;
};

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

    // The caller's own client loads the booking, so RLS decides visibility.
    const { data: booking } = await userClient
      .from("bookings")
      .select(
        "id, customer_id, provider_id, booking_flow, status, initial_payment_due_at, hourly_rate_cents_snapshot, estimated_minutes",
      )
      .eq("id", bookingId)
      .maybeSingle();
    if (!booking || booking.customer_id !== user.id) {
      return fail("not_found", "Booking not found.", 404);
    }
    if (booking.booking_flow !== "hourly_v1") {
      return fail(
        "unsupported_flow",
        "This booking doesn’t use hourly payment.",
        409,
      );
    }
    if (booking.status !== "accepted") {
      return fail(
        "wrong_status",
        "This booking isn’t awaiting the first-hour payment.",
        409,
      );
    }
    if (
      booking.initial_payment_due_at &&
      new Date(booking.initial_payment_due_at) <= new Date()
    ) {
      return fail(
        "payment_window_closed",
        "The first-hour payment window has closed for this booking.",
        409,
      );
    }
    if (
      booking.hourly_rate_cents_snapshot === null ||
      booking.estimated_minutes === null ||
      !booking.initial_payment_due_at
    ) {
      return fail(
        "missing_terms",
        "This booking is missing its hourly payment terms.",
        409,
      );
    }

    // Both acceptances must already exist (the app records them via RLS
    // before calling). This guard keeps the payment path unreachable without
    // signed terms, without this function ever generating legal content.
    const { data: acceptances } = await userClient
      .from("legal_acceptances")
      .select("kind")
      .eq("booking_id", booking.id)
      .eq("user_id", user.id)
      .in("kind", ["booking_addendum", "payment_authorization"]);
    const kinds = new Set((acceptances ?? []).map((row) => row.kind));
    if (!kinds.has("booking_addendum") || !kinds.has("payment_authorization")) {
      return fail(
        "acceptance_required",
        "Accept the booking risk addendum and payment authorization first.",
        409,
      );
    }

    // Persist exactly one first-hour attempt BEFORE any Stripe call. Runs as
    // the user, same as the web action — the RPC enforces state + identity.
    const { data: begunRow, error: beginError } = await userClient
      .rpc("begin_first_hour_payment", {
        p_booking_id: booking.id,
        p_authorization_version: HOURLY_AUTHORIZATION_VERSION,
      })
      .maybeSingle();
    const begun = begunRow as PaymentAttempt | null;
    if (beginError || !begun) {
      return fail(
        "begin_failed",
        "Could not start the first-hour payment. Try again.",
        409,
      );
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const publishableKey = Deno.env.get("STRIPE_PUBLISHABLE_KEY");
    if (!stripeKey || !publishableKey) {
      return fail("unconfigured", "Payments aren’t configured yet.", 503);
    }
    const stripe = new Stripe(stripeKey, { apiVersion: STRIPE_API_VERSION });

    const admin = createClient<any>(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // One platform Customer per user (port of lib/stripe/customers.ts):
    // deterministic Stripe idempotency key + upsert-then-reselect tolerate
    // concurrent creates.
    const { data: existingCustomer } = await admin
      .from("stripe_customers")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    let customerId = existingCustomer?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const created = await stripe.customers.create(
        {
          email: user.email ?? undefined,
          metadata: { cc_user_id: user.id },
        },
        { idempotencyKey: `cc_customer_${user.id}` },
      );
      await admin
        .from("stripe_customers")
        .upsert(
          { user_id: user.id, stripe_customer_id: created.id },
          { onConflict: "user_id", ignoreDuplicates: true },
        );
      const { data: settled } = await admin
        .from("stripe_customers")
        .select("stripe_customer_id")
        .eq("user_id", user.id)
        .maybeSingle();
      customerId = (settled?.stripe_customer_id as string | undefined) ?? created.id;
    }

    // Connected-account ids are private provider data — read only after the
    // customer-owned booking above authorized this operation.
    const { data: providerPayout } = await admin
      .from("provider_profiles")
      .select("stripe_account_id")
      .eq("id", booking.provider_id)
      .maybeSingle();
    if (!providerPayout?.stripe_account_id) {
      return fail("unconfigured", "This provider can’t receive payments yet.", 503);
    }

    // Destination charge with the DB-issued amount/fee + idempotency key;
    // saves the method off_session for the later balance charge.
    const intent = await stripe.paymentIntents.create(
      {
        amount: begun.amount_cents,
        currency: "usd",
        customer: customerId,
        application_fee_amount: begun.application_fee_cents,
        transfer_data: { destination: providerPayout.stripe_account_id },
        metadata: { booking_id: booking.id, payment_kind: "first_hour" },
        setup_future_usage: "off_session",
        automatic_payment_methods: { enabled: true },
      },
      { idempotencyKey: begun.idempotency_key },
    );
    if (!intent.client_secret) {
      return fail("unconfigured", "Payments aren’t configured yet.", 503);
    }

    const { error: attachError } = await userClient.rpc(
      "attach_first_hour_payment_intent",
      {
        p_booking_id: booking.id,
        p_stripe_payment_intent_id: intent.id,
        p_stripe_customer_id: customerId,
      },
    );
    if (attachError) {
      return fail("attach_failed", "Could not record the payment. Try again.", 409);
    }

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: STRIPE_API_VERSION },
    );
    if (!ephemeralKey.secret) {
      return fail("unconfigured", "Payments aren’t configured yet.", 503);
    }

    return json({
      clientSecret: intent.client_secret,
      ephemeralKey: ephemeralKey.secret,
      customerId,
      publishableKey,
      amountCents: begun.amount_cents,
    });
  } catch (cause) {
    console.error("create-payment-sheet failed:", cause);
    return fail("internal", "Unexpected payment error.", 500);
  }
});
