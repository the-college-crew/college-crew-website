# Blog strategy

The weekly blog routine reads this file to decide what to write and how to write
it. It starts every run with **zero context** — nothing here is background
reading, it is the whole brief.

Related: [`PUBLISHING.md`](./PUBLISHING.md) (how a post ships),
[`published.md`](./published.md) (what has already been written).

---

## Who the posts are for

**Homeowners and parents in the pilot service areas: the North Shore and
Lincoln Park.** People who have a task they'd rather not do, could pay someone
to do it, and are trying to work out what it costs and who to trust.

Not students. Not investors. Not other founders. When a topic could be angled at
either the person hiring or the student earning, **write it for the person
hiring.**

## What College Crew actually is

Facts a post may state, because they are true:

- A curated, hyperlocal marketplace connecting neighbors with **verified college
  students (18+)** for home and household services.
- Verification is real and specific: an 18+ date-of-birth gate, `.edu` email,
  manual student-ID review, and founder approval before a provider appears.
- Live in the **North Shore and Lincoln Park** during the pilot.
- Customers browse, book, and pay in the app. Providers are independent.
- Hourly work has a one-hour minimum and 15-minute increments; some
  visual-scope jobs use a single fixed quote instead.

### The nine live services

| Service | Slug (for links) |
|---|---|
| Babysitting | `babysitting` |
| Dog walking & pet sitting | `pet-care` |
| Hauling & junk removal | `hauling` |
| House Management | `house-management` |
| Lawn & yard care | `lawn-yard-care` |
| Pressure washing | `pressure-washing` |
| Tutoring | `tutoring` |
| Window washing | `window-washing` |
| Youth Sports Coaching | `youth-sports-coaching` |

Link to a service as `/browse?service=<slug>`.

---

## Choosing the week's topic

Read [`published.md`](./published.md) first. **Never repeat a topic already
listed there**, and don't write a near-duplicate of one (a "spring lawn cleanup"
post and a "spring yard prep" post are the same post).

Then pick the highest-value gap, weighing in this order:

1. **Seasonal fit.** A leaf-cleanup post in October beats an evergreen one. Check
   today's date and write what a neighbor is actually thinking about this month.
2. **Search intent that converts.** Cost and "should I hire this out" questions
   beat general interest.
3. **Service coverage.** Prefer a service with no post yet over a fourth post
   about dog walking.

### The intent types worth writing

| Type | Shape | Example |
|---|---|---|
| **Cost** | What drives the price, what to expect, what to ask | "What does it cost to get your windows washed in Lincoln Park?" |
| **Seasonal** | What needs doing this month and what's worth hiring out | "The five yard jobs worth doing before the first frost" |
| **Hiring guide** | How to pick someone, what to ask, what good looks like | "What to ask before you hand someone your spare key" |
| **Comparison** | Honest options including ones that aren't us | "Hiring a neighbor's kid vs. a service: what actually differs" |

That last one matters more than it looks. A post that names real alternatives
honestly reads as credible to both people and answer engines; one that pretends
College Crew is the only option reads as an ad and gets treated like one.

---

## The shape of a post

**~600 words. 4 to 7 paragraphs.** Long enough to actually answer the question,
short enough to still sound like a person wrote it.

1. **Open concrete.** A specific moment, season, or situation — not a definition
   and not a throat-clear. Never open with "In today's world" or "As a
   homeowner, you know that…".
2. **The middle does the work.** This is the part that ranks: the actual
   answer. What it costs and why, what changes the price, when to book, what to
   ask, what to look out for. Be specific enough to be useful to someone who
   will never hire us.
3. **Two or three `##` subheads.** Phrase them as the question a person would
   actually type. These become the `id`-anchored sections an AI answer engine
   can cite.
4. **Close short.** Two or three sentences. No hard sell, no "In conclusion", no
   "Ready to get started?".

### Required in every post

- **2–4 FAQ entries** in the frontmatter. Real questions, answered in 1–3
  sentences each — a complete answer that stands alone when quoted, because
  being quoted out of context is exactly what happens. This is the single
  highest-leverage thing in the post for AI answer engines.
- **2–3 internal links** in the body, woven into sentences. At least one to a
  relevant `/browse?service=<slug>`. Never a bare "click here".

  ⚠ **Every link must point at a page that actually exists.** A confident link
  to a page we never built is a 404 in published marketing, and it is the kind
  of error nobody notices until a customer hits it. Link only to these:

  | Path | What it is |
  |---|---|
  | `/` | Home |
  | `/browse` and `/browse?service=<slug>` | Browse, optionally filtered — slugs in the table above |
  | `/about`, `/about/customers`, `/about/students` | About pages |
  | `/blog` and `/blog/<slug>` | The blog, and any post listed in `published.md` as `published` |
  | `/faq` | FAQ |
  | `/support` | Support form |
  | `/legal`, `/privacy` | Legal |

  Nothing else. There is no `/pricing`, no `/how-it-works`, no `/services`, no
  per-service landing page. If the sentence wants one, rewrite the sentence.
  Confirm anything you are unsure of by looking for the matching
  `apps/web/app/**/page.tsx` before you link it.
