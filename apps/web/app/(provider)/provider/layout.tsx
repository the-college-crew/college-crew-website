import Link from "next/link";

import { ProviderVerifyBanner } from "@/components/provider-verify-banner";
import { SiteHeader } from "@/components/site-header";
import {
  getEffectiveRole,
  getOwnProviderProfile,
  getSession,
} from "@/lib/auth/session";
import { getVerifiedSchoolEmail } from "@/lib/db/school-email";

/**
 * Compute the "finish verifying" nudge for a provider whose onboarding is
 * incomplete. Only fires for an account that has actually started providing
 * (owns a provider profile) and is still pending with proofs missing; the
 * banner self-hides inside the onboarding wizard.
 */
async function providerVerifyNudge(
  userId: string,
): Promise<{ href: string; message: string } | null> {
  const profile = await getOwnProviderProfile();
  if (!profile) return null;
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
 * Provider work surface. Unified accounts: same site chrome as everywhere
 * else, plus a slim provider sub-nav for accounts with the provider
 * capability (or admins previewing via view-as). Pages guard their own
 * access — the onboarding account step must render logged-out.
 */
export default async function ProviderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  // "provider" here = provider-capable (or an admin previewing as one).
  const effectiveRole = session ? await getEffectiveRole() : null;
  const showProviderNav = effectiveRole === "provider";

  // Only nudge a real provider account (not an admin preview).
  const verifyNudge =
    session && session.profile.role !== "admin"
      ? await providerVerifyNudge(session.user.id)
      : null;

  return (
    <>
      <SiteHeader />
      {showProviderNav ? (
        <nav
          aria-label="Provider"
          className="border-b border-viridian/15 bg-shell"
        >
          <div className="mx-auto flex h-11 max-w-[1140px] items-center gap-6 px-5 text-sm font-semibold text-viridian sm:px-8">
            <span className="rounded-full border border-viridian/20 bg-viridian/5 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.14em]">
              Provider
            </span>
            <Link href="/provider/dashboard" className="hover:text-viridian/60">
              Dashboard
            </Link>
            <Link href="/provider/jobs" className="hover:text-viridian/60">
              Jobs
            </Link>
            <Link
              href="/account?tab=pricing"
              className="hover:text-viridian/60"
            >
              Pricing
            </Link>
          </div>
        </nav>
      ) : null}
      {verifyNudge ? <ProviderVerifyBanner {...verifyNudge} /> : null}
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
    </>
  );
}
