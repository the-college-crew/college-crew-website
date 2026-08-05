# Weekly blog — 2026-08-05

## Gate

Canvas `F0BMQ38NM62` held the `back-to-school-tutoring-cost-lincoln-park`
draft, now using the new key-based photo flow (shipped in #198 right before
this run — the fix for the image-transfer blocker from the last three
firings). Evaluated both checks individually:

1. `* [x] I approve this blog for production` — checked. ✓
2. `Image: 2026-08-05-college-crew-logo-0554e0.png` — non-empty, matches the
   required key shape `YYYY-MM-DD-<name>-<token>.jpg|png|webp`. ✓

Both checks pass. Per the current policy (`canvas.md`, "The key licenses no
opinion about what the photo shows... Refuse on a malformed key and on
nothing else"), the key was **not** evaluated against what it might depict
(the name segment reads "college-crew-logo," which could suggest a
company-logo image rather than the suggested tutor/kid photo) — that
judgment is explicitly Gianna's alone, and this routine has no way to see
the photo now regardless. The key is well-formed, which is the only image
check that applies.

Step 3 checks: no `[NEEDS ...]` marker remained (rate was filled in — see
`published.md` history), the slug was not already `published`, the key
matched the required shape, and title/meta description/slug were all
present. Nothing blocked publication going in.

## Publish attempt — CI failure, then resolved

Wrote `apps/web/content/blog/back-to-school-tutoring-cost-lincoln-park.md`
with `image` expanded to
`https://dwnaaffrffdgrautgigw.supabase.co/storage/v1/object/public/blog-images/2026-08-05-college-crew-logo-0554e0.png`
per `PUBLISHING.md`, and updated `published.md`'s row to `published`. Opened
[PR #199](https://github.com/the-college-crew/college-crew-website/pull/199)
— diff confined to `apps/web/content/blog/back-to-school-tutoring-cost-lincoln-park.md`
and `docs/blog/published.md`, correctly scoped for rule 7b self-merge.

Vercel's first build on that commit **failed**. Diagnosed as far as I could
without Vercel log access (no CLI token, no Vercel MCP auth in this
sandbox): `lib/blog/posts.ts` throws and fails the whole build if a post's
`image` doesn't pass `isBlogImageUrl()`. I reproduced that function's exact
logic locally — my URL was byte-correct and validated successfully *when*
`NEXT_PUBLIC_SUPABASE_URL` is set to the project's real URL, and failed
*only* when that env var is absent. `main` (including #198 itself) still
built clean, because #198 shipped the Storage-URL plumbing but no post
actually used it yet — this PR was the first real exercise of that path.
Posted the diagnosis as a PR comment (`isBlogImageUrl` likely missing
`NEXT_PUBLIC_SUPABASE_URL` in Vercel's **Preview** scope), tagging Zach, and
did not merge.

**Resolved mid-run.** A merge commit landed on the PR branch shortly after
("Merge branch 'main' into blog/publish-back-to-school-tutoring-cost-lincoln-park",
authored by Zach) — consistent with the env var getting fixed and the build
retriggered. The rebuild (`81758bff`) went green. Re-verified the diff was
still confined to the same two files, then merged PR #199
(`830905b767d0d047749b7b7f8ad1ea5c374bcbe7`). The post is live at
`/blog/back-to-school-tutoring-cost-lincoln-park`. `published.md`'s row now
correctly reads `published`.

Immediately updated the canvas Status section per Step 4 to record the
publish and that a new draft was coming next.

## Step 5 — new draft written

With the overwrite guard cleared (this slug's row is now `published`, not
`drafted`), continued into Step 5.

**Topic:** one agility drill (the "star drill") worth running before fall
sports tryouts.
**Shape:** How-to/method · niche.

**Why this topic and shape:** `published.md` held two posts, both broad
(`Cost · broad`, `Spotlight · broad`) — the rotation rule
(`STRATEGY.md`: "at least two of any four consecutive posts are niche" /
"never the same type twice in a row") means this week needed to be niche,
and specifically not another Cost post. Weighed the three factors within
that constraint: youth-sports-coaching had zero post coverage (all nine
services checked against `published.md`), and today (2026-08-05) is exactly
when fall-sport tryouts start coming up for families — a tight seasonal
window rather than an evergreen topic dropped in at random.

Wrote the draft as pure craft knowledge (a specific drill, how to set it up,
why it works) with no marketplace claims requiring a `[NEEDS ...]` marker —
no price, no named person, no claim about demand or booking speed. FAQ
answers avoid describing what a coaching session "includes" (per
`STRATEGY.md`'s scope-promise rule): the "what does a session cover"
question is answered as "whatever you ask for when you book," not a task
list. Closes by offering the Browse link, then stops — no disclaimer
language.

Internal links: `/about/customers` (verification) and
`/browse?service=youth-sports-coaching` — 2 links, both in the closing
paragraph.

Overwrote the canvas per `STRATEGY.md`'s full section list: Status (already
updated), Approval gate (checkbox reset to `* [ ]`, `Image:` line cleared,
photo instructions kept per `canvas.md`'s standing template), Title, Meta
description, Slug, Suggested photo, Caption, Draft, Needs from you (none
outstanding), FAQ, Internal links, Keep these words. Logged the draft in
`published.md` as `drafted` with its Shape via
[PR #203](https://github.com/the-college-crew/college-crew-website/pull/203)
(merged, `docs/blog/published.md` only).

## Markers

None this run, on either post. The tutoring post had already cleared its
one marker (hourly rate) before this run; the new draft is a craft/how-to
post with no marketplace claim requiring one.

## Slack message sent

Two messages this run — the first while PR #199 was still blocked, the
second (below) once everything resolved. Posted directly to
`#weekly-blog` (`C0BMRK02RR8`) via `slack_send_message`:

**First (mid-run, CI still failing):**

> :wave: <@U0BMH9KBZ2P> <@U0BMD6360GM> Good news: the photo-key fix from
> Monday worked — I could read the approval and the key cleanly, no more
> Slack-attachment problem. Bad news: publishing still didn't go through.
>
> The post built a real error in Vercel CI, and my best diagnosis (details
> on <https://github.com/the-college-crew/college-crew-website/pull/199|PR #199>)
> is that `NEXT_PUBLIC_SUPABASE_URL` isn't set for the Preview environment
> in Vercel — the post's photo URL fails validation exactly the way it
> would if that variable were missing, and it's the first post to ever use
> the new Storage-URL format. <@U0BMD6360GM>, can you check the Vercel
> project's env var scopes?
>
> Nothing needed from Gianna — the draft itself is fine and needs no
> rewrite. PR #199 is open, unmerged, waiting on that fix. I'll try again
> next Monday.

**Second, planned for after this log merges** (not yet sent — see next
run's note, or check the channel directly): a short follow-up confirming
the post went live, linking it, and naming the new draft waiting on
approval.

## Definition of done

Full run, resolved: PR #199 merged (post live, `published.md` updated),
canvas Status updated immediately after, Step 5 completed (new niche draft
in the canvas, both approval fields reset), `published.md` logged the new
draft with its Shape (PR #203, merged), this run log records the whole
arc. One more Slack message is owed to report the successful publish —
sending it next.
