import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import type { Profile, ProviderProfile, UserRole } from "@/lib/db/types";
import { hasSupabaseEnv } from "@/lib/env";
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

    const supabase = await createClient();
    const { data } = await supabase
      .from("provider_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    return data;
  },
);

/** Admin "view as" switcher cookie. Set only by app/actions/view-as.ts. */
export const VIEW_AS_COOKIE = "cc-view-as";

const VIEW_AS_ROLES: readonly UserRole[] = ["customer", "provider", "admin"];

/**
 * The role the app should treat the current user as. Everyone gets their real
 * role, except admins with a view-as cookie (the header switcher), who get the
 * cookie's role. Preview only, not a privilege sandbox: Server Actions and RLS
 * still run as the real identity, and the cookie is ignored for non-admins.
 */
export const getEffectiveRole = cache(async (): Promise<UserRole | null> => {
  const session = await getSession();
  if (!session) return null;
  if (session.profile.role !== "admin") return session.profile.role;

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

export async function requireUser(nextPath?: string): Promise<User> {
  const user = await getUser();
  if (!user) {
    redirect(
      nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login",
    );
  }
  return user;
}

/**
 * Real (database-backed) role gate — the proxy only checks that a session
 * exists. Wrong-role users are sent to their own home, not an error page.
 */
export async function requireRole(
  role: UserRole,
  nextPath?: string,
): Promise<Session> {
  const session = await getSession();
  if (!session) {
    redirect(
      nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login",
    );
  }
  if (session.profile.role !== role) {
    // Admins may preview other roles' pages via the view-as switcher.
    // (requireRole("admin") never lands here for real admins, so /admin
    // stays open to them regardless of the cookie — they can always switch
    // back.)
    if (session.profile.role === "admin") {
      const effective = await getEffectiveRole();
      if (effective === role) return session;
      redirect(homePathFor(effective ?? "admin"));
    }
    redirect(homePathFor(session.profile.role));
  }
  return session;
}
