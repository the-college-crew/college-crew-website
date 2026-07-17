import Image from "next/image";
import Link from "next/link";

import { Editable } from "@/components/content/editable";
import { getEffectiveRole, getSession } from "@/lib/auth/session";
import { PARENT_STEPS, STUDENT_STEPS } from "@/lib/content/defaults";
import { getLiveServices } from "@/lib/db/queries";
import type { Service } from "@/lib/db/types";

type Cta = { href: string; label: string };

import { HowItWorksTabs, type Step } from "./landing-client";
import { FeatureIcon, ServiceIcon } from "./landing-icons";

const MARK_SRC = "/college-crew-mark.png";
const MARK_STONE_SRC = "/college-crew-mark-stone.png";
const MARK_WHITE_SRC = "/college-crew-mark-white.png";

/*
 * Shared section shells for the ant-mascot homepage design: full-bleed color
 * bands separated by hairline rules, with a 1140px inner wrap. Kept as class
 * strings (mirrored in landing-client.tsx) rather than components so server
 * and client sections can share them without a module boundary dance.
 */
const WRAP = "mx-auto w-full max-w-[1140px] px-5 sm:px-8";
const BAND =
  "relative overflow-hidden border-t-[1.5px] border-viridian/15 py-[72px] md:py-[104px]";
const EYEBROW =
  "flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.16em] text-viridian/55";
const H2 =
  "mt-3.5 max-w-[20ch] text-balance font-display text-[32px] font-semibold leading-[1.05] tracking-[-0.02em] text-viridian md:text-[42px]";
const LEAD =
  "mt-5 max-w-[52ch] text-[17px] leading-[1.55] text-viridian/75 md:text-[19px]";

const BTN =
  "inline-flex items-center justify-center gap-2 rounded-full border-[1.6px] px-[26px] py-[15px] text-base font-semibold transition duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.98]";
const BTN_PRIMARY = `${BTN} border-viridian bg-viridian text-shell hover:bg-viridian-ink`;
const BTN_GHOST = `${BTN} border-viridian text-viridian hover:bg-viridian/5`;
// Inverted variants for the dark CTA band.
const BTN_PRIMARY_ON_DARK = `${BTN} border-shell bg-shell text-viridian hover:bg-[#e7e4dc]`;
const BTN_GHOST_ON_DARK = `${BTN} border-shell/45 text-shell hover:bg-shell/10`;

/*
 * Shared card come-forward behavior. Every box on the page lifts and casts a
 * viridian-tinted shadow on hover; bordered cards also deepen their edge.
 * Radius/padding stay per-section so section rhythm is unchanged. Cards carry
 * `group` so their inner icon tile can react to the same hover.
 */
const CARD_LIFT =
  "transition duration-200 hover:-translate-y-[3px] hover:shadow-[0_18px_40px_-26px_rgba(52,73,69,0.5)]";
const CARD_LIFT_BORDERED = `${CARD_LIFT} hover:border-viridian/30`;
// Icon tile that inverts (honeydew → viridian) as its card is hovered.
const ICON_TILE_HOVER =
  "transition duration-200 group-hover:bg-viridian group-hover:text-shell";

const SERVICE_BLURBS: Record<string, string> = {
  "lawn-yard-care": "Mowing, edging, and yard tidy-ups handled by students nearby.",
  "pet-care": "Walks, drop-ins, and sitting while you're out or away.",
  "house-management":
    "Errands and home tasks: package returns, grocery pickup, and check-ins.",
  tutoring:
    "Where students have the biggest edge: real help with the subjects they just took.",
  "youth-sports-coaching":
    "Student athletes coach kids on fundamentals, confidence, and skills.",
  hauling: "Heavy lifting and junk removal, with the muscle to actually move it.",
  "pressure-washing":
    "Driveways, patios, and outdoor surfaces handled by equipped student crews.",
  "window-washing":
    "Interior and exterior windows from student-run crews with the right gear.",
  babysitting:
    "Highest demand, highest trust bar: added after the pilot once the right safeguards are in place.",
};

