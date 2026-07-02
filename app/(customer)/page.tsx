import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getLiveServices } from "@/lib/db/queries";
import { NEIGHBORHOOD } from "@/lib/site";

const HOW_IT_WORKS = [
  {
    step: "1",
    title: "Browse the crew",
    body: "Every provider is a verified college student (18+) from right around the corner — ID-checked by the founders before they ever appear here.",
  },
  {
    step: "2",
    title: "Request a booking",
    body: "Pick a time, share the address and details. Nothing is charged yet — the student accepts first.",
  },
  {
    step: "3",
    title: "Confirm & pay in-app",
    body: "Once they accept, you confirm and pay securely on the platform. That's it — they show up and get it done.",
  },
];

export default async function LandingPage() {
  const services = await getLiveServices();

  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="pt-8 text-center sm:pt-16">
        <p className="font-display text-sm font-semibold uppercase tracking-[0.22em] text-quad-600">
          Hyperlocal · student-powered · {NEIGHBORHOOD.name}
        </p>
        <h1 className="mx-auto mt-3 max-w-3xl font-display text-5xl font-bold uppercase leading-none tracking-wide text-ink sm:text-7xl">
          The neighborhood crew for your{" "}
          <span className="text-crew-600">to-do list</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-ink-soft">
          Hire verified college students for lawn care, babysitting, cleaning,
          tutoring, and more. Browse, book, and pay in one place — and back a
          young person while you&apos;re at it.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/browse" className={buttonClasses({ size: "lg" })}>
            Browse providers
          </Link>
          <Link
            href="/provider/onboarding/account"
            className={buttonClasses({ variant: "secondary", size: "lg" })}
          >
            Earn as a student
          </Link>
        </div>
        <p className="mt-6 text-xs font-medium text-mist">
          ✓ ID-verified students &nbsp;·&nbsp; ✓ 18+ only &nbsp;·&nbsp; ✓
          Payments protected in-app
        </p>
      </section>

      {/* How it works */}
      <section aria-labelledby="how-it-works">
        <h2
          id="how-it-works"
          className="text-center font-display text-3xl font-semibold uppercase tracking-wide"
        >
          How it works
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {HOW_IT_WORKS.map((item) => (
            <Card key={item.step} className="p-6">
              <p className="font-display text-4xl font-bold text-crew-200">
                {item.step}
              </p>
              <h3 className="mt-2 font-display text-xl font-semibold uppercase tracking-wide">
                {item.title}
              </h3>
              <p className="mt-2 text-sm text-ink-soft">{item.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Services (always from the curated `services` table, never hard-coded) */}
      <section aria-labelledby="services">
        <h2
          id="services"
          className="text-center font-display text-3xl font-semibold uppercase tracking-wide"
        >
          What the crew can do
        </h2>
        {services.length === 0 ? (
          <div className="mt-8">
            <EmptyState title="Services coming soon">
              The curated service list lives in the database — it&apos;ll show
              up here once the platform is connected and seeded.
            </EmptyState>
          </div>
        ) : (
          <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {services.map((service) => (
              <li key={service.id}>
                <Link
                  href={`/browse?service=${service.slug}`}
                  className="group block rounded-xl border border-line bg-paper p-5 shadow-sm transition-colors hover:border-crew-400"
                >
                  <p className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-mist">
                    {service.category}
                  </p>
                  <p className="mt-1 font-display text-lg font-semibold uppercase tracking-wide text-ink group-hover:text-crew-700">
                    {service.name}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Mission band */}
      <section className="pennant overflow-hidden rounded-2xl bg-crew-900 px-6 py-12 text-center sm:px-12">
        <h2 className="font-display text-3xl font-semibold uppercase tracking-wide text-white">
          Back young people
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-crew-100">
          Every booking puts money in a local student&apos;s pocket and a
          familiar face at your door. We verify every provider ourselves,
          curate every service, and stay small on purpose — one neighborhood
          at a time.
        </p>
        <Link
          href="/about"
          className={buttonClasses({
            variant: "secondary",
            className: "mt-6",
          })}
        >
          Meet the team
        </Link>
      </section>
    </div>
  );
}
