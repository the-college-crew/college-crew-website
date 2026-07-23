import { MobileNav } from "@/components/mobile-nav";
import { NavLinks } from "@/components/nav-links";
import { navBreakpoint, navFor, Wordmark } from "@/components/site-header";
import { UserMenu } from "@/components/user-menu";
import {
  dashboardLabelFor,
  getEffectiveRole,
  getSession,
  homePathFor,
  isProviderCapable,
} from "@/lib/auth/session";
import { getUnreadSummary } from "@/lib/messaging/unread";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

/** Minimal chrome for shared surfaces (account, messaging) used by every role. */
export default async function SharedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const role = session
    ? ((await getEffectiveRole()) ?? session.profile.role)
    : null;
  const providerCapable = session ? await isProviderCapable() : false;
  const unreadCount = session
    ? (await getUnreadSummary(await createClient())).total
    : 0;

  // Same links as the main site header: these surfaces are a dead end without
  // them, since the bar carries no other way back to Browse or My Bookings.
  const nav = navFor({
    isMember: Boolean(session) && session?.profile.role !== "admin",
    providerCapable,
  });
  const breakpoint = navBreakpoint(nav);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 shrink-0 border-b border-viridian/10 bg-viridian text-shell">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <div className="flex min-w-0 items-center gap-2">
            <MobileNav
              nav={nav}
              isAuthed={Boolean(session)}
              breakpoint={breakpoint}
            />
            <Wordmark tone="dark" />
          </div>

          <nav
            aria-label="Main"
            className={cn(
              "hidden flex-1 items-center justify-center gap-6 text-sm font-semibold",
              breakpoint === "lg" ? "lg:flex" : "sm:flex",
            )}
          >
            <NavLinks nav={nav} tone="dark" />
          </nav>

          {session && role ? (
            <UserMenu
              name={session.profile.full_name}
              email={session.user.email ?? ""}
              homePath={homePathFor(role)}
              realRole={session.profile.role}
              currentRole={role}
              dashboardLabel={dashboardLabelFor(role)}
              unreadCount={unreadCount}
            />
          ) : null}
        </div>
      </header>
      <main id="main" className="flex min-h-0 flex-1 flex-col">
        {children}
      </main>
    </div>
  );
}
