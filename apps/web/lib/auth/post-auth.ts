import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, UserRole } from "@/lib/db/types";
import {
  needsProfileCompletion,
  profileCompletionPath,
  safeNext,
} from "@/lib/auth/redirects";
import {
  hasAcceptedCurrentLegalDocument,
  legalDocumentPath,
} from "@/lib/legal/acceptance";
import { createClient } from "@/lib/supabase/server";

export { safeNext } from "@/lib/auth/redirects";

/**
 * The signed-in user's account shape in one round trip set: their role
 * (customer|admin) and whether they're provider-capable (own a
 * provider_profiles row — readable under RLS as themselves).
 */
export async function getAccountShape(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{
  role: UserRole;
  providerCapable: boolean;
  profileComplete: boolean;
}> {
  const [{ data: profile }, { data: providerProfile }] = await Promise.all([
    supabase
      .from("profiles")
      .select("role, full_name, address_line1, city, state, postal_code")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("provider_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  return {
    role: (profile?.role ?? "customer") as UserRole,
    providerCapable: Boolean(providerProfile),
    profileComplete: Boolean(profile && !needsProfileCompletion(profile)),
  };
}

/**
 * Where a user lands once an email link has established their session: `next`,
 * or the common Platform Terms first when they have not accepted them.
 * Shared by the callback route and the confirm interstitial.
 */
export async function postAuthDestination(
  requestedNext?: string | null,
): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const next = safeNext(requestedNext);
  if (!user) return next;

  const shape = await getAccountShape(supabase, user.id);
  const destination =
    requestedNext == null || requestedNext === "/"
      ? shape.role === "admin"
        ? "/admin"
        : shape.providerCapable
          ? "/provider/dashboard"
          : "/dashboard"
      : next;

  if (shape.role === "admin") return destination;
  if (!shape.profileComplete) return profileCompletionPath(destination);
  if (destination.startsWith("/legal/master")) return destination;

  const accepted = await hasAcceptedCurrentLegalDocument(supabase, {
    userId: user.id,
    kind: "platform_terms",
  });

  return accepted
    ? destination
    : legalDocumentPath("platform_terms", destination);
}
