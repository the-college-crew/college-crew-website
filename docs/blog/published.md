# Blog post log

**This file is the routine's only memory.** The cloud environment holds
placeholder Supabase credentials by design, so the weekly blog routine cannot
read the live site to see what it has already written. If a post is not listed
here, the routine does not know it exists.

Three rules depend on this file:

- **Dedupe** — never write a topic already listed below.
- **The overwrite guard** — if the newest row is still `drafted`, the routine
  **skips the week entirely** rather than overwriting an unpublished draft in
  the canvas. It posts one line saying so and stops.
- **Shape rotation** — the `Shape` column drives the rotation rule in
  [`STRATEGY.md`](./STRATEGY.md): at least two of any four consecutive posts are
  niche, and never the same type twice in a row. A run that forgets to record
  its shape blinds the next one, which will quietly default to another broad
  cost guide.

## Status values

| Status | Meaning |
|---|---|
| `drafted` | Written to the canvas, waiting on Gianna. Blocks next week's run. |
| `published` | Live on the site. Set by the publish flow (`PUBLISHING.md`). |
| `dropped` | Gianna decided against it. Does not block; still counts for dedupe. |

## Log

Newest first. One row per post.

| Date drafted | Slug | Topic / intent | Shape | Status |
|---|---|---|---|---|
| 2026-08-23 | `college-coaches-better-youth-tennis` | Hiring guide — why college students make better tennis coaches for kids than pros or high schoolers | Hiring guide · broad | `published` |
| 2026-08-11 | `lawn-dead-or-just-dormant` | Specific problem — telling a dormant August lawn from a dead one, with Illinois Extension's watering and mowing guidance | Specific problem · niche | `drafted` |
| 2026-08-10 | `college-student-dog-sitters-chicago` | Hiring guide — why college students work as dog sitters and what to look for | Hiring guide · broad | `published` |
| 2026-08-06 | `algae-mold-stains-concrete-patio` | Specific problem — algae/mold stains on a concrete patio, with a CDC-sourced cleaning ratio | Specific problem · niche | `dropped` |
| 2026-08-05 | `one-drill-before-fall-sports-tryouts` | How-to — one agility drill worth running before fall tryouts | How-to/method · niche | `dropped` |
| 2026-08-04 | `back-to-school-tutoring-cost-lincoln-park` | Cost — back-to-school tutoring pricing in Lincoln Park | Cost · broad | `dropped` |
| 2026-07-16 | `meet-jackson-the-walker-behind-the-leash-be90e9cf` | Student spotlight — dog walking | Spotlight · broad | `published` |

Write **Shape** as `<Type> · <broad|niche>`, using a type from the table in
`STRATEGY.md`.

<!--
The tennis-coach post was written end to end by Gianna under the rewrite-bypass
checkbox, not by the routine: both `I approve this blog for production` and
`I rewrote this myself, publish it as written` were ticked on the 2026-08-24 run,
with a valid photo key already in place, so it published the same morning. Per
the bypass rule, the routine ignored her Links, Keep these words, and citation
sections entirely (even though they matched the body this time) and added
exactly one link back to Browse instead of the two she proposed. It named a real
coach (Stephen, a DePaul senior) and real price figures; those are her claims to
make, not the routine's to verify or invent, and the bypass exists precisely so
the routine does not hold a human-authored post over them. No FAQ section was
included and none was added — STRATEGY.md requires one for routine-authored
drafts, but a missing FAQ is not one of the routine's enumerated refusal
reasons, so this shipped without one. Rotation check: the previous post
(`lawn-dead-or-just-dormant`) is niche, so a broad post is due, and this one
lands as `Hiring guide`, different from the prior routine-written type
(`Specific problem`). It covers `youth-sports-coaching`, which had no post yet.
The lawn-dormancy draft below is unaffected and still waiting on approval.
-->

<!--
The lawn dormancy draft was written by hand on 2026-08-11, not by the Monday
routine, because the 08-10 run held on the canvas mismatch and so never reached
its Step 5. Rotation check applied: the previous post was `Hiring guide`, so this
one is a different type, and three of the last four shapes are niche. It covers
`lawn-yard-care`, which had no post at all. The outbound citation is University
of Illinois Extension's "Managing Lawns During Drought", fetched directly rather
than taken from a search snippet.
-->

<!--
The dog-sitter post was written end to end by Gianna, not by the routine. She
replaced the patio draft in the canvas with her own story rather than editing it,
which is a legitimate thing to do and which the routine had no way to be told
about — it held on 2026-08-10 because the canvas Links and "Keep these words"
sections still described the post she had replaced. Zach published it by hand the
same day under the terms the rewrite-bypass checkbox now encodes: her prose
verbatim, the stale keywords and CDC citation dropped, and exactly one internal
link added so the post is not a dead end. Nothing here came from a routine draft,
so do not read its shape or voice as a precedent for what the routine produces.
-->

<!--
The patio draft never existed outside the standing canvas, and Gianna's rewrite
overwrote it. Its prose is not in git and is not recoverable from here; only the
intent survives, in `docs/agents/runs/2026-08-06-weekly-blog.md` — algae and mold
on a concrete patio, built around the CDC's mold clean-up guidance (the bleach
ratio and the ammonia warning). `dropped` rather than deleted so the routine does
not re-propose it as an untouched topic. Worth knowing: `pressure-washing` is
still the service with no coverage at all, which is why that topic was picked in
the first place. It remains a good gap to fill.
-->

<!--
The drill post was published for real on 2026-08-06 and pulled the same day, for
the same reason as the tutoring post below it: it was the end-to-end test of the
routine after the humanizer + GEO rules landed (#208, #209), and the photo key
approved for it was the College Crew logo rather than a real photograph. The
pipeline itself worked — gate, publish, canvas overwrite, run log, Slack — so
what was wrong here is the picture, not the machinery. `dropped` rather than
deleted, so the routine does not propose fall-tryout agility work again as if it
were untouched. Recover the prose with
`git show 184eb6c:apps/web/content/blog/one-drill-before-fall-sports-tryouts.md`
if it is worth republishing with a real photo — note it was written under the old
rules, so it carries em dashes, no outbound citation, and no tags.
-->

<!--
The tutoring post was published for real on 2026-08-05 and then pulled the same
day: it was the end-to-end test of the Storage-photo pipeline, and it went live
with the College Crew logo as its hero image rather than a real photo. `dropped`
rather than deleted, so the routine does not propose the topic again as if it
were untouched. The prose was good and Gianna had approved it — recover it from
git (`git show 830905b:apps/web/content/blog/back-to-school-tutoring-cost-lincoln-park.md`)
if it is worth republishing with a proper photo.
-->

<!--
The Jackson post predates this routine; it is listed so the routine does not
propose a dog-walking student spotlight as if it were an untouched topic. Its
"Spotlight" shape is legacy — it is not one of the types in STRATEGY.md, and it
counts as broad for the rotation rule.
-->