function serviceBlurb(service: Service): string {
  return (
    SERVICE_BLURBS[service.slug] ??
    "Verified student help for practical jobs around the neighborhood."
  );
}

const FEATURES = [
  {
    title: "Verified college students",
    body: "ID verification on every student before they're bookable.",
  },
  {
    title: "Secure in-app payments",
    body: "Pay the first hour after acceptance, then the actual-time balance securely in the app.",
  },
  {
    title: "A reputation that travels",
    body: "Reviews and track record move with a student between home and campus.",
  },
  {
    title: "Neighbors, not strangers",
    body: "Students close to you are recommended first, so help usually comes from a few streets over.",
  },
  {
    title: "ID & school checks",
    body: "Every student completes 18+, .edu, and student-ID review first.",
  },
  {
    title: "Clear support",
    body: "Cancellation, no-show, refund, and billing concerns follow one visible review process.",
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
    <div className="mx-[calc(50%-50vw)] -mt-8 -mb-8 w-screen max-w-[100vw] overflow-x-clip bg-shell text-viridian">
      <Hero
        showProviderCta={showProviderCtas}
        primaryCta={primaryCta}
        services={services}
      />
      <Comparison />
      <HowItWorksTabs
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

/** Small grad-cap-ant icon used in eyebrows and feature tiles. */
function AntMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <Image
      src={MARK_SRC}
      alt=""
      width={36}
      height={33}
      className={`${className} object-contain`}
      aria-hidden
    />
  );
}

/** Hairline rule with the ant marching along it — the section divider. */
function AntRule() {
  return (
    <div className="mb-2 flex items-center gap-[22px]" aria-hidden>
      <span className="h-[1.5px] flex-1 bg-viridian/20" />
      <Image
        src={MARK_SRC}
        alt=""
        width={36}
        height={33}
        className="h-9 w-9 object-contain"
      />
      <span className="h-[1.5px] flex-1 bg-viridian/20" />
    </div>
  );
}

function Hero({
  showProviderCta,
  primaryCta,
  services,
}: {
  showProviderCta: boolean;
  primaryCta: Cta;
  services: Service[];
}) {
  return (
    <section className="relative overflow-hidden bg-stone py-16 md:py-[104px]">
      {/* Emerges from the corner like the CTA band's watermark — kept out of
          the phone mock's shadow so it actually reads. */}
      <Image
        src={MARK_STONE_SRC}
        alt=""
        width={600}
        height={551}
        priority
        aria-hidden
        className="pointer-events-none absolute -bottom-[120px] -left-[100px] z-0 hidden w-[430px] max-w-none rotate-[16deg] opacity-60 lg:block"
      />
      <div
        className={`${WRAP} relative z-10 grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]`}
      >
        <div>
          <div className={EYEBROW}>
            <AntMark />
            <Editable k="home.hero.eyebrow">
              Your neighbors, your students
            </Editable>
          </div>
          <h1 className="mt-[18px] font-display text-[44px] font-bold leading-[1.02] tracking-[-0.025em] text-viridian md:text-[62px] md:leading-none">
            <Editable k="home.hero.title">
              Hometown help, from someone your block already trusts.
            </Editable>
          </h1>
          <p className={LEAD}>
            <Editable k="home.hero.subtitle">
              College Crew connects families with verified college students for
              practical neighborhood help. Browse students near you, see where
              they go to school, and pay securely in the app.
            </Editable>
          </p>
          <div className="mt-[34px] flex flex-wrap gap-3.5">
            <Link href={primaryCta.href} className={BTN_PRIMARY}>
              {primaryCta.label}
            </Link>
            {showProviderCta ? (
              <Link href="/provider/onboarding/account" className={BTN_GHOST}>
                Join as a student
              </Link>
            ) : null}
          </div>
          <div className="mt-[30px] flex flex-wrap gap-2.5">
            {[
              "Verified college students",
              "Students near you, first",
              "Secure in-app payment",
            ].map((item, index) => (
              <span
                key={item}
                className="group flex items-center gap-2 rounded-full border-[1.4px] border-viridian/20 bg-white/50 px-4 py-[9px] text-sm font-semibold transition duration-200 hover:border-viridian/40 hover:bg-white"
              >
                <span className="h-[7px] w-[7px] rounded-full bg-viridian transition duration-200 group-hover:scale-125" />
                <Editable k={`home.hero.points.${index}`}>{item}</Editable>
              </span>
            ))}
          </div>
        </div>
        <PhoneMock services={services} />
      </div>
    </section>
  );
}

