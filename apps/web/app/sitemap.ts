import type { MetadataRoute } from "next";

import { getAllPosts, lastUpdated } from "@/lib/blog/posts";
import { SITE_URL } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const supabase = await createClient();
  const [{ data: providers }, posts] = await Promise.all([
    supabase
      .from("public_provider_directory")
      .select("provider_id, created_at"),
    getAllPosts(),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/browse`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    {
      url: `${SITE_URL}/about/customers`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/about/students`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    { url: `${SITE_URL}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/faq`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: new Date("2026-07-29"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/legal`,
      lastModified: new Date("2026-07-29"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  const providerRoutes: MetadataRoute.Sitemap = (providers ?? []).map(
    (provider) => ({
      url: `${SITE_URL}/providers/${provider.provider_id}`,
      lastModified: provider.created_at
        ? new Date(provider.created_at)
        : now,
      changeFrequency: "weekly",
      priority: 0.7,
    }),
  );
  const blogRoutes: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(`${lastUpdated(post)}T00:00:00Z`),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...providerRoutes, ...blogRoutes];
}
