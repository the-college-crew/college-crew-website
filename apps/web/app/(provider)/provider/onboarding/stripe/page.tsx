import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { WizardSteps } from "@/app/(provider)/provider/_components/wizard-steps";
import {
  connectStripeFromOnboarding,
  refreshStripeReadiness,
} from "@/app/(provider)/provider/actions";
import { FormLoader } from "@/components/form-loader";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  getOwnProviderProfile,
  requireOnboardingUser,
} from "@/lib/auth/session";
import { isPayoutsActive } from "@/lib/provider/setup";

export const metadata: Metadata = { title: "Provider onboarding — payouts" };

const STRIPE_MESSAGES: Record<string, string> = {
  pending:
    "Stripe onboarding is temporarily unavailable. Try again in a moment or contact College Crew.",
  noemail:
    "Stripe needs an email address. Add one in Account settings, then return here.",
  refresh: "That Stripe link expired or was refreshed. Resume with a new link.",
  incomplete:
    "Stripe still needs information before payouts can turn on. Resume below.",
  save: "We created the Stripe account but could not save the connection. Try again; the retry safely reuses the same account.",
};

/** Wizard step 6: optional Stripe setup while founder review runs separately. */
export default async function OnboardingStripePage({
  searchParams,
}: {
  searchParams: Promise<{ stripe?: string; submitted?: string }>;
}) {
  await requireOnboardingUser("/provider/onboarding/stripe");
  const [{ stripe, submitted }, profile] = await Promise.all([
    searchParams,
    getOwnProviderProfile(),
  ]);
  if (!profile) redirect("/provider/onboarding/account");
  if (!profile.onboarding_submitted_at) redirect("/provider/onboarding");
  if (profile.verification_status === "rejected") {
    redirect("/provider/dashboard");
  }

  const payoutsActive = isPayoutsActive(profile);
  const stripeMessage = stripe ? STRIPE_MESSAGES[stripe] : null;

  return (
    <div>
      <WizardSteps current="stripe" />

      <Card pennant className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold">
              Set up payouts
            </h2>
            <p className="mt-1 max-w-lg text-sm text-ink-soft">
              Connect Stripe now while a founder reviews your student ID, or
              come back later. Stripe securely collects your identity and bank
              details; College Crew never sees them.
            </p>
          </div>
          <Badge
            tone={
              profile.verification_status === "approved" ? "green" : "gold"
            }
          >
            {profile.verification_status === "approved"
              ? "Founder approved"
              : "Founder review pending"}
          </Badge>
        </div>

        {submitted ? (
          <div className="mt-5 rounded-lg border border-quad-200 bg-quad-50 p-3 text-sm text-quad-800">
            College Crew onboarding submitted. You can safely leave and return
            to this step at any time.
          </div>
        ) : null}

        {stripeMessage ? (
          <div className="mt-5 rounded-lg border border-gold-300 bg-gold-100 p-3 text-sm text-gold-800">
            {stripeMessage}
          </div>
        ) : null}

        <div className="mt-6 rounded-xl border border-line bg-court p-5">
          {payoutsActive ? (
            <div>
              <Badge tone="green">✓ Stripe payouts active</Badge>
              <p className="mt-3 text-sm text-ink-soft">
                Your payout setup is complete. Your profile becomes visible
                only after founder approval and every other readiness check
                also passes.
              </p>
            </div>
          ) : profile.stripe_account_id ? (
            <div>
              <Badge tone="gold">Stripe setup incomplete</Badge>
              <p className="mt-3 text-sm text-ink-soft">
                Resume Stripe&apos;s hosted flow with a fresh single-use link.
                Verification can remain under review briefly after submission.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <form action={connectStripeFromOnboarding}>
                  <FormLoader />
                  <Button type="submit" size="sm">
                    Resume Stripe setup
                  </Button>
                </form>
                <form action={refreshStripeReadiness}>
                  <Button type="submit" size="sm" variant="secondary">
                    Refresh status
                  </Button>
                </form>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm font-semibold">Ready when you are</p>
              <p className="mt-1 text-sm text-ink-soft">
                Have your legal name, address, SSN or alternative identity
                details, and your own bank account ready. Stripe usually takes
                about five minutes.
              </p>
              <form action={connectStripeFromOnboarding} className="mt-4">
                <FormLoader />
                <Button type="submit" size="sm">
                  Set up payouts with Stripe
                </Button>
              </form>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <Link
            href="/provider/onboarding/review"
            className={buttonClasses({ variant: "ghost", size: "sm" })}
          >
            ← Back to review
          </Link>
          <Link
            href="/provider/dashboard"
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            {payoutsActive ? "Continue to dashboard" : "Do this later"}
          </Link>
        </div>
      </Card>
    </div>
  );
}
