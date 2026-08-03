import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import featuredImage from "@/public/blog/featured-neighborhood-coffee.jpg";
import chicagoSkylineImage from "@/public/blog/chicago-skyline.jpg";
import { formatPostDate, getAllPosts, type BlogPost } from "@/lib/blog/posts";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Stories from the block",
  description:
    "Neighborhood stories, practical home help, and student spotlights from College Crew.",
  alternates: { canonical: `${SITE_URL}/blog` },
};

/**
 * Marketplace services, not blog categories — these link to Browse and are
 * labelled as such. An earlier version presented them as topic filters, which
 * they never were (docs/internal/audit-fixes-todo.md).
 */
const SERVICES = [
  { label: "Pet care", slug: "pet-care" },
  { label: "House management", slug: "house-management" },
  { label: "Hauling", slug: "hauling" },
  { label: "Lawn & yard", slug: "lawn-yard-care" },
  { label: "Tutoring", slug: "tutoring" },
  { label: "Coaching", slug: "youth-sports-coaching" },
] as const;

function StoryCard({ post, reverse }: { post: BlogPost; reverse: boolean }) {
  return (
    <article className="grid items-start gap-7 sm:grid-cols-2 sm:gap-8">
      <div
        className={
          reverse
            ? "relative aspect-[4/5] overflow-hidden sm:order-2 sm:aspect-auto sm:h-[340px]"
            : "relative aspect-[4/5] overflow-hidden sm:aspect-auto sm:h-[340px]"
        }
      >
        <Image
          src={post.image}
          alt={post.imageAlt}
          fill
          sizes="(max-width: 640px) 100vw, 460px"
          className="object-cover"
        />
      </div>

      <div className={reverse ? "sm:order-1" : undefined}>
        <time
          dateTime={post.publishedAt}
          className="text-[10px] font-bold uppercase tracking-[0.2em] text-viridian"
        >
          {formatPostDate(post.publishedAt)}
        </time>
        <h2 className="mt-3 font-[Georgia,'Times_New_Roman',serif] text-[29px] leading-[1.13] font-semibold text-viridian italic">
          <Link
            href={`/blog/${post.slug}`}
            className="transition-colors hover:text-viridian/65"
          >
            {post.title}
          </Link>
        </h2>
        {/*
          The excerpt, not the body. Printing full posts here duplicated every
          post verbatim on a second URL and grew the page without bound.
        */}
        <p className="mt-5 text-[14px] leading-[1.76] text-viridian/80">
          {post.description}
        </p>
        <Link
          href={`/blog/${post.slug}`}
          className="mt-5 inline-block text-[11px] font-bold uppercase tracking-[0.18em] text-viridian transition-colors hover:text-viridian/65"
        >
          Read the story →
        </Link>
      </div>
    </article>
  );
}

export default async function BlogPage() {
  const posts = await getAllPosts();

  return (
    <div className="relative left-1/2 -my-8 w-screen -translate-x-1/2 bg-card text-viridian">
      <div className="mx-auto max-w-[1140px] px-5 py-8 sm:px-8 sm:py-10">
        <section aria-labelledby="blog-heading">
          <div className="relative min-h-[430px] overflow-hidden sm:min-h-[520px] lg:min-h-[560px]">
            <Image
              src={featuredImage}
              alt="Reading the neighborhood paper over coffee"
              fill
              priority
              sizes="(max-width: 1140px) 100vw, 1140px"
              className="object-cover object-[center_40%]"
            />
            <div className="absolute inset-0 bg-viridian-ink/48" />
            <div className="absolute inset-0 flex items-center justify-center px-5 py-10 text-center text-card">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-card/90">
                  Featured
                </p>
                <h1
                  id="blog-heading"
                  className="mt-4 font-[Georgia,'Times_New_Roman',serif] text-[42px] leading-[1.08] font-semibold text-card italic sm:text-[52px]"
                >
                  Stories From
                  <br />
                  the Block
                </h1>
                <p className="mx-auto mt-4 max-w-[560px] text-[14px] leading-7 text-card/90 sm:text-[15px]">
                  The people, the pickups, and the small favors that make a
                  neighborhood feel like one. Grab a coffee and catch up on
                  what your neighbors and their students have been up to.
                </p>
              </div>
            </div>
          </div>

          <nav
            aria-label="Book a service"
            className="overflow-x-auto border-b border-viridian/20"
          >
            <ul className="flex min-w-max items-center py-5 sm:mx-auto sm:w-max sm:py-6">
              {SERVICES.map((service, index) => (
                <li key={service.slug} className="flex items-center">
                  {index > 0 ? (
                    <span
                      aria-hidden="true"
                      className="mx-5 h-3 w-px bg-viridian/25 sm:mx-6"
                    />
                  ) : null}
                  <Link
                    href={`/browse?service=${service.slug}`}
                    className="whitespace-nowrap text-[13px] font-medium text-viridian/80 transition-colors hover:text-viridian"
                  >
                    {service.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </section>

        <div className="grid gap-14 pb-14 pt-12 md:pb-20 md:pt-14 lg:grid-cols-[1.65fr_0.95fr] lg:gap-14">
          <div className="space-y-16">
            {posts.length > 0 ? (
              posts.map((post, index) => (
                <StoryCard
                  key={post.slug}
                  post={post}
                  reverse={index % 2 === 1}
                />
              ))
            ) : (
              <p className="border-y border-viridian/20 py-10 font-[Georgia,'Times_New_Roman',serif] text-2xl italic text-viridian/70">
                New stories are on the way.
              </p>
            )}
          </div>

          <aside className="border-t border-viridian/20 pt-9 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-12">
            <h2 className="border-b border-viridian/20 pb-3 font-[Georgia,'Times_New_Roman',serif] text-[30px] leading-tight font-semibold text-viridian italic">
              Our Story
            </h2>
            <div className="mt-5 space-y-4 text-[14px] leading-[1.78] text-viridian/80">
              <p>
                College Crew started with a simple frustration: every college
                student lands in a new town and has to prove themselves from
                scratch, while families right down the street can never find
                help they actually trust.
              </p>
              <p>
                The four of us were those students. So we built the thing we
                wished existed: a place where a verified student can build a
                reputation through completed work, and neighbors can book
                trusted help from someone nearby. No anonymous listings, just
                students doing the work they already do best.
              </p>
            </div>

            <div className="relative mt-7 aspect-[3/2] overflow-hidden">
              <Image
                src={chicagoSkylineImage}
                alt="The Chicago skyline at dusk with Lake Michigan in the background"
                fill
                sizes="(max-width: 1023px) 100vw, 350px"
                className="object-cover"
              />
            </div>

            <p className="mt-8 text-[10px] font-bold uppercase tracking-[0.22em] text-viridian">
              Links
            </p>
            <ol className="mt-2">
              {[
                { href: "/browse", label: "Book a Student" },
                {
                  href: "/provider/onboarding/account",
                  label: "Become a provider",
                },
                { href: "/browse", label: "See All Services" },
              ].map((item, index) => (
                <li
                  key={item.label}
                  className="flex items-baseline gap-5 border-b border-viridian/15 py-4"
                >
                  <span className="min-w-8 font-[Georgia,'Times_New_Roman',serif] text-xl text-viridian italic">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <Link
                    href={item.href}
                    className="font-[Georgia,'Times_New_Roman',serif] text-lg text-viridian italic transition-colors hover:text-viridian/65"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </div>
    </div>
  );
}
