"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label, Textarea } from "@/components/ui/field";
import type { PublicBlogPost } from "@/lib/db/types";
import { blogImageUrl } from "@/lib/media/blog-images";
import { formatDate } from "@/lib/utils";

import {
  createBlogPost,
  deleteBlogPost,
  updateBlogPost,
  type BlogActionState,
} from "./actions";

const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

function ActionMessage({ state }: { state: BlogActionState }) {
  return (
    <div aria-live="polite">
      {state.success ? (
        <p className="text-sm font-medium text-quad-700">{state.success}</p>
      ) : null}
      <FieldError>{state.error}</FieldError>
    </div>
  );
}

function NewPostForm() {
  const [state, action, pending] = useActionState(createBlogPost, {});
  return (
    <form action={action} className="space-y-4 rounded-2xl border border-stone bg-paper p-5 shadow-sm shadow-viridian/5">
      <div>
        <h2 className="font-display text-xl font-semibold text-viridian">Write a new post</h2>
        <p className="mt-1 text-sm text-ink-soft">Saving publishes immediately and places it at the top of the blog.</p>
      </div>
      <div>
        <Label htmlFor="new-blog-title">Title</Label>
        <Input id="new-blog-title" name="title" maxLength={160} required />
      </div>
      <div>
        <Label htmlFor="new-blog-body">Body</Label>
        <Textarea id="new-blog-body" name="body" rows={10} maxLength={30000} required />
      </div>
      <div>
        <Label htmlFor="new-blog-image">Image</Label>
        <Input id="new-blog-image" name="image" type="file" accept={IMAGE_ACCEPT} required className="cursor-pointer file:mr-3 file:rounded-lg file:border-0 file:bg-honeydew file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-viridian" />
        <FieldHint>JPG, PNG, or WebP — up to 5 MB.</FieldHint>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Publishing…" : "Publish post"}</Button>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

function PostEditor({ post }: { post: PublicBlogPost }) {
  const [updateState, updateAction, updating] = useActionState(updateBlogPost, {});
  const [deleteState, deleteAction, deleting] = useActionState(deleteBlogPost, {});
  const imageUrl = blogImageUrl(post.image_path);

  return (
    <details className="group border-b border-line last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 marker:content-none">
        <span className="min-w-0 font-semibold text-ink group-open:text-viridian">{post.title}</span>
        <span className="shrink-0 text-xs text-mist">{formatDate(post.updated_at)}</span>
      </summary>
      <div className="border-t border-line bg-court/60 p-4 sm:p-5">
        <div className="mb-5 overflow-hidden rounded-xl bg-sky">
          {imageUrl ? (
            // Public Storage image; unique paths prevent stale replacement copies.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={post.title} className="aspect-[16/8] w-full object-cover" />
          ) : (
            <div className="flex aspect-[16/8] items-center justify-center text-sm text-mist">Image unavailable</div>
          )}
        </div>

        <form action={updateAction} className="space-y-4">
          <input type="hidden" name="postId" value={post.id} />
          <div>
            <Label htmlFor={`blog-title-${post.id}`}>Title</Label>
            <Input id={`blog-title-${post.id}`} name="title" defaultValue={post.title} maxLength={160} required />
          </div>
          <div>
            <Label htmlFor={`blog-body-${post.id}`}>Body</Label>
            <Textarea id={`blog-body-${post.id}`} name="body" defaultValue={post.body} rows={12} maxLength={30000} required />
          </div>
          <div>
            <Label htmlFor={`blog-image-${post.id}`}>Replace image</Label>
            <Input id={`blog-image-${post.id}`} name="image" type="file" accept={IMAGE_ACCEPT} className="cursor-pointer file:mr-3 file:rounded-lg file:border-0 file:bg-honeydew file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-viridian" />
            <FieldHint>Leave empty to keep the current image.</FieldHint>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" disabled={updating || deleting}>{updating ? "Saving…" : "Save changes"}</Button>
            <ActionMessage state={updateState} />
          </div>
        </form>

        <form
          action={deleteAction}
          className="mt-6 border-t border-red-200 pt-4"
          onSubmit={(event) => {
            if (!window.confirm(`Delete “${post.title}”? This cannot be undone.`)) event.preventDefault();
          }}
        >
          <input type="hidden" name="postId" value={post.id} />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="danger" size="sm" disabled={updating || deleting}>{deleting ? "Deleting…" : "Delete post"}</Button>
            <ActionMessage state={deleteState} />
          </div>
        </form>
      </div>
    </details>
  );
}

export function BlogManager({ posts }: { posts: PublicBlogPost[] }) {
  return (
    <div className="space-y-6">
      <NewPostForm />
      <section aria-labelledby="published-posts-heading">
        <div className="mb-3 flex items-end justify-between gap-4">
          <h2 id="published-posts-heading" className="font-display text-xl font-semibold text-viridian">Published posts</h2>
          <span className="text-xs text-mist">Newest first</span>
        </div>
        {posts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone bg-paper/70 px-6 py-10 text-center text-sm text-ink-soft">No posts yet. Publish the first one above.</div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-stone bg-paper shadow-sm shadow-viridian/5">
            {posts.map((post) => <PostEditor key={post.id} post={post} />)}
          </div>
        )}
      </section>
    </div>
  );
}
