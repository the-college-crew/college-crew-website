import Link from "next/link";
import Image from "next/image";

import { MobileNav } from "@/components/mobile-nav";
import { UserMenu } from "@/components/user-menu";
import {
  dashboardLabelFor,
  getEffectiveRole,
  getSession,
  homePathFor,
} from "@/lib/auth/session";
import { getUnreadSummary } from "@/lib/messaging/unread";
import { SITE } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/browse", label: "Browse" },
  { href: "/about", label: "About" },
  { href: "/blog", label: "Blog" },
];

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
  const unreadCount = session
    ? (await getUnreadSummary(await createClient())).total
    : 0;

  return (
    <header className="sticky top-0 z-40 border-b-[1.5px] border-viridian/15 bg-shell text-viridian">
      <div className="mx-auto flex h-[72px] max-w-[1140px] items-center justify-between gap-4 px-5 sm:px-8">
        <div className="flex min-w-0 items-center gap-2">
          <MobileNav nav={NAV} isAuthed={Boolean(session)} tone="light" />
          <Wordmark />
        </div>

        <nav
          aria-label="Main"
          className="hidden flex-1 items-center justify-center gap-7 text-base font-semibold sm:flex"
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="transition-colors hover:text-viridian/60"
            >
              {item.label}
            </Link>
          ))}
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
