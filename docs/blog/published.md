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
| 2026-08-04 | `back-to-school-tutoring-cost-lincoln-park` | Cost — back-to-school tutoring pricing in Lincoln Park | Cost · broad | `published` |
| 2026-07-16 | `meet-jackson-the-walker-behind-the-leash-be90e9cf` | Student spotlight — dog walking | Spotlight · broad | `published` |

Write **Shape** as `<Type> · <broad|niche>`, using a type from the table in
`STRATEGY.md`.

<!--
The Jackson post predates this routine; it is listed so the routine does not
propose a dog-walking student spotlight as if it were an untouched topic. Its
"Spotlight" shape is legacy — it is not one of the types in STRATEGY.md, and it
counts as broad for the rotation rule.
-->
