import Link from "next/link";
import Image from "next/image";

import { BackButton } from "@/components/back-button";
import { MobileNav } from "@/components/mobile-nav";
import { UserMenu } from "@/components/user-menu";
import { ViewAsSwitcher } from "@/components/view-as-switcher";
import {
  dashboardLabelFor,
  getEffectiveRole,
  getSession,
  homePathFor,
} from "@/lib/auth/session";
import { SITE } from "@/lib/site";
import { cn } from "@/lib/utils";

const serif = "font-[family-name:var(--font-newsreader)]";

const NAV = [
  { href: "/browse", label: "Browse" },
  { href: "/about", label: "About" },
  { href: "/blog", label: "Blog" },
];

/**
 * College Crew wordmark: a forest logo tile + name. `tone` flips it for use on
 * dark surfaces (the forest footer) vs. light ones (the header).
 */
export function Wordmark({ tone = "light" }: { tone?: "light" | "dark" }) {
  const onDark = tone === "dark";
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span
        className={cn(
          "flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl p-1.5",
          onDark ? "bg-shell" : "bg-shell ring-1 ring-stone",
        )}
        aria-hidden
      >
        <Image
          src="/college-crew-mark.png"
          alt=""
          width={40}
          height={37}
          className="h-full w-full object-contain"
          priority
        />
      </span>
      <span
        className={cn(
          "text-lg font-semibold tracking-tight",
          serif,
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
  const isAdmin = session?.profile.role === "admin";

  return (
    <header className="sticky top-0 z-40 border-b border-viridian/10 bg-viridian text-shell">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-3 sm:gap-8">
          <MobileNav nav={NAV} isAuthed={Boolean(session)} />
          <Wordmark tone="dark" />
          <BackButton />
          <nav
            aria-label="Main"
            className="hidden items-center gap-6 text-sm font-semibold text-shell/75 sm:flex"
          >
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="transition-colors hover:text-shell"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-1.5">
          {session ? (
            <>
              {isAdmin ? (
                <ViewAsSwitcher current={effectiveRole ?? "admin"} />
              ) : null}
              <UserMenu
                name={session.profile.full_name}
                email={session.user.email ?? ""}
                homePath={homePathFor(effectiveRole ?? session.profile.role)}
                dashboardLabel={dashboardLabelFor(
                  effectiveRole ?? session.profile.role,
                )}
              />
            </>
          ) : (
            // On mobile these live inside the hamburger panel instead.
            <div className="hidden items-center gap-1.5 sm:flex">
              <Link
                href="/login"
                className="rounded-xl border border-shell/30 px-3.5 py-2 text-sm font-semibold text-shell transition-colors hover:bg-shell/10"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-xl bg-honeydew px-4 py-2 text-sm font-semibold text-viridian transition-colors hover:bg-shell"
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
