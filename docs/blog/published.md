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
| 2026-08-06 | `algae-mold-stains-concrete-patio` | Specific problem — algae/mold stains on a concrete patio, with a CDC-sourced cleaning ratio | Specific problem · niche | `drafted` |
| 2026-08-05 | `one-drill-before-fall-sports-tryouts` | How-to — one agility drill worth running before fall tryouts | How-to/method · niche | `dropped` |
| 2026-08-04 | `back-to-school-tutoring-cost-lincoln-park` | Cost — back-to-school tutoring pricing in Lincoln Park | Cost · broad | `dropped` |
| 2026-07-16 | `meet-jackson-the-walker-behind-the-leash-be90e9cf` | Student spotlight — dog walking | Spotlight · broad | `published` |

Write **Shape** as `<Type> · <broad|niche>`, using a type from the table in
`STRATEGY.md`.

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
