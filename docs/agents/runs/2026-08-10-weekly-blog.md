# Weekly blog — 2026-08-10

## Outcome: held, flagged for human review

Read the canvas (`F0BMQ38NM62`). Mechanical gate check:

- Checkbox: ticked — `[x] I approve this blog for production`
- Image key: present — `2026-08-10-image-8-9-26-at-9-57-pm-40b022.png`, regex-valid

Both mechanical conditions pass. Did not publish anyway, because the canvas
content is internally inconsistent in a way the checklist doesn't cover:

- `published.md`'s newest row (2026-08-06, `algae-mold-stains-concrete-patio`,
  status `drafted`) says the draft waiting on approval is the algae/mold
  concrete-patio post written last run. That is not what's in the canvas.
- The canvas Title/Slug/Body/FAQ are a completely different topic: "Why
  College Students Make the Best Dog Sitters for Busy Chicago Families,"
  slug `college-student-dog-sitters-chicago`.
- The canvas's own **Links** and **Keep these words** sections still describe
  the *old* patio post — the CDC mold-cleanup citation, "algae and mold
  stains," "concrete patio," "the same corner," "pressure washing," North
  Shore/Lincoln Park framing. None of that connects to dog sitters.
- The body itself doesn't read like an edited version of anything this
  routine wrote: heavy exact-phrase repetition ("college dog sitters in
  Chicago," "verified college dog sitters" over and over), no outward
  citation, no sign of a humanizer pass, no self-contained GEO-style
  sections. It reads like generic SEO copy substituted in wholesale, not an
  edit of my draft.
- The Status section at the top is also stale — it still says the drill post
  is live at `/blog/one-drill-before-fall-sports-tryouts`, but `published.md`
  shows that post was pulled (`dropped`) days ago.

None of the checklist's enumerated refusal reasons (`[NEEDS …]` marker,
duplicate slug, malformed image key, missing title/meta/slug) technically
fire — that checklist assumes the canvas holds an edited version of the
routine's own draft, not a wholesale swap to unrelated content. Confirmed via
`get_file_contents` that the slug isn't a duplicate of an existing post
either. Publishing under self-merge rule 7b would put this live and indexed
with no further human gate, so: did not publish, did not touch the canvas
(left exactly as found), and did not write a new draft. The overwrite guard
already blocks a new draft while `published.md`'s newest row is `drafted`;
that's doubly correct here since overwriting would erase whatever produced
this canvas state before anyone can look at it.

Posted to `#weekly-blog`, tagging Gianna, asking her to confirm which draft
is actually meant to go out and naming the mismatched Links/Keep-these-words
sections as the specific tell.

## Self-check

Not applicable this run — no draft was published and no new draft was
written, so there is no routine-authored prose to check for AI tells, dash
count, section self-containment, citations, or unsourced marketplace claims.