/** The iPhone "Book a job" mock from the reference design — pure decoration. */
function PhoneMock({ services }: { services: Service[] }) {
  // Four pills wrap into two tidy rows; six leaves a ragged tail.
  const tabs = services.slice(0, 4);

  return (
    <div className="relative mx-auto w-full max-w-[346px] rounded-[54px] bg-[#1b2523] p-[13px] shadow-[0_36px_72px_-26px_rgba(27,37,35,0.6),0_6px_18px_rgba(27,37,35,0.28)]">
      {/* Notch */}
      <div className="absolute left-1/2 top-[13px] z-10 h-7 w-[132px] -translate-x-1/2 rounded-b-[18px] bg-[#1b2523]" />
      <div className="overflow-hidden rounded-[42px] bg-card">
        <div className="flex items-center justify-between px-7 pb-1.5 pt-[15px] text-sm font-bold tabular-nums text-viridian">
          <span>9:41</span>
          <span className="flex items-center gap-[7px]">
            <span className="flex h-[11px] items-end gap-[2px]" aria-hidden>
              <i className="block h-1 w-[3px] rounded-[1px] bg-viridian" />
              <i className="block h-1.5 w-[3px] rounded-[1px] bg-viridian" />
              <i className="block h-2 w-[3px] rounded-[1px] bg-viridian" />
              <i className="block h-[11px] w-[3px] rounded-[1px] bg-viridian" />
            </span>
            <span
              className="relative h-3 w-6 rounded-[3px] border-[1.6px] border-viridian"
              aria-hidden
            >
              <span className="absolute inset-[1.5px] w-[74%] rounded-[1px] bg-viridian" />
              <span className="absolute -right-[3px] top-1/2 h-[5px] w-[2px] -translate-y-1/2 rounded-r-[1px] bg-viridian" />
            </span>
          </span>
        </div>

        <div className="flex items-center justify-between border-b border-viridian/10 px-[22px] pb-3.5 pt-2">
          <span className="font-display text-[21px] font-semibold text-viridian">
            Book a job
          </span>
          <AntMark className="h-6 w-6" />
        </div>

        <div className="px-[18px] pb-1 pt-4">
          <div className="mb-5 flex flex-wrap gap-2">
            {tabs.length > 0 ? (
              tabs.map((service, index) => (
                <span
                  key={service.id}
                  className={
                    index === 0
                      ? "rounded-full border-[1.3px] border-viridian bg-viridian px-[13px] py-2 text-[13px] font-semibold text-shell"
                      : "rounded-full border-[1.3px] border-viridian/20 px-[13px] py-2 text-[13px] font-semibold text-viridian"
                  }
                >
                  {service.name}
                </span>
              ))
            ) : (
              <span className="rounded-full border-[1.3px] border-viridian bg-viridian px-[13px] py-2 text-[13px] font-semibold text-shell">
                Browse
              </span>
            )}
          </div>

          <div className="rounded-2xl border border-viridian/10 bg-shell p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-viridian/50">
              Job details
            </p>
            <div className="mb-3.5 mt-2 flex items-start justify-between gap-4">
              <div>
                <p className="font-display text-[21px] font-semibold leading-tight text-viridian">
                  Neighborhood help
                </p>
                <p className="mt-[3px] text-sm text-viridian/65">
                  123 Maple Street
                </p>
              </div>
              <p className="font-display text-[26px] font-bold leading-none tabular-nums text-viridian">
                $45/hr
              </p>
            </div>
            <p className="text-sm tabular-nums text-viridian/65">
              Sat, May 10 · 9:00 AM · est. 60 min
            </p>
            <p className="mt-3">
              <span className="inline-flex items-center gap-[7px] rounded-full bg-honeydew px-[11px] py-[5px] text-[13px] font-semibold text-viridian">
                ✓ ID &amp; school verified
              </span>
            </p>
          </div>

          <div className="my-[18px] flex items-center gap-3.5 rounded-2xl border border-viridian/10 bg-white p-3.5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sky font-display text-xl font-bold text-viridian">
              E
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold text-viridian">
                Ethan T.
              </p>
              <p className="truncate text-[13px] text-viridian/65">
                Northwestern &apos;27 · 2 mi
              </p>
            </div>
            <p className="ml-auto text-right text-[13px] font-bold text-viridian">
              ★ 4.9
            </p>
          </div>

          <Link href="/browse" className={`${BTN_PRIMARY} w-full`}>
            Request at $45/hour
          </Link>
          <p className="mt-3 text-center text-[13px] text-viridian/65">
            <Editable k="home.banner.note">
              Now booking in Highland Park &amp; Lincoln Park
            </Editable>
          </p>
        </div>

        <div className="mx-auto mb-3 mt-2 h-[5px] w-[132px] rounded-full bg-viridian/30" />
      </div>
    </div>
  );
}

