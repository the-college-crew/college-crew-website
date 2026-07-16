import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, UserRole } from "@/lib/db/types";
import {
  hasAcceptedCurrentMasterAgreement,
  masterAgreementPath,
  requiredMasterVariant,
} from "@/lib/legal/acceptance";
import { createClient } from "@/lib/supabase/server";

/** Only ever redirect within the app — never to an attacker-supplied origin. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

/**
 * The signed-in user's account shape in one round trip set: their role
 * (customer|admin) and whether they're provider-capable (own a
 * provider_profiles row — readable under RLS as themselves).
 */
export async function getAccountShape(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ role: UserRole; providerCapable: boolean }> {
  const [{ data: profile }, { data: providerProfile }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", userId).maybeSingle(),
    supabase
      .from("provider_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  return {
    role: (profile?.role ?? "customer") as UserRole,
    providerCapable: Boolean(providerProfile),
  };
}

/**
 * Where a user lands once an email link has established their session: `next`,
 * or the master agreement first when they haven't accepted the current one.
 * Shared by the callback route and the confirm interstitial.
 */
export async function postAuthDestination(next: string): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return next;

  const shape = await getAccountShape(supabase, user.id);
  const accepted = await hasAcceptedCurrentMasterAgreement(supabase, {
    userId: user.id,
    variant: requiredMasterVariant(shape.role, shape.providerCapable),
  });

  return accepted ? next : masterAgreementPath(next);
}
