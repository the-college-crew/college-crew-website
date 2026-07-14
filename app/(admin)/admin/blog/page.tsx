import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import type { PublicBlogPost } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";

import { BlogManager } from "./blog-manager";

export const metadata: Metadata = { title: "Blog management" };

export default async function AdminBlogPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blog_posts")
    .select("id, slug, title, body, image_path, created_at, updated_at")
    .order("updated_at", { ascending: false });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Blog"
        description="Publish College Crew stories and edit existing posts. Updating a post refreshes its date and returns it to the top."
      />
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">Could not load blog posts: {error.message}</div>
      ) : (
        <BlogManager posts={(data ?? []) as PublicBlogPost[]} />
      )}
    </div>
  );
}
