import type { Metadata } from "next";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";

import { Editable } from "@/components/content/editable";
import { getEffectiveRole, getSession } from "@/lib/auth/session";
import ariPortrait from "@/public/about/ari.jpg";
import giannaPortrait from "@/public/about/gianna.jpg";
import maxPortrait from "@/public/about/max-lapidus.jpg";
import zachPortrait from "@/public/about/zach.jpg";

export const metadata: Metadata = {
  title: "About us",
  description:
    "Meet the College Crew founders and learn why we built a trusted marketplace for neighbors and verified college students.",
};

const LOGO_SRC = "/college-crew-logo.png";
const WRAP = "mx-auto w-full max-w-[1140px] px-5 sm:px-8";
const SERIF = "font-[Georgia,'Times_New_Roman',serif]";

type Founder = {
  name: string;
  hometown: string;
  school: string;
  bio: string;
  portrait: StaticImageData;
  portraitPosition?: string;
};

const FOUNDERS: Founder[] = [
  {
    name: "Ari",
    hometown: "Highland Park, Illinois",
    school:
      "University of Iowa, sophomore studying Computer Science and Computer Engineering",
    bio: "I grew up in Highland Park, where a good reputation with your neighbors genuinely counts for something. Now I'm at the University of Iowa studying Computer Science and Computer Engineering, and I kept noticing how fast that hometown trust disappears in a new city. I created College Crew because I value those local connections and want to protect them. My goal is to make it simple for students to market their skills to the families right around them.",
    portrait: ariPortrait,
  },
  {
    name: "Gianna",
    hometown: "Cleveland, Ohio",
    school:
      "DePaul University, senior studying Business Management with a minor in PR and Advertising",
    bio: "I've been working since I was 13 and have always had some kind of side gig, and I always wished I'd had a platform to promote it on. As a Business Management major at DePaul with a minor in PR and Advertising, I know how hard it is for college kids to meet new families in a new city. I started College Crew to change that. I want to help students like me who rely on side gigs to make it through college. Everyone deserves an easy way to turn their skills into real, steady income close to campus.",
    portrait: giannaPortrait,
    portraitPosition: "center 25%",
  },
  {
    name: "Max Lapidus",
    hometown: "Nashville, Tennessee",
    school:
      "Tulane University, junior studying Finance, Management, and Data Analytics and AI",
    bio: "I spent all of high school babysitting and picking up odd jobs for neighbors and family friends, building a reputation people trusted back home. The second I left for college, that reputation disappeared, and I watched the same thing happen to everyone around me. Studying Finance, Management, and Data Analytics and AI at Tulane, I started seeing it less as bad luck and more as a broken system. I built College Crew because everyone deserves the chance to build and protect their reputation, both at home and at school, and to put their skills to work in whatever community they're in.",
    portrait: maxPortrait,
  },
  {
    name: "Zach",
    hometown: "Elmhurst, Illinois",
    school:
      "University of Illinois Urbana-Champaign, junior studying Electrical and Computer Engineering",
    bio: "I've spent my summers running my own window washing business, and the hardest part was never the work, it was finding the people who needed it. That's when I realized thousands of students have the same problem: real, marketable skills and no easy way to get them in front of the right people. Studying Electrical and Computer Engineering at UIUC, I wanted to build a fix. College Crew exists to close that gap, connecting students who can do the work with the neighbors looking for it.",
    portrait: zachPortrait,
    portraitPosition: "center 20%",
  },
];

function BrandMark({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <Image
      src={LOGO_SRC}
      alt=""
      width={36}
      height={36}
      className={`${className} object-contain`}
      aria-hidden
    />
  );
}

