# Weekly blog — 2026-08-04 (second firing)

## Gate

Canvas `F0BMQ38NM62` still held the `back-to-school-tutoring-cost-lincoln-park`
draft from the prior run, now edited by Gianna (real $40/hr rate filled in,
availability/notice paragraphs rewritten against real policy, both markers
cleared). Evaluated the three checks individually:

1. `* [x] I approve this blog for production` — checked. ✓
2. `* [x] I inserted a photo below the line` — checked. ✓
3. An image present in the canvas — yes: file `F0BNM69PDLY`
   (`0826F6E4-1AA3-420C-B2A9-67AC68BDAE33_4_5005_c.jpeg`), 76.4 KB,
   `image/jpeg`. ✓

All three literal checks pass — the gate is open by the letter.

## Refused to publish anyway

Fetched the attached image with `slack_read_file` to check its size against
Step 3's 2 MB limit before publishing. It's well under the limit (76.4 KB),
but the photo itself shows a plate of food — chicken, cashews, broccoli,
rice, and peach slices. No person, no tutoring, nothing related to the post.
It doesn't match "Suggested photo" in the canvas (a tutor and a kid at a
kitchen table with a worksheet) or the post topic at all.

This isn't one of Step 3's enumerated refusal reasons — no `[NEEDS ...]`
marker remains, the slug isn't already published, the image is under 2 MB,
and title/meta description/slug are all present. But shipping an unrelated
food photo as the hero image on a live, public post is exactly the kind of
broken outcome that mechanism exists to catch, and `canvas.md`'s own
rationale for requiring both a checkbox *and* an image presence check — "the
checkbox catches...a leftover from last week, or something pasted into a
comment" — describes precisely this failure mode. A checked box can't tell
"this is deliberately the photo for this post" apart from "I pasted the
wrong thing from my camera roll" when the mismatch is this obvious. Given
the low cost of waiting one more week against the cost of publishing a plate
of food as a tutoring-cost article's featured image, held publication and
flagged it instead of shipping it.

Left the canvas **byte-for-byte unchanged** — did not call
`slack_update_canvas`. Did not touch `apps/web/content/blog/`,
`apps/web/public/blog/`, or the `published.md` row (still `drafted`). Did
not proceed to Step 5 — the existing draft doesn't need a rewrite, just the
photo swapped, and overwriting it would destroy Gianna's completed edits
(the real rate, the rewritten paragraphs) over an unrelated image problem.

## Markers

None outstanding — Gianna already filled in the hourly rate in both the body
and the FAQ; "Needs from you" in the canvas correctly says so.

## Shape / rotation

Not applicable this run — no new draft was written, so `published.md`'s
`Shape` column and the rotation rule are unchanged from the last entry
(`Cost · broad`, still `drafted`).

## Slack message sent

Posted directly to `#weekly-blog` (`C0BMRK02RR8`) via `slack_send_message`,
mentioning `<@U0BMH9KBZ2P>`:

> :wave: <@U0BMH9KBZ2P> Both approval boxes are ticked, but the photo
> attached doesn't match this post — it's a plate of food (chicken, cashews,
> broccoli, rice, and peach slices), not a tutoring scene. I didn't publish
> this week so nothing gets lost.
>
> Swap in a photo like the one described under *Suggested photo* (a tutor
> and a kid at a kitchen table with a worksheet), leave the boxes ticked,
> and it'll go out next Monday.
> <https://college-crewworkspace.slack.com/docs/T0BML6ZJNLC/F0BMQ38NM62|Open the canvas>

## Definition of done

Gate was open by the letter but publication was refused, which this
routine's Step 3 treats the same as a closed gate for scope purposes: only
items 4 (run log) and 5 (Slack message) apply. Canvas is untouched;
`published.md` is untouched.
