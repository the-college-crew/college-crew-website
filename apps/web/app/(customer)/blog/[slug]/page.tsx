import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { JsonLd } from "@/components/json-ld";
import { renderMarkdown } from "@/lib/blog/markdown";
import {
  formatPostDate,
  getAllPosts,
  getPost,
  lastUpdated,
  type BlogPost,
} from "@/lib/blog/posts";
import { SITE, SITE_URL } from "@/lib/site";

export async function generateStaticParams() {
  const posts = await getAllPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: "Post not found" };

  const url = `${SITE_URL}/blog/${post.slug}`;
  const image = `${SITE_URL}${post.image}`;

  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title: post.title,
      description: post.description,
      siteName: SITE.name,
      publishedTime: post.publishedAt,
      modifiedTime: lastUpdated(post),
      tags: [...post.tags],
      images: [{ url: image, alt: post.imageAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
      images: [image],
    },
  };
}

function schemas(post: BlogPost) {
  const url = `${SITE_URL}/blog/${post.slug}`;

  const article = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    headline: post.title,
    description: post.description,
    image: [`${SITE_URL}${post.image}`],
    datePublished: post.publishedAt,
    dateModified: lastUpdated(post),
    author: { "@type": "Organization", name: SITE.name, url: SITE_URL },
    publisher: { "@type": "Organization", name: SITE.name, url: SITE_URL },
    ...(post.tags.length > 0 ? { keywords: post.tags.join(", ") } : {}),
  };

  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
      { "@type": "ListItem", position: 3, name: post.title, item: url },
    ],
  };

  // Only emitted when the post carries FAQ entries, and the same entries are
  // rendered visibly below — schema that does not match the visible page gets
  // both the markup and the page discounted.
  const faq =
    post.faq.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: post.faq.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        }
      : null;

  return { article, breadcrumbs, faq };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  const html = await renderMarkdown(post.body);
  const { article, breadcrumbs, faq } = schemas(post);
  const updated = lastUpdated(post);

  return (
    <article className="relative left-1/2 -my-8 w-screen -translate-x-1/2 bg-card text-viridian">
      <JsonLd schema={article} />
      <JsonLd schema={breadcrumbs} />
      {faq ? <JsonLd schema={faq} /> : null}

      <div className="mx-auto max-w-[900px] px-5 py-10 sm:px-8 sm:py-14">
        <Link
          href="/blog"
          className="text-[11px] font-bold uppercase tracking-[0.18em] text-viridian/70 transition-colors hover:text-viridian"
        >
          ← Stories From the Block
        </Link>
        <header className="mx-auto mt-10 max-w-[760px] text-center">
          <time
            dateTime={post.publishedAt}
            className="text-[10px] font-bold uppercase tracking-[0.22em] text-viridian/70"
          >
            {formatPostDate(post.publishedAt)}
          </time>
          <h1 className="mt-4 font-[Georgia,'Times_New_Roman',serif] text-[38px] leading-[1.08] font-semibold text-viridian italic sm:text-[54px]">
            {post.title}
          </h1>
        </header>

        <div className="relative mt-10 aspect-[16/9] overflow-hidden sm:mt-12">
          <Image
            src={post.image}
            alt={post.imageAlt}
            fill
            priority
            sizes="(max-width: 900px) 100vw, 900px"
            className="object-cover"
          />
        </div>

        <div
          className="blog-body mx-auto mt-10 max-w-[680px] sm:mt-12"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        {post.faq.length > 0 ? (
          <section
            aria-labelledby="post-faq"
            className="mx-auto mt-14 max-w-[680px] border-t border-viridian/20 pt-10"
          >
            <h2
              id="post-faq"
              className="font-[Georgia,'Times_New_Roman',serif] text-[30px] leading-tight font-semibold text-viridian italic"
            >
              Common questions
            </h2>
            <dl className="mt-6 space-y-7">
              {post.faq.map((item) => (
                <div key={item.q}>
                  <dt className="text-[15px] font-bold text-viridian">
                    {item.q}
                  </dt>
                  <dd className="mt-2 text-[16px] leading-[1.85] text-viridian/80">
                    {item.a}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        {updated !== post.publishedAt ? (
          <p className="mx-auto mt-12 max-w-[680px] text-[11px] uppercase tracking-[0.18em] text-viridian/55">
            Updated {formatPostDate(updated)}
          </p>
        ) : null}
      </div>
    </article>
  );
}
