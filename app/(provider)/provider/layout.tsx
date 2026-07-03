import Link from "next/link";

import { signOut } from "@/app/(auth)/actions";
import { Wordmark } from "@/components/site-header";
import { buttonClasses } from "@/components/ui/button";
import { ViewAsSwitcher } from "@/components/view-as-switcher";
import { getEffectiveRole, getSession } from "@/lib/auth/session";

/**
 * Provider shell. Deliberately lighter than the customer chrome — this is a
 * work surface. Pages guard their own access (the onboarding account step
 * must render logged-out, so the layout can't requireRole).
 */
export default async function ProviderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const isAdmin = session?.profile.role === "admin";
  // Effective role so admins previewing via the view-as switcher get the
  // provider nav too (their pages show the no-profile/onboarding states).
  const effectiveRole = session ? await getEffectiveRole() : null;
  const isProvider = effectiveRole === "provider";

  return (
    <>
      <header className="pennant border-b border-line bg-paper">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-3">
            <Wordmark />
            <span className="rounded-full border border-crew-200 bg-crew-100 px-2.5 py-0.5 font-display text-xs font-semibold uppercase tracking-wide text-crew-800">
              Provider
            </span>
          </div>
          {session ? (
            <div className="flex items-center gap-3">
              {isAdmin ? (
                <ViewAsSwitcher current={effectiveRole ?? "admin"} />
              ) : null}
              <form action={signOut}>
                <button
                  type="submit"
                  className={buttonClasses({ variant: "ghost", size: "sm" })}
                >
                  Log out
                </button>
              </form>
            </div>
          ) : (
            <Link
              href="/login?next=/provider/dashboard"
              className={buttonClasses({ variant: "ghost", size: "sm" })}
            >
              Log in
            </Link>
          )}
        </div>
        {isProvider ? (
          <nav
            aria-label="Provider"
            className="mx-auto flex max-w-5xl gap-6 px-4 pb-3 text-sm font-medium text-ink-soft"
          >
            <Link href="/provider/dashboard" className="hover:text-crew-700">
              Dashboard
            </Link>
            <Link href="/provider/jobs" className="hover:text-crew-700">
              Jobs & pricing
            </Link>
            <Link href="/provider/settings" className="hover:text-crew-700">
              Profile & settings
            </Link>
          </nav>
        ) : null}
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
    </>
  );
}
