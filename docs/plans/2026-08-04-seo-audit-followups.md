# SEO follow-ups from the Semrush audit

**Status:** in progress — P0 and the technical half of P1 complete and verified
**Owner:** Ari
**Branch:** `fix/seo-robots-provider-prefix` (P0, merged); `fix/seo-about-students` (current)
**Updated:** 2026-08-06

Source: Semrush project `thecollegecrew.com` (id 30693153). Originally written
from snapshot `6a71fa531eae29d43b5bcc0c` (crawl 2026-08-04, 60 pages, Site
Health 88/100). **Re-verified 2026-08-06 against snapshot
`6a727bf0a8989c61443ec880`** (crawl 2026-08-05, 79 pages).

## Goal

The site is technically clean but **has zero organic visibility** — Semrush has
no ranking keywords for the domain in any database. Done looks like: every
public page crawlable, no duplicate-title/content errors, and one page type
(service landing pages) actually built to rank.

> ⚠️ **Read this doc against `origin/main`, not a feature branch.** The first
> draft was written from a branch ~40 commits behind and called three
> already-fixed things broken. Those are marked below.

---

## Verified state, 2026-08-06

| | 2026-08-04 (`6a71fa53…`) | 2026-08-05 (`6a727bf0…`) |
|---|---|---|
| Site Health | 88/100 | **96/100** |
| Errors | 138 | **0** |
| Warnings | 78 | 78 |
| Notices | 34 | 33 |
| Pages crawled | 60 | 79 |

**The technical half of this program is done.** Every duplicate-title,
duplicate-content and duplicate-meta error is gone (`errors_delta: -138`), and
those were the entire error count. What remains is not technical debt — it is
the *content and targeting* work in P1 (`/services/<slug>`), P2 and P3.

Remaining defects, by Semrush issue id:

| id | issue | count | severity |
|---|---|---|---|
| 112 | Low text-to-HTML ratio | 56 | warning |
| 117 | Low word count | 19 | warning |
| 102 | Title element too long | 3 | warning |
| 4 | Blocked from crawling | 15 | notice — **all correct**, see P0 |
| 213 | Pages with only one internal link | 14 | notice |
| 207 | Orphaned sitemap pages | 3 | notice — see P3 |
| 223 | Content not optimized (`/privacy`) | 1 | notice |

Issue **137 ("llms.txt not found") is now 0** — `apps/web/app/llms.txt/route.ts`
exists on `main`, and 219 ("llms.txt has formatting issues") is 0 too. That item
is closed; see the LLM section below.

`markups.schemaOrg` is still **0**. Per the correction further down, that means
Semrush detected no schema at all, not that schema is broken — the audit remains
silent on schema, not disapproving of it.

### What's next, ranked (2026-08-06)

1. **`/about/students`** — the highest-leverage single page left. It ships
   `title: "Our mission for students"` and nothing else: no description, no
   canonical, no targeting, and no inbound internal link. Fixing it closes a
   P2 thin-content flag, a P3 orphan notice, and the supply-side keyword gap in
   one PR. Targets `babysitting jobs chicago` (KD 10) and `dog walking jobs
   chicago` (KD 0). **In progress — `fix/seo-about-students`.**
2. **`/services/<slug>`** — the main organic play, still unbuilt. Order stands:
   hauling → house-management → pet-care → babysitting. Zach's module;
   coordinate first.
3. **P3 cheap wins** — link both `/about` sub-pages from `/about`. **Folded into
   item 1's PR**, since the orphan fix *is* the inbound-link fix. Closes 2 of
   the 3 orphan notices; the homepage one is deliberately left alone (see P3).
4. **Seed the Position Tracking campaign** — re-confirmed empty 2026-08-06
   (`campaigns` returns `targets: null`). Zero code; the 25-keyword list is
   below and must be pasted in the Semrush UI by hand.
5. **`LocalBusiness` / `Organization` JSON-LD on the homepage** — only
   `/providers/<id>` and `/blog/<slug>` carry schema today.

