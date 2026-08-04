# Run log — Weekly blog — 2026-08-03

**Routine:** Weekly blog (`trig_01EvgEGuhKANPq89NtWs2Kwp`)
**Fired:** 2026-08-03 19:15 CDT — manual test run, not the Monday cron
**Outcome:** First-ever run. Nothing to publish; wrote the opening draft to the canvas.

> ⚠ **Backfilled by hand.** The routine did not write this log itself — it drafted,
> posted to Slack, and stopped. See "What went wrong" below; the prompt has been
> changed so the run log now precedes the Slack post.

## Gate

No draft existed in canvas `F0BMQ38NM62`, so the gate did not apply. Went straight
to drafting.

## What was written

**Topic:** back-to-school tutoring cost, Lincoln Park.
Seasonal (first week of August), cost intent, and `tutoring` had no post yet —
the three criteria in `STRATEGY.md`, correctly applied.

- Title: *What Does Tutoring Cost Before School Starts in Lincoln Park?*
- Slug: `back-to-school-tutoring-cost-lincoln-park`
- Logged in `published.md` as `drafted` via PR #164 (self-merged, `published.md` only — correct under rule 7b)

**Markers left:** one — `[NEEDS REAL NUMBER: typical hourly tutoring rate]`,
appearing in the body and the first FAQ answer. Correct behaviour: it refused to
invent the rate.

## What went wrong

1. **No run log.** The routine did the draft, posted to Slack at 19:22:53, and
   stopped. Rule 2 requires a committed log; this run left no reviewable record
   on `main`. **Fix:** the run log is now Step 6 and the Slack post Step 7, so
   skipping the log also skips the message — making the omission visible instead
   of silent.

2. **Invented claims that the honesty rules did not cover.** The draft passed the
   no-invented-numbers test, then asserted *"Tuesday and Thursday at 4pm fill up
   fast once school is actually in session"* and *"test prep and AP-level subjects
   tend to run a little higher."* Nobody knows either. With a handful of providers
   in a seven-week pilot there is no booking pattern to describe. **Fix:** the
   honesty rules in `STRATEGY.md` now cover any unverifiable claim about the
   marketplace — scarcity, demand, popularity, what "tends to" happen — not just
   numbers. The offending paragraphs were rewritten in the canvas against real
   policy (providers set their own rates; availability windows; 12-hour minimum
   notice).

Both links it chose (`/about/customers`, `/browse?service=tutoring`) resolve —
but by luck, not rule. `STRATEGY.md` now carries an explicit allow-list of
public routes.

## Changes made after this run

- Approval gate is now **three** checks: two checkboxes (approval + photo
  inserted) and the image itself.
- Canvas section "Alt text" renamed to "Caption".
- "Needs from you" clarified as Gianna's to-do list.
- A "Definition of done" listing all five required artifacts.

Then a second pass on topic variety (2026-08-04), after the draft came out as a
by-the-numbers cost guide — which is exactly what the old brief asked for:

- **Shape rotation.** Posts now carry a type *and* a breadth (broad/niche), with
  new niche types: how-to/method, specific problem, edge case. At least two of
  any four consecutive posts must be niche, and never the same type twice in a
  row. `published.md` gained a `Shape` column so the rule has a memory.
- **Length is a range now** (450–850) instead of "~600 words, 4–7 paragraphs,
  two or three subheads". That fixed template was what made every post feel the
  same regardless of topic.
- **The honesty rule was split.** As written it banned the entire how-to genre —
  a window-washing method post is nothing but claims about the world. Craft
  knowledge anyone can check is now explicitly exempt; claims about *our*
  marketplace stay banned, prices included.
- **Niche posts must not read as a service spec.** A method post lays out steps
  a customer then expects, and a "things to do while babysitting" post reads as
  an itinerary — both promise scope nobody agreed to. The rule is to write about
  the task, never about what our students do, and never to write the disclaimer
  either, since naming the absence of a promise is its own tell.
- **The Slack message spec moved to `canvas.md`.** Not editorial — the routine
  prompt hit the `RemoteTrigger` input ceiling (truncated at 11,688 bytes), so
  content had to leave the prompt for a file the routine already reads.

## Slack

Posted directly to `#weekly-blog` at 19:22:53 CDT tagging Gianna — first draft
ready, one number needed, edit and approve when ready.
