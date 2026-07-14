import type { Metadata } from "next";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";

import dogWalkImage from "@/public/blog/evening-dog-walk.jpg";
import featuredImage from "@/public/blog/featured-neighborhood-coffee.jpg";
import houseManagementImage from "@/public/blog/house-management.jpg";
import soccerImage from "@/public/blog/youth-soccer-coaching.jpg";

export const metadata: Metadata = {
  title: "Stories from the block",
  description:
    "Neighborhood stories, practical home help, and student spotlights from College Crew.",
};

const TOPICS = [
  "Pet care",
  "House management",
  "Hauling",
  "Lawn & yard",
  "Tutoring",
  "Coaching",
];

const POSTS: Array<{
  date: string;
  title: string;
  image: StaticImageData;
  imageAlt: string;
  imagePosition?: string;
  reverse?: boolean;
  paragraphs: string[];
}> = [
  {
    date: "March 4, 2026",
    title: "The Quiet Work of Keeping a Home Running",
    image: houseManagementImage,
    imageAlt: "A warmly lit living room cared for while its owner is away",
    paragraphs: [
      "Mrs. Alvarez travels for work about a week every month. This past winter she had a pile of packages that needed returning, an empty fridge she wanted filled before she landed, and two houseplants that were not going to make it another few days on their own.",
      "One of our students, a junior at Loyola who lives four blocks over, took care of all of it. Returns dropped at the UPS store, groceries put away, plants watered, and a quick photo texted over so she knew things were handled while she was gone.",
      "Honestly, that's most of what house management is. The little stuff that stacks up when life gets busy, done by someone from the neighborhood you'd recognize at the coffee shop. No app full of strangers, and you always know who has your spare key.",
    ],
  },
  {
    date: "February 18, 2026",
    title: "Dog Walking, Day and Night, Whatever the Block Needs",
    image: dogWalkImage,
    imageAlt: "A College Crew student walking a golden retriever in the evening",
    imagePosition: "50% 58%",
    reverse: true,
    paragraphs: [
      "Our neighbors don't keep normal hours, so we don't either. Some walks happen at 6am before a shift. Some happen at 10pm when someone's stuck late downtown and the dog has been waiting by the door for an hour.",
      "Take Winnie, a golden who lives on the corner. Most nights she gets walked by the same two students. Her owner never knows exactly when he'll be home, so he books whoever's free and trusts they'll show up. They always do.",
      "Rain, snow, early, late. If your dog needs to get out, one of our students will be there, and you'll get a message the second the walk starts.",
    ],
  },
];

function StoryPost({ post }: { post: (typeof POSTS)[number] }) {
  return (
    <article className="grid items-start gap-7 sm:grid-cols-2 sm:gap-8">
      <div
        className={
          post.reverse
            ? "relative aspect-[4/5] overflow-hidden sm:order-2 sm:aspect-auto sm:h-[340px]"
            : "relative aspect-[4/5] overflow-hidden sm:aspect-auto sm:h-[340px]"
        }
      >
        <Image
          src={post.image}
          alt={post.imageAlt}
          fill
          sizes="(max-width: 639px) 100vw, (max-width: 1023px) 42vw, 300px"
          className="object-cover"
          style={{ objectPosition: post.imagePosition }}
        />
      </div>

      <div className={post.reverse ? "sm:order-1" : undefined}>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-viridian">
          {post.date}
        </p>
        <h2 className="mt-3 font-[Georgia,'Times_New_Roman',serif] text-[29px] leading-[1.13] font-semibold text-viridian italic">
          {post.title}
        </h2>
        <div className="mt-5 space-y-5 text-[14px] leading-[1.76] text-viridian/80">
          {post.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </div>
    </article>
  );
}

export default function BlogPage() {
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
            aria-label="Blog topics"
            className="overflow-x-auto border-b border-viridian/20"
          >
            <ul className="flex min-w-max items-center py-5 sm:mx-auto sm:w-max sm:py-6">
              {TOPICS.map((topic, index) => (
                <li key={topic} className="flex items-center">
                  {index > 0 ? (
                    <span
                      aria-hidden="true"
                      className="mx-5 h-3 w-px bg-viridian/25 sm:mx-6"
                    />
                  ) : null}
                  <Link
                    href="/browse"
                    className="whitespace-nowrap text-[13px] font-medium text-viridian/80 transition-colors hover:text-viridian"
                  >
                    {topic}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </section>

        <div className="grid gap-14 pb-14 pt-12 md:pb-20 md:pt-14 lg:grid-cols-[1.65fr_0.95fr] lg:gap-14">
          <div className="space-y-16">
            {POSTS.map((post) => (
              <StoryPost key={post.title} post={post} />
            ))}
          </div>

          <aside className="border-t border-viridian/20 pt-9 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-12">
            <h2 className="border-b border-viridian/20 pb-3 font-[Georgia,'Times_New_Roman',serif] text-[30px] leading-tight font-semibold text-viridian italic">
              Our Story
            </h2>
            <div className="mt-5 space-y-4 text-[14px] leading-[1.78] text-viridian/80">
              <p>
                College Crew&apos;s co-owner, Gianna, has spent years coaching
                youth soccer around here. She&apos;s the kind of coach who knows
                every kid&apos;s name and gets their parents to actually stay for
                practice.
              </p>
              <p>
                That&apos;s exactly why youth sports coaching earned a place on
                College Crew. Student athletes teaching kids fundamentals,
                confidence, and heart, from people the family already knows
                and trusts on the block.
              </p>
            </div>

            <div className="relative mt-7 aspect-[3/2] overflow-hidden">
              <Image
                src={soccerImage}
                alt="Gianna coaching children during a neighborhood youth soccer game"
                fill
                sizes="(max-width: 1023px) 100vw, 350px"
                className="object-cover object-[center_35%]"
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
                  label: "Join as a Student",
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
