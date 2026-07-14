import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { hasSupabaseEnv } from "@/lib/env";
import { blogImageUrl } from "@/lib/media/blog-images";
import { createClient } from "@/lib/supabase/server";

async function getPost(slug: string) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("blog_posts")
    .select("id, slug, title, body, image_path, created_at, updated_at")
    .eq("slug", slug)
    .maybeSingle();
  return data;
}

function postDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  return post
    ? { title: post.title, description: post.body.slice(0, 155) }
    : { title: "Post not found" };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();
  const imageUrl = blogImageUrl(post.image_path);
  const paragraphs = post.body.split(/\n\s*\n/).filter(Boolean);

  return (
    <article className="relative left-1/2 -my-8 w-screen -translate-x-1/2 bg-card text-viridian">
      <div className="mx-auto max-w-[900px] px-5 py-10 sm:px-8 sm:py-14">
        <Link
          href="/blog"
          className="text-[11px] font-bold uppercase tracking-[0.18em] text-viridian/70 transition-colors hover:text-viridian"
        >
          ← Stories From the Block
        </Link>
        <header className="mx-auto mt-10 max-w-[760px] text-center">
          <time
            dateTime={post.updated_at}
            className="text-[10px] font-bold uppercase tracking-[0.22em] text-viridian/70"
          >
            {postDate(post.updated_at)}
          </time>
          <h1 className="mt-4 font-[Georgia,'Times_New_Roman',serif] text-[38px] leading-[1.08] font-semibold text-viridian italic sm:text-[54px]">
            {post.title}
          </h1>
        </header>

        {imageUrl ? (
          <div className="mt-10 aspect-[16/9] overflow-hidden sm:mt-12">
            {/* CMS media may be a bundled legacy asset or public Storage URL. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={post.title}
              className="h-full w-full object-cover"
            />
          </div>
        ) : null}

        <div className="mx-auto mt-10 max-w-[680px] space-y-6 text-[16px] leading-[1.85] text-viridian/80 sm:mt-12 sm:text-[17px]">
          {paragraphs.map((paragraph, index) => (
            <p key={`${post.id}-${index}`}>{paragraph}</p>
          ))}
        </div>
      </div>
    </article>
  );
}
