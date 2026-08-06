# Weekly blog — 2026-08-06

## Gate

Canvas `F0BMQ38NM62` held the `one-drill-before-fall-sports-tryouts` draft.
Evaluated both checks individually:

1. `* [x] I approve this blog for production` — checked. ✓
2. `Image: 2026-08-06-image-7-27-26-at-11-20-am-removebg-previ-3dbd37.png` —
   non-empty, matches the required key shape
   `YYYY-MM-DD-<name>-<token>.jpg|png|webp`. ✓

Both checks pass. Per policy (`canvas.md`), the key was **not** evaluated
against what it might depict — the filename looks like an auto-generated
screenshot/graphic name ("image 7-27-26 at 11.20am", "removebg"), which
could suggest a non-photo asset, but that judgment belongs to Gianna alone
and the routine cannot see the photo regardless. The key is well-formed,
which is the only image check that applies.

Step 3 checks: no `[NEEDS ...]` marker in the body or FAQ, the slug was not
already `published`, the key matched the required shape, and
title/meta/slug were present. Nothing blocked publication.

## Published

Used the canvas content exactly as Gianna approved it — did **not** rewrite
it to the new, stricter rules added to `STRATEGY.md` this week (700+ words,
humanizer pass, outward citation, etc.), since this draft predates those
rules and Step 4 is explicit: publish what she approved, never a
substitute.

