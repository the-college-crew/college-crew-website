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

/**
 * OpenAI is optional too: it powers the gpt-5.4-nano backstop in profile-text
 * moderation (lib/moderation/profile-text.ts). Without a key that layer no-ops
 * and the regex layer stands alone — moderation is flag-only, so a missing key
 * can never interfere with a provider saving their profile.
 *
 * Note this is the APP's key (.env.local / Vercel). The moderate-message Edge
 * Function reads its own OPENAI_API_KEY from the Supabase secret store; the two
 * are configured separately.
 */
export function hasOpenAiEnv() {
  return Boolean(process.env.OPENAI_API_KEY);
}
