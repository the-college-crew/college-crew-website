import Link from "next/link";

import { MobileNav } from "@/components/mobile-nav";
import { ProviderVerifyBanner } from "@/components/provider-verify-banner";
import { Wordmark } from "@/components/site-header";
import { buttonClasses } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";
import {
  getEffectiveRole,
  getOwnProviderProfile,
  getSession,
  homePathFor,
} from "@/lib/auth/session";
import { getVerifiedSchoolEmail } from "@/lib/db/school-email";
import { getUnreadSummary } from "@/lib/messaging/unread";
import { createClient } from "@/lib/supabase/server";

const PROVIDER_NAV = [
  { href: "/provider/dashboard", label: "Dashboard" },
  { href: "/provider/jobs", label: "Jobs & pricing" },
  { href: "/messages", label: "Messages" },
  { href: "/account", label: "Profile & settings" },
];

/**
 * Compute the "finish verifying" nudge for a real provider whose onboarding
 * is incomplete. Returns null when there's nothing to prompt (no profile-less
 * account, already approved/rejected, or both proofs are in). The banner
 * itself self-hides inside the onboarding wizard.
 */
async function providerVerifyNudge(
  userId: string,
): Promise<{ href: string; message: string } | null> {
  const profile = await getOwnProviderProfile();
  if (!profile) {
    return {
      href: "/provider/onboarding/account",
      message: "Finish creating your provider account to get verified.",
    };
  }
  // Approved providers are done; rejected ones get their own dashboard banner.
  if (profile.verification_status !== "pending") return null;

  const schoolEmail = await getVerifiedSchoolEmail(userId);
  const missing: string[] = [];
  if (!schoolEmail) missing.push("verify your school (.edu) email");
  if (!profile.id_document_url || !profile.id_document_back_url) {
    missing.push("upload your driver's license");
  }
  if (missing.length === 0) return null;

  return {
    href: "/provider/onboarding/verify",
    message: `Almost there — ${missing.join(" and ")} to finish setting up and go live.`,
  };
}

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
  // Effective role so admins previewing via the view-as switcher get the
  // provider nav too (their pages show the no-profile/onboarding states).
  const effectiveRole = session ? await getEffectiveRole() : null;
  const isProvider = effectiveRole === "provider";

  // Only nudge a *real* provider (not an admin previewing via view-as).
  const verifyNudge =
    session && session.profile.role === "provider"
      ? await providerVerifyNudge(session.user.id)
      : null;

  const unreadCount = session
    ? (await getUnreadSummary(await createClient())).total
    : 0;

  return (
    <>
      <header className="relative border-b border-viridian/10 bg-viridian text-shell">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-3">
            {isProvider ? (
              <MobileNav nav={PROVIDER_NAV} isAuthed />
            ) : null}
            <Wordmark tone="dark" />
            <span className="rounded-full border border-shell/20 bg-shell/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.14em] text-honeydew">
              Provider
            </span>
          </div>
          {session ? (
            <div className="flex items-center gap-3">
              <UserMenu
                name={session.profile.full_name}
                email={session.user.email ?? ""}
                homePath={homePathFor(effectiveRole ?? session.profile.role)}
                realRole={session.profile.role}
                currentRole={effectiveRole ?? session.profile.role}
                unreadCount={unreadCount}
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
            className="mx-auto hidden max-w-5xl gap-6 px-4 pb-3 text-sm font-semibold text-shell/70 sm:flex"
          >
            <Link href="/provider/dashboard" className="hover:text-shell">
              Dashboard
            </Link>
            <Link href="/provider/jobs" className="hover:text-shell">
              Jobs & pricing
            </Link>
            <Link href="/messages" className="hover:text-shell">
              Messages
            </Link>
            <Link href="/account" className="hover:text-shell">
              Profile & settings
            </Link>
          </nav>
        ) : null}
      </header>
      {verifyNudge ? <ProviderVerifyBanner {...verifyNudge} /> : null}
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
    </>
  );
}
