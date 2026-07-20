// settle-booking — remaining-balance settlement during invoice_review
// (iOS arch A-4; hourly_v1 only). Contract of record:
// packages/core/src/contracts/edge.ts (settleBooking*).
//
// Port of the web invoice actions
// (apps/web/app/(customer)/bookings/[id]/invoice/actions.ts):
//
//   mode "confirm" — zero balance settles with no charge
//   (settle_zero_balance_invoice); otherwise begin_balance_payment issues the
//   single attempt, the saved method is confirmed on-session, and the
//   outcome maps to: processing (webhook completes), payment_sheet_required
//   (bank wants authentication), or a 402 card_declined error (recorded via
//   mark_balance_payment_unsuccessful so the invoice becomes recoverable).
//
//   mode "recover" — reset_balance_payment_for_retry mints a fresh attempt
//   (new idempotency key, stale intent cleared) and returns an unconfirmed
//   intent as a PaymentSheet bundle to re-authenticate or collect a method.
//
// Ordering is sacred: create unconfirmed → attach → confirm. The settlement
// webhook can win a race against the attach, and an unattached success
// strands the invoice in review. Domain RPCs run AS THE USER (RLS + state
// guards are the authority); service role only reads booking_payments /
// provider connected-account ids and talks to Stripe. The booking flips to
// `completed` only from the stripe-webhook function.
//
// Secrets: STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY.

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
type UserClient = ReturnType<typeof createClient<any>>;

/** Saved off-session method + provider connected account (service role —
 * booking_payments is server-only; always AFTER the caller authorized on the
 * customer-owned booking). */
async function loadSavedMethod(
  admin: UserClient,
  bookingId: string,
  providerId: string,
) {
  const { data: firstHour } = await admin
    .from("booking_payments")
    .select("stripe_customer_id, stripe_payment_method_id")
    .eq("booking_id", bookingId)
    .eq("kind", "first_hour")
    .maybeSingle();
  if (!firstHour?.stripe_customer_id) return null;

  const { data: provider } = await admin
    .from("provider_profiles")
    .select("stripe_account_id")
    .eq("id", providerId)
    .maybeSingle();
  if (!provider?.stripe_account_id) return null;

  return {
    stripeCustomerId: firstHour.stripe_customer_id as string,
    stripePaymentMethodId: firstHour.stripe_payment_method_id as string | null,
    providerStripeAccountId: provider.stripe_account_id as string,
  };
}

/** Row returned by begin_balance_payment / reset_balance_payment_for_retry
 * (lib/db/types.ts is canonical; reset omits payment_id). */
type PaymentAttempt = {
  amount_cents: number;
  application_fee_cents: number;
  idempotency_key: string;
};

