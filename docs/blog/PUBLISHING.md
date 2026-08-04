# Publishing a blog post

Blog posts are markdown files in this repo. Publishing one is a commit — there
is no admin page and no database write, so nothing needs credentials.

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
