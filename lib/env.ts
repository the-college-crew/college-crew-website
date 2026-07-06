/**
 * Environment guards. The skeleton must be browsable before .env.local
 * exists, so data helpers check these and degrade to empty states instead
 * of crashing (a dev banner explains what's missing).
 */

export function hasSupabaseEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function hasServiceRoleEnv() {
  return hasSupabaseEnv() && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function hasStripeEnv() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * Resend is optional: without a key we log OTP codes server-side instead of
 * emailing them, so provider .edu verification is testable before the account
 * exists. lib/email/send.ts branches on this.
 */
export function hasResendEnv() {
  return Boolean(process.env.RESEND_API_KEY);
}
