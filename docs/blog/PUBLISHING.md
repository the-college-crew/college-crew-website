# Publishing a blog post

Blog posts are markdown files in this repo. Publishing one is a commit — there
is no database write and no CMS, so the words need no credentials.

Photos are the one exception: they live in a Supabase bucket, not in git, and
are uploaded through `/admin/blog-photos`. See [Images](#images) for why.

Most weeks nobody does this by hand: the weekly blog routine drafts the post,
Gianna approves it in Slack, and the **next** run publishes it. That loop is at
the bottom under [The weekly loop](#the-weekly-loop). Everything above it is the
file format, which both the routine and a human follow.

## Where things live

| Path | What |
|---|---|
| `apps/web/content/blog/<slug>.md` | The post. **The filename is the URL slug.** |
| `blog-images` Supabase bucket | Where photos live. Uploaded at `/admin/blog-photos`. |
| `apps/web/public/blog/<slug>.jpg` | Older photos, committed before the bucket. Still valid. |
| `apps/web/lib/blog/posts.ts` | Reads and validates the files. |
| `apps/web/lib/media/blog-images.ts` | Key shape, size/MIME rules, and the URL builder. |
| `apps/web/lib/blog/markdown.ts` | Markdown → HTML. |

## The file

```markdown
---
title: "How much should you pay for fall leaf cleanup in Lincoln Park?"
description: "What neighbors actually pay, what changes the price, and when to book."
publishedAt: "2026-08-10"
image: "/blog/fall-leaf-cleanup.jpg"
imageAlt: "A college student raking leaves into a paper yard bag on a Lincoln Park sidewalk"
tags: ["lawn-and-yard", "pricing"]
faq:
  - q: "How much does leaf cleanup usually cost?"
    a: "Most yards on the block run $60–$120 depending on lot size."
---

The body, in markdown. `##` subheads, [links](/browse), lists, and tables all
render properly.
```

### Frontmatter rules

Every field below is **required** except `updatedAt`, `tags`, and `faq`. A file
that breaks any of these fails the build with the filename and field named — it
cannot ship a half-broken `<head>` silently.

| Field | Rule |
|---|---|
| `title` | 1–160 characters. |
| `description` | 1–200 characters. This is the meta description and the excerpt on `/blog`. Aim for ~150 — Google truncates around 160. Write it deliberately; it is not generated from the body. |
| `publishedAt` | `YYYY-MM-DD`. Sets the sort order and `datePublished`. |
| `updatedAt` | `YYYY-MM-DD`, optional. Adds an "Updated" line and sets `dateModified`. Use it — refreshing a seasonal post next year beats writing a near-duplicate, and freshness is a ranking and citation signal. |
| `image` | Either a `blog-images` public URL (what the routine writes) or a legacy `/blog/…` path served from `apps/web/public/blog/`. Anything else fails the build. |
| `imageAlt` | Required. Describe the photo, don't restate the title — this is both an accessibility and a ranking signal. |
| `tags` | Optional list of slugs, but write them: they ship as `keywords` in the post's structured data. Put the relevant **service slug first**, then at most two more. They come from the canvas, not from a judgment call at publish time. |
| `faq` | `q`/`a` pairs. Optional to the build, **required by [`STRATEGY.md`](./STRATEGY.md)** — 3–5 of them, none restating a section of the body. Rendered visibly **and** emitted as `FAQPage` structured data. |

### Slugs

The filename is the slug, so `fall-leaf-cleanup-pricing.md` publishes at
`/blog/fall-leaf-cleanup-pricing`. Lowercase, hyphens, no dates in the name.

**Renaming a file changes a live URL.** Don't rename a published post unless you
mean to break its links. `meet-jackson-the-walker-behind-the-leash-be90e9cf`
keeps its odd suffix for exactly this reason — it was the slug the old
database-backed blog generated, and it is live.

### Images

Photos are **not** in git. They live in the public `blog-images` Supabase
bucket, uploaded through `/admin/blog-photos`, which hands back a key:

```
2026-08-05-tutor-table-a1b2c3.jpg
```

Expand that key against the storage base URL to get the `image` value:

```
https://dwnaaffrffdgrautgigw.supabase.co/storage/v1/object/public/blog-images/<key>
```

That base is not a secret — it is `NEXT_PUBLIC_SUPABASE_URL`, shipped in every
page's client bundle.

**Why photos left git.** The weekly routine cannot commit a binary file: GitHub
MCP's `content` parameter is text, and `git push` is blocked from its sandbox.
It can write an address, so an address is what a post carries. No downscaling
step is needed either — `next/image` optimizes on delivery, and unlike git these
files are not permanent repo weight.

Posts committed before this change still point at `/blog/…` paths in
`apps/web/public/blog/`. Those keep working; don't migrate them. If you are
hand-publishing one that way, downscale first — those bytes *are* permanent:

```
sips -Z 1600 photo.jpg --out apps/web/public/blog/<slug>.jpg
```

## Steps

1. Upload the photo at `/admin/blog-photos`, then write
   `apps/web/content/blog/<slug>.md` with its expanded URL as `image`.
2. `npm run build` — this is what catches bad frontmatter.
3. `npm run dev`, open `/blog` and `/blog/<slug>`, read it once on a phone width.
4. Commit on a branch, open a PR, merge. Vercel deploys.

## What ships automatically

Nothing below needs to be written by hand — it comes from the frontmatter:

- Canonical URL, OpenGraph `article` tags, and a Twitter summary card.
- `BlogPosting` and `BreadcrumbList` structured data, plus `FAQPage` when the
  post has `faq` entries.
- An `id` on every heading, so a search result or an AI answer engine can
  deep-link the exact section that answered the question.
- The post's entry in `/sitemap.xml`.

---

## The weekly loop

One routine runs every Monday morning and does two things in order: publishes
last week's approved draft, then writes a new one. Everything hinges on a single
standing Slack canvas in `#weekly-blog` that Gianna edits in place
([`canvas.md`](./canvas.md)).

```
Monday 8:03am ─ routine reads the canvas
                 │
                 ├─ checkbox ticked AND image key present?
                 │    ├─ no  → change nothing, post one line saying what's
                 │    │        missing. Same draft is still there next week.
                 │    └─ yes → is the body a from-scratch rewrite?
                 │         ├─ no, an edit → publish as drafted
                 │         └─ yes → rewrite box ticked?
                 │              ├─ yes → publish as written, drop the
                 │              │        keywords, links and citation
                 │              └─ no  → hold, ask her to tick it
                 │                  ↓
                 │        commit the post, mark published.md, then
                 │        overwrite the canvas with a new draft
                 ↓
Gianna, any time ─ edits the draft, fills in [NEEDS …] markers,
                   pastes a photo key, ticks the box (or both boxes,
                   if she wrote the post herself)
```

### Gianna's side

1. Read the draft in the canvas. Rewrite it so it sounds like a person — that
   pass is the point, not a formality.
2. Clear every **`[NEEDS …]`** marker. Each one is a fact the routine refused to
   invent: a real student's name, a real price. Fill it in with something true or
   delete the sentence. **A post with a marker left in it will not publish** —
   the routine refuses and tells you which one.
3. Keep the phrases under **Keep these words**. Rewrite freely around them;
   those are what the post ranks for.
4. Upload the photo at [`/admin/blog-photos`](https://www.thecollegecrew.com/admin/blog-photos),
   tap **Copy for the canvas**, and paste the key onto the `Image:` line. An
   earlier photo can be reused straight from the grid — no upload needed.
5. Tick `I approve this blog for production`.

**Wrote your own post instead?** Then step 3 doesn't apply — the keywords, the
links, and the citation all belong to the draft you replaced, and there is no
reason to work them back in. Tick the second box as well:

```
* [x] I rewrote this myself, publish it as written
```

That publishes your version as written. The routine drops the stale keywords and
citation, adds at most one link back to Browse, and writes the photo caption if
you removed that section. Without it, a from-scratch rewrite stalls: the routine
sees a canvas describing two different posts and holds rather than guess which
one you meant.

It goes live on the next Monday run. Nothing is on a clock — an unapproved draft
just waits, and the routine will not write over it.

### Why it works this way

Gianna does not run Claude Code, and a Slack `@`-mention can't drive a scheduled
routine. So the canvas *is* the interface: the checkbox is the authorization
signal, and the routine reads it on its own schedule. No credentials leave the
sandbox, and the approval is a durable artifact rather than a message someone
has to remember to send.

The routine self-merges its own publish PR under **rule 7b** in
`docs/agents/README.md` — permitted only because the diff is confined to blog
content, artwork, and `published.md`.
