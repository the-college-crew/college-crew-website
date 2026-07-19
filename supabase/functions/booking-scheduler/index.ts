// booking-scheduler — the every-minute automation heartbeat (Hourly Booking
// v1 Phase 7; iOS arch A-4 port of app/api/internal/booking-scheduler).
//
// Invoked by pg_cron → pg_net (see private.invoke_booking_scheduler) with a
// shared bearer secret from Vault. `verify_jwt = false` in config.toml —
// pg_net sends no Supabase JWT; the BOOKING_CRON_SECRET comparison below is
// the auth, so there is no unauthenticated ingress in practice.
//
// Secrets: BOOKING_CRON_SECRET, STRIPE_SECRET_KEY, RESEND_API_KEY,
// EMAIL_FROM, FOUNDER_OPERATIONS_EMAILS, PUBLIC_SITE_URL.
// Deploy: npx supabase functions deploy booking-scheduler

import { runBookingScheduler } from "./automation.ts";

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}

/** Compare hashes so length and content leak nothing (mirrors the web route). */
async function isAuthorized(request: Request): Promise<boolean> {
  const expected = Deno.env.get("BOOKING_CRON_SECRET")?.trim();
  if (!expected) return false;
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const [a, b] = await Promise.all([digest(supplied), digest(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }
  if (!Deno.env.get("BOOKING_CRON_SECRET")?.trim()) {
    return json({ error: "Scheduler is not configured." }, 503);
  }
  if (!(await isAuthorized(request))) {
    return json({ error: "Unauthorized." }, 401);
  }

  try {
    const summary = await runBookingScheduler();
    return json({ ok: true, ...summary });
  } catch (error) {
    console.error("[booking-scheduler] cycle_failed", {
      errorClass: error instanceof Error ? error.name : "unknown_error",
    });
    return json({ error: "Scheduler cycle failed." }, 500);
  }
});
