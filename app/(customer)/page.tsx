import Image from "next/image";
import Link from "next/link";

import { getEffectiveRole, getSession } from "@/lib/auth/session";

type Cta = { href: string; label: string };

import { FAQList, HowItWorksTabs } from "./landing-client";

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

const SERVICES = [
  {
    name: "Lawn & yard care",
    cadence: "Weekly",
    blurb: "The demand anchor: sell as a full-season package, not a one-off mow.",
    icon: "LC",
  },
  {
    name: "Dog walking & pet sitting",
    cadence: "Daily/weekly",
    blurb: "High-frequency, low trust barrier: bundle walks into weekly charges.",
    icon: "DW",
  },
  {
    name: "Housekeeping & cleaning",
    cadence: "Biweekly",
    blurb: "Proven willingness to pay from dual-income families, high lifetime value.",
    icon: "HC",
  },
  {
    name: "Tutoring & test prep",
    cadence: "Seasonal",
    blurb: "Where students have the biggest edge: sells well as session packages.",
    icon: "TT",
  },
  {
    name: "Moving & junk removal",
    cadence: "One-off",
    blurb: "High ticket, low trust barrier: a great first booking for new families.",
    icon: "MJ",
  },
  {
    name: "Babysitting",
    cadence: "Coming soon",
    blurb: "Highest demand, highest trust bar: added once vetting is fully in place.",
    icon: "BS",
  },
];

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
    body: "Lawn care, dog walking, and tutoring sell as season passes and packages, not one-off jobs.",
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
      "My reviews from mowing lawns at home actually count for something near campus now. That never used to be true.",
    name: "Ethan M.",
    detail: "Student, Northwestern '27",
  },
  {
    quote:
      "Booking the season pass for lawn care instead of texting back and forth every week has been the easiest part.",
    name: "The Alvarez family",
    detail: "Parents, Glenview",
  },
];

