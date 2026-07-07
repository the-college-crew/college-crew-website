import type { Metadata } from "next";
import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PLATFORM_FEE_RATE, SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Our mission for students" };

const PRINCIPLES = [
  {
    title: "Earn through real neighborhood demand",
    body: "College Crew is built around practical home and household services that neighbors already need, from yard work to cleaning, moving help, tutoring, and more.",
  },
  {
    title: "Build trust before the first job",
    body: "Providers are verified as students, must be 18 or older, and can show customers that someone local has reviewed their account before they ever arrive.",
  },
  {
    title: "Keep payments organized",
    body: "Bookings and payments happen in the app, so students can focus on doing good work instead of chasing cash, texts, or informal follow-ups.",
  },
] as const;

export default function StudentMissionPage() {
  const providerFeePercent = Math.round(PLATFORM_FEE_RATE * 100);

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <PageHeader
        eyebrow="For students"
        title="A better way for students to earn locally"
        description={`${SITE.name} is here to help verified college students turn skill, reliability, and local trust into real work.`}
        actions={
          <Link
            href="/provider/onboarding/account"
            className={buttonClasses({ size: "sm" })}
          >
            Start earning
          </Link>
        }
      />

      <section className="space-y-4 text-sm leading-relaxed text-ink-soft">
        <p>
          We believe students should have a clearer path to earn money without
          having to build a business from zero, rely on random posts, or manage
          every booking by text. {SITE.name} gives students a simple place to
          offer services, set pricing, receive requests, and build trust with
          nearby customers.
        </p>
        <p>
          The pilot is intentionally curated. We approve student providers
          manually, keep the service list focused, and start with one local
          neighborhood so students can serve real demand close to home or
          campus.
        </p>
      </section>

      <section aria-labelledby="student-principles">
        <h2
          id="student-principles"
          className="font-display text-2xl font-semibold"
        >
          How we work with students
        </h2>
        <div className="mt-4 grid gap-4">
          {PRINCIPLES.map((principle) => (
            <Card key={principle.title} pennant className="p-5">
              <h3 className="font-display text-xl font-semibold">
                {principle.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                {principle.body}
              </p>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="student-flow">
        <h2
          id="student-flow"
          className="font-display text-2xl font-semibold"
        >
          What students can expect
        </h2>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-soft">
          <p>
            Students sign up with a school email, confirm they are 18 or older,
            submit student verification, choose services, and set pricing. Once
            approved, they can receive customer requests and accept the jobs
            that fit their schedule.
          </p>
          <p>
            College Crew takes a {providerFeePercent}% platform fee from the
            provider&apos;s side of completed jobs. Customers see clear prices,
            and providers keep the rest after platform and payment processing
            rules are applied.
          </p>
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/about"
          className={buttonClasses({ variant: "secondary", size: "sm" })}
        >
          Back to About
        </Link>
        <Link
          href="/about/customers"
          className={buttonClasses({ variant: "ghost", size: "sm" })}
        >
          Customer mission
        </Link>
      </div>
    </div>
  );
}
