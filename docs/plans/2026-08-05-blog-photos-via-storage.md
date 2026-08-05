# Blog photos move to Supabase Storage

**Status:** in progress
**Owner:** Zach
**Branch:** `blog/photos-via-storage`
**Updated:** 2026-08-05

## Goal

The weekly blog routine can publish a post with a photo. It has failed three
times and never once published, because it cannot get Gianna's Slack photo into
git.

The constraint is absolute, not a tuning problem: **the routine cannot commit a
binary file at all.** GitHub MCP's `content` parameter is a text field — it
base64-encodes whatever string it is given, so handing it base64 lands a text
file of base64 characters — and `git push` is 403 from the cloud sandbox. Where
the bytes come from is irrelevant.

So photos stop travelling through git. They go to the public `blog-images`
Supabase bucket, and a post's frontmatter carries a URL. The routine only ever
writes text, which is the one thing it can reliably do.

Done looks like: Gianna uploads a photo at `/admin/blog-photos`, taps **Copy for
the canvas**, pastes the key into the Slack canvas, ticks one box — and the next
run publishes without anyone touching git.

## Approach

**1. `apps/web/lib/media/blog-images.ts`** (recreated; deleted in #160) — bucket
constant, 5 MB / JPEG-PNG-WebP rules, `validateBlogImage`, `blogImageKey`,
`blogImageUrl`, `isBlogImageKey`, `isBlogImageUrl`. Mirrors
`lib/media/provider-photos.ts` and `provider-avatars.ts`.

Key shape: `YYYY-MM-DD-<slug>-<token>.<ext>`. The random token is load-bearing —
two photos off the same phone on the same day arrive with the same filename, and
without it the second would silently replace the first, changing the image on an
already-published post.

**2. `app/(admin)/admin/blog-photos/`** — server page (list the bucket), client
manager (upload + per-photo "Copy for the canvas"), Server Action.

Upload goes through a **Server Action using `createAdminClient()`**, not
browser-direct. `blog-images` has no storage policy of any kind, so a browser
upload would need a new migration; service role needs none. 5 MB sits well
inside the 22 MB `serverActions.bodySizeLimit` already in `next.config.ts`.

Nav is written **twice** in `admin/layout.tsx` — the `ADMIN_NAV` array (mobile)
and a hardcoded `<nav>` (desktop). Both got the entry.

**3. Remote images render** — `lib/blog/posts.ts` accepts a `/blog/…` path *or*
a `blog-images` URL; new `postImageUrl()` replaces the two
`` `${SITE_URL}${post.image}` `` concatenations in `blog/[slug]/page.tsx`, which
would otherwise emit a doubled, silently broken `og:image`; `next.config.ts`
gains `images.remotePatterns` scoped to that one bucket path.

**4. The gate drops from three checks to two** — approval box + non-empty
`Image:` key. Pasting a key *is* the deliberate photo choice, so the separate
photo checkbox no longer means anything. Updated in `docs/blog/canvas.md`,
`docs/agents/prompts/weekly-blog.md`, and `docs/blog/PUBLISHING.md`.

Rule 7b in `docs/agents/README.md` is deliberately **unchanged**: it still
permits `apps/web/public/blog/**` for hand-published posts, while the routine
prompt now confines itself to `apps/web/content/blog/**` and
`docs/blog/published.md`. The prompt being stricter than the rule is the safe
direction.

## Correction, 2026-08-05 (after the first real publish attempt)

The first publish PR (#199) **failed its Preview build**, and the bug was mine.
`isBlogImageUrl` and `next.config.ts` both derived the expected bucket host from
`NEXT_PUBLIC_SUPABASE_URL`. Preview now points at a separate Supabase project
(`docs/PREVIEW_ENVIRONMENT.md`), so the same committed post validated in
production and was rejected on Preview:

```
Invalid frontmatter in content/blog/back-to-school-tutoring-cost-lincoln-park.md
  — image: Use a /blog/… path or a blog-images public URL
```

A blog post is static content; whether it is valid must not depend on which
environment happens to build it. The host is now **pinned** in
`BLOG_IMAGES_HOST`, and `next.config.ts` imports it rather than reading the env.
Reproduced both ways locally by building with the Preview URL.

The routine itself did nothing wrong — it wrote exactly the right URL.

## Open questions

- **Can the sandbox reach `supabase.co`?** Its proxy 403'd the Slack CDN. If it
  blocks Supabase too, the routine can validate a key's *shape* but not that the
  object exists, so a typo'd key would publish a broken hero image caught only on
  review. The next manual run should `curl` the public URL once and report the
  result in its run log.

## Notes

- Verified locally: `og:image`, `twitter:image`, and `BlogPosting` JSON-LD all
  carry the bucket URL exactly once, unconcatenated. `remotePatterns` accepts the
  bucket path and rejects both a foreign host and a different bucket on the same
  host (`"url" parameter is not allowed`). The legacy `meet-jackson` post still
  resolves `/blog/meet-jackson.jpg` against `SITE_URL`.
- **Untested:** the upload page itself, which needs an admin login. And the
  publish + canvas-reset half of the routine, which has never run to completion.
- The bucket holds one legacy object from the old DB-backed blog, nested under a
  UUID folder. `list("")` filters folder entries, so it does not appear in the
  grid.
