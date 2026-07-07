import type { Metadata } from "next";
import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { NEIGHBORHOOD, SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Our mission for customers" };

const OUTCOMES = [
  {
    title: "Get help from someone local",
    body: "College Crew starts in one pilot neighborhood so customers can book nearby students for practical services without searching through open marketplaces.",
  },
  {
    title: "Support students directly",
    body: "Every booking helps a verified student earn, gain experience, and build a track record through work that matters to real neighbors.",
  },
  {
    title: "Book with more confidence",
    body: "Providers are reviewed before they go live, services are curated, and payments stay in the app so the process is easier to understand.",
  },
] as const;

export default function CustomerMissionPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <PageHeader
        eyebrow="For customers"
        title="A simpler way to get trusted help at home"
        description={`${SITE.name} helps neighbors turn everyday household needs into opportunities for verified local students.`}
        actions={
          <Link href="/browse" className={buttonClasses({ size: "sm" })}>
            Browse providers
          </Link>
        }
      />

      <section className="space-y-4 text-sm leading-relaxed text-ink-soft">
        <p>
          Home projects, errands, and recurring chores often need a person you
          can trust more than a giant marketplace. {SITE.name} is designed for
          neighbors who want reliable help and like the idea that their money
          backs young people in their own community.
        </p>
        <p>
          During the pilot, we are keeping the marketplace intentionally small:
          one neighborhood, curated services, and a limited group of verified
          student providers. That focus helps us learn what customers need,
          support students well, and keep the experience personal.
        </p>
      </section>

      <section aria-labelledby="customer-outcomes">
        <h2
          id="customer-outcomes"
          className="font-display text-2xl font-semibold"
        >
          What customers can achieve
        </h2>
        <div className="mt-4 grid gap-4">
          {OUTCOMES.map((outcome) => (
            <Card key={outcome.title} pennant className="p-5">
              <h3 className="font-display text-xl font-semibold">
                {outcome.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                {outcome.body}
              </p>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="customer-flow">
        <h2
          id="customer-flow"
          className="font-display text-2xl font-semibold"
        >
          How it works
        </h2>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-soft">
          <p>
            Customers browse student providers in {NEIGHBORHOOD.name}, choose a
            service, request a booking, and share the details needed for the
            job. The provider accepts or declines the request before payment is
            collected.
          </p>
          <p>
            Once a provider accepts, the customer confirms and pays in the app.
            That keeps the booking record, appointment details, and payment
            flow in one place while the student handles the work.
          </p>
        </div>
      </section>

      <p className="text-xs leading-relaxed text-mist">
        Providers on {SITE.name} are independent. College Crew connects
        customers with verified student providers, curates the marketplace, and
        processes payments for the pilot.
      </p>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/about"
          className={buttonClasses({ variant: "secondary", size: "sm" })}
        >
          Back to About
        </Link>
        <Link
          href="/about/students"
          className={buttonClasses({ variant: "ghost", size: "sm" })}
        >
          Student mission
        </Link>
      </div>
    </div>
  );
}
