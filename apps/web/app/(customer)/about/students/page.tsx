import type { Metadata } from "next";
import Link from "next/link";

import { Editable } from "@/components/content/editable";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getSession, isProviderCapable } from "@/lib/auth/session";
import { getLiveServices } from "@/lib/db/queries";
import {
  PILOT_SERVICE_AREA,
  PLATFORM_FEE_RATE,
  SITE,
  SITE_URL,
} from "@/lib/site";

/*
 * This page carries the supply side of the marketplace, and the recruiting
 * queries are the cheapest on the board: "babysitting jobs chicago" (KD 10) and
 * "dog walking jobs chicago" (KD 0), against KD 50+ for the customer-side
 * equivalents. It previously shipped a title and nothing else, so it competed
 * for nothing. See docs/plans/2026-08-04-seo-audit-followups.md.
 */
export const metadata: Metadata = {
  title: "Student jobs in Chicago",
  description: `Paid local work for verified college students in ${PILOT_SERVICE_AREA.name}: babysitting, dog walking, hauling, yard work and tutoring. Set your prices and hours.`,
  alternates: { canonical: `${SITE_URL}/about/students` },
};

const PRINCIPLES = [
  {
    title: "Earn through real neighborhood demand",
    body: "College Crew is built around practical services that neighbors already need, with the live catalog curated by the founders.",
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

export default async function StudentMissionPage() {
  const [session, services] = await Promise.all([
    getSession(),
    getLiveServices(),
  ]);
  const showProviderCta =
    !session ||
    (session.profile.role !== "admin" && !(await isProviderCapable()));
  const providerFeePercent = Math.round(PLATFORM_FEE_RATE * 100);

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <PageHeader
        title={
          <Editable k="about-students.header.title">
            Student jobs that fit around class
          </Editable>
        }
        description={
          <Editable k="about-students.header.description">
            {`${SITE.name} helps verified college students turn skill, reliability, and local trust into paid work close to campus.`}
          </Editable>
        }
        actions={
          showProviderCta ? (
            <Link
              href="/provider/onboarding"
              className={buttonClasses({ size: "sm" })}
            >
              Become a provider
            </Link>
          ) : null
        }
      />

      <section className="space-y-4 text-sm leading-relaxed text-ink-soft">
        <p>
          <Editable k="about-students.intro.p1">
            {`We believe students should have a clearer path to earn money without having to build a business from zero, rely on random posts, or manage every booking by text. ${SITE.name} gives students a simple place to offer services, set pricing, receive requests, and build trust with nearby customers.`}
          </Editable>
        </p>
        <p>
          <Editable k="about-students.intro.p2">
            {`The pilot is intentionally curated. We approve student providers manually, keep the service list focused, and start in ${PILOT_SERVICE_AREA.name} so students can serve real demand close to home or campus.`}
          </Editable>
        </p>
      </section>

      {/*
       * The page named no actual work, which left it thin and competing for
       * nothing. Pulled from getLiveServices() rather than hard-coded, per the
       * services-table rule in CLAUDE.md, so an admin toggling a service off
       * removes it here with no code change.
       */}
      {services.length > 0 ? (
        <section aria-labelledby="student-work">
          <h2 id="student-work" className="font-display text-2xl font-semibold">
            <Editable k="about-students.work.heading">
              The work students pick up
            </Editable>
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            <Editable k="about-students.work.body">
              These are the services neighbors are booking right now. Pick the
              ones you are good at, set your own rate for each, and leave the
              rest off your profile.
            </Editable>
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {services.map((service) => (
              <li key={service.id}>
                <Link
                  href={`/browse?service=${service.slug}`}
                  className="inline-flex rounded-full border border-stone bg-paper px-4 py-2 text-[13px] font-semibold text-viridian transition hover:-translate-y-px hover:bg-honeydew"
                >
                  {service.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="student-principles">
        <h2
          id="student-principles"
          className="font-display text-2xl font-semibold"
        >
          <Editable k="about-students.principles.heading">
            How we work with students
          </Editable>
        </h2>
        <div className="mt-4 grid gap-4">
          {PRINCIPLES.map((principle, index) => (
            <Card key={principle.title} pennant className="p-5">
              <h3 className="font-display text-xl font-semibold">
                <Editable k={`about-students.principles.${index}.title`}>
                  {principle.title}
                </Editable>
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                <Editable k={`about-students.principles.${index}.body`}>
                  {principle.body}
                </Editable>
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
          <Editable k="about-students.flow.heading">
            What students can expect
          </Editable>
        </h2>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-soft">
          <p>
            <Editable k="about-students.flow.p1">
              Students sign up with a school email, confirm they are 18 or
              older, submit student verification, choose services, and set
              pricing. Once approved, they can receive customer requests and
              accept the jobs that fit their schedule.
            </Editable>
          </p>
          <p>
            <Editable k="about-students.flow.p2">
              {`College Crew takes a ${providerFeePercent}% platform fee from the provider's side of completed jobs. Customers see clear prices, and providers keep the rest after platform and payment processing rules are applied.`}
            </Editable>
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
