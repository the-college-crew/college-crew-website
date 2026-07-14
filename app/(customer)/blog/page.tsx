import type { Metadata } from "next";
import Link from "next/link";

import { Editable } from "@/components/content/editable";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { hasSupabaseEnv } from "@/lib/env";
import { blogImageUrl } from "@/lib/media/blog-images";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Blog" };

function postDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

export default async function BlogPage() {
  const posts = hasSupabaseEnv()
    ? ((await (await createClient())
        .from("blog_posts")
        .select("id, slug, title, body, image_path, created_at, updated_at")
        .order("updated_at", { ascending: false })).data ?? [])
    : [];
  const [featured, ...morePosts] = posts;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title={<Editable k="blog.header.title">Blog</Editable>}
        description={
          <Editable k="blog.header.description">
            Local tips, student spotlights, and seasonal checklists.
          </Editable>
        }
      />

      {!featured ? (
        <EmptyState
          title={<Editable k="blog.empty.title">First post coming soon</Editable>}
          action={
            <Link href="/browse" className={buttonClasses({ variant: "secondary", size: "sm" })}>
              Browse providers instead
            </Link>
          }
        >
          <Editable k="blog.empty.body">
            {`We're heads-down getting the pilot ready. Posts land here once the crew is up and running.`}
          </Editable>
        </EmptyState>
      ) : (
        <div className="space-y-8">
          <article className="overflow-hidden rounded-2xl border border-stone bg-paper shadow-sm shadow-viridian/5">
            {blogImageUrl(featured.image_path) ? (
              // Public Storage asset. Every replacement gets a new object URL.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={blogImageUrl(featured.image_path) ?? undefined}
                alt={featured.title}
                className="aspect-[16/8] w-full object-cover"
              />
            ) : null}
            <div className="p-5 sm:p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-mist">
                Latest · {postDate(featured.updated_at)}
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold leading-tight text-viridian sm:text-3xl">
                <Link href={`/blog/${featured.slug}`} className="hover:text-viridian-ink">
                  {featured.title}
                </Link>
              </h2>
              <p className="mt-3 line-clamp-3 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-ink-soft">
                {featured.body}
              </p>
              <Link href={`/blog/${featured.slug}`} className={buttonClasses({ variant: "secondary", size: "sm", className: "mt-5" })}>
                Read post
              </Link>
            </div>
          </article>

          {morePosts.length > 0 ? (
            <section aria-labelledby="more-posts-heading">
              <div className="mb-3 flex items-end justify-between gap-4">
                <h2 id="more-posts-heading" className="font-display text-xl font-semibold text-viridian">More from the crew</h2>
                <span className="text-xs text-mist">Newest first</span>
              </div>
              <div className="divide-y divide-line overflow-hidden rounded-2xl border border-stone bg-paper shadow-sm shadow-viridian/5">
                {morePosts.map((post) => (
                  <article key={post.id} className="flex items-center justify-between gap-5 px-5 py-4 sm:px-6">
                    <h3 className="min-w-0 font-display text-lg font-semibold leading-snug text-viridian">
                      <Link href={`/blog/${post.slug}`} className="hover:text-viridian-ink">{post.title}</Link>
                    </h3>
                    <time dateTime={post.updated_at} className="shrink-0 text-xs text-mist">{postDate(post.updated_at)}</time>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
