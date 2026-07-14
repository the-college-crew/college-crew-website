import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonClasses } from "@/components/ui/button";
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

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  return post ? { title: post.title, description: post.body.slice(0, 155) } : { title: "Post not found" };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();
  const imageUrl = blogImageUrl(post.image_path);

  return (
    <article className="mx-auto max-w-3xl">
      <Link href="/blog" className={buttonClasses({ variant: "ghost", size: "sm", className: "mb-6" })}>
        ← All posts
      </Link>
      <header>
        <time dateTime={post.updated_at} className="text-xs font-semibold uppercase tracking-[0.12em] text-mist">
          Updated {postDate(post.updated_at)}
        </time>
        <h1 className="mt-3 font-display text-3xl font-semibold leading-tight text-viridian sm:text-5xl">
          {post.title}
        </h1>
      </header>
      {imageUrl ? (
        <div className="mt-7 overflow-hidden rounded-2xl bg-sky">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={post.title} className="aspect-[16/8] w-full object-cover" />
        </div>
      ) : null}
      <div className="mt-8 whitespace-pre-wrap text-base leading-8 text-ink-soft sm:text-lg">{post.body}</div>
    </article>
  );
}
