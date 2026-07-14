import "server-only";

import type { UserRole } from "@/lib/db/types";
import {
  hasAcceptedCurrentMasterAgreement,
  masterAgreementPath,
} from "@/lib/legal/acceptance";
import { createClient } from "@/lib/supabase/server";

/** Only ever redirect within the app — never to an attacker-supplied origin. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = (profile?.role ?? "customer") as UserRole;
  const accepted = await hasAcceptedCurrentMasterAgreement(supabase, {
    userId: user.id,
    role,
  });

  return accepted ? next : masterAgreementPath(next);
}
