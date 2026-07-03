import Link from "next/link";

import { signOut } from "@/app/(auth)/actions";
import { buttonClasses } from "@/components/ui/button";
import { ViewAsSwitcher } from "@/components/view-as-switcher";
import { getEffectiveRole, getSession, homePathFor } from "@/lib/auth/session";
import { SITE } from "@/lib/site";

export function Wordmark() {
  return (
    <Link
      href="/"
      className="font-display text-xl font-bold uppercase tracking-wide"
    >
      <span className="text-ink">College</span>{" "}
      <span className="text-crew-600">Crew</span>
    </Link>
  );
}

/** Customer-facing site chrome; auth-aware on the right side. */
export async function SiteHeader() {
  const session = await getSession();
  const effectiveRole = session ? await getEffectiveRole() : null;
  const isAdmin = session?.profile.role === "admin";

  return (
    <header className="pennant sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-8">
          <Wordmark />
          <nav
            aria-label="Main"
            className="hidden items-center gap-6 text-sm font-medium text-ink-soft sm:flex"
          >
            <Link href="/browse" className="hover:text-crew-700">
              Browse
            </Link>
            <Link href="/about" className="hover:text-crew-700">
              About
            </Link>
            <Link href="/blog" className="hover:text-crew-700">
              Blog
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {session ? (
            <>
              {isAdmin ? (
                <ViewAsSwitcher current={effectiveRole ?? "admin"} />
              ) : null}
              <Link
                href={homePathFor(effectiveRole ?? session.profile.role)}
                className={buttonClasses({ variant: "secondary", size: "sm" })}
              >
                Dashboard
              </Link>
              <form action={signOut}>
                <button
                  type="submit"
                  className={buttonClasses({ variant: "ghost", size: "sm" })}
                >
                  Log out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className={buttonClasses({ variant: "ghost", size: "sm" })}
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className={buttonClasses({ variant: "primary", size: "sm" })}
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Mobile nav row */}
      <nav
        aria-label="Main mobile"
        className="flex items-center gap-6 border-t border-line px-4 py-2 text-sm font-medium text-ink-soft sm:hidden"
      >
        <Link href="/browse" className="hover:text-crew-700">
          Browse
        </Link>
        <Link href="/about" className="hover:text-crew-700">
          About
        </Link>
        <Link href="/blog" className="hover:text-crew-700">
          Blog
        </Link>
      </nav>
      <span className="sr-only">{SITE.name}</span>
    </header>
  );
}
