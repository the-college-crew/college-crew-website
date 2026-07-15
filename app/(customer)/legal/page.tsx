import type { Metadata } from "next";

import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  GENERAL_FAMILY_DISCLOSURE,
  HOURLY_PAYMENT_AUTHORIZATION,
  HOURLY_TERMS_INTRO,
  HOURLY_TERMS_SECTIONS,
  LEGAL_CONTENT_VERSION,
  MASTER_INTRO,
  MASTER_SECTIONS,
  SERVICE_RISK_ADDENDA,
} from "@/lib/legal/waivers";

export const metadata: Metadata = { title: "Legal agreement" };

export default function LegalOverviewPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title="Master Service Agreement"
        description={`The agreement customers and students accept when they use College Crew, shown here for reference. Version ${LEGAL_CONTENT_VERSION}.`}
      />

      <Card pennant className="p-6">
        <div className="space-y-5 text-sm leading-6 text-ink-soft">
          {MASTER_INTRO.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}

          {MASTER_SECTIONS.map((section) => (
            <section key={section.number} className="border-t border-line pt-5">
              <h2 className="font-display text-lg font-semibold text-ink">
                {section.number}. {section.title}
                {section.appliesTo === "provider" ? (
                  <span className="ml-2 align-middle text-xs font-medium uppercase tracking-wide text-ink-soft">
                    Students only
                  </span>
                ) : null}
              </h2>
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
          Hourly Booking Terms &amp; Fee Schedule
        </h2>
        <div className="mt-3 space-y-5 text-sm leading-6 text-ink-soft">
          {HOURLY_TERMS_INTRO.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          {HOURLY_TERMS_SECTIONS.map((section) => (
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
          <section className="border-t border-line pt-5">
            <h3 className="font-display text-base font-semibold text-ink">
              First-hour payment authorization
            </h3>
            <p className="mt-2 rounded-lg border border-line bg-court p-4">
              {HOURLY_PAYMENT_AUTHORIZATION}
            </p>
          </section>
        </div>
      </Card>

      <Card pennant className="p-6">
        <h2 className="font-display text-lg font-semibold text-ink">
          Booking risk addenda
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink-soft">
          Shown at the time of booking for the specific service, in addition
          to the Master Service Agreement above.
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
    </div>
  );
}
