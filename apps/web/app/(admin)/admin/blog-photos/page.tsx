import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth/session";
import { hasServiceRoleEnv } from "@/lib/env";
import { BLOG_IMAGES_BUCKET, blogImageUrl } from "@/lib/media/blog-images";
import { createAdminClient } from "@/lib/supabase/admin";

import { BlogPhotoManager, type BlogPhoto } from "./blog-photo-manager";

export const metadata: Metadata = { title: "Blog photos" };

/** Most recent first, and enough history that reusing a photo stays practical. */
const PHOTO_LIMIT = 60;

async function listBlogPhotos(): Promise<BlogPhoto[]> {
  if (!hasServiceRoleEnv()) return [];

  const { data } = await createAdminClient()
    .storage.from(BLOG_IMAGES_BUCKET)
    .list("", {
      limit: PHOTO_LIMIT,
      sortBy: { column: "created_at", order: "desc" },
    });

  return (data ?? [])
    // Storage lists folders with a null id, plus a placeholder object it
    // creates for empty prefixes. Neither is a photo.
    .filter((object) => object.id && object.name !== ".emptyFolderPlaceholder")
    .map((object) => ({ key: object.name, url: blogImageUrl(object.name) }))
    .filter((photo): photo is BlogPhoto => photo.url !== null);
}

/**
 * Where blog hero photos come from. Blog posts are markdown files in git, but
 * their photos are not: the weekly routine cannot commit a binary file, so it
 * writes a URL instead. This page is what turns a photo on someone's phone into
 * a key they can paste into the Slack canvas.
 */
export default async function AdminBlogPhotosPage() {
  await requireRole("admin", "/admin/blog-photos");
  const photos = await listBlogPhotos();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Blog photos"
        description="Upload the photo for this week's post, then copy its key and paste it into the blog canvas in Slack. Photos stay here, so you can reuse an earlier one instead of uploading again."
      />

      {!hasServiceRoleEnv() ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          SUPABASE_SERVICE_ROLE_KEY is missing — uploads need it. Add it to
          .env.local.
        </div>
      ) : null}

      <BlogPhotoManager photos={photos} />
    </div>
  );
}