function Comparison() {
  return (
    <section className={`${BAND} bg-sky`}>
      <div className={`${WRAP} reveal-rise`}>
        <AntRule />
        <div className="mb-[52px]">
          <h2 className={H2}>
            <Editable k="home.compare.heading">
              A good name in this town should count for something.
            </Editable>
          </h2>
          <p className={LEAD}>
            <Editable k="home.compare.body">
              Every student starts from zero in a new town twice a year.
              Generic marketplaces were never built around student identity or
              the trust neighbors build over time. College Crew was.
            </Editable>
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
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
              "Students near you, recommended first, not a random zip code",
              "Every student is ID and school verified",
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
      className={
        dark
          ? `group rounded-[22px] bg-viridian p-8 text-shell ${CARD_LIFT}`
          : `group rounded-[22px] border-[1.4px] border-viridian/15 bg-stone/55 p-8 text-viridian ${CARD_LIFT_BORDERED}`
      }
    >
      <h3 className="font-display text-[22px] font-bold">{title}</h3>
      <ul className="mt-[22px] space-y-3.5">
        {items.map((item, index) => (
          <li key={index} className="flex gap-3 leading-snug">
            <span
              className={
                dark
                  ? "mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-honeydew text-[13px] font-bold text-viridian"
                  : "mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-viridian/10 text-[13px] font-bold text-viridian/55"
              }
              aria-hidden
            >
              {dark ? "✓" : "✕"}
            </span>
            <span className={dark ? "text-shell/90" : "text-viridian/80"}>
              {item}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ServicesSection({ services }: { services: Service[] }) {
  return (
    <section className={`${BAND} bg-honeydew`}>
      <div className={`${WRAP} reveal-rise`}>
        <div className="mb-[52px]">
          <div className={EYEBROW}>
            <AntMark />
            <Editable k="home.services.eyebrow">What you can book</Editable>
          </div>
          <h2 className={H2}>
            <Editable k="home.services.heading">
              Services matched to what students do best.
            </Editable>
          </h2>
        </div>
        <div className="grid gap-[22px] sm:grid-cols-2 lg:grid-cols-3">
          {services.length === 0 ? (
            <div className="rounded-[20px] border-[1.4px] border-viridian/15 bg-card p-[26px] text-sm text-viridian/70 sm:col-span-2 lg:col-span-3">
              Live services will appear here once the catalog is available.
            </div>
          ) : null}
          {services.map((service) => (
            <Link
              key={service.id}
              href={`/browse?service=${service.slug}`}
              className={`group flex flex-col gap-3.5 rounded-[20px] border-[1.4px] border-viridian/15 bg-card p-[26px] ${CARD_LIFT_BORDERED}`}
            >
              <span
                className={`flex h-[52px] w-[52px] items-center justify-center rounded-[15px] bg-honeydew text-viridian ${ICON_TILE_HOVER}`}
              >
                <ServiceIcon slug={service.slug} className="h-[26px] w-[26px]" />
              </span>
              <h3 className="font-display text-[21px] font-semibold leading-tight text-viridian">
                {service.name}
              </h3>
              <p className="leading-normal text-viridian/65">
                <Editable k={`home.services.${service.slug}.blurb`}>
                  {serviceBlurb(service)}
                </Editable>
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className={`${BAND} bg-shell`}>
      <Image
        src={MARK_STONE_SRC}
        alt=""
        width={300}
        height={276}
        aria-hidden
        className="pointer-events-none absolute right-10 top-16 z-0 w-[300px] rotate-[10deg] opacity-50"
      />
      <div className={`${WRAP} reveal-rise relative z-10`}>
        <div className="mb-[52px]">
          <h2 className={H2}>
            <Editable k="home.features.heading">
              Built for trust, front to back.
            </Editable>
          </h2>
        </div>
        {/* Open two-column list: icon tile + copy, no card boxes. */}
        <div className="grid gap-x-14 gap-y-11 sm:grid-cols-2">
          {FEATURES.map(({ title, body }, index) => (
            <div key={title} className="group flex items-start gap-5">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-honeydew text-viridian ${ICON_TILE_HOVER}`}
              >
                <FeatureIcon index={index} className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-display text-[21px] font-semibold leading-tight text-viridian">
                  <Editable k={`home.features.${index}.title`}>{title}</Editable>
                </h3>
                <p className="mt-2 max-w-[52ch] leading-normal text-viridian/65">
                  <Editable k={`home.features.${index}.body`}>{body}</Editable>
                </p>
              </div>
            </div>
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
    <section className={`${BAND} bg-viridian text-shell`}>
      <Image
        src={MARK_WHITE_SRC}
        alt=""
        width={520}
        height={478}
        aria-hidden
        className="pointer-events-none absolute -bottom-[120px] -left-[120px] z-0 w-[520px] max-w-none rotate-[14deg] opacity-15"
      />
      <div className="reveal-rise relative z-10 mx-auto w-full max-w-[760px] px-5 text-center sm:px-8">
        <h2 className="mx-auto max-w-[20ch] text-balance font-display text-[32px] font-semibold leading-[1.05] tracking-[-0.02em] md:text-[42px]">
          <Editable k="home.cta.heading">Ready to join College Crew?</Editable>
        </h2>
        <p className="mx-auto mt-5 max-w-[52ch] text-[17px] leading-[1.55] text-shell/80 md:text-[19px]">
          <Editable k="home.cta.body">
            Book trusted help nearby, or sign up to start earning and building
            a reputation that follows you. It takes two minutes.
          </Editable>
        </p>
        <div className="mt-[34px] flex flex-wrap items-center justify-center gap-3.5">
          <Link href={primaryCta.href} className={BTN_PRIMARY_ON_DARK}>
            {primaryCta.label}
          </Link>
          {showProviderCta ? (
            <Link
              href="/provider/onboarding/account"
              className={BTN_GHOST_ON_DARK}
            >
              Join as a student
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
