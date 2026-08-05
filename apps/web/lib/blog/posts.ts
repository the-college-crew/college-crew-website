import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";
import { cache } from "react";
import "server-only";
import { z } from "zod";

import { isBlogImageUrl } from "@/lib/media/blog-images";
import { SITE_URL } from "@/lib/site";

/**
 * Blog posts are markdown files in this repo, not database rows.
 *
 * The source of truth is git: a post ships in a PR, its history is a diff, and
 * publishing needs no credentials. See `docs/blog/PUBLISHING.md`.
 */
const POSTS_DIR = path.join(process.cwd(), "content", "blog");

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const frontmatterSchema = z.object({
  title: z.string().trim().min(1).max(160),
  /**
   * The meta description, written deliberately rather than sliced off the top
   * of the body. Google truncates around 160 characters.
   */
  description: z.string().trim().min(1).max(200),
  publishedAt: z.string().regex(ISO_DATE, "Use YYYY-MM-DD"),
  updatedAt: z.string().regex(ISO_DATE, "Use YYYY-MM-DD").optional(),
  /**
   * Either a path under `public/` (`/blog/leaf-cleanup.jpg`) or a public URL
   * in the `blog-images` bucket. The weekly routine always writes the second
   * kind — it cannot commit a binary file, so photos live in Storage and only
   * the address travels through git. See `lib/media/blog-images.ts`.
   */
  image: z
    .string()
    .refine(
      (value) => value.startsWith("/blog/") || isBlogImageUrl(value),
      "Use a /blog/… path or a blog-images public URL",
    ),
  /** Required: alt text is both an accessibility and a ranking signal. */
  imageAlt: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)).default([]),
  faq: z
    .array(
      z.object({
        q: z.string().trim().min(1),
        a: z.string().trim().min(1),
      }),
    )
    .default([]),
});

export type BlogPost = z.infer<typeof frontmatterSchema> & {
  slug: string;
  body: string;
};

function parsePost(slug: string, raw: string): BlogPost {
  const { data, content } = matter(raw);
  const parsed = frontmatterSchema.safeParse(data);

  if (!parsed.success) {
    // Fail the build rather than shipping a post with a broken <head>. A bad
    // frontmatter key is a mistake nobody notices from the rendered page.
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid frontmatter in content/blog/${slug}.md — ${issues}`);
  }

  if (!content.trim()) {
    throw new Error(`content/blog/${slug}.md has no body.`);
  }

  return { ...parsed.data, slug, body: content.trim() };
}

export const getAllPosts = cache(async (): Promise<BlogPost[]> => {
  let entries: string[];
  try {
    entries = await readdir(POSTS_DIR);
  } catch {
    // No content directory yet — an empty blog, not an error.
    return [];
  }

  const posts = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".md"))
      .map(async (entry) => {
        const slug = entry.replace(/\.md$/, "");
        const raw = await readFile(path.join(POSTS_DIR, entry), "utf8");
        return parsePost(slug, raw);
      }),
  );

  return posts.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
});

export const getPost = cache(async (slug: string): Promise<BlogPost | null> => {
  const posts = await getAllPosts();
  return posts.find((post) => post.slug === slug) ?? null;
});

/**
 * Absolute URL for the hero photo, for OpenGraph and structured data.
 *
 * Never concatenate `SITE_URL` with `post.image` directly: since photos moved
 * to Storage, that value is already absolute half the time, and gluing the two
 * together produces a silently broken `og:image` that nothing in the build
 * catches.
 */
export function postImageUrl(post: BlogPost): string {
  return post.image.startsWith("/") ? `${SITE_URL}${post.image}` : post.image;
}

/** The date shown to readers and used for `dateModified`. */
export function lastUpdated(post: BlogPost): string {
  return post.updatedAt ?? post.publishedAt;
}

export function formatPostDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}
