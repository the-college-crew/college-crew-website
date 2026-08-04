import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import {
  needsProfileCompletion,
  profileCompletionPath,
  safeNext,
} from "@/lib/auth/redirects";
import type { Profile, ProviderProfile, UserRole } from "@/lib/db/types";
import { hasSupabaseEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Session helpers for server components, layouts, and Server Actions.
 * All are per-request memoized with React cache().
 */

export const getUser = cache(async (): Promise<User | null> => {
  if (!hasSupabaseEnv()) {
    // Read cookies anyway so auth-aware pages always render per-request —
    // never frozen into a keyless build as static logged-out HTML.
    await cookies();
    return null;
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export type Session = { user: User; profile: Profile };

export const getSession = cache(async (): Promise<Session | null> => {
  const user = await getUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return profile ? { user, profile } : null;
});

/** The provider_profiles row for the signed-in user, if any. */
export const getOwnProviderProfile = cache(
  async (): Promise<ProviderProfile | null> => {
    const user = await getUser();
    if (!user) return null;

    // Private provider columns (service ZIP, Stripe state, ID paths) are not
    // browser-readable. The authenticated user id scopes this server-only read.
    const admin = createAdminClient();
    const { data } = await admin
      .from("provider_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    return data;
  },
);

/**
 * Provider is a CAPABILITY of the base account, not an account type: a user
 * is a provider iff they own a provider_profiles row (created when they start
 * onboarding). profiles.role only distinguishes admins from regular accounts.
 */
export const isProviderCapable = cache(async (): Promise<boolean> => {
  return Boolean(await getOwnProviderProfile());
});

/** Admin "view as" switcher cookie. Set only by app/actions/view-as.ts. */
export const VIEW_AS_COOKIE = "cc-view-as";

const VIEW_AS_ROLES: readonly UserRole[] = ["customer", "provider", "admin"];

/**
 * The surface the app should treat the current user as ("provider" here means
 * provider-capable, never the retired account role). Regular users derive it
 * from capability; admins with a view-as cookie (the header switcher) get the
 * cookie's surface. Preview only, not a privilege sandbox: Server Actions and
 * RLS still run as the real identity, and the cookie is ignored for
 * non-admins.
 */
export const getEffectiveRole = cache(async (): Promise<UserRole | null> => {
  const session = await getSession();
  if (!session) return null;
  if (session.profile.role !== "admin") {
    return (await isProviderCapable()) ? "provider" : "customer";
  }

  const cookieStore = await cookies();
  const viewAs = cookieStore.get(VIEW_AS_COOKIE)?.value as UserRole | undefined;
  return viewAs && VIEW_AS_ROLES.includes(viewAs) ? viewAs : "admin";
});

export function homePathFor(role: UserRole) {
  switch (role) {
    case "admin":
      return "/admin";
    case "provider":
      return "/provider/dashboard";
    case "customer":
      return "/dashboard";
  }
}

/**
 * Label for a role's home destination. The customer's `/dashboard` is titled
 * "My bookings", so the menu/back-button reads that; providers and admins get
 * the generic "Dashboard".
 */
export function dashboardLabelFor(role: UserRole) {
  return role === "customer" ? "My Bookings" : "Dashboard";
}

function requireCompleteProfile(session: Session, nextPath?: string) {
  if (
    session.profile.role !== "admin" &&
    needsProfileCompletion(session.profile)
  ) {
    redirect(profileCompletionPath(safeNext(nextPath ?? "/dashboard")));
  }
}

export async function requireUser(
  nextPath?: string,
  options?: { allowIncompleteProfile?: boolean },
): Promise<User> {
  const session = await getSession();
  if (!session) {
    redirect(
      nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login",
    );
  }
  if (!options?.allowIncompleteProfile) {
    requireCompleteProfile(session, nextPath);
  }
  return session.user;
}

/**
 * Real (database-backed) role gate — the proxy only checks that a session
 * exists. Wrong-role users are sent to their own home, not an error page.
 * With unified accounts only "customer" (any regular account) and "admin"
 * make sense here; provider surfaces use requireProviderAccess instead.
 */
export async function requireRole(
  role: Extract<UserRole, "customer" | "admin">,
  nextPath?: string,
): Promise<Session> {
  const session = await getSession();
  if (!session) {
    redirect(
      nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login",
    );
  }
  requireCompleteProfile(session, nextPath);
  if (session.profile.role !== role) {
    // Admins may preview other surfaces' pages via the view-as switcher.
    // (requireRole("admin") never lands here for real admins, so /admin
    // stays open to them regardless of the cookie — they can always switch
    // back.)
    if (session.profile.role === "admin") {
      const effective = await getEffectiveRole();
      if (effective === role) return session;
      redirect(homePathFor(effective ?? "admin"));
    }
    redirect(homePathFor((await getEffectiveRole()) ?? "customer"));
  }
  return session;
}

/**
 * Gate for the provider work surface (dashboard, jobs, pricing, provider
 * actions). Open to provider-capable users and to admins previewing via
 * view-as (their pages render the sample-preview storefront). A regular
 * account that hasn't started providing is invited to onboard instead of
 * being bounced home.
 */
export async function requireProviderAccess(
  nextPath?: string,
): Promise<Session> {
  const session = await getSession();
  if (!session) {
    redirect(
      nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login",
    );
  }
  requireCompleteProfile(session, nextPath);
  if (session.profile.role === "admin") {
    const effective = await getEffectiveRole();
    if (effective === "provider") return session;
    redirect(homePathFor(effective ?? "admin"));
  }
  if (await isProviderCapable()) return session;
  redirect("/provider/onboarding/account");
}

/**
 * Gate for provider onboarding: any signed-in regular account may start
 * providing (that IS the upgrade path). Admin (founder) accounts don't
 * onboard — they're sent to their effective home; view-as "provider" admins
 * land on the sample-preview dashboard instead.
 */
export async function requireOnboardingUser(
  nextPath?: string,
): Promise<Session> {
  const session = await getSession();
  if (!session) {
    redirect(
      nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login",
    );
  }
  requireCompleteProfile(session, nextPath);
  if (session.profile.role === "admin") {
    redirect(homePathFor((await getEffectiveRole()) ?? "admin"));
  }
  return session;
}
