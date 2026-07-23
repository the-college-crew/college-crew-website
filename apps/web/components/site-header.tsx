import Link from "next/link";
import Image from "next/image";

import { MobileNav } from "@/components/mobile-nav";
import { NavLinks } from "@/components/nav-links";
import { UserMenu } from "@/components/user-menu";
import {
  dashboardLabelFor,
  getEffectiveRole,
  getSession,
  homePathFor,
  isProviderCapable,
} from "@/lib/auth/session";
import { getUnreadSummary } from "@/lib/messaging/unread";
import { SITE } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

/**
 * Main nav. A signed-in regular account gets its two personal destinations
 * promoted out of the account menu and in beside Browse; the public links stay
 * grouped at the end. Admins keep the plain three — they can't book, and their
 * own surfaces live in the admin header.
 *
 * Exported because the shared-surface layout (account, messaging, legal)
 * renders the same links in its own slimmer bar.
 */
export function navFor({
  isMember,
  providerCapable,
}: {
  isMember: boolean;
  providerCapable: boolean;
}) {
  return [
    { href: "/browse", label: "Browse" },
    ...(isMember
      ? [
          { href: "/dashboard", label: "My Bookings" },
          ...(providerCapable
            ? [{ href: "/provider/dashboard", label: "Provider dashboard" }]
            : []),
        ]
      : []),
    { href: "/about", label: "About" },
    { href: "/blog", label: "Blog" },
  ];
}

/**
 * Width at which a given nav can sit beside the wordmark. The personal links
 * push the bar past what fits between ~640px and ~870px, so a nav carrying
 * them stays in the hamburger until lg; the public three-item nav still opens
 * up at sm.
 */
export function navBreakpoint(nav: readonly unknown[]): "sm" | "lg" {
  return nav.length > 3 ? "lg" : "sm";
}

/**
 * College Crew wordmark: the grad-cap ant + name. `tone` flips it for use on
 * dark surfaces (forest provider/admin bars, the footer) vs. light ones.
 */
export function Wordmark({ tone = "light" }: { tone?: "light" | "dark" }) {
  const onDark = tone === "dark";
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <Image
        src={onDark ? "/college-crew-mark-white.png" : "/college-crew-mark.png"}
        alt=""
        width={40}
        height={37}
        className={cn("object-contain", onDark ? "h-12 w-12" : "h-9 w-9")}
        priority
      />
      <span
        className={cn(
          "font-display text-[22px] font-bold tracking-[-0.01em]",
          onDark ? "text-shell" : "text-viridian",
        )}
      >
        College Crew
      </span>
    </Link>
  );
}

/** Customer-facing site chrome; auth-aware on the right side. */
export async function SiteHeader() {
  const session = await getSession();
  const effectiveRole = session ? await getEffectiveRole() : null;
  const providerCapable = session ? await isProviderCapable() : false;
  const unreadCount = session
    ? (await getUnreadSummary(await createClient())).total
    : 0;

  const nav = navFor({
    isMember: Boolean(session) && session?.profile.role !== "admin",
    providerCapable,
  });
  const breakpoint = navBreakpoint(nav);

  return (
    <header className="sticky top-0 z-40 border-b-[1.5px] border-viridian/15 bg-shell text-viridian">
      <div className="mx-auto flex h-[72px] max-w-[1140px] items-center justify-between gap-4 px-5 sm:px-8">
        <div className="flex min-w-0 items-center gap-2">
          <MobileNav
            nav={nav}
            isAuthed={Boolean(session)}
            tone="light"
            breakpoint={breakpoint}
          />
          <Wordmark />
        </div>

        <nav
          aria-label="Main"
          className={cn(
            "hidden flex-1 items-center justify-center gap-7 text-base font-semibold",
            breakpoint === "lg" ? "lg:flex" : "sm:flex",
          )}
        >
          <NavLinks nav={nav} />
        </nav>

        <div className="flex shrink-0 items-center gap-3.5">
          {session ? (
            <UserMenu
              name={session.profile.full_name}
              email={session.user.email ?? ""}
              homePath={homePathFor(effectiveRole ?? session.profile.role)}
              realRole={session.profile.role}
              currentRole={effectiveRole ?? session.profile.role}
              dashboardLabel={dashboardLabelFor(
                effectiveRole ?? session.profile.role,
              )}
              unreadCount={unreadCount}
              badgeRing="ring-shell"
            />
          ) : (
            // On mobile these live inside the hamburger panel instead.
            <div className="hidden items-center gap-3.5 sm:flex">
              <Link
                href="/login"
                className="text-base font-semibold transition-colors hover:text-viridian/60"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center rounded-full border-[1.6px] border-viridian bg-viridian px-[22px] py-2.5 text-[15px] font-semibold text-shell transition hover:-translate-y-px hover:bg-viridian-ink"
              >
                Get started
              </Link>
            </div>
          )}
        </div>
      </div>
      <span className="sr-only">{SITE.name}</span>
    </header>
  );
}
