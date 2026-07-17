import "server-only";

import { hasServiceRoleEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Reads for the provider .edu verification state. Two tables by design:
 *   * provider_school_emails  — durable, verified result. Owner/admin readable
 *     via RLS, so this uses the normal session client.
 *   * provider_email_verifications — the in-flight code. Service-role only (no
 *     RLS policy), so the pending-address read goes through the admin client.
 */

export type VerifiedSchoolEmail = { email: string; verified_at: string } | null;

/** The provider's verified .edu, if any (owner- or admin-visible via RLS). */
export async function getVerifiedSchoolEmail(
  userId: string,
): Promise<VerifiedSchoolEmail> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("provider_school_emails")
    .select("email, verified_at")
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}

/**
 * The address a live code was sent to (service-role read; hash never leaves).
 *
 * Expired rows are excluded. They linger in the table until the next send or a
 * failed verify clears them, and treating a dead code as "pending" strands the
 * provider on the enter-your-code screen with no way back to the send form.
 */
export async function getPendingSchoolEmail(
  userId: string,
): Promise<{ email: string; expires_at: string } | null> {
  if (!hasServiceRoleEnv()) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("provider_email_verifications")
    .select("email, expires_at")
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return data ?? null;
}

/**
 * The login email, when it is itself a confirmed .edu — i.e. Supabase has
 * already proven the provider owns a school address and a second OTP round
 * would be asking them to prove the same thing twice.
 */
export function eligibleAccountSchoolEmail(user: {
  email?: string | null;
  email_confirmed_at?: string | null;
}): string | null {
  const email = user.email?.toLowerCase() ?? null;
  if (!email || !email.endsWith(".edu") || !user.email_confirmed_at) return null;
  return email;
}

export type ClaimResult =
  | { ok: true }
  | { ok: false; reason: "taken" | "unavailable" };

/**
 * Record a school email as verified without an OTP. Only ever called with an
 * address Supabase already confirmed for this user — the caller establishes
 * that, this just writes the row (service-role: the table is not client-
 * writable, so the browser can never mint its own "verified").
 */
export async function claimAccountEmailAsSchool(
  userId: string,
  email: string,
): Promise<ClaimResult> {
  if (!hasServiceRoleEnv()) return { ok: false, reason: "unavailable" };
  const admin = createAdminClient();

  // Anti-sharing: a verified .edu belongs to exactly one provider.
  const { data: taken } = await admin
    .from("provider_school_emails")
    .select("user_id")
    .eq("email", email)
    .maybeSingle();
  if (taken && taken.user_id !== userId) return { ok: false, reason: "taken" };

  const { error } = await admin.from("provider_school_emails").upsert({
    user_id: userId,
    email,
    verified_at: new Date().toISOString(),
  });
  if (error) {
    // 23505 => someone else claimed this .edu in the gap since the check above.
    return { ok: false, reason: error.code === "23505" ? "taken" : "unavailable" };
  }

  // Any in-flight code for this provider is now moot.
  await admin
    .from("provider_email_verifications")
    .delete()
    .eq("user_id", userId);

  return { ok: true };
}
