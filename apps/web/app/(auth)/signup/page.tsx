import type { Metadata } from "next";
import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Sign up" };

/**
 * Shared signup with the "hire vs. earn" role choice (SPEC §8 Auth).
 * Hiring creates a customer account here; earning routes into the provider
 * onboarding wizard, whose first step is account creation.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; oauth_error?: string }>;
}) {
  const [{ role, oauth_error: oauthError }, session] = await Promise.all([
    searchParams,
    getSession(),
  ]);
  const earning = role === "earn";

  const tab = (active: boolean) =>
    cn(
      "flex-1 rounded-lg px-4 py-2 text-center text-sm font-semibold transition-colors",
      active ? "bg-crew-600 text-white" : "text-ink-soft hover:bg-crew-50",
    );

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">
        Join the crew
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        First things first: are you hiring help, or earning as a student?
      </p>

      <div
        role="tablist"
        aria-label="Account type"
        className="mt-5 flex gap-1 rounded-xl border border-line bg-court p-1"
      >
        <Link role="tab" aria-selected={!earning} href="/signup" className={tab(!earning)}>
          Hire help
        </Link>
        <Link
          role="tab"
          aria-selected={earning}
          href="/signup?role=earn"
          className={tab(earning)}
        >
          Earn as a student
        </Link>
      </div>

      <div className="mt-6">
        {earning ? (
          <div className="space-y-4 text-sm text-ink-soft">
            <p>
              Provider accounts are created in the onboarding wizard. You&apos;ll
              need:
            </p>
            <ul className="list-inside list-disc space-y-1">
              <li>Your school (.edu) email. Providers are students, 18+</li>
              <li>
                Photos of your driver&apos;s license (front and back) for
                manual review
              </li>
              <li>The services you want to offer, with your prices</li>
            </ul>
            <p>
              After the founders approve your ID, you&apos;ll connect a bank
              account through Stripe and go live.
            </p>
            {!session ? (
              <Link
                href="/provider/onboarding/account"
                className={buttonClasses({ size: "lg", className: "w-full" })}
              >
                Start provider onboarding
              </Link>
            ) : (
              <div className="rounded-xl border border-line bg-court p-3">
                <p className="text-sm text-ink-soft">
                  Your current account can also become a provider account.
                </p>
                <Link
                  href="/provider/onboarding/account"
                  className={buttonClasses({
                    size: "sm",
                    className: "mt-3 w-full",
                  })}
                >
                  Become a provider
                </Link>
              </div>
            )}
          </div>
        ) : (
          <SignupForm oauthError={oauthError} />
        )}
      </div>

      <p className="mt-6 text-center text-sm text-ink-soft">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-crew-700">
          Log in
        </Link>
      </p>
      <p className="mt-3 text-center text-xs leading-5 text-ink-soft">
        Learn how we handle personal information in our{" "}
        <Link href="/privacy" className="font-semibold text-crew-700 underline">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
