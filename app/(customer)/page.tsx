import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { getLiveServices } from "@/lib/db/queries";

// Newsreader is loaded globally in the root layout; reference its variable.
const serif = "font-[family-name:var(--font-newsreader)]";

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
    body: "Once they accept, you confirm and pay securely on the platform. They show up and get it done.",
  },
];

const TRUST = [
  {
    title: "ID & background-checked",
    body: "Every student is screened by the founders before booking.",
    icon: IconShield,
  },
  {
    title: "Matched by proximity & school",
    body: "Two miles away, verified at a school you'll recognize.",
    icon: IconPin,
  },
  {
    title: "Paid securely",
    body: "Every job settles in-app. No cash at the door, ever.",
    icon: IconLock,
  },
];

export default async function LandingPage() {
  const services = await getLiveServices();

  return (
    <div
      className="home-canvas mx-[calc(50%-50vw)] -mt-8 -mb-24 w-screen max-w-[100vw] overflow-x-clip text-bark"
    >
      <div className="mx-auto max-w-6xl px-4 pb-16">
        {/* ---------------------------------------------------------------- Hero */}
        <section className="grid items-center gap-12 pt-12 pb-14 sm:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
          <div className="max-w-xl">
            <span className="inline-flex items-center rounded-full bg-sage-100 px-3.5 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-sage-700">
              For families &amp; college students
            </span>

            <h1
              className={`${serif} mt-6 text-[2.6rem] font-medium leading-[1.04] tracking-[-0.015em] text-bark sm:text-[3.4rem]`}
            >
              The trust you build at home follows you to campus,{" "}
              <span className="italic text-forest-700">and back again.</span>
            </h1>

            <p className="mt-6 max-w-md text-base leading-relaxed text-bark-soft">
              College Crew connects families with verified local college
              students for lawn care, dog walking, cleaning, tutoring, and
              more — matched by proximity and school, and paid securely in the
              app.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/browse"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-forest-800 px-6 py-3 text-sm font-semibold text-cream shadow-sm transition-colors hover:bg-forest-900"
              >
                Book a student
              </Link>
              <Link
                href="/provider/onboarding/account"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-forest-800/25 px-6 py-3 text-sm font-semibold text-forest-800 transition-colors hover:bg-forest-800/[0.06]"
              >
                Join as a student
              </Link>
            </div>

            <p className="mt-7 text-xs font-medium text-bark-soft/80">
              Free to browse · No charge until a student accepts · 18+ verified
            </p>
          </div>

          {/* Signature: a live "Book a job" phone, hand-built. */}
          <PhoneMockup />
        </section>

        {/* ---------------------------------------------------------- Trust bar */}
        <section className="grid divide-y divide-bark-line/60 overflow-hidden rounded-2xl border border-bark-line bg-cream-card/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {TRUST.map(({ title, body, icon: Icon }) => (
            <div key={title} className="flex items-start gap-3.5 p-5">
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-forest-100 text-forest-700">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-bark">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-bark-soft">
                  {body}
                </p>
              </div>
            </div>
          ))}
        </section>

        {/* --------------------------------------------------------- How it works */}
        <section aria-labelledby="how-it-works" className="pt-20 sm:pt-24">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-forest-600">
            How it works
          </p>
          <h2
            id="how-it-works"
            className={`${serif} mt-2 max-w-xl text-3xl font-medium tracking-[-0.01em] text-bark sm:text-4xl`}
          >
            Three steps from “someone should mow this” to done.
          </h2>
          <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-3">
            {HOW_IT_WORKS.map((item) => (
              <div key={item.step}>
                <div className="flex items-center gap-3">
                  <span
                    className={`${serif} text-2xl font-medium text-forest-700`}
                  >
                    {item.step}
                  </span>
                  <span className="h-px flex-1 bg-bark-line" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-bark">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-bark-soft">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* -------------------------------------------------------------- Services */}
        <section aria-labelledby="services" className="pt-20 sm:pt-24">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-forest-600">
            The service list
          </p>
          <h2
            id="services"
            className={`${serif} mt-2 text-3xl font-medium tracking-[-0.01em] text-bark sm:text-4xl`}
          >
            What the crew can do.
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-bark-soft">
            A short, curated menu — we decide what the crew offers, so it stays
            focused instead of an open free-for-all.
          </p>
          {services.length === 0 ? (
            <div className="mt-8">
              <EmptyState title="Services coming soon">
                The curated service list lives in the database — it&apos;ll show
                up here once the platform is connected and seeded.
              </EmptyState>
            </div>
          ) : (
            <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((service) => (
                <li key={service.id}>
                  <Link
                    href={`/browse?service=${service.slug}`}
                    className="group flex items-center justify-between gap-4 rounded-xl border border-bark-line bg-cream-card px-5 py-4 transition-colors hover:border-forest-600 hover:bg-white"
                  >
                    <span>
                      <span className="block text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-sage-700">
                        {service.category}
                      </span>
                      <span className="mt-1 block text-base font-semibold text-bark group-hover:text-forest-700">
                        {service.name}
                      </span>
                    </span>
                    <IconArrow className="h-4 w-4 flex-none text-mist transition-colors group-hover:text-forest-700" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* --------------------------------------------------------- Mission panel */}
        <section className="mt-20 overflow-hidden rounded-3xl border border-sage-200 bg-sage-100 px-6 py-14 text-center sm:mt-24 sm:px-12">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sage-700">
            Small on purpose
          </p>
          <h2
            className={`${serif} mx-auto mt-3 max-w-2xl text-3xl font-medium tracking-[-0.01em] text-bark sm:text-4xl`}
          >
            Every booking backs a young person, and puts a familiar face at
            your door.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-bark-soft">
            We verify every provider ourselves, curate every service, and stay
            in one neighborhood at a time. Fewer strangers, more neighbors.
          </p>
          <Link
            href="/about"
            className="mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-forest-800 px-6 py-3 text-sm font-semibold text-cream transition-colors hover:bg-forest-900"
          >
            Meet the team
          </Link>
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Phone -- */

function PhoneMockup() {
  return (
    <div className="relative mx-auto w-full max-w-[320px] lg:mx-0 lg:ml-auto">
      {/* ambient glow behind the device */}
      <div
        aria-hidden
        className="absolute -inset-6 -z-10 rounded-[3rem] bg-haze-200/50 blur-2xl"
      />
      <div className="rounded-[2.75rem] border border-forest-950/15 bg-forest-950 p-2.5 shadow-[0_45px_90px_-35px_rgba(34,48,31,0.6)]">
        <div className="relative overflow-hidden rounded-[2.25rem] bg-paper">
          {/* status bar + dynamic island */}
          <div className="relative flex items-center justify-between px-6 pt-3.5 pb-1 text-[11px] font-semibold text-bark">
            <span>9:41</span>
            <span
              aria-hidden
              className="absolute left-1/2 top-3 h-5 w-[4.5rem] -translate-x-1/2 rounded-full bg-forest-950"
            />
            <span className="flex items-center gap-1 text-forest-800">
              <IconSignal className="h-3 w-3" />
              <IconBattery className="h-3 w-4" />
            </span>
          </div>

          <div className="px-5 pb-5">
            <div className="flex items-center justify-between pt-1 text-bark-soft">
              <IconChevron className="h-4 w-4" />
              <span className="text-lg leading-none tracking-widest">···</span>
            </div>

            <h3 className={`${serif} mt-3 text-2xl font-semibold text-bark`}>
              College Crew
            </h3>
            <p className="mt-0.5 text-xs text-mist">
              Good morning, the Alvarez family
            </p>

            <p className="mt-4 text-sm font-semibold text-bark">Book a job</p>
            <div className="mt-2.5 flex gap-1.5">
              <span className="rounded-full bg-forest-800 px-3 py-1 text-[0.7rem] font-medium text-cream">
                Lawn care
              </span>
              <span className="rounded-full border border-bark-line px-3 py-1 text-[0.7rem] font-medium text-bark-soft">
                Dog walking
              </span>
              <span className="rounded-full border border-bark-line px-3 py-1 text-[0.7rem] font-medium text-bark-soft">
                Tutoring
              </span>
            </div>

            {/* job preview image */}
            <div
              aria-hidden
              className="mt-3 h-20 rounded-xl border border-bark-line bg-[repeating-linear-gradient(135deg,var(--color-sage-100)_0_10px,var(--color-cream-card)_10px_20px)]"
            />

            {/* job line */}
            <div className="mt-3 flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-bark">
                  Weekly mow + edge
                </p>
                <p className="mt-0.5 text-[0.7rem] text-mist">
                  123 Maple Street
                </p>
                <p className="text-[0.7rem] text-mist">
                  Sat, May 24 · 10:00 AM · 45 min
                </p>
              </div>
              <p className="text-sm font-semibold text-bark">$45</p>
            </div>

            {/* verified chip */}
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-sage-100 px-3 py-2">
              <IconCheck className="h-3.5 w-3.5 flex-none text-sage-700" />
              <div>
                <p className="text-[0.72rem] font-semibold text-sage-700">
                  Verified &amp; background-checked
                </p>
                <p className="text-[0.62rem] text-sage-700/80">
                  Screened by the founders
                </p>
              </div>
            </div>

            {/* matched student */}
            <p className="mt-3 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-mist">
              Matched student
            </p>
            <div className="mt-1.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-forest-100 text-[0.7rem] font-semibold text-forest-700">
                  E
                </span>
                <span className="text-sm font-medium text-bark">
                  Ethan · Northwestern ’27
                </span>
              </div>
              <span className="flex items-center gap-0.5 text-xs font-medium text-bark-soft">
                <IconStar className="h-3 w-3 text-gold-400" /> 4.9
              </span>
            </div>

            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              className="mt-4 w-full rounded-xl bg-forest-800 py-3 text-sm font-semibold text-cream"
            >
              Book job · $45
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Icons -- */

type IconProps = { className?: string };

function IconCheck({ className }: IconProps) {
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

function IconShield({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className={className}>
      <path
        d="M10 2.5 16 5v4.5c0 4-2.6 6.6-6 8-3.4-1.4-6-4-6-8V5l6-2.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="m7.3 10 1.9 1.9 3.5-3.8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconPin({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className={className}>
      <path
        d="M10 17c3-3.2 5-5.8 5-8.4A5 5 0 0 0 5 8.6C5 11.2 7 13.8 10 17Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="8.4" r="1.8" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function IconLock({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className={className}>
      <rect
        x="4"
        y="9"
        width="12"
        height="8"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M7 9V6.5a3 3 0 0 1 6 0V9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconArrow({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className={className}>
      <path
        d="M4 10h11m0 0-4-4m4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconChevron({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className={className}>
      <path
        d="M12 5 7 10l5 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconStar({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className={className}>
      <path d="M10 2.5 12.2 7l4.8.7-3.5 3.4.8 4.8L10 13.6 5.7 15.9l.8-4.8L3 7.7 7.8 7 10 2.5Z" />
    </svg>
  );
}

function IconSignal({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className={className}>
      <rect x="1" y="12" width="3" height="5" rx="1" />
      <rect x="6" y="9" width="3" height="8" rx="1" />
      <rect x="11" y="6" width="3" height="11" rx="1" />
      <rect x="16" y="3" width="3" height="14" rx="1" />
    </svg>
  );
}

function IconBattery({ className }: IconProps) {
  return (
    <svg viewBox="0 0 26 14" fill="none" aria-hidden className={className}>
      <rect
        x="1"
        y="1"
        width="21"
        height="12"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <rect x="3" y="3" width="15" height="8" rx="1.5" fill="currentColor" />
      <rect x="23.5" y="4.5" width="2" height="5" rx="1" fill="currentColor" />
    </svg>
  );
}
