import type { Metadata } from "next";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  GENERAL_FAMILY_DISCLOSURE,
  HOURLY_PAYMENT_AUTHORIZATION,
  CUSTOMER_BOOKING_TERMS_SECTIONS,
  CUSTOMER_BOOKING_TERMS_VERSION,
  PLATFORM_TERMS_SECTIONS,
  PLATFORM_TERMS_VERSION,
  PROVIDER_TERMS_SECTIONS,
  PROVIDER_TERMS_VERSION,
  SERVICE_RISK_ADDENDA,
} from "@/lib/legal/waivers";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Legal agreement",
  description:
    "The agreements that govern College Crew: platform terms, customer booking terms, provider terms, payment authorization, and per-service risk addenda.",
  alternates: { canonical: `${SITE_URL}/legal` },
};

export default function LegalOverviewPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title="College Crew legal terms"
        description="The platform-wide and action-specific agreements, shown here for reference."
      />

      <Card className="p-5 text-sm leading-6 text-ink-soft">
        College Crew&apos;s collection, use, disclosure, retention, and
        protection of personal information are described in the{" "}
        <Link href="/privacy" className="font-semibold text-crew-700 underline">
          Privacy Policy
        </Link>
        .
      </Card>

      <Card id="platform-terms" pennant className="scroll-mt-24 p-6">
        <div className="space-y-5 text-sm leading-6 text-ink-soft">
          <h2 className="font-display text-lg font-semibold text-ink">
            Platform Terms · Version {PLATFORM_TERMS_VERSION}
          </h2>
          <p>
            Every regular account accepts these terms once after email
            verification.
          </p>

          {PLATFORM_TERMS_SECTIONS.map((section) => (
            <section key={section.number} className="border-t border-line pt-5">
              <h3 className="font-display text-base font-semibold text-ink">
                {section.number}. {section.title}
              </h3>
              <div className="mt-2 space-y-3">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Card>

      <Card id="customer-booking-terms" pennant className="scroll-mt-24 p-6">
        <h2 className="font-display text-lg font-semibold text-ink">
          Customer Booking Terms · Version {CUSTOMER_BOOKING_TERMS_VERSION}
        </h2>
        <div className="mt-3 space-y-5 text-sm leading-6 text-ink-soft">
          <p>
            Customers accept these once before their first hourly request.
          </p>
          {CUSTOMER_BOOKING_TERMS_SECTIONS.map((section) => (
            <section key={section.title} className="border-t border-line pt-5">
              <h3 className="font-display text-base font-semibold text-ink">
                {section.title}
              </h3>
              <div className="mt-2 space-y-3">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Card>

      <Card id="provider-terms" pennant className="scroll-mt-24 p-6">
        <h2 className="font-display text-lg font-semibold text-ink">
          Provider Terms · Version {PROVIDER_TERMS_VERSION}
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink-soft">
          Providers accept this addendum at the final onboarding review.
        </p>
        <div className="mt-3 space-y-5 text-sm leading-6 text-ink-soft">
          {PROVIDER_TERMS_SECTIONS.map((section) => (
            <section key={section.title} className="border-t border-line pt-5">
              <h3 className="font-display text-base font-semibold text-ink">
                {section.title}
              </h3>
              <div className="mt-2 space-y-3">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Card>

      <Card pennant className="p-6">
        <h2 className="font-display text-lg font-semibold text-ink">
          Booking risk addenda
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink-soft">
          Accepted for each booking, with the service, date, address, customer,
          and provider captured in the immutable snapshot.
        </p>
        <div className="mt-5 space-y-5 text-sm leading-6 text-ink-soft">
          {GENERAL_FAMILY_DISCLOSURE.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}

          {Object.values(SERVICE_RISK_ADDENDA).map((addendum) => (
            <section
              key={addendum.title}
              className="border-t border-line pt-5"
            >
              <h3 className="font-display text-base font-semibold text-ink">
                {addendum.title}
              </h3>
              <div className="mt-2 space-y-3">
                {addendum.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Card>

      <Card pennant className="p-6">
        <h2 className="font-display text-lg font-semibold text-ink">
          Per-booking payment authorization
        </h2>
        <p className="mt-3 rounded-lg border border-line bg-court p-4 text-sm leading-6 text-ink-soft">
          {HOURLY_PAYMENT_AUTHORIZATION}
        </p>
        <p className="mt-3 text-sm leading-6 text-ink-soft">
          The accepted record also captures that booking&apos;s first-hour amount,
          estimated total, estimated balance, and payment deadline.
        </p>
      </Card>
    </div>
  );
}