- **A meta `description`** of roughly 150 characters that reads as a promise of
  what the post answers, not a summary of what it contains.
- **`imageAlt`** describing the photograph, not restating the title.

---

## Voice

Match the existing posts. Read
`apps/web/content/blog/meet-jackson-the-walker-behind-the-leash-be90e9cf.md`
before writing — it is the reference, not this description of it.

- First-person plural for us ("we", "our students"). Second person for the
  reader ("you", "your block").
- Contractions always. Short sentences. Occasional fragments. Plain words.
- Concrete over abstract: "a golden retriever on the corner", not "pet care
  needs".
- Warm, not folksy. Confident, not salesy. It should read like a neighbor who
  knows the answer, not a brand.

### Banned — these are the tells

Never use: *delve, tapestry, testament, navigate the world of, in today's
fast-paced, unlock, elevate, seamless, robust, leverage, game-changer, look no
further, whether you're a ... or a ..., it's important to note, in conclusion,
rest assured, peace of mind* (as a closing phrase), *nestled*.

Also avoid: three-item lists where two would do, a rhetorical question as an
opener, em-dash pileups, and paragraphs that all run the same length.

---

## Honesty rules — these are hard limits

Gianna publishes this under the company's name. A post that invents something is
worse than no post.

1. **Never invent a statistic, a price, or a percentage.** If the useful answer
   needs a real number, write the sentence with a marker instead:
   `[NEEDS REAL NUMBER: typical window-washing price for a 3-bed in Lincoln Park]`.
   Gianna fills it or cuts it. A plausible-sounding invented price is the single
   worst failure this routine can produce.

   ⚠ **This extends past numbers, to any claim about the marketplace you cannot
   check.** Scarcity, demand, popularity, how fast things book, what "most"
   providers charge or "tends to" happen — all of it is invented unless it is in
   this file or the codebase. The first draft this routine ever wrote passed the
   number test and then said *"Tuesday and Thursday at 4pm fill up fast once
   school is in session"* and *"test prep tends to run a little higher."*
   Nobody knows either of those things. With a handful of providers in a
   seven-week pilot, there is no booking pattern to describe.

   The tell: if a sentence asserts something about **the world or the market**
   rather than about **how College Crew works**, and you did not read it in this
   file or the code, cut it or mark it. Writing "we're new, so book early" is
   honest. Writing "slots fill up fast" is not.
2. **Never invent a named person, customer, student, or pet**, and never write a
   quote nobody said. The named-neighbor detail is what makes these posts good,
   so leave a marker where one belongs:
   `[NEEDS REAL DETAIL: a student who does this — name, school, neighborhood]`.
3. **Never claim a service, coverage area, guarantee, or feature that isn't in
   this file.** No background checks, no insurance claims, no "satisfaction
   guaranteed", no same-day promises.
4. **Never name a competitor negatively.** Comparisons describe trade-offs.

Markers are a feature, not a failure — they are how the post gets a real detail
in it instead of a fabricated one. Two or three per post is normal. Collect them
in the canvas under **Needs from you** so Gianna sees them before she reads the
body.

---

## What the routine hands over

Everything below goes in the standing Slack canvas
(ID in [`canvas.md`](./canvas.md)), which Gianna edits in place before
publishing:

1. **Status** — one line: drafted today, waiting on approval
2. **Approval gate** — **two** checkboxes, both **unchecked**, worded exactly:

   ```
   * [ ] I, Gianna, approve this blog for production
   * [ ] I inserted a photo below the line
   ```

   Next week's run matches both strings literally, so changing the wording
   breaks the gate. The photo instruction and the line it goes below come after
   them.
3. **Title**
4. **Meta description**
5. **Slug** — lowercase, hyphens, no date
6. **Suggested photo** — what the shot should show, from the team's photoshoot
7. **Caption** — one sentence describing what is in the photo. It becomes the
   image's alt text on the live page: read aloud by screen readers, read by
   search engines, and shown if the image fails to load. Describe the picture,
   don't restate the title.
8. **Needs from you** — **Gianna's to-do list, not yours.** Every `[NEEDS …]`
   marker you left, with where it appears. These are facts you refused to
   invent; she supplies them or cuts the sentence.
9. **Draft** — the body in markdown, editable in place
10. **FAQ** — the q/a pairs
11. **Internal links** — which links are in the body and where
12. **Keep these words** — see below

### "Keep these words"

Gianna rewrites the draft so it doesn't read like AI. That's the point of her
pass, and it will sometimes delete the exact phrase the post was built to rank
for. So end the canvas with the 4–8 phrases carrying the search intent, each
with one line on why it's there:

```
• "window washing in Lincoln Park" — the phrase people search; keep it in the
  title and once in the first two paragraphs
• "how much does it cost" — matches how the question gets typed; keep it as a
  subhead
```

Phrases, not a word list. She can rewrite everything around them.
