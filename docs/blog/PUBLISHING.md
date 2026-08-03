# Publishing a blog post

Blog posts are markdown files in this repo. Publishing one is a commit — there
is no admin page and no database write, so nothing needs credentials.

Most weeks nobody does this by hand: the weekly blog routine drafts the post,
Gianna approves it in Slack, and the **next** run publishes it. That loop is at
the bottom under [The weekly loop](#the-weekly-loop). Everything above it is the
file format, which both the routine and a human follow.

## Where things live

| Path | What |
|---|---|
| `apps/web/content/blog/<slug>.md` | The post. **The filename is the URL slug.** |
| `apps/web/public/blog/<slug>.jpg` | Its image. |
| `apps/web/lib/blog/posts.ts` | Reads and validates the files. |
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
| `updatedAt` | `YYYY-MM-DD`, optional. Adds an "Updated" line and sets `dateModified`. |
| `image` | Must start with `/blog/`. The file goes in `apps/web/public/blog/`. |
| `imageAlt` | Required. Describe the photo, don't restate the title — this is both an accessibility and a ranking signal. |
| `tags` | Optional list of slugs. |
| `faq` | Optional `q`/`a` pairs. Rendered visibly **and** emitted as `FAQPage` structured data. |

### Slugs

The filename is the slug, so `fall-leaf-cleanup-pricing.md` publishes at
`/blog/fall-leaf-cleanup-pricing`. Lowercase, hyphens, no dates in the name.

**Renaming a file changes a live URL.** Don't rename a published post unless you
mean to break its links. `meet-jackson-the-walker-behind-the-leash-be90e9cf`
keeps its odd suffix for exactly this reason — it was the slug the old
database-backed blog generated, and it is live.

### Images

Downscale to **≤1600px wide and ≤300KB** before committing. These live in git;
a full-resolution phone photo every week adds up fast.

```
sips -Z 1600 photo.jpg --out apps/web/public/blog/<slug>.jpg
```

## Steps

1. Write `apps/web/content/blog/<slug>.md` and add the image.
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
                 ├─ checkbox ticked AND photo present?
                 │    ├─ yes → commit the post + photo, mark published.md,
                 │    │        then overwrite the canvas with a new draft
                 │    └─ no  → change nothing, post one line saying what's
                 │             missing. Same draft is still there next week.
                 ↓
Gianna, any time ─ edits the draft, fills in [NEEDS …] markers,
                   drops in a photo, ticks the box
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
4. Drop the photo into the canvas.
5. Tick `I, Gianna, approve this blog for production`.

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
