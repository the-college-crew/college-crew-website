import Link from "next/link";

import { Wordmark } from "@/components/site-header";
import { buttonClasses } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";
import { ViewAsSwitcher } from "@/components/view-as-switcher";
import { getEffectiveRole, getSession, homePathFor } from "@/lib/auth/session";

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
      <header className="border-b border-viridian/10 bg-viridian text-shell">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-3">
            <Wordmark tone="dark" />
            <span className="rounded-full border border-shell/20 bg-shell/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.14em] text-honeydew">
              Provider
            </span>
          </div>
          {session ? (
            <div className="flex items-center gap-3">
              {isAdmin ? (
                <ViewAsSwitcher current={effectiveRole ?? "admin"} />
              ) : null}
              <UserMenu
                name={session.profile.full_name}
                email={session.user.email ?? ""}
                homePath={homePathFor(effectiveRole ?? session.profile.role)}
              />
            </div>
          ) : (
            <Link
              href="/login?next=/provider/dashboard"
              className={buttonClasses({
                variant: "secondary",
                size: "sm",
                className: "border-shell/30 text-shell hover:bg-shell/10",
              })}
            >
              Log in
            </Link>
          )}
        </div>
        {isProvider ? (
          <nav
            aria-label="Provider"
            className="mx-auto flex max-w-5xl gap-6 px-4 pb-3 text-sm font-semibold text-shell/70"
          >
            <Link href="/provider/dashboard" className="hover:text-shell">
              Dashboard
            </Link>
            <Link href="/provider/jobs" className="hover:text-shell">
              Jobs & pricing
            </Link>
            <Link href="/provider/settings" className="hover:text-shell">
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
