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

/** The address a code was last sent to (service-role read; hash never leaves). */
export async function getPendingSchoolEmail(
  userId: string,
): Promise<{ email: string; expires_at: string } | null> {
  if (!hasServiceRoleEnv()) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("provider_email_verifications")
    .select("email, expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}