Wrote `apps/web/content/blog/one-drill-before-fall-sports-tryouts.md` with
`image` expanded to the Storage URL, no `tags` field (this draft predates
`STRATEGY.md`'s Tags-canvas-section requirement, so there was no
Gianna-sourced value to use, and `PUBLISHING.md` is explicit that tags come
from the canvas, not a publish-time judgment call).
[PR #210](https://github.com/the-college-crew/college-crew-website/pull/210)
— diff confined to the post file and `docs/blog/published.md`, merged
after Vercel went green. Live at `/blog/one-drill-before-fall-sports-tryouts`.
Updated the canvas Status immediately after, per Step 4.

## Step 5 — new draft written

**Topic:** algae and mold stains on a concrete patio.
**Shape:** Specific problem · niche.

**Why this topic and shape:** `published.md`'s most recent shapes are
How-to/method · niche (just published), Cost · broad (dropped), Spotlight ·
broad (published, legacy/broad). The rotation rule requires a different
*type* than the immediately preceding post (How-to/method), and at least 2
of the most recent 4 niche — with only 1 niche in the current 3-post
history, this week had to be niche again to reach that ratio once a 4th
post exists. Chose Specific problem (not How-to/method, satisfying the
no-repeat rule) over Edge case.

For topic: `pressure-washing` had zero coverage among all nine services,
and late-summer humidity is exactly when algae/mildew staining on shaded
concrete becomes visible in the Chicago area — a real seasonal window, not
an evergreen topic dropped in at random.

**Outward citation:** used `WebSearch` and attempted `WebFetch` on the
CDC's mold clean-up guidance
(`https://www.cdc.gov/mold-health/about/clean-up.html`). Direct `WebFetch`
was blocked by cdc.gov's bot protection (403) on both the CDC and EPA
pages, so the citation rests on `WebSearch`'s aggregated snippet from CDC's
own page plus independent confidence that the figure (no more than 1 cup
bleach per gallon of water; never mix bleach with ammonia) matches
long-standing, stable official mold-cleanup guidance. Named "the CDC" and
"the CDC's mold clean-up guidance" in-sentence twice in the body (the
bleach ratio, and the don't-mix-with-ammonia warning), not just linked.

**Humanizer skill (Embedded mode):** ran the draft → audit → final loop
internally on the draft before it went in the canvas; only the finished
prose landed in the canvas, no audit bullets. See self-check below for what
that pass caught.

Internal links: `hiring it out` → `/browse?service=pressure-washing`, and
`checked out before they're ever listed` → `/about/customers` — deliberately
different anchor text from the previous two posts, which both used "same
verification" (flagged in `STRATEGY.md` as a repeated-anchor problem).
Neither published post (Jackson/pet-care, the drill/youth-sports-coaching)
is topically related enough to pressure washing to force a link to it, so
no link to another post this week — `STRATEGY.md`'s rule is conditional on
relevance, not absolute.

Overwrote the canvas per the full section list in `STRATEGY.md` (Status
already updated; Approval gate reset to `* [ ]` and `Image:` cleared;
Title; Meta description; Slug; **Tags**, added as a new section — this
canvas predated the Tags requirement; Suggested photo; Caption; Draft;
Needs from you; FAQ; **Links**, renamed from "Internal links" to hold both
internal links and the outbound citation per the new structure; Keep these
words, including the source). Logged the draft in `published.md` as
`drafted` with its Shape via
[PR #211](https://github.com/the-college-crew/college-crew-website/pull/211)
(merged, `docs/blog/published.md` only).

## Markers

None. No `[NEEDS ...]` markers — every specific claim is either craft
knowledge (algae/mold/lichen biology, the 3,000 PSI range for concrete,
general safety precautions) or the CDC citation, not a claim about College
Crew's marketplace.

## The self-check (STRATEGY.md, "The self-check, before the canvas")

1. **"What makes the below so obviously AI generated?"** Two patterns I
   specifically went looking for and found, then fixed: §7 AI vocabulary
   ("actually" appeared twice — once in the lead sentence of the first
   answer section, once in a subhead — both removed) and a fabricated-sounding
   specific number (an early draft said a cleaned patio stays clear for
   exactly "three weeks"; no source backs that precise figure, so I
   softened it to "within a few weeks," matching the vaguer, honest framing
   already used earlier in the same paragraph). The closest remaining risk
   is mild §31 (manufactured-punchline framing) on a couple of
   section-closing sentences ("which is the difference between a patio
   that stays clean and one that's back to gray...") — kept because each
   one states a real, specific consequence rather than empty rhythm, not
   because I'm certain it reads as fully human.
2. **Em and en dashes: zero.** Confirmed with `grep -c "—\|–"` against the
   full draft file before it went in the canvas; the count was 0.
3. **Does every section stand alone?** Checked the opening sentence of
   each `##` section: "The fix that holds...", "Algae is the green
   layer...", "A patio that only stains in one section...", "Never combine
   the bleach solution...", "A patio that's just algae, caught early...".
   None open with a bare pronoun reaching back across the heading. The one
   borderline case is the safety section's "the bleach solution," a
   descriptive noun phrase (not a pronoun) that refers back to the earlier
   section's cleaning mixture — judged acceptable because the phrase is
   self-explanatory in context even without reading the earlier section,
   unlike "it" or "this."
4. **Outward sources cited: one.** The CDC's mold clean-up guidance, used
   twice in-sentence (see above). I'm confident in the specific figures
   cited based on independent knowledge that they match stable,
   long-standing official guidance, though I could not directly fetch the
   live page to quote it verbatim (blocked by bot protection) — noted this
   caveat in the canvas's Links section rather than overstating my
   certainty.
5. **Any sentence asserting something about our marketplace not read in
   `STRATEGY.md` or the code?** Checked the closing section's marketplace
   claims specifically: "checked out before they're ever listed" restates
   the verification facts already established in `STRATEGY.md` (18+ gate,
   `.edu` email, manual student-ID review, founder approval); "they set
   their own rates and availability" restates the independent-providers
   fact also in `STRATEGY.md`. No claim about demand, booking speed,
   pricing amounts, or scarcity appears anywhere in the draft. Nothing to
   cut.

## Slack message sent

Posted directly to `#weekly-blog` (`C0BMRK02RR8`) via `slack_send_message`,
mentioning `<@U0BMH9KBZ2P>` — see message text below, sent after this run
log merges.

## Definition of done

Gate was open: published (PR #210, merged, live), canvas Status updated
immediately after. Step 5 completed: new draft in the canvas with the
approval box unchecked and `Image:` cleared, logged in `published.md` as
`drafted` with Shape (PR #211, merged). This run log, including the
self-check, is being merged now (self-merge under rule 7 — confined to
`docs/agents/`). One Slack message to follow.