Everything else (56 low text-to-HTML, 19 low word count, 3 long titles,
`/privacy`) is a soft content flag that resolves as real copy lands. The
backlink profile is a quarterly re-check, next due ~2026-11.

---

## Decisions locked by Ari, 2026-08-04

1. **Ship P0 alone first**, then the rest — not one big SEO PR.
2. **`/browse?service=<slug>` becomes real `/services/<slug>` pages** (unique
   title, meta description, H1), not a cheap canonical to `/browse`.
   ⚠️ See "Keyword reality check" — the *targeting* inside this decision needs
   to change even though the decision stands.
3. **AI crawlers allowed, and named explicitly** rather than left to the `*`
   fallthrough.
4. **Blog stays as-is** — one post, kept in the sitemap, no cadence committed.

---

## P0 — blocking indexation

- [x] **`robots.txt` was blocking every public provider profile.**
  `Disallow: /provider` is a *prefix* match, so it also blocked
  `/providers/<id>`. Fixed to `/provider/` in **PR #180**, squash-merged
  `939d9f3` on 2026-08-04. Verified safe: no bare `/provider` route exists and
  there is no rewrite to one.
  The file had already documented this exact hazard for `/f/` and missed the
  same case one line below.
- [x] ~~Add provider profiles to `sitemap.ts`.~~ **Already done on `main`** —
  landed in #160 (2026-08-03), which generates `/providers/<id>` from
  `public_provider_directory` plus blog post URLs. The "sitemap is 7 static
  URLs" claim came from the stale branch.
- [x] **Re-crawl in Semrush and confirm the fix.** ✅ **Verified 2026-08-06**
  against snapshot `6a727bf0a8989c61443ec880`.

  ⚠️ **The original pass condition — `blocked` goes 8 → 3 — was wrong, and
  would have read as a failure.** `blocked` is **15**. That is not a
  regression: the crawl grew 60 → 79 pages and picked up correctly-disallowed
  URLs that the first crawl never reached. The real pass condition is the
  second sentence of the original: **no `/providers/*` URL may appear.** None
  does.

  All 15 blocked URLs, pulled via `issue_details` (issue id 4), and every one
  of them is a block we want:

  | URLs | count | correct? |
  |---|---|---|
  | `/book/<uuid>` | 6 | yes — transactional, never indexable |
  | `/login?next=/providers/<uuid>` | 6 | yes — auth wall, `next` is UI state |
  | `/login`, `/signup` | 2 | yes — always intended |
  | `/provider/onboarding` | 1 | yes — always intended |

  **Lesson for future verifications:** never write a pass condition as an
  absolute count against a crawl whose page budget can change. Assert on the
  *membership* of the set (no `/providers/*`), not its size.

## P1 — duplicate content (39–42 pages, the whole error count)

> ✅ **Causes A and B are both fixed and verified — errors are 0.** Only the
> `/services/<slug>` build remains open in this section, and it is a *growth*
> item, not an error fix.

Every error in the audit is a duplicate-title / duplicate-content /
duplicate-meta flag, from **two independent root causes** needing different
fixes.

### Cause A — missing per-page `description` (42 pages, incl. the homepage)

Most pages export `title` only, so they inherit `SITE.description` from the root
`layout.tsx`. The 42 affected URLs decompose exactly: 9 services × 3 sort
variants (27) + 3 bare `/browse` variants + 9 `/support` variants + `/faq` +
`/legal` + **`/`**.

- [x] **Add a unique `description` to each page's metadata export.**
  ✅ **Done and live.** Confirmed on `origin/main` 2026-08-06: `/`, `/faq`,
  `/legal` and `/support` each export their own `description` plus an
  `alternates.canonical`, and `/browse` derives both from `browseSeo(services,
  service)` so every per-service variant gets a unique pair. Duplicate-meta
  errors are 0.

