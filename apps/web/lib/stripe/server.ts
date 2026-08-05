import "server-only";

import Stripe from "stripe";

/**
 * Stripe server client. Returns null when Stripe is unconfigured — callers
 * must handle the null and degrade gracefully (see lib/stripe/connect.ts).
 * The key itself selects test or live mode; environment validation prevents
 * the server and browser keys from using different modes.
 */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  // Pin the version the code was written against (the Accounts v2 GA release)
  // so an SDK bump can't silently change request/response shapes under us.
  return new Stripe(key, { apiVersion: "2026-07-29.dahlia" });
}

export function isStripeLiveMode() {
  return /^(?:sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY ?? "");
}
