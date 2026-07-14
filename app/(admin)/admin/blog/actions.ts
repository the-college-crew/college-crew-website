"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { hasServiceRoleEnv } from "@/lib/env";
import { BLOG_IMAGES_BUCKET } from "@/lib/media/blog-images";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const postFieldsSchema = z.object({
  title: z.string().trim().min(1, "Add a title.").max(160),
  body: z.string().trim().min(1, "Add the post body.").max(30000),
});

export type BlogActionState = {
  error?: string;
  success?: string;
};

function parseImage(value: FormDataEntryValue | null, required: boolean) {
  if (!(value instanceof File) || value.size === 0) {
    return required ? { error: "Choose an image." } : { file: null };
  }
  if (value.size > MAX_IMAGE_BYTES) {
    return { error: "Choose an image smaller than 5 MB." };
  }
  const extension = IMAGE_EXTENSION[value.type];
  if (!extension) return { error: "Use a JPG, PNG, or WebP image." };
  return { file: value, extension };
}

function postSlug(title: string, id: string) {
  const base = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140)
    .replace(/-+$/g, "");
  return `${base || "post"}-${id.slice(0, 8)}`;
}

function revalidateBlog(slug?: string) {
  revalidatePath("/admin/blog");
  revalidatePath("/blog");
  if (slug) revalidatePath(`/blog/${slug}`);
}

export async function createBlogPost(
  _previous: BlogActionState,
  formData: FormData,
): Promise<BlogActionState> {
  const session = await requireRole("admin");
  if (!hasServiceRoleEnv()) {
    return { error: "Server key missing — check .env.local." };
  }

  const fields = postFieldsSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
  });
  if (!fields.success) {
    return { error: fields.error.issues[0]?.message ?? "Check the post fields." };
  }

  const parsedImage = parseImage(formData.get("image"), true);
  if ("error" in parsedImage) return { error: parsedImage.error };
  if (!parsedImage.file || !parsedImage.extension) {
    return { error: "Choose an image." };
  }

  const id = randomUUID();
  const slug = postSlug(fields.data.title, id);
  const imagePath = `${id}/${randomUUID()}.${parsedImage.extension}`;
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from(BLOG_IMAGES_BUCKET)
    .upload(imagePath, parsedImage.file, {
      cacheControl: "31536000",
      contentType: parsedImage.file.type,
      upsert: false,
    });
  if (uploadError) return { error: `Image upload failed: ${uploadError.message}` };

  const { error: insertError } = await admin.from("blog_posts").insert({
    id,
    slug,
    title: fields.data.title,
    body: fields.data.body,
    image_path: imagePath,
    created_by: session.user.id,
    updated_by: session.user.id,
  });
  if (insertError) {
    await admin.storage.from(BLOG_IMAGES_BUCKET).remove([imagePath]);
    return { error: `Could not publish the post: ${insertError.message}` };
  }

  revalidateBlog(slug);
  return { success: "Post published." };
}

export async function updateBlogPost(
  _previous: BlogActionState,
  formData: FormData,
): Promise<BlogActionState> {
  const session = await requireRole("admin");
  if (!hasServiceRoleEnv()) {
    return { error: "Server key missing — check .env.local." };
  }

  const postId = z.string().uuid().safeParse(formData.get("postId"));
  if (!postId.success) return { error: "That post could not be found." };
  const fields = postFieldsSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
  });
  if (!fields.success) {
    return { error: fields.error.issues[0]?.message ?? "Check the post fields." };
  }
  const parsedImage = parseImage(formData.get("image"), false);
  if ("error" in parsedImage) return { error: parsedImage.error };

  const admin = createAdminClient();
  const { data: existing, error: readError } = await admin
    .from("blog_posts")
    .select("slug, image_path")
    .eq("id", postId.data)
    .maybeSingle();
  if (readError || !existing) return { error: "That post no longer exists." };

  let nextImagePath = existing.image_path;
  if (parsedImage.file && parsedImage.extension) {
    nextImagePath = `${postId.data}/${randomUUID()}.${parsedImage.extension}`;
    const { error: uploadError } = await admin.storage
      .from(BLOG_IMAGES_BUCKET)
      .upload(nextImagePath, parsedImage.file, {
        cacheControl: "31536000",
        contentType: parsedImage.file.type,
        upsert: false,
      });
    if (uploadError) {
      return { error: `Image upload failed: ${uploadError.message}` };
    }
  }

  const { error: updateError } = await admin
    .from("blog_posts")
    .update({
      title: fields.data.title,
      body: fields.data.body,
      image_path: nextImagePath,
      updated_by: session.user.id,
    })
    .eq("id", postId.data);
  if (updateError) {
    if (nextImagePath !== existing.image_path) {
      await admin.storage.from(BLOG_IMAGES_BUCKET).remove([nextImagePath]);
    }
    return { error: `Could not save the post: ${updateError.message}` };
  }

  if (nextImagePath !== existing.image_path) {
    await admin.storage.from(BLOG_IMAGES_BUCKET).remove([existing.image_path]);
  }

  revalidateBlog(existing.slug);
  return { success: "Post updated and moved to the top." };
}

export async function deleteBlogPost(
  _previous: BlogActionState,
  formData: FormData,
): Promise<BlogActionState> {
  await requireRole("admin");
  if (!hasServiceRoleEnv()) {
    return { error: "Server key missing — check .env.local." };
  }

  const postId = z.string().uuid().safeParse(formData.get("postId"));
  if (!postId.success) return { error: "That post could not be found." };

  const admin = createAdminClient();
  const { data: existing, error: readError } = await admin
    .from("blog_posts")
    .select("slug, image_path")
    .eq("id", postId.data)
    .maybeSingle();
  if (readError || !existing) return { error: "That post no longer exists." };

  const { error: deleteError } = await admin
    .from("blog_posts")
    .delete()
    .eq("id", postId.data);
  if (deleteError) return { error: `Could not delete the post: ${deleteError.message}` };

  await admin.storage.from(BLOG_IMAGES_BUCKET).remove([existing.image_path]);
  revalidateBlog(existing.slug);
  return { success: "Post deleted." };
}