/** PaymentSheet bundle for an unconfirmed intent (authentication/recovery). */
async function paymentSheetBundle(
  stripe: Stripe,
  clientSecret: string,
  customerId: string,
  publishableKey: string,
) {
  const ephemeralKey = await stripe.ephemeralKeys.create(
    { customer: customerId },
    { apiVersion: STRIPE_API_VERSION },
  );
  if (!ephemeralKey.secret) return null;
  return {
    outcome: "payment_sheet_required" as const,
    clientSecret,
    customerId,
    ephemeralKey: ephemeralKey.secret,
    publishableKey,
  };
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
    const mode = body?.mode === "recover" ? "recover" : "confirm";
    if (!UUID_RE.test(bookingId)) {
      return fail("bad_request", "bookingId must be a UUID.", 400);
    }

    // Reviewable-invoice guard, as the user (mirrors loadReviewableInvoice).
    const { data: booking } = await userClient
      .from("bookings")
      .select("id, customer_id, provider_id, booking_flow, status")
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
    if (booking.status !== "invoice_review") {
      return fail(
        "wrong_status",
        "This booking isn’t awaiting payment review.",
        409,
      );
    }
    const { data: invoice } = await userClient
      .from("booking_invoices")
      .select("id, status, remaining_balance_cents")
      .eq("booking_id", bookingId)
      .maybeSingle();
    if (!invoice) {
      return fail("no_invoice", "That invoice no longer exists.", 409);
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const publishableKey = Deno.env.get("STRIPE_PUBLISHABLE_KEY");

    const admin = createClient<any>(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (mode === "confirm" && invoice.remaining_balance_cents === 0) {
      const { error } = await userClient.rpc("settle_zero_balance_invoice", {
        p_invoice_id: invoice.id,
      });
      if (error) {
        return fail("begin_failed", "Could not complete the job.", 409);
      }
      return json({ outcome: "settled" });
    }
    if (mode === "recover" && invoice.remaining_balance_cents === 0) {
      return fail("no_balance_due", "There’s no remaining balance to pay.", 409);
    }

    if (!stripeKey || !publishableKey) {
      return fail("unconfigured", "Payments aren’t configured yet.", 503);
    }
    const stripe = new Stripe(stripeKey, { apiVersion: STRIPE_API_VERSION });

    if (mode === "recover") {
      // Fresh attempt: new idempotency key, stale intent cleared.
      const { data: resetRow, error: resetError } = await userClient
        .rpc("reset_balance_payment_for_retry", { p_invoice_id: invoice.id })
        .maybeSingle();
      const reset = resetRow as PaymentAttempt | null;
      if (resetError || !reset) {
        return fail("begin_failed", "Could not restart the payment. Try again.", 409);
      }

      const saved = await loadSavedMethod(admin, booking.id, booking.provider_id);
      if (!saved) {
        return fail("unconfigured", "Payments aren’t configured yet.", 503);
      }

      // No payment_method staged — PaymentSheet collects/re-authenticates one.
      const intent = await stripe.paymentIntents.create(
        {
          amount: reset.amount_cents,
          currency: "usd",
          customer: saved.stripeCustomerId,
          application_fee_amount: reset.application_fee_cents,
          transfer_data: { destination: saved.providerStripeAccountId },
          metadata: {
            booking_id: booking.id,
            invoice_id: invoice.id,
            payment_kind: "balance",
          },
          automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        },
        { idempotencyKey: reset.idempotency_key },
      );
      if (!intent.client_secret) {
        return fail("unconfigured", "Payments aren’t configured yet.", 503);
      }

      const { error: attachError } = await userClient.rpc(
        "attach_balance_payment_intent",
        {
          p_invoice_id: invoice.id,
          p_stripe_payment_intent_id: intent.id,
        },
      );
      if (attachError) {
        return fail("attach_failed", "Could not record the payment. Try again.", 409);
      }

      const bundle = await paymentSheetBundle(
        stripe,
        intent.client_secret,
        saved.stripeCustomerId,
        publishableKey,
      );
      if (!bundle) {
        return fail("unconfigured", "Payments aren’t configured yet.", 503);
      }
      return json(bundle);
    }

    // mode === "confirm", non-zero balance: one-click saved-method charge.
    const { data: begunRow, error: beginError } = await userClient
      .rpc("begin_balance_payment", { p_invoice_id: invoice.id })
      .maybeSingle();
    const begun = begunRow as PaymentAttempt | null;
    if (beginError || !begun) {
      return fail("begin_failed", "Could not start the payment. Try again.", 409);
    }

    const saved = await loadSavedMethod(admin, booking.id, booking.provider_id);
    if (!saved || !saved.stripePaymentMethodId) {
      return fail("unconfigured", "Payments aren’t configured yet.", 503);
    }

    // Create unconfirmed, attach, THEN confirm (see header).
    const intent = await stripe.paymentIntents.create(
      {
        amount: begun.amount_cents,
        currency: "usd",
        customer: saved.stripeCustomerId,
        application_fee_amount: begun.application_fee_cents,
        transfer_data: { destination: saved.providerStripeAccountId },
        payment_method: saved.stripePaymentMethodId,
        metadata: {
          booking_id: booking.id,
          invoice_id: invoice.id,
          payment_kind: "balance",
        },
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      },
      { idempotencyKey: begun.idempotency_key },
    );

    const { error: attachError } = await userClient.rpc(
      "attach_balance_payment_intent",
      {
        p_invoice_id: invoice.id,
        p_stripe_payment_intent_id: intent.id,
      },
    );
    if (attachError) {
      // Nothing was confirmed, so no money moved; a retry reuses this intent.
      return fail("attach_failed", "Could not record the payment. Try again.", 409);
    }

    let confirmed: Stripe.PaymentIntent;
    try {
      confirmed = await stripe.paymentIntents.confirm(intent.id, {
        off_session: false,
      });
    } catch (error) {
      const pi =
        error && typeof error === "object" && "payment_intent" in error
          ? ((error as { payment_intent?: Stripe.PaymentIntent }).payment_intent ??
            null)
          : null;
      // A retried confirm against a settled intent throws without one —
      // re-read so crash retries stay idempotent.
      confirmed = pi ?? (await stripe.paymentIntents.retrieve(intent.id));
    }

    if (confirmed.status === "succeeded" || confirmed.status === "processing") {
      return json({ outcome: "processing" });
    }
    if (confirmed.status === "requires_action" && confirmed.client_secret) {
      const bundle = await paymentSheetBundle(
        stripe,
        confirmed.client_secret,
        saved.stripeCustomerId,
        publishableKey,
      );
      if (!bundle) {
        return fail("unconfigured", "Payments aren’t configured yet.", 503);
      }
      return json(bundle);
    }

    // Hard decline: record it so the invoice becomes recoverable.
    await admin.rpc("mark_balance_payment_unsuccessful", {
      p_stripe_payment_intent_id: confirmed.id,
      p_target_status: "failed",
      p_failure_code: confirmed.status,
      p_failure_message: "The card was declined.",
    });
    return fail(
      "card_declined",
      "Your card was declined. Try another payment method.",
      402,
    );
  } catch (cause) {
    console.error("settle-booking failed:", cause);
    return fail("internal", "Unexpected payment error.", 500);
  }
});
