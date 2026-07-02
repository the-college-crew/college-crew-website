import type { Metadata } from "next";
import Link from "next/link";

import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";

import { WizardSteps } from "../../_components/wizard-steps";
import { startProviderProfile } from "../actions";
import { ProviderSignupForm } from "./provider-signup-form";

export const metadata: Metadata = { title: "Provider onboarding — account" };

/**
 * Wizard step 1: account (.edu + 18+ + password). Doubles as provider
 * signup when logged out; shows the account summary when logged in.
 */
export default async function OnboardingAccountPage() {
  const session = await getSession();

  return (
    <div>
      <WizardSteps current="account" />

      {!session ? (
        <Card pennant className="p-6">
          <h2 className="font-display text-xl font-semibold uppercase tracking-wide">
            Create your account
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Providers are college students, 18 or older, verified by the
            founders.
          </p>
          <div className="mt-5">
            <ProviderSignupForm />
          </div>
          <p className="mt-4 text-center text-sm text-ink-soft">
            Already started?{" "}
            <Link
              href="/login?next=/provider/onboarding/verify"
              className="font-semibold text-crew-700"
            >
              Log in to continue
            </Link>
          </p>
        </Card>
      ) : session.profile.role === "provider" ? (
        <Card pennant className="p-6">
          <h2 className="font-display text-xl font-semibold uppercase tracking-wide">
            Account ready ✓
          </h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-mist">Name</dt>
              <dd className="font-medium">{session.profile.full_name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-mist">School email</dt>
              <dd className="font-medium">{session.user.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-mist">Email confirmed</dt>
              <dd className="font-medium">
                {session.user.email_confirmed_at ? "Yes" : "Not yet — check your inbox"}
              </dd>
            </div>
          </dl>
          <form action={startProviderProfile} className="mt-6">
            <Button type="submit" size="lg" className="w-full">
              Continue to verification →
            </Button>
          </form>
        </Card>
      ) : (
        <Card className="p-6 text-sm text-ink-soft">
          <p>
            You&apos;re signed in as a{" "}
            {session.profile.role === "admin" ? "founder" : "customer"}.
            Provider accounts use a separate school (.edu) email — log out
            first, then start onboarding.
          </p>
          <Link
            href="/"
            className={buttonClasses({
              variant: "secondary",
              size: "sm",
              className: "mt-4",
            })}
          >
            Back to home
          </Link>
        </Card>
      )}
    </div>
  );
}
