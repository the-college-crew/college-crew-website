import Image from "next/image";
import Link from "next/link";

import { Editable } from "@/components/content/editable";
import { getEffectiveRole, getSession } from "@/lib/auth/session";
import { FAQS, PARENT_STEPS, STUDENT_STEPS } from "@/lib/content/defaults";
import { getLiveServices } from "@/lib/db/queries";
import type { Service } from "@/lib/db/types";

type Cta = { href: string; label: string };

import { FAQList, HowItWorksTabs, type FaqItem, type Step } from "./landing-client";

const MARK_SRC = "/college-crew-mark.png";

const TRUST_ITEMS = [
  {
    title: "ID & background-checked",
    body: "Every student is screened before booking.",
    icon: CheckIcon,
  },
  {
    title: "Matched by proximity & school",
    body: '"2 miles away - verified Northwestern sophomore"',
    icon: DiamondIcon,
  },
  {
    title: "Paid securely",
    body: "Every job settles in-app, no cash or Venmo.",
    icon: DollarIcon,
  },
];

type ServiceDisplay = {
  cadence: string;
  blurb: string;
  icon: string;
};

const SERVICE_DISPLAY: Record<string, ServiceDisplay> = {
  "lawn-yard-care": {
    cadence: "Weekly",
    blurb: "The demand anchor: sell as a full-season package, not a one-off mow.",
    icon: "LC",
  },
  "pet-care": {
    cadence: "Daily/weekly",
    blurb: "High-frequency, low trust barrier: bundle walks into weekly charges.",
    icon: "DW",
  },
  "house-management": {
    cadence: "Flexible",
    blurb: "Errands and home tasks like package returns, grocery pickup, and check-ins.",
    icon: "HM",
  },
  tutoring: {
    cadence: "Seasonal",
    blurb: "Where students have the biggest edge: sells well as session packages.",
    icon: "TT",
  },
  "youth-sports-coaching": {
    cadence: "Weekly",
    blurb: "Student athletes coach kids on fundamentals, confidence, and sport-specific skills.",
    icon: "SC",
  },
  hauling: {
    cadence: "One-off",
    blurb: "High ticket, low trust barrier: a great first booking for new families.",
    icon: "HJ",
  },
  "pressure-washing": {
    cadence: "Seasonal",
    blurb: "Driveways, patios, and outdoor surfaces handled by equipped student crews.",
    icon: "PW",
  },
  "window-washing": {
    cadence: "Seasonal",
    blurb: "Interior and exterior windows from student-run crews with the right gear.",
    icon: "WW",
  },
  babysitting: {
    cadence: "Coming soon",
    blurb: "Highest demand, highest trust bar: added once vetting is fully in place.",
    icon: "BS",
  },
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

function serviceDisplay(service: Service): ServiceDisplay {
  return (
    SERVICE_DISPLAY[service.slug] ?? {
      cadence: service.category,
      blurb: "Verified student help for practical jobs around the neighborhood.",
      icon: initials(service.name) || "CC",
    }
  );
}

const FEATURES = [
  {
    title: "Verified & background-checked",
    body: "ID verification and background checks on every student before they're bookable.",
    tone: "bg-honeydew",
    icon: CheckIcon,
  },
  {
    title: "Secure in-app payments",
    body: "No cash, no Venmo requests: payment is held and released once the job's done.",
    tone: "bg-sky",
    icon: DollarIcon,
  },
  {
    title: "A reputation that travels",
    body: "Reviews and track record move with a student between home and campus. Nothing resets.",
    tone: "bg-honeydew",
    icon: StarIcon,
  },
  {
    title: "Bundled & recurring",
    body: "Repeat jobs can be booked as season passes and packages, not just one-off requests.",
    tone: "bg-sky",
    icon: CircleIcon,
  },
];

const TESTIMONIALS = [
  {
    quote:
      "I like that I know who's showing up. It's not a stranger off an app, it's a verified student from a few streets over.",
    name: "Dana R.",
    detail: "Parent, Northbrook",
  },
  {
    quote:
      "My reviews from helping families at home actually count for something near campus now. That never used to be true.",
    name: "Ethan M.",
    detail: "Student, Northwestern '27",
  },
  {
    quote:
      "Booking a recurring job instead of texting back and forth every week has been the easiest part.",
    name: "The Alvarez family",
    detail: "Parents, Glenview",
  },
];

export default async function LandingPage() {
  const [session, services] = await Promise.all([
    getSession(),
    getLiveServices(),
  ]);
  const showProviderCtas = !session;
  const role = session ? await getEffectiveRole() : null;

  // Providers already have an account — send them to their dashboard instead
  // of the customer browse flow. Everyone else gets the "Book a student" CTA.
  const primaryCta: Cta =
    role === "provider"
      ? { href: "/provider/dashboard", label: "View dashboard" }
      : { href: "/browse", label: "Book a student" };

  return (
    <div className="home-canvas mx-[calc(50%-50vw)] -mt-8 -mb-24 w-screen max-w-[100vw] overflow-x-clip text-viridian">
      <Hero showProviderCta={showProviderCtas} primaryCta={primaryCta} />
      <PhoneFloat services={services} />

      <section className="pb-2 text-center">
        <div className="mx-auto max-w-6xl px-4">
          <span className="text-sm font-bold tracking-[0.02em] text-viridian/55">
            <Editable k="home.banner.note">
              Now booking in Highland Park and Lincoln Park
            </Editable>
          </span>
        </div>
      </section>

      <section id="safety" className="mt-10 bg-stone py-14">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 md:grid-cols-3">
          {TRUST_ITEMS.map(({ title, body, icon: Icon }, index) => (
            <div key={title} className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-shell text-viridian">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold">
                  <Editable k={`home.trust.${index}.title`}>{title}</Editable>
                </h2>
                <p className="mt-1 text-sm text-viridian/65">
                  <Editable k={`home.trust.${index}.body`}>{body}</Editable>
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Comparison />
      <HowItWorksTabs
        eyebrow={<Editable k="home.how.eyebrow">How it works</Editable>}
        heading={
          <Editable k="home.how.heading">
            Simple for families. Rewarding for students.
          </Editable>
        }
        parentSteps={editableSteps("home.how.families", PARENT_STEPS)}
        studentSteps={editableSteps("home.how.students", STUDENT_STEPS)}
      />
      <ServicesSection services={services} />
      <FeaturesSection />
      <TestimonialsSection />
      <FAQList
        eyebrow={<Editable k="home.faq.eyebrow">FAQ</Editable>}
        heading={<Editable k="home.faq.heading">Good to know.</Editable>}
        items={FAQS.map(
          (faq, index): FaqItem => ({
            q: <Editable k={`home.faq.${index}.q`}>{faq.q}</Editable>,
            a: <Editable k={`home.faq.${index}.a`}>{faq.a}</Editable>,
          }),
        )}
      />
      {showProviderCtas ? (
        <CTASection showProviderCta={showProviderCtas} primaryCta={primaryCta} />
      ) : null}
    </div>
  );
}

function editableSteps(
  prefix: string,
  steps: { n: string; title: string; body: string }[],
): Step[] {
  return steps.map((step, index) => ({
    n: step.n,
    title: <Editable k={`${prefix}.${index}.title`}>{step.title}</Editable>,
    body: <Editable k={`${prefix}.${index}.body`}>{step.body}</Editable>,
  }));
}

function Hero({
  showProviderCta,
  primaryCta,
}: {
  showProviderCta: boolean;
  primaryCta: Cta;
}) {
  return (
    <section className="relative overflow-hidden bg-stone px-4 py-16 text-center sm:py-20 lg:pb-48">
      <DecorativeMark className="absolute top-6 right-6 hidden w-44 opacity-20 sm:block" />
      <div className="relative z-10 mx-auto max-w-[760px]">
        <span className="brand-eyebrow">
          <Editable k="home.hero.eyebrow">Your neighbors, your students</Editable>
        </span>
        <h1 className="mt-6 font-display text-[2.3rem] font-semibold leading-[1.06] text-viridian sm:text-[3.75rem]">
          <Editable k="home.hero.title">
            Hometown help, from someone your block already trusts.
          </Editable>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-viridian/75 sm:text-lg">
          <Editable k="home.hero.subtitle">
            College Crew connects families with verified college students for
            practical neighborhood help - matched by proximity and school, and
            paid securely in the app.
          </Editable>
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href={primaryCta.href}
            className="inline-flex items-center justify-center rounded-xl bg-viridian px-7 py-4 text-sm font-bold text-shell transition hover:bg-viridian-ink"
          >
            {primaryCta.label}
          </Link>
          {showProviderCta ? (
            <Link
              href="/provider/onboarding/account"
              className="inline-flex items-center justify-center rounded-xl border-2 border-viridian/35 px-7 py-4 text-sm font-bold text-viridian transition hover:bg-shell/40"
            >
              Join as a student
            </Link>
          ) : null}
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          {[
            "Verified & background-checked",
            "Matched by proximity & school",
            "Secure in-app payment",
          ].map((item, index) => (
            <span
              key={item}
              className="flex items-center gap-2 text-sm font-semibold text-viridian/70"
            >
              <span className="h-2 w-2 rounded-full bg-viridian" />
              <Editable k={`home.hero.points.${index}`}>{item}</Editable>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function PhoneFloat({ services }: { services: Service[] }) {
  const shownServices = services.slice(0, 3);

  return (
    <div className="relative z-20 -mt-24 flex justify-center px-4 pb-16 sm:-mt-36">
      <div className="absolute bottom-10 left-[calc(50%-260px)] hidden h-72 w-72 rounded-full bg-sky opacity-60 blur-md sm:block" />
      <div className="relative w-full max-w-[326px] rounded-[2rem] bg-viridian p-2 shadow-[0_28px_80px_rgba(52,73,69,0.25)]">
        <div className="rounded-[1.6rem] bg-shell p-4">
          <h2 className="font-display text-2xl font-semibold">Book a job</h2>
          <div className="mt-4 flex gap-2 overflow-hidden">
            {shownServices.length > 0 ? (
              shownServices.map((service, index) => (
                <span
                  key={service.id}
                  className={
                    index === 0
                      ? "rounded-full bg-viridian px-4 py-2 text-xs font-bold text-shell"
                      : "rounded-full bg-stone px-4 py-2 text-xs font-semibold"
                  }
                >
                  {service.name}
                </span>
              ))
            ) : (
              <span className="rounded-full bg-viridian px-4 py-2 text-xs font-bold text-shell">
                Browse
              </span>
            )}
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl bg-stone">
            <div className="flex h-28 items-center justify-center bg-[repeating-linear-gradient(135deg,var(--color-sky)_0_12px,var(--color-honeydew)_12px_24px)] text-xs font-bold uppercase tracking-[0.12em] text-viridian/45">
              job details
            </div>
            <div className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-bold">Neighborhood help</p>
                  <p className="mt-1 text-xs text-viridian/65">
                    123 Maple Street
                  </p>
                </div>
                <p className="font-display text-lg font-bold">$45</p>
              </div>
              <p className="mt-3 text-xs text-viridian/55">
                Sat, May 10 - 9:00 AM - 45 min
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-honeydew px-4 py-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-viridian text-sm text-shell">
              <CheckIcon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-bold">Verified & background-checked</p>
              <p className="text-xs text-viridian/60">
                ID verified - 2 miles away
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-stone p-4">
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-viridian/55">
              Matched student
            </p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-sky" />
                <p className="text-sm font-bold">Ethan - Northwestern &apos;27</p>
              </div>
              <p className="text-xs font-bold">4.9</p>
            </div>
          </div>

          <div className="mt-4 flex w-full items-center justify-center rounded-xl bg-viridian py-4 text-sm font-bold text-shell">
            Book job - $45
          </div>
        </div>
      </div>
    </div>
  );
}

function Comparison() {
  return (
    <section className="brand-section">
      <div className="relative mx-auto max-w-6xl px-4">
        <DecorativeMark className="absolute -top-6 right-4 hidden w-28 opacity-20 md:block" />
        <span className="brand-eyebrow">
          <Editable k="home.compare.eyebrow">Why College Crew</Editable>
        </span>
        <h2 className="mt-4 max-w-3xl font-display text-4xl font-semibold leading-tight text-viridian">
          <Editable k="home.compare.heading">
            A good name in this town should count for something.
          </Editable>
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-viridian/70">
          <Editable k="home.compare.body">
            Every student starts from zero in a new town twice a year.
            Care.com, Thumbtack, and Nextdoor were never built around student
            identity or the kind of trust neighbors build over time. College
            Crew was.
          </Editable>
        </p>
        <div className="mt-9 grid gap-5 md:grid-cols-2">
          <CompareColumn
            title={
              <Editable k="home.compare.them.title">
                Care.com, Thumbtack, Nextdoor
              </Editable>
            }
            items={[
              "Reputation is tied to the platform, not the person",
              "No sense of who's actually nearby or in school",
              "Anonymous listings, not a known, verified student",
              "Reviews don't travel if you move or switch apps",
            ].map((item, index) => (
              <Editable key={index} k={`home.compare.them.items.${index}`}>
                {item}
              </Editable>
            ))}
          />
          <CompareColumn
            dark
            title={<Editable k="home.compare.us.title">College Crew</Editable>}
            items={[
              "One profile, one reputation, home and campus",
              "Matched by proximity and school, not a random zip code",
              "Every student is ID and background-checked",
              "Reviews and ratings travel with you, always",
            ].map((item, index) => (
              <Editable key={index} k={`home.compare.us.items.${index}`}>
                {item}
              </Editable>
            ))}
          />
        </div>
      </div>
    </section>
  );
}

function CompareColumn({
  title,
  items,
  dark = false,
}: {
  title: React.ReactNode;
  items: React.ReactNode[];
  dark?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl p-7 ${
        dark ? "bg-viridian text-shell" : "bg-stone text-viridian"
      }`}
    >
      <h3
        className={`text-base font-bold ${
          dark ? "text-honeydew" : "text-viridian/60"
        }`}
      >
        {title}
      </h3>
      <ul
        className={`mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed ${
          dark ? "text-shell/85" : "text-viridian/75"
        }`}
      >
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function ServicesSection({ services }: { services: Service[] }) {
  return (
    <>
      <section className="brand-section pb-10">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <span className="brand-eyebrow">
                <Editable k="home.services.eyebrow">What you can book</Editable>
              </span>
              <h2 className="mt-4 max-w-2xl font-display text-4xl font-semibold leading-tight text-viridian">
                <Editable k="home.services.heading">
                  Services matched to what students do best.
                </Editable>
              </h2>
            </div>
            <div
              className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone text-lg font-semibold text-viridian sm:flex"
              aria-hidden
            >
              +
            </div>
          </div>
        </div>
      </section>
      <section className="pb-20">
        <div className="mx-auto grid max-w-6xl gap-5 px-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.length === 0 ? (
            <div className="rounded-3xl border border-stone bg-shell p-7 text-sm text-viridian/70 sm:col-span-2 lg:col-span-3">
              Live services will appear here once the catalog is available.
            </div>
          ) : null}
          {services.map((service) => {
            const display = serviceDisplay(service);

            return (
              <Link
                key={service.id}
                href={`/browse?service=${service.slug}`}
                className="group rounded-3xl border border-stone bg-shell p-7 transition hover:-translate-y-0.5 hover:border-viridian"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-sky text-xs font-black text-viridian">
                  {display.icon}
                </div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-base font-bold text-viridian">
                    {service.name}
                  </h3>
                  <span className="whitespace-nowrap rounded-full bg-stone px-3 py-1 text-[0.68rem] font-bold text-viridian/55">
                    <Editable k={`home.services.${service.slug}.cadence`}>
                      {display.cadence}
                    </Editable>
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-viridian/70">
                  <Editable k={`home.services.${service.slug}.blurb`}>
                    {display.blurb}
                  </Editable>
                </p>
              </Link>
            );
          })}
        </div>
      </section>
    </>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="brand-section bg-stone">
      <div className="mx-auto max-w-6xl px-4">
        <span className="brand-eyebrow">
          <Editable k="home.features.eyebrow">Why families choose us</Editable>
        </span>
        <h2 className="mt-4 font-display text-4xl font-semibold text-viridian">
          <Editable k="home.features.heading">
            Built for trust, front to back.
          </Editable>
        </h2>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {FEATURES.map(({ title, body, tone, icon: Icon }, index) => (
            <div key={title} className="rounded-3xl bg-shell p-8">
              <div
                className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl ${tone}`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-viridian">
                <Editable k={`home.features.${index}.title`}>{title}</Editable>
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-viridian/70">
                <Editable k={`home.features.${index}.body`}>{body}</Editable>
              </p>
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-4 rounded-3xl bg-shell/60 p-5 md:grid-cols-3">
          {[
            ["ID & background checks", "Every student is verified before their first booking."],
            ["Guarantee & support", "If a job isn't done right, we make it right."],
            ["What the fee funds", "A small Trust & Safety fee on each booking covers all of the above."],
          ].map(([title, body], index) => (
            <div key={title}>
              <h3 className="text-sm font-bold text-viridian">
                <Editable k={`home.feature-notes.${index}.title`}>
                  {title}
                </Editable>
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-viridian/65">
                <Editable k={`home.feature-notes.${index}.body`}>
                  {body}
                </Editable>
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TestimonialsSection() {
  return (
    <section className="brand-section">
      <div className="mx-auto max-w-6xl px-4">
        <span className="brand-eyebrow">
          <Editable k="home.testimonials.eyebrow">Early feedback</Editable>
        </span>
        <h2 className="mt-4 font-display text-4xl font-semibold text-viridian">
          <Editable k="home.testimonials.heading">
            What families and students are saying.
          </Editable>
        </h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {TESTIMONIALS.map((item, index) => (
            <figure key={item.name} className="rounded-3xl bg-stone p-7">
              <blockquote className="text-sm leading-relaxed text-viridian/85">
                &quot;
                <Editable k={`home.testimonials.${index}.quote`}>
                  {item.quote}
                </Editable>
                &quot;
              </blockquote>
              <figcaption className="mt-5">
                <p className="text-sm font-bold text-viridian">
                  <Editable k={`home.testimonials.${index}.name`}>
                    {item.name}
                  </Editable>
                </p>
                <p className="mt-1 text-xs text-viridian/55">
                  <Editable k={`home.testimonials.${index}.detail`}>
                    {item.detail}
                  </Editable>
                </p>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTASection({
  showProviderCta,
  primaryCta,
}: {
  showProviderCta: boolean;
  primaryCta: Cta;
}) {
  return (
    <section className="brand-section text-center">
      <div className="mx-auto max-w-2xl px-4">
        <h2 className="font-display text-4xl font-semibold text-viridian">
          <Editable k="home.cta.heading">Ready to join College Crew?</Editable>
        </h2>
        <p className="mt-4 text-base leading-relaxed text-viridian/70">
          <Editable k="home.cta.body">
            Book trusted help nearby, or sign up to start earning and building
            a reputation that follows you. It takes two minutes.
          </Editable>
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href={primaryCta.href}
            className="inline-flex items-center justify-center rounded-xl bg-viridian px-7 py-4 text-sm font-bold text-shell transition hover:bg-viridian-ink"
          >
            {primaryCta.label}
          </Link>
          {showProviderCta ? (
            <Link
              href="/provider/onboarding/account"
              className="inline-flex items-center justify-center rounded-xl border-2 border-viridian px-7 py-4 text-sm font-bold text-viridian transition hover:bg-stone/45"
            >
              Join as a student
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function DecorativeMark({ className }: { className?: string }) {
  return (
    <Image
      src={MARK_SRC}
      alt=""
      width={180}
      height={165}
      className={className}
      aria-hidden
    />
  );
}

type IconProps = { className?: string };

function CheckIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className={className}>
      <path
        d="M4 10.5 8 14.5 16 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DiamondIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className={className}>
      <path
        d="M10 2.5 17.5 10 10 17.5 2.5 10 10 2.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 10h5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DollarIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className={className}>
      <path
        d="M10 3v14M14 6.5c-.8-1-2-1.5-3.7-1.5-2.1 0-3.6 1-3.6 2.6 0 4 7.2 1.5 7.2 5.2 0 1.5-1.4 2.5-3.7 2.5-1.8 0-3.2-.6-4.1-1.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StarIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className={className}>
      <path d="M10 2.8 12.1 7l4.6.7-3.3 3.2.8 4.6-4.2-2.2-4.2 2.2.8-4.6-3.3-3.2 4.6-.7L10 2.8Z" />
    </svg>
  );
}

function CircleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className={className}>
      <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="10" cy="10" r="2" fill="currentColor" />
    </svg>
  );
}