function Eyebrow({
  children,
  inverted = false,
}: {
  children: React.ReactNode;
  inverted?: boolean;
}) {
  return (
    <p
      className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] ${
        inverted ? "justify-center text-shell/65" : "text-viridian/55"
      }`}
    >
      <BrandMark />
      {children}
    </p>
  );
}

function BrandRule() {
  return (
    <div className="mb-8 flex items-center gap-6" aria-hidden>
      <span className="h-px flex-1 bg-viridian/20" />
      <BrandMark className="h-6 w-6" />
      <span className="h-px flex-1 bg-viridian/20" />
    </div>
  );
}

export default async function AboutPage() {
  const session = await getSession();
  const role = session ? await getEffectiveRole() : null;
  const primaryCta =
    role === "provider"
      ? { href: "/provider/dashboard", label: "View dashboard" }
      : { href: "/browse", label: "Book a student" };

  return (
    <div className="mx-[calc(50%-50vw)] -my-8 w-screen max-w-[100vw] overflow-x-clip bg-card text-viridian">
      <section className="relative overflow-hidden bg-honeydew py-20 sm:py-24 lg:py-[104px]">
        <Image
          src={LOGO_SRC}
          alt=""
          width={600}
          height={600}
          priority
          aria-hidden
          className="pointer-events-none absolute -right-24 top-8 hidden h-auto w-[520px] max-w-none opacity-35 lg:block"
        />
        <div className={`${WRAP} relative z-10`}>
          <div className="max-w-[790px]">
            <Eyebrow>
              <Editable k="about.hero.eyebrow">
                Notes from the founders
              </Editable>
            </Eyebrow>
            <h1
              className={`${SERIF} mt-5 max-w-[800px] text-balance text-[40px] leading-[1.06] font-semibold text-viridian sm:text-[50px] lg:text-[56px]`}
            >
              <Editable k="about.hero.title">
                Everything you want to know about College Crew, straight from
                the founders.
              </Editable>
            </h1>
            <p className="mt-6 max-w-[62ch] text-[16px] leading-[1.65] text-viridian/75 sm:text-[18px]">
              <Editable k="about.hero.body">
                The company, the people behind it, how it actually works, and
                what comes next. No corporate filler, just the real story,
                written by the four of us.
              </Editable>
            </p>
            <p className="mt-5 text-sm font-semibold text-viridian/70">
              <Editable k="about.hero.byline">
                Gianna, Zach, Ari and Max
              </Editable>
            </p>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-card py-[76px] sm:py-24 lg:py-[104px]">
        <Image
          src={LOGO_SRC}
          alt=""
          width={360}
          height={360}
          aria-hidden
          className="pointer-events-none absolute -left-24 bottom-0 hidden h-auto w-[340px] opacity-25 md:block"
        />
        <div className={`${WRAP} relative z-10`}>
          <BrandRule />
          <div className="grid gap-10 md:grid-cols-[0.85fr_1.15fr] md:gap-16 lg:gap-24">
            <div>
              <Eyebrow>
                <Editable k="about.story.eyebrow">Why we built it</Editable>
              </Eyebrow>
              <h2
                className={`${SERIF} mt-4 max-w-[13ch] text-[34px] leading-[1.08] font-semibold sm:text-[42px]`}
              >
                <Editable k="about.story.heading">
                  A good name should travel with you.
                </Editable>
              </h2>
            </div>
            <div className="space-y-5 text-[16px] leading-[1.72] text-viridian/75">
              <p>
                <Editable k="about.story.p1">
                  College Crew started with a simple frustration: every
                  college student lands in a new town and has to prove
                  themselves from scratch, while families right down the
                  street can never find help they actually trust.
                </Editable>
              </p>
              <p>
                <Editable k="about.story.p2">
                  We were those students. So we built the thing we wished
                  existed: a place where a verified student can build a
                  reputation through completed work, and neighbors can book
                  help from someone nearby.
                </Editable>
              </p>
              <p>
                <Editable k="about.story.p3">
                  No anonymous listings. No unverified providers. Just
                  students, verified and nearby, doing the work they already
                  do best.
                </Editable>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-viridian/15 bg-sky py-[76px] sm:py-24 lg:py-[104px]">
        <div className={WRAP}>
          <div className="max-w-[720px]">
            <Eyebrow>
              <Editable k="about.reputation.eyebrow">
                Hometown, meet campus
              </Editable>
            </Eyebrow>
            <h2
              className={`${SERIF} mt-4 max-w-[12ch] text-[36px] leading-[1.08] font-semibold sm:text-[46px]`}
            >
              <Editable k="about.reputation.heading">
                Two places. One reputation.
              </Editable>
            </h2>
            <p className="mt-6 max-w-[64ch] text-[16px] leading-[1.7] text-viridian/75 sm:text-[17px]">
              <Editable k="about.reputation.body">
                Every one of us grew up mowing lawns, walking dogs, and
                helping neighbors, then went off to school and watched that
                hard-earned trust reset to zero. College Crew gives students
                one verified place to build from every completed job.
              </Editable>
            </p>
          </div>
          <ul className="mt-8 flex max-w-[900px] flex-wrap gap-3">
            {[
              "One profile, one reputation",
              "Students nearby, school included",
              "Every student ID and school verified",
              "Reviews build over time",
            ].map((item, index) => (
              <li
                key={item}
                className="inline-flex items-center gap-2 rounded-full border border-viridian/15 bg-card/75 px-4 py-2.5 text-[13px] font-semibold text-viridian"
              >
                <BrandMark className="h-4 w-4" />
                <Editable k={`about.reputation.point.${index}`}>
                  {item}
                </Editable>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-stone py-[76px] sm:py-24 lg:py-[104px]">
        <div className={WRAP}>
          <BrandRule />
          <div className="mb-10 sm:mb-12">
            <Eyebrow>
              <Editable k="about.team.eyebrow">Meet the crew</Editable>
            </Eyebrow>
            <h2
              id="team"
              className={`${SERIF} mt-4 max-w-[15ch] text-[36px] leading-[1.08] font-semibold sm:text-[46px]`}
            >
              <Editable k="about.team.heading">
                The four founders behind College Crew.
              </Editable>
            </h2>
          </div>

          <div
            aria-labelledby="team"
            className="grid items-stretch gap-5 sm:grid-cols-2 xl:grid-cols-4"
          >
            {FOUNDERS.map((founder, index) => (
              <article
                key={founder.name}
                className="overflow-hidden rounded-[18px] border border-viridian/10 bg-card"
              >
                <div className="relative aspect-[4/5] overflow-hidden bg-viridian/5">
                  <Image
                    src={founder.portrait}
                    alt={`${founder.name}, co-founder of College Crew`}
                    fill
                    sizes="(max-width: 639px) 100vw, (max-width: 1279px) 50vw, 270px"
                    className="object-cover"
                    style={{ objectPosition: founder.portraitPosition }}
                  />
                </div>
                <div className="p-6">
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-viridian/45">
                    Co-founder
                  </p>
                  <h3
                    className={`${SERIF} mt-2 text-[25px] leading-tight font-semibold text-viridian`}
                  >
                    <Editable k={`about.team.${index}.name`}>
                      {founder.name}
                    </Editable>
                  </h3>
                  <p className="mt-3 text-[12px] font-semibold leading-[1.5] text-viridian/70">
                    <Editable k={`about.team.${index}.hometown`}>
                      {founder.hometown}
                    </Editable>
                  </p>
                  <p className="mt-1 text-[12px] leading-[1.5] text-viridian/60">
                    <Editable k={`about.team.${index}.school`}>
                      {founder.school}
                    </Editable>
                  </p>
                  <p className="mt-5 text-[13px] leading-[1.68] text-viridian/75">
                    <Editable k={`about.team.${index}.bio`}>
                      {founder.bio}
                    </Editable>
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-viridian py-[76px] text-shell sm:py-24">
        <Image
          src={LOGO_SRC}
          alt=""
          width={520}
          height={520}
          aria-hidden
          className="pointer-events-none absolute -bottom-36 -left-28 h-auto w-[470px] max-w-none opacity-15"
        />
        <div className="relative z-10 mx-auto max-w-[760px] px-5 text-center sm:px-8">
          <div className="justify-center">
            <Eyebrow inverted>
              <Editable k="about.cta.eyebrow">Come say hi</Editable>
            </Eyebrow>
          </div>
          <h2
            className={`${SERIF} mx-auto mt-4 max-w-[17ch] text-balance text-[36px] leading-[1.08] font-semibold sm:text-[48px]`}
          >
            <Editable k="about.cta.heading">
              Neighbors and students, in one crew.
            </Editable>
          </h2>
          <p className="mx-auto mt-6 max-w-[58ch] text-[16px] leading-[1.65] text-shell/75 sm:text-[17px]">
            <Editable k="about.cta.body">
              Book trusted help nearby, or sign up to start earning and
              building a reputation through work you are proud of.
            </Editable>
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
            <Link
              href={primaryCta.href}
              className="inline-flex items-center justify-center rounded-full border-[1.6px] border-shell bg-shell px-6 py-3.5 text-[15px] font-semibold text-viridian transition hover:-translate-y-px hover:bg-stone"
            >
              {primaryCta.label}
            </Link>
            {!session ? (
              <Link
                href="/provider/onboarding/account"
                className="inline-flex items-center justify-center rounded-full border-[1.6px] border-shell/45 px-6 py-3.5 text-[15px] font-semibold text-shell transition hover:-translate-y-px hover:bg-shell/10"
              >
                Become a provider
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
