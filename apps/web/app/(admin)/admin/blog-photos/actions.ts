"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/session";
import { hasServiceRoleEnv } from "@/lib/env";
import {
  BLOG_IMAGES_BUCKET,
  blogImageKey,
  validateBlogImage,
} from "@/lib/media/blog-images";
import { createAdminClient } from "@/lib/supabase/admin";

export type UploadBlogImageResult =
  | { ok: true; key: string }
  | { ok: false; error: string };

/**
 * Upload a blog hero photo to the public `blog-images` bucket.
 *
 * Service-role rather than browser-direct on purpose: the bucket carries no
 * storage policy at all, so a browser upload would need a new one. The file is
 * capped at 5 MB, well inside the 22 MB Server Action body limit set in
 * `next.config.ts`. Always AFTER requireRole("admin").
 */
export async function uploadBlogImage(
  formData: FormData,
): Promise<UploadBlogImageResult> {
  await requireRole("admin");
  if (!hasServiceRoleEnv()) {
    return {
      ok: false,
      error: "SUPABASE_SERVICE_ROLE_KEY is missing — add it to .env.local.",
    };
  }

  const file = formData.get("photo");
  if (!(file instanceof File)) return { ok: false, error: "Choose a photo to upload." };

  // Same rules the browser already applied — re-run them here, since a Server
  // Action is a public endpoint.
  const invalid = validateBlogImage(file);
  if (invalid) return { ok: false, error: invalid };

  const key = blogImageKey(file);
  const { error } = await createAdminClient()
    .storage.from(BLOG_IMAGES_BUCKET)
    .upload(key, file, { contentType: file.type, upsert: false });

  if (error) return { ok: false, error: `Could not upload that photo: ${error.message}` };

  revalidatePath("/admin/blog-photos");
  return { ok: true, key };
}
