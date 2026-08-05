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

## Publish attempt — CI failure, not merged

Wrote `apps/web/content/blog/back-to-school-tutoring-cost-lincoln-park.md`
with `image` expanded to
`https://dwnaaffrffdgrautgigw.supabase.co/storage/v1/object/public/blog-images/2026-08-05-college-crew-logo-0554e0.png`
per `PUBLISHING.md`, and updated `published.md`'s row to `published`. Opened
[PR #199](https://github.com/the-college-crew/college-crew-website/pull/199)
— diff confined to `apps/web/content/blog/back-to-school-tutoring-cost-lincoln-park.md`
and `docs/blog/published.md`, correctly scoped for rule 7b self-merge.

Vercel's build on that commit **failed**. Diagnosed as far as I could
without Vercel log access (no CLI token, no Vercel MCP auth in this
sandbox — see PR comment for the full reasoning): `lib/blog/posts.ts`
throws and fails the whole build if a post's `image` doesn't pass
`isBlogImageUrl()`. I reproduced that function's exact logic locally — my
URL is byte-correct and validates successfully *when*
`NEXT_PUBLIC_SUPABASE_URL` is set to the project's real URL, and fails
*only* when that env var is absent. `main` (including #198 itself) still
builds clean, because #198 shipped the Storage-URL plumbing but no post
actually used it yet — this PR is the first real exercise of that path.
Best diagnosis: `NEXT_PUBLIC_SUPABASE_URL` likely isn't set for this
Vercel project's **Preview** scope. Posted the full reasoning and a request
to check as a PR comment, tagging Zach.

**Did not merge.** Left PR #199 open — the content itself needs no changes;
once the env var is confirmed/fixed, the same branch should build clean.

`published.md` on `main` is unaffected — my update to `published`
lives only on the unmerged branch, so the row there still correctly reads
`drafted`.

## Step 5 — skipped

The overwrite guard applies: the newest row for this slug in `published.md`
on `main` is still `drafted` (publish never landed), so a new draft was not
written this run. The canvas was left untouched.

## Markers

None — the draft had already cleared its one marker (hourly rate) before
this run.

## Slack message sent

Posted directly to `#weekly-blog` (`C0BMRK02RR8`) via `slack_send_message`,
mentioning both `<@U0BMH9KBZ2P>` and `<@U0BMD6360GM>`:

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

## Definition of done

Gate was open and content was ready, but publication failed at CI for
reasons outside this routine's control. Treating this like a blocked run:
items 4 (run log) and 5 (Slack message) apply. `published.md` and the
canvas are unaffected on `main`. PR #199 stays open for Zach.
