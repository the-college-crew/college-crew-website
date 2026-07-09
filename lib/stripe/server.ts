import "server-only";

import Stripe from "stripe";

/**
 * Stripe server client. Returns null while the pilot's Stripe test account
 * is unprovisioned — callers must handle the null and degrade gracefully
 * (see lib/stripe/connect.ts). TEST MODE ONLY during the pilot; flipping to
 * live keys requires an explicit team decision.
 */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  // Pin the version the code was written against (the Accounts v2 GA release)
  // so an SDK bump can't silently change request/response shapes under us.
  return new Stripe(key, { apiVersion: "2026-06-24.dahlia" });
}
