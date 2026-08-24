# Weekly blog — 2026-08-24

## Gate check

Read the canvas (`F0BMQ38NM62`). It held the tennis-coach post, written
directly into the canvas by Gianna rather than as an edit of a routine draft.

1. `* [x] I approve this blog for production` — **checked**.
2. `Image:` line — **present and valid**: `2026-08-23-image-8-22-26-at-7-21-pm-9ca6a7.png`.
3. `* [x] I rewrote this myself, publish it as written` — **checked** (the
   rewrite bypass).

Gate open, bypass set. Checked the four refusal reasons that still apply under
the bypass: no `[NEEDS …]` marker in the body, slug not already `published` in
`published.md`, image key well-formed, title/description/slug all present.
None fired.

## Published

**Why College Tennis Coaches Are Better for Your Kid** →
`/blog/college-coaches-better-youth-tennis`.

Published under the rewrite-bypass terms: her Links, Keep these words, and
outbound-citation sections were ignored entirely (even though, unusually, they
actually matched the body this run), and exactly one internal link was added —
`/browse?service=youth-sports-coaching` on words already in her prose — rather
than the two she had listed. The Caption section was present, so it was used
verbatim as `imageAlt` rather than written from scratch. Tags were published as
given (four, one more than the "service plus two" guideline calls for) since
tag count isn't one of the routine's enumerated refusal reasons. No FAQ was
present and none was added, for the same reason. She named a real coach
(Stephen, a DePaul senior) and specific price figures; those are her claims to
publish, not the routine's to verify, invent, or hold up — that is the entire
point of the bypass.

The `lawn-dead-or-just-dormant` draft that had been standing since 2026-08-11
was overwritten in the canvas by this rewrite before it was ever approved.
Marked `dropped` rather than left `drafted` in `published.md`, with an HTML
comment explaining why, so the overwrite guard doesn't block every future run
over a draft that no longer exists anywhere (its prose isn't recoverable from
git, same situation as the earlier patio draft).

PR #250, self-merged under rule 7b (diff confined to
`apps/web/content/blog/college-coaches-better-youth-tennis.md` and
`docs/blog/published.md`), CI green before merge.

## New draft

Wrote this week's draft directly (the standing draft was just cleared by the
publish above, so the overwrite guard didn't block it) and overwrote the
canvas with `slack_update_canvas`, replacing the Status line, resetting both
approval checkboxes and the `Image:` line, deleting Gianna's prior draft
sections, and appending the new draft in the routine's standard section
format.

**Topic and shape:** "When a Window Air Conditioner Won't Come Out, Try This
First" — an edge case about freeing a window AC stuck in its frame at the end
of summer. Shape: `Edge case · niche`.

**Rotation check:** the last four shapes counting this one are Edge case,
Hiring guide (tennis), Specific problem (lawn, dropped), Hiring guide (dog
sitters) — two of four niche, and the type differs from the immediately prior
post (`Hiring guide`), so both rotation rules hold. `Edge case` hadn't been
used in the log yet. It covers `hauling`, which had no post at all — a real
service-coverage gap, not just a rotation-rule box to check.

**Needs from you:** none. The post is craft knowledge (freeing a stuck seal,
corroded screws, a hidden support bracket, storage) plus one outward citation;
nothing needed a placeholder.

**Outbound citation:** the U.S. Consumer Product Safety Commission's 2008
press release, "Window Falls Prompts CPSC to Issue Warning," cited for the
danger of a window air conditioner falling from a window opening. WebFetch was
blocked network-wide this run — every domain I tried (cpsc.gov, a manufacturer
manual host, an installation how-to site, even the Illinois Extension page
that worked directly two weeks ago) came back `EGRESS_BLOCKED`, not just one
site the way it's been in past weeks. The citation rests on a WebSearch
summary rather than a direct read, and I kept the sentence to what the search
results actually corroborated (that CPSC has warned about this danger) rather
than any specific number or quote from the page itself. Disclosed the same way
in the canvas's Links section.

PR #251, self-merged under rule 7b (diff confined to `docs/blog/published.md`),
CI green before merge.

## Self-check

1. **What makes this so obviously AI generated?** On the first draft, two
   things: the intro opened with three short subject-verb sentences in a row
   ("Paint bonds it... Foam sealant hardens... Screws that turned...") — a
   staccato triplet, the skill's §31 — and the weight section had a "not just
   the number on the box" tailing negation, §9. I went looking for those two
   patterns specifically, since they're on `STRATEGY.md`'s own table of
   patterns this routine has hit before. Fixed both before the draft went in
   the canvas: the triplet became one sentence with varied clause lengths
   instead of three short ones, and the negation became a direct comparative
   sentence.
2. **Em and en dashes: how many?** Zero. Scanned the title, description, FAQ
   answers, `imageAlt`, and the full body before writing it into the canvas.
3. **Does every section stand alone?** Yes. Each of the five subheaded
   sections opens with a fresh subject (a seal, corroded screws, a typical
   unit's weight, an angle bracket, a unit in storage) — none opens with a
   pronoun reaching back across its own heading.
4. **Outbound sources cited, and how certain?** One — the CPSC press release
   above. Moderate-to-high confidence in the underlying fact: it's a specific,
   named, real government safety notice, and the general claim (CPSC has
   warned about window units falling) was independently corroborated by more
   than one search result. Lower confidence in the exact page text, since
   direct verification wasn't possible this run for any site I tried — see
   the disclosure above and in the canvas.
5. **Any unsourced marketplace claim?** No. The post never touches College
   Crew's pricing, demand, or booking speed — it's AC weight ranges, a
   corroded-screw fix, CPSC's public safety position, and general appliance
   recycling knowledge, plus a single generic offer of `hauling` help at the
   close with no claim about what a booking includes.
