import type { Metadata } from "next";
import Link from "next/link";

import { Editable } from "@/components/content/editable";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { NEIGHBORHOOD, SITE, TEAM } from "@/lib/site";

export const metadata: Metadata = { title: "About us" };

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <PageHeader
        title={<Editable k="about.header.title">About us</Editable>}
        description={
          <Editable k="about.header.description">{SITE.tagline}</Editable>
        }
      />

      <section className="space-y-4 text-sm leading-relaxed text-ink-soft">
        <p>
          <Editable k="about.intro.p1">
            {`${SITE.name} started with a simple observation: every neighborhood is full of jobs that need doing, and every campus is full of students who'd gladly do them. What's missing is trust — knowing who's showing up at your door, and knowing you'll actually get paid for the work.`}
          </Editable>
        </p>
        <p>
          <Editable k="about.intro.p2">
            {`So we built the connection ourselves. Every provider on ${SITE.name} is a college student, 18 or older, verified by us personally — school email, driver's license, the works. We curate which services are offered instead of running an open listing site, and every booking and payment happens on the platform, so both sides are covered.`}
          </Editable>
        </p>
        <p>
          <Editable k="about.intro.p3">
            {`We're starting small on purpose: one pilot neighborhood (${NEIGHBORHOOD.name}), a handful of hand-picked students, and neighbors who want to back young people while getting real help.`}
          </Editable>
        </p>
      </section>

      <section aria-labelledby="why-students">
        <h2
          id="why-students"
          className="font-display text-2xl font-semibold"
        >
          <Editable k="about.why-students.heading">Why students?</Editable>
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          <Editable k="about.why-students.body">
            {`Because hiring a student isn't just outsourcing a chore — it's an investment in someone at the start of their story. Students bring energy and hustle; neighbors bring work and mentoring moments. Money stays in the neighborhood, and young people build something real before they graduate.`}
          </Editable>
        </p>
      </section>

      <section aria-labelledby="learn-more">
        <h2
          id="learn-more"
          className="font-display text-2xl font-semibold"
        >
          <Editable k="about.learn-more.heading">
            Learn more about our mission
          </Editable>
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Card pennant className="flex flex-col p-5">
            <h3 className="font-display text-xl font-semibold">
              <Editable k="about.learn-more.students.title">
                For students
              </Editable>
            </h3>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-soft">
              <Editable k="about.learn-more.students.body">
                {`See how ${SITE.name} helps verified students earn locally, build a reputation, and get paid through a safer, more organized system.`}
              </Editable>
            </p>
            <Link
              href="/about/students"
              className={buttonClasses({
                variant: "secondary",
                size: "sm",
                className: "mt-5 self-start",
              })}
            >
              Learn about students
            </Link>
          </Card>

          <Card pennant className="flex flex-col p-5">
            <h3 className="font-display text-xl font-semibold">
              <Editable k="about.learn-more.customers.title">
                For customers
              </Editable>
            </h3>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-soft">
              <Editable k="about.learn-more.customers.body">
                Learn how neighbors can book trusted local help, support young
                people, and handle household work without starting from
                scratch.
              </Editable>
            </p>
            <Link
              href="/about/customers"
              className={buttonClasses({
                variant: "secondary",
                size: "sm",
                className: "mt-5 self-start",
              })}
            >
              Learn about customers
            </Link>
          </Card>
        </div>
      </section>

      <section aria-labelledby="team">
        <h2
          id="team"
          className="font-display text-2xl font-semibold"
        >
          <Editable k="about.team.heading">The team</Editable>
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {TEAM.map((member, index) => (
            <Card key={member.name} pennant className="p-4 text-center">
              <p className="font-display text-lg font-semibold">
                <Editable k={`about.team.${index}.name`}>
                  {member.name}
                </Editable>
              </p>
              <p className="mt-1 text-xs text-mist">
                <Editable k={`about.team.${index}.role`}>
                  {member.role}
                </Editable>
              </p>
            </Card>
          ))}
        </div>
      </section>

      <p className="text-xs text-mist">
        <Editable k="about.disclaimer">
          {`Providers on ${SITE.name} are independent — they're responsible for the work they do. ${SITE.name} connects you, verifies providers, and processes payments. Full terms of service are coming with the pilot launch.`}
        </Editable>
      </p>
    </div>
  );
}