export default async function LandingPage() {
  const session = await getSession();
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
      <PhoneFloat />

      <section className="pb-2 text-center">
        <div className="mx-auto max-w-6xl px-4">
          <span className="text-sm font-bold tracking-[0.02em] text-viridian/55">
            Now booking in Highland Park and Lincoln Park
          </span>
        </div>
      </section>

      <section id="safety" className="mt-10 bg-stone py-14">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 md:grid-cols-3">
          {TRUST_ITEMS.map(({ title, body, icon: Icon }) => (
            <div key={title} className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-shell text-viridian">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold">{title}</h2>
                <p className="mt-1 text-sm text-viridian/65">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Comparison />
      <HowItWorksTabs />
      <ServicesSection />
      <FeaturesSection />
      <TestimonialsSection />
      <FAQList />
      <CTASection showProviderCta={showProviderCtas} primaryCta={primaryCta} />
    </div>
  );
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
        <div className="mx-auto mb-7 flex h-24 w-24 items-center justify-center rounded-3xl bg-viridian/10 p-4">
          <Image
            src={MARK_SRC}
            alt=""
            width={96}
            height={88}
            className="h-full w-full object-contain"
            priority
          />
        </div>
        <span className="brand-eyebrow">Your neighbors, your students</span>
        <h1 className="mt-6 font-display text-[2.3rem] font-semibold leading-[1.06] text-viridian sm:text-[3.75rem]">
          Hometown help, from someone your block already trusts.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-viridian/75 sm:text-lg">
          College Crew connects families with verified college students for
          lawn care, dog walking, cleaning, tutoring, and more - matched by
          proximity and school, and paid securely in the app.
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
          ].map((item) => (
            <span
              key={item}
              className="flex items-center gap-2 text-sm font-semibold text-viridian/70"
            >
              <span className="h-2 w-2 rounded-full bg-viridian" />
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function PhoneFloat() {
  return (
    <div className="relative z-20 -mt-24 flex justify-center px-4 pb-16 sm:-mt-36">
      <div className="absolute bottom-10 left-[calc(50%-260px)] hidden h-72 w-72 rounded-full bg-sky opacity-60 blur-md sm:block" />
      <div className="relative w-full max-w-[326px] rounded-[2rem] bg-viridian p-2 shadow-[0_28px_80px_rgba(52,73,69,0.25)]">
        <div className="rounded-[1.6rem] bg-shell p-4">
          <h2 className="font-display text-2xl font-semibold">Book a job</h2>
          <div className="mt-4 flex gap-2 overflow-hidden">
            <span className="rounded-full bg-viridian px-4 py-2 text-xs font-bold text-shell">
              Lawn care
            </span>
            <span className="rounded-full bg-stone px-4 py-2 text-xs font-semibold">
              Dog walking
            </span>
            <span className="rounded-full bg-stone px-4 py-2 text-xs font-semibold">
              Tutoring
            </span>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl bg-stone">
            <div className="flex h-28 items-center justify-center bg-[repeating-linear-gradient(135deg,var(--color-sky)_0_12px,var(--color-honeydew)_12px_24px)] text-xs font-bold uppercase tracking-[0.12em] text-viridian/45">
              yard photo
            </div>
            <div className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-bold">Weekly mow + edge</p>
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
        <span className="brand-eyebrow">Why College Crew</span>
        <h2 className="mt-4 max-w-3xl font-display text-4xl font-semibold leading-tight text-viridian">
          A good name in this town should count for something.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-viridian/70">
          Every student starts from zero in a new town twice a year. Care.com,
          Thumbtack, and Nextdoor were never built around student identity or
          the kind of trust neighbors build over time. College Crew was.
        </p>
        <div className="mt-9 grid gap-5 md:grid-cols-2">
          <CompareColumn
            title="Care.com, Thumbtack, Nextdoor"
            items={[
              "Reputation is tied to the platform, not the person",
              "No sense of who's actually nearby or in school",
              "Anonymous listings, not a known, verified student",
              "Reviews don't travel if you move or switch apps",
            ]}
          />
          <CompareColumn
            dark
            title="College Crew"
            items={[
              "One profile, one reputation, home and campus",
              "Matched by proximity and school, not a random zip code",
              "Every student is ID and background-checked",
              "Reviews and ratings travel with you, always",
            ]}
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
  title: string;
  items: string[];
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
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function ServicesSection() {
  return (
    <>
      <section className="brand-section pb-10">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <span className="brand-eyebrow">What you can book</span>
              <h2 className="mt-4 max-w-2xl font-display text-4xl font-semibold leading-tight text-viridian">
                Six services, matched to what students do best.
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
          {SERVICES.map((service) => (
            <Link
              key={service.name}
              href="/browse"
              className="group rounded-3xl border border-stone bg-shell p-7 transition hover:-translate-y-0.5 hover:border-viridian"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-sky text-xs font-black text-viridian">
                {service.icon}
              </div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-base font-bold text-viridian">
                  {service.name}
                </h3>
                <span className="whitespace-nowrap rounded-full bg-stone px-3 py-1 text-[0.68rem] font-bold text-viridian/55">
                  {service.cadence}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-viridian/70">
                {service.blurb}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="brand-section bg-stone">
      <div className="mx-auto max-w-6xl px-4">
        <span className="brand-eyebrow">Why families choose us</span>
        <h2 className="mt-4 font-display text-4xl font-semibold text-viridian">
          Built for trust, front to back.
        </h2>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {FEATURES.map(({ title, body, tone, icon: Icon }) => (
            <div key={title} className="rounded-3xl bg-shell p-8">
              <div
                className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl ${tone}`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-viridian">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-viridian/70">
                {body}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-4 rounded-3xl bg-shell/60 p-5 md:grid-cols-3">
          {[
            ["ID & background checks", "Every student is verified before their first booking."],
            ["Guarantee & support", "If a job isn't done right, we make it right."],
            ["What the fee funds", "A small Trust & Safety fee on each booking covers all of the above."],
          ].map(([title, body]) => (
            <div key={title}>
              <h3 className="text-sm font-bold text-viridian">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-viridian/65">
                {body}
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
        <span className="brand-eyebrow">Early feedback</span>
        <h2 className="mt-4 font-display text-4xl font-semibold text-viridian">
          What families and students are saying.
        </h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {TESTIMONIALS.map((item) => (
            <figure key={item.name} className="rounded-3xl bg-stone p-7">
              <blockquote className="text-sm leading-relaxed text-viridian/85">
                &quot;{item.quote}&quot;
              </blockquote>
              <figcaption className="mt-5">
                <p className="text-sm font-bold text-viridian">{item.name}</p>
                <p className="mt-1 text-xs text-viridian/55">{item.detail}</p>
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
          Ready to join College Crew?
        </h2>
        <p className="mt-4 text-base leading-relaxed text-viridian/70">
          Book trusted help nearby, or sign up to start earning and building a
          reputation that follows you. It takes two minutes.
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
