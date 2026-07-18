import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { hasSupabaseEnv } from "@/lib/env";

/**
 * Session refresh + optimistic route protection, called from proxy.ts on
 * every matched request.
 *
 * Optimistic only (per the Next.js auth guide): we check that a session
 * exists, never roles — role checks hit the database and live in each
 * route group's layout/page via lib/auth/session.ts.
 */

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/provider",
  "/admin",
  "/messages",
  "/book",
  "/bookings",
  "/account",
];

// The onboarding wizard's account step doubles as provider signup, so it
// must stay reachable while logged out.
const PUBLIC_EXCEPTIONS = ["/provider/onboarding/account"];

function isProtectedPath(path: string) {
  if (
    PUBLIC_EXCEPTIONS.some((p) => path === p || path.startsWith(`${p}/`))
  ) {
    return false;
  }
  return PROTECTED_PREFIXES.some(
    (p) => path === p || path.startsWith(`${p}/`),
  );
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Keyless development: skip auth entirely so the skeleton stays browsable.
  if (!hasSupabaseEnv()) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refreshes the auth token if expired. Do not run other logic between
  // client creation and this call — the refreshed cookies must win.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  if (!user && isProtectedPath(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", path);

    const redirectResponse = NextResponse.redirect(url);
    // Carry any refreshed session cookies onto the redirect.
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });
    return redirectResponse;
  }

  return supabaseResponse;
}