Correction to the first draft: `/about` is **not** the only page setting its own
description — `/privacy` and `/blog` both do too, and `/blog` also carries a
self-canonical (#160). Only `/faq`, `/legal`, `/support`, `/browse` and `/` need
one.

These pages have unique *titles* already (the layout's `%s · College Crew`
template). Duplicate titles are purely a Cause B problem.

### Cause B — query-param URL variants (39 duplicate titles + 39 duplicate content)

- [x] **`/browse?sort=…`.** ✅ Done — `browseSeo()` emits a canonical pointing
  at the service-filtered URL with no `sort` param.
- [x] **`/support?from=…`.** ✅ Done — `/support` self-canonicals to
  `${SITE_URL}/support`, and the source comments the reasoning (every variant
  renders the same page).
- [ ] **Build `/services/<slug>`** per decision 2 — see targeting below.
  **This is now the single largest open item in the whole program.**
  ⚠️ Lands in `app/(customer)/…`, which is **Zach's** module per CLAUDE.md
  ownership. Coordinate before starting.

## Keyword reality check (Semrush `us` database, pulled 2026-08-04)

The first draft argued that *"student lawn care in `<neighborhood>`" is exactly
the query a local marketplace should own.* **The volume data does not support
that.**

- **Neighborhood terms barely exist.** `dog walker lincoln park` 30/mo,
  `window cleaning lincoln park` 20, `pressure washing lincoln park` 20 — all
  KD **0**. `babysitter lincoln park chicago`, `lawn care lincoln park chicago`,
  `junk removal lincoln park` and `tutor lincoln park chicago` return **no data
  at all**.
- **The "college student" framing has no demand.** `college student babysitter`
  50/mo, `hire college students` 20, `student handyman` 20,
  `college student babysitters` 0. The brand differentiator is not a query.
- **City-level is the real target:**

  | keyword | volume | KD | CPC |
  |---|---|---|---|
  | `junk removal chicago` | 2400 | 34 | $9.34 |
  | `house cleaning chicago` | 2400 | 50 | $7.57 |
  | `dog walker chicago` | 720 | 54 | $4.32 |
  | `babysitter chicago` | 390 | **20** | $2.81 |
  | `lawn care chicago` | 390 | 26 | $4.34 |
  | `window cleaning chicago` | 320 | 45 | $8.32 |
  | `pressure washing chicago` | 170 | 32 | $5.08 |
  | `tutor chicago` | 140 | 34 | $2.84 |

- **Sleeper:** `odd jobs near me` — 3600/mo at KD **23**. Fits
  house-management / hauling and is unusually winnable.
- Generic `near me` terms are enormous (`lawn mowing service near me` 135k) but
  resolve in Google's **local pack** via Google Business Profile, not a
  marketplace landing page. Do not build for them.

### Targeting for the Lincoln Park / DePaul service area

> **Superseded:** an earlier revision of this doc recommended **Evanston**
> (`dog walker evanston` 260 @ KD 13, `junk removal evanston il` 70 @ KD 9,
> etc.). Ari moved the provider area to **Lincoln Park / DePaul** on 2026-08-04,
> so that recommendation is dead. Keep the numbers only as a reference if the
> pilot ever expands back to the North Shore.

**Neighborhood terms are thin, and no rewrite changes that.** Best available:
`house cleaning lincoln park` 70 @ KD 0, `handyman lincoln park` 50 @ KD 23,
`house cleaning lakeview` 40 @ KD 7, `dog walker wicker park` 30 @ KD 0,
`dog walker logan square` 30 @ KD 2, `junk removal lakeview` 20 @ KD 0.
`babysitter lincoln park`, `dog walker lakeview` and `dog walker old town
chicago` return **no data at all**. Use neighborhood names as on-page supporting
copy, not as the thing a page is built to rank for.

**The move-out / hauling cluster is the real demand-side play.** Lincoln Park is
dense apartment turnover, and the queries reflect it — this maps onto the
existing **Hauling & junk removal** and **House Management** services:

| keyword | volume | KD | CPC |
|---|---|---|---|
| `move out cleaning near me` | 8100 | 27 | $8.15 |
| `move out cleaning chicago` | 1300 | **20** | $8.95 |
| `apartment movers chicago` | 480 | 30 | **$15.93** |
| `college movers chicago` | 390 | **14** | — |
| `furniture removal chicago` | 390 | **12** | $7.68 |
| `moving help chicago` | 390 | 26 | $10.43 |
| `mattress removal chicago` | 260 | **11** | $6.02 |
| `couch removal chicago` | 210 | 24 | $7.85 |
| `labor only movers chicago` | 70 | **7** | $9.18 |

`college movers chicago` at KD 14 is close to a literal description of the
business.

**Supply-side keywords are the cheapest wins on the whole board** — and a
marketplace needs providers as much as customers. These map to
`/about/students`, which currently targets nothing:

| keyword | volume | KD |
|---|---|---|
| `babysitting jobs chicago` | 720 | **10** |
| `depaul student jobs` | 390 | 26 |
| `side jobs for college students` | 320 | 34 |
| `dog walking jobs chicago` | 210 | **0** |

**Avoid city-level cleaning.** `apartment cleaning chicago` KD **63**,
`deep cleaning chicago` KD **49**, `condo cleaning chicago` KD 31 — the
incumbents own these and there is no cheap way in.

**Pet is mid:** `pet sitter chicago` 590 @ KD 30, `cat sitter chicago` 590 @
KD **17**, `dog boarding lincoln park` 50 @ KD 11.

**So the revised build order for `/services/<slug>`:**

1. **hauling** — target the move-out/furniture-removal cluster. Highest volume,
   lowest difficulty, highest CPC, and it fits the neighborhood's actual demand.
2. **house-management** — `move out cleaning chicago` (KD 20), *not* generic
   "cleaning chicago".
3. **pet-care** — `cat sitter chicago` (KD 17) is the way in, not `dog walker
   chicago` (KD 54).
4. **babysitting** — `babysitter chicago` 390 @ KD 20.

And one page that is not a service page at all: **give `/about/students` real
metadata and copy targeting `babysitting jobs chicago` and `dog walking jobs
chicago`.** KD 10 and KD 0 respectively, and it recruits the supply side. It is
already in the sitemap and already flagged as orphaned in P3 — fixing all three
at once is the single highest-leverage page on this list.

**Temper expectations.** Authority Score **2** with a spam-only backlink profile
means even KD 20–34 is a multi-month climb. The near-term payoff of these pages
is killing the 39 duplicate-title and 39 duplicate-content errors and becoming
citable in AI answers — not pilot-window traffic.

## P2 — thin content

- [ ] **~~15~~ 19 pages flagged low word count** (issue 117, count rose with the
  larger crawl), including `/faq`, `/blog`, the single blog post, and the
  `window-washing` / `pressure-washing` / `lawn-yard-care` / `hauling` browse
  filters. The service filters resolve themselves once `/services/<slug>` ships.
- [ ] **~~44~~ 56 pages with low text-to-HTML ratio** (issue 112). Mostly thin
  copy on a heavy React shell; improves alongside the above, not worth chasing
  directly. The set is broader than browse/support — it includes **`/`**,
  **`/about`**, `/faq`, `/blog` and the blog post.
- [ ] **`/privacy` is the one page flagged "content not optimized."** Low
  priority; it is the only page carrying that flag.
- [x] **Blog cadence** — decided: keep the single post, keep it in the sitemap,
  commission nothing. Revisit separately.

## P3 — housekeeping

- [x] **2 of the 3 orphaned sitemap pages** — confirmed still exactly 3 on
  2026-08-06 via `issue_details` (issue 207). `/about/customers` and
  `/about/students` genuinely had no internal links pointing at them; both are
  now linked from the "Two places. One reputation." section of `/about`, with
  descriptive anchor text rather than "Learn more". Shipped on
  `fix/seo-about-students`.
- [ ] ~~**Homepage orphan flag** — normalize the sitemap trailing slash.~~
  **Attempted and deliberately reverted.** The doc guessed the cause was the
  sitemap emitting `SITE_URL` bare while internal links resolve to `/`. Adding
  the slash to the sitemap does not fix it, because **Next normalizes
  `alternates.canonical` back to the bare origin when `trailingSlash` is
  false** (verified by rendering the page: the sitemap emitted
  `https://www.thecollegecrew.com/` while the canonical still served
  `https://www.thecollegecrew.com`). The change therefore traded a cosmetic
  notice for a real sitemap/canonical disagreement. The homepage is linked from
  every header on the site and is not orphaned in any sense that matters.
  **Do not retry this without first verifying the actual cause.**
- [ ] **~~8~~ 14 pages reachable by only one internal link** (issue 213).
  ⚠️ **The prediction that "this is resolved by the `/support` canonical" was
  wrong.** The canonical shipped and the count went 8 → 14. A canonical tells a
  search engine which URL to *index*; it does not remove the URL from the site
  or create internal links, so the crawler still finds and counts each variant.
  Verified 2026-08-06 — the 14 are 13 `/support?from=…` URLs plus the blog post,
  the same shape as before, just more of them now that more pages link to
  support.

  If this is ever worth closing, the fix is **to stop emitting the `from` param
  in support links** (carry it in state, or drop it), not to add more canonical
  tags. Low priority: these are correctly canonicalized, so the SEO harm is
  already neutralized and the notice is cosmetic.
- [ ] **`/privacy` — "Low readability."** Two caveats before acting. The
  structural half is **already done** (`<h2>` `PolicySection` headings,
  `<dl>`-based `Disclosure` cards), so the flag is about sentence length and
  vocabulary. And this is a **legal document** — "replace complex words with
  simpler alternatives" is exactly where precision lives. Plain language is a
  genuine best practice (GDPR Art. 12 asks for it), so it is not purely a
  tradeoff, but any rewrite needs Ari's sign-off and must not ride in an SEO PR.
  Priority note: nobody searches for a privacy policy. SEO value ~zero; do it
  for user trust or not at all.
- [ ] **Position Tracking campaign is configured with no keywords.** Confirmed
  empty via MCP (`campaigns` returns `targets: null`). ⚠️ **The Semrush MCP is
  read-only for Position Tracking** — every exposed report is a `tracking_*`
  read, so the keywords must be pasted in the Semrush UI by hand. The seed list
  is below.

  **Campaign settings:** domain `thecollegecrew.com`; location **Chicago,
  Illinois** (Semrush location id `1016367`). Device: mobile (local-service
  queries skew mobile); add desktop if the plan allows both. If the plan caps
  keyword count, drop tiers 4 and 5 first.

  ```
  move out cleaning chicago
  furniture removal chicago
  college movers chicago
  mattress removal chicago
  couch removal chicago
  moving help chicago
  apartment movers chicago
  labor only movers chicago
  junk removal chicago
  move out cleaning near me
  babysitting jobs chicago
  dog walking jobs chicago
  depaul student jobs
  side jobs for college students
  babysitter chicago
  cat sitter chicago
  pet sitter chicago
  tutor chicago
  handyman lincoln park
  house cleaning lincoln park
  dog boarding lincoln park
  dog walker lincoln park
  odd jobs near me
  college crew
  the college crew
  ```

  Tiers: **1–10 move-out/hauling** (the demand-side play, KD 7–30);
  **11–14 supply side** (recruiting DePaul students — `dog walking jobs chicago`
  is KD 0, `babysitting jobs chicago` KD 10); **15–18 other services**;
  **19–22 Lincoln Park** (thin volume, tracked as the pilot-area baseline);
  **23 generic**; **24–25 brand** (0 volume today — track so brand demand
  becoming real is visible).

  Expect most of these to read "not ranking" for months. That is the point of a
  baseline.

## LLM / AI-answer visibility

- [x] **The P0 robots fix was also the top LLM item.** `Disallow: /provider`
  prefix-blocked `/providers/<id>`, shutting GPTBot, ClaudeBot, PerplexityBot
  and Google-Extended out of the only pages carrying rich `Service` schema.
  Shipped in #180.
- [x] **AI-crawler policy is now deliberate.** #180 adds a named group
  (`GPTBot`, `OAI-SearchBot`, `ChatGPT-User`, `ClaudeBot`, `Claude-User`,
  `Claude-SearchBot`, `PerplexityBot`, `Perplexity-User`, `Google-Extended`,
  `Applebot-Extended`) explicitly allowed, with the student-names/photos
  tradeoff and the reversal instruction written into the file.
  ⚠️ **A crawler obeys only its most specific matching group and ignores `*`
  entirely**, so that group repeats the full disallow list. Never add a named
  user-agent group without it.
- [x] **Add `llms.txt`.** ✅ Done — `apps/web/app/llms.txt/route.ts` is on
  `main` and serves the pilot service area from `PILOT_SERVICE_AREA`. Semrush
  issues 137 ("not found") and 219 ("formatting issues") are both 0. Keep
  expectations low, as originally written: a proposed convention (llmstxt.org),
  not a standard, and major AI crawlers don't demonstrably consume it yet.
- [ ] **Consider `LocalBusiness` / `Organization` schema on the homepage.** Ties
  the marketplace to a service area; higher expected value than `llms.txt`.

### Correction: "structured data is already a strength" was a misread

The first draft cited *"the audit found 0 structured-data markup errors."*
Semrush actually reports `markups.schemaOrg: **0**` — zero pages where it
detected schema **at all**, against `openGraph: 46` and `twitterCard: 46` of 60
pages. Issue 45 ("structured data that contains markup errors") never fired
because nothing was evaluated. Treat the audit as **silent** on schema, not
approving of it.

The underlying claim does survive, but only on direct evidence — production
HTML curled 2026-08-04:

- `/providers/<id>` serves `Service` + `Person` + `Offer`.
- `/blog/<slug>` serves `BlogPosting` + `BreadcrumbList` (+ `FAQPage` when the
  post has one).

## P4 — spam backlinks (monitor, don't act yet)

The backlink profile is **entirely spam**: 220 backlinks / 116 referring
domains, Authority Score **2**, essentially every anchor SEO-vendor spam
(`"premium seo authority links to rank higher…"`). Referring domains are link
farms clustered on a handful of Singapore IPs — a classic auto-generated
network. Unsolicited; nobody bought these.

- [ ] **Don't disavow yet.** Google ignores this class of link by default and
  there is nothing to protect — the domain has no rankings to lose. Disavowing
  116 domains is busywork today.
- [ ] **Do track it.** Volume is climbing (13 domains in 2024-10 → 116 now,
  ~+5–10/month and accelerating). Re-check quarterly; if real rankings appear
  and then drop, revisit with a disavow file.

---

## Notes

- **Traffic Analytics is not on the current Semrush plan** — no visits, bounce
  rate, or channel data.
- ~~The site-wide `noindex` guardrail in `CLAUDE.md` is stale.~~ **Already
  rewritten on `main`** — it now reads "Production indexing is enabled…  Keep
  `app/robots.ts` and `app/sitemap.ts` aligned with public routes."
- ~~`robots.ts` exists on `origin/main` but not on the current branch.~~
  Resolved — P0 was built in a worktree off `origin/main` and merged.
- **Vercel previews are SSO-protected**, so `curl`ing a preview URL for
  `robots.txt` returns a 302 to a login page. To verify metadata routes without
  deploying, run the module through Next's own serializer:
  `resolveRouteData(robots(), "robots")` from
  `next/dist/build/webpack/loaders/metadata/resolve-route-data.js`.
- **`gh` needs an account switch on this repo.** The active `gh` account is
  `aschwa1012`, which is not a collaborator on the org — `gh pr create` fails
  with `must be a collaborator` even though `git push` succeeds over SSH. Run
  `gh auth switch --user Ari-TheCollegeCrew` before any `gh` write.
