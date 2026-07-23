import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";

import { Section } from "../_components/section";

const STEPS = [
  "Verify your school (.edu) email and upload your ID so neighbors know you're a real, local student.",
  "Pick the services you offer and set your pricing.",
  "Set the days and hours you're available.",
  "We review your account, then your storefront goes live on Browse.",
] as const;

/**
 * The upgrade path for an account that doesn't provide yet. Providing is a
 * capability, not a separate account — this tab replaces itself with the
 * Storefront/Availability/Pricing/Payouts tabs once onboarding starts.
 */
export function BecomeProviderPanel() {
  return (
    <Section
      title="Become a provider"
      description="Earn from this same account — you keep browsing and booking like any other neighbor."
    >
      <ol className="mb-5 space-y-3 text-sm text-ink-soft">
        {STEPS.map((step, index) => (
          <li key={step} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-court text-xs font-bold text-viridian">
              {index + 1}
            </span>
            <span className="leading-relaxed">{step}</span>
          </li>
        ))}
      </ol>

      <Link
        href="/provider/onboarding/account"
        className={buttonClasses({ size: "sm" })}
      >
        Start provider setup
      </Link>
      <p className="mt-3 text-xs text-mist">
        You must be 18 or older and enrolled at a college or university.
      </p>
    </Section>
  );
}
