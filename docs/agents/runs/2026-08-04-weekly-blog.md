# Weekly blog — 2026-08-04

## Canvas gate

First-ever run: the canvas (`F0BMQ38NM62`) still held its initial placeholder
("Waiting for the first draft") — no checkbox, no image, nothing to evaluate
against the gate. Nothing to publish. Went straight to Step 5 per the
first-run instruction.

`docs/blog/published.md` had no `drafted` row, so the overwrite guard did not
apply.

## What was published

Nothing. First run, no prior draft existed.

## New draft written

**Topic:** Cost — back-to-school tutoring pricing in Lincoln Park
**Slug:** `back-to-school-tutoring-cost-lincoln-park`

**Why this topic:** Read `docs/blog/published.md` — only the Jackson post
(pet-care, student spotlight) existed, so every other service, including
tutoring, was untouched. Weighed the three factors in `STRATEGY.md`:

- **Seasonal fit** — today is 2026-08-04; school starts back up in North
  Shore/Lincoln Park in a few weeks. Late summer is exactly when a parent
  notices their kid is rusty and starts looking for a tutor before the first
  bell, so this is a tight seasonal window, not an evergreen topic dropped in
  at a random time.
- **Search intent that converts** — cost/hiring-guide hybrid: "what does
  tutoring cost" is a converting query, and back-to-school timing sharpens it
  further ("before school starts").
- **Service coverage** — tutoring had zero posts; picked over lawn care or
  pressure washing (also seasonal in August) specifically because it had no
  coverage yet.

Wrote the draft into the canvas per the full structure in `STRATEGY.md`
(Title, Meta description, Slug, Suggested photo, Alt text, Draft, Needs from
you, FAQ, Internal links, Keep these words), left the approval checkbox
unchecked, and left the photo section untouched (no image yet).

One `[NEEDS REAL NUMBER: typical hourly tutoring rate on College Crew in
Lincoln Park / North Shore]` marker — no real pricing data available to this
routine, so left as a marker rather than inventing a number, per the honesty
rules. Listed under **Needs from you** in the canvas and flagged in the first
FAQ answer.

Internal links used: `/about/customers` (verification) and
`/browse?service=tutoring` — 2 links, both woven into the "What should you
ask before the first session?" section.

Logged the draft in `docs/blog/published.md` as `drafted`.

## PR

Branch `blog/draft-back-to-school-tutoring-cost-lincoln-park`, PR
[#164](https://github.com/the-college-crew/college-crew-website/pull/164).
Diff confined to `docs/blog/published.md` only (one line added) — self-merged
under rule 7b in `docs/agents/README.md`. (Caught and corrected an
accidental base64-encoding of the file content in the first commit before
merging — verified the raw content read back correctly afterward.) Vercel's
preview-deploy status was still `pending` at merge time; that check is
informational for a docs-only file and not a merge blocker. Merged via
squash.

## Slack message sent

Posted directly to `#weekly-blog` (`C0BMRK02RR8`) via `slack_send_message`,
mentioning `<@U0BMH9KBZ2P>`:

> :wave: <@U0BMH9KBZ2P> First run of the weekly blog canvas — nothing was
> waiting to publish yet, so I went straight to drafting.
>
> *New draft ready for your pass:* _What Does Tutoring Cost Before School
> Starts in Lincoln Park?_
> <https://college-crewworkspace.slack.com/docs/T0BML6ZJNLC/F0BMQ38NM62|Open the canvas>
>
> One thing needs a real number from you (tutoring rate) — it's flagged
> under *Needs from you* in the canvas. Edit the draft, fill that in, drop in
> a photo, and tick the approval box whenever you're ready — it publishes on
> next Monday's run.

## Notes for next run

This canvas now has a real draft in it (not the placeholder), so next
Monday's run should evaluate the gate normally: checkbox + image, or skip
and say what's missing.
