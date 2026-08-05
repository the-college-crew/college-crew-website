# Decisions

Append-only. Why things were rejected, and how finished work turned out.

**Agents must read this before proposing.** Re-proposing a rejected idea is the
fastest way for this system to become noise. If an idea here is proposed again,
the proposal must say what changed.

Newest first.

---

## 2026-08-05 — DONE: CC-006 (label reviews as "Verified booking" on the provider profile page)

Merged in PR #172. Added a small green `Badge` reading "Verified booking"
next to each review's star rating in `components/provider-profile.tsx`.
Every row `provider_reviews` returns is already, structurally, tied to a
completed booking (`set_review_public_dimensions` trigger + `submitReview`'s
completed-booking check + RLS) — this just states that existing guarantee in
the UI. No new query, no schema change. Built directly by Worker 1 on
2026-08-04 (pure effort `S`, no plan required). `npm run build`/`lint`/`typecheck`
all passed before opening the PR; Vercel preview deploy was green. Zach
merged it 2026-08-05.

---

## 2026-08-03 — DONE: CC-004 (give provider profile pages real metadata and Service structured data)

Merged in PR #149. Replaced the static `{ title: "Provider profile" }`
metadata (identical for every provider) with a per-provider
`generateMetadata` (name, primary service, town, canonical URL) and added a
`Service` JSON-LD block (`aggregateRating` when the provider has reviews) to
`app/(customer)/providers/[id]/page.tsx`. Built by Worker 1 on 2026-08-03 from
the plan at `docs/agents/plans/CC-004.md` (already approved — no planning
needed this run). `npm run build`/`lint`/`typecheck` all passed before opening
the PR; Vercel preview deploy was green. Zach merged it the same day.

Open judgment call from the plan, never resolved either way: whether
`"@type": "Organization"` is the right schema.org type for
`provider_type === "business"` providers (vs. `LocalBusiness` or something
else) had no existing precedent in the codebase. Shipped as `Organization`
since these providers don't have a public street address; revisit if it ever
matters for how a provider's markup renders in search results.

---

## 2026-08-03 — DONE: CC-003 (surface the cancellation window on the provider profile page)

Merged in PR #148. Added a one-line "Free cancellation up to 12 hours before
the booking starts" note to `components/provider-profile.tsx`, next to the
booking CTA, sourced from the existing `CUSTOMER_REFUND_NOTICE_HOURS`
constant (`lib/booking/policy.ts`) — the same constant already shown at final
confirm. Built directly by Worker 1 on 2026-08-03 (pure effort `S`, no plan
required per `docs/agents/README.md`). `npm run build`/`lint`/`typecheck` all
passed before opening the PR; Vercel preview deploy was green. Zach merged it
the same day.

---

## 2026-08-02 — REJECTED: CC-005 (cache Browse catalog reads with `"use cache"`)

Caching a query that isn't slow yet adds staleness risk for no gain at pilot
traffic. At 6 providers in one neighborhood, the Browse catalog reads
(`getLiveServices()` / `getServiceProviderCounts()`) were never a bottleneck,
so a `"use cache"` layer optimizes nothing measurable — while introducing a
window where an admin's service-table toggle doesn't take effect until the
revalidate interval elapses. Not worth the added staleness for zero performance
gain at this scale.

If re-proposed, it must show that these catalog reads are an actual measured
bottleneck at real traffic.

CC-003 and CC-004 from the same trial run were approved.

---

## 2026-08-02 — RESOLVED: GitHub MCP writes now work

The Claude GitHub App was **not installed on the `the-college-crew` org at all** —
the org's installed-apps page listed only Supabase and Vercel. The earlier
GitHub connection was an OAuth grant (account-scoped, read-only), which is why
reads succeeded and every write 403'd.

Zach installed the App with read **and write** access. Recheck probe
`trig_01DLpnuBkD7F3MQ1aa7p88By` then confirmed, end to end:

- `mcp__github__create_branch` — **succeeded**
- `mcp__github__create_or_update_file` — **succeeded**
- `mcp__github__create_pull_request` — **succeeded** (PR #120, since closed)

**Cloud agents can publish work to GitHub.** The Worker is unblocked, and so is
every approval path that needs an agent to edit `backlog.md`.

`git push` remains blocked (the sandbox proxy 403s regardless) — that part of
the finding below still stands. **Always use GitHub MCP tools, never git push.**

The entry below is kept for the diagnostic trail. Its conclusion is superseded.

---

## 2026-08-02 — [SUPERSEDED] GitHub MCP writes are 403'd: an App permission problem, not a wall

Probe `trig_01Jn9Uftr1csKntM7nLmjdZD` answered the remaining blocker.

The **full GitHub MCP write toolset is present** — `create_branch`,
`create_or_update_file`, `create_pull_request`, `push_files`, `delete_file`,
`merge_pull_request`, `update_pull_request`, `issue_write`,
`enable_pr_auto_merge`, and more, alongside the read tools.

All three write attempts failed identically:

```
create_branch:         POST .../git/refs      403 Resource not accessible by integration
create_or_update_file: PUT  .../contents/...  403 Resource not accessible by integration
create_pull_request:   POST .../pulls         403 Resource not accessible by integration
```

**`Resource not accessible by integration` is GitHub telling us the App
installation lacks the permission scope** — it is not Anthropic blocking the
operation. Reads work; writes are refused at GitHub's API layer. This also
explains the earlier `git push` 403: the sandbox proxy authenticates with the
same App credentials.

**Therefore this is very likely fixable** by the org owner, at
`https://github.com/organizations/the-college-crew/settings/installations`:

1. Check for a **pending permission request** banner — approving it may be the
   entire fix.
2. Confirm **repository access** includes `college-crew-website`.
3. Confirm **Contents: Read & write** and **Pull requests: Read & write**.

Caveat: an App can only hold permissions it requests. If Anthropic's App is
read-only by design there is nothing to grant — but it ships `push_files` and
`merge_pull_request`, so that seems unlikely.

**Until this is resolved:** the Proposer and Planner work fully (they run on
schedule, reason, and notify the phone — all verified). The Worker cannot
publish. Do not redesign around a thinking-only system until the App permissions
have actually been checked.

---

## 2026-08-02 — Cloud agents CANNOT `git push`; writes go through GitHub MCP

Probe `trig_01CYoGg6hwLt9GGTTgBrFeps` ran end to end and answered definitively.

`origin` in the sandbox is not GitHub. It is a local git proxy
(`http://127.0.0.1:41729/git/...`) that returns **HTTP 403 on write**, with no
credential helper configured. Two attempts, identical failure. This is a
platform restriction, not a misconfiguration — no environment setting works
around it.

`gh` is not installed either. The environment instead exposes a **GitHub MCP
server**, so branch/commit/PR creation happens through the API.

**Consequence for the Worker:** it commits locally, then publishes via GitHub
MCP tools. It must never rely on `git push`.

Notably the probe ran with `clear_mcp_connections: true` and still had GitHub
MCP available — that server comes from the platform, not from Zach's account
connectors, so stripping Gmail and Drive does not break the Worker.

Other facts from the same run:

- Repo checkout: `/home/user/college-crew-website` — one level below where the
  setup script runs. A setup script could locate it with a search.
- Git identity reported as `Claude <noreply@anthropic.com>`, **not** the
  `College Crew Agent` identity configured in the setup script and env vars.
  Either the script did not apply or the platform overrides it. Unresolved;
  cosmetic.
- `npm install` from the repo root: ~41s, 1038 packages. Cheap enough per
  firing; no caching needed.
- Outbound HTTPS works (npm registry returned 200).
- npm reported 13 vulnerabilities (12 moderate, 1 high), matching Dependabot
  alert #26.

---

## 2026-08-02 — `npm run typecheck` cannot pass on a fresh clone

The probe reported six missing image modules under `apps/web/public/` and
concluded assets were missing from the repo. **That diagnosis was wrong** — all
six are tracked and present.

The real cause: `next-env.d.ts` is gitignored (`.gitignore:63`) and generated
by `next build` / `next dev`. It carries
`/// <reference types="next/image-types/global" />`, the declaration that makes
`.jpg` imports legal in TypeScript, and it also imports `./.next/types/
routes.d.ts`, which only exists after a build.

So on any fresh checkout, `tsc` reports every image import as a missing module
until a build has run.

**How to apply:** any routine that runs `npm run typecheck` must run a build
first, or skip typecheck entirely. Without this an agent will conclude the repo
is broken and "fix" imports that were never wrong. Applies to CI too.

---

## 2026-08-02 — Agent commit identity is separate from Zach's

Cloud agents commit as `College Crew Agent <agent@thecollegecrew.com>`, not as
Zach.

**Why:** the repo will carry commits from Zach, Ari, Codex, and three scheduled
routines. `git blame` should say instantly whether a line came from a human at
2pm or a routine at 3am, because those get different levels of trust when
debugging. Cost: agent commits do not link to Zach's GitHub profile or count
toward his contribution graph. Accepted.

---

## 2026-08-02 — MCP connectors are stripped from all College Crew routines

Every routine passes `clear_mcp_connections: true`.

**Why:** routines silently inherit every connector on the claude.ai account. A
probe came back with Gmail and Google Drive attached without being asked. Those
belong to Zach's personal Google account, so they carry no signal for this
project — and a build agent has no business holding mailbox access regardless.
Verified working: a routine created with the flag returned `mcp_connections: []`.

A future personal email agent is a separate project with a separate design.

---

## 2026-08-02 — Setup scripts may not assume the repo exists

The `college-crew` environment setup script may only do repo-independent work,
and must never use `set -e`.

**Why:** the first version ran `npm install` and died with exit 254 —
`ENOENT: /home/user/package.json`. The setup script's working directory is
`/home/user` and the checkout is not there when it runs. Because the script
used `set -e`, the failure was fatal: Claude Code never launched and the
session produced no output at all. Two probes were wasted before this surfaced.

`npm install` now runs from the routine prompt, inside the checkout.

---

## 2026-08-02 — No hierarchy of agents

Roles are passes inside a single session, not separate agents calling each
other.

**Why:** modeled on a ~100-agent C-suite setup that costs $200/mo plus token
overage. The research and devil's-advocate roles carry most of the value and
are cheap; the org chart is mostly prompt scaffolding, and every hop between
agents re-derives context. Keep the roles, drop the hierarchy.

Revisit if a flat structure demonstrably fails to produce useful proposals.

---

## 2026-08-02 — Business-strategy agents deferred until the pilot has data

No marketing, financial, legal, or executive roles yet.

**Why:** with no bookings and no acquisition-cost data they generate confident,
plausible, ungrounded output — worse than nothing, because it is convincing.
Revisit once the pilot produces real numbers.

Related: the current bottleneck is provider Stripe onboarding (6 providers, 22
offerings blocked on it), which is a people problem no agent system solves.

---
## 2026-08-02 — CC-002 done by hand: Preview no longer holds the Resend key

`RESEND_API_KEY` is now scoped **Production only**. Zach unchecked Preview in
the Vercel dashboard; verified with `vercel env ls`. `OPENAI_API_KEY` was
shared the same way and was fixed in the same pass.

**Why it never reached the Worker:** this is a dashboard change, and the cloud
environment holds placeholder credentials by design. An agent cannot make it,
and would have had to mark the item `blocked` — so a human doing it directly was
always the right path, not a fallback.

**The general rule this establishes:** an item whose fix lives in a provider's
dashboard rather than in the repo is not Worker work. Propose it if it matters,
but expect to do it by hand, and close it out here rather than leaving it
`approved` where a Worker will pick it up and block on it.

Still open from the same review: the three Supabase vars
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`) remain scoped to Preview and Production, so every
preview deployment still runs against the production database with an
RLS-bypassing key. That is CC-001, rejected for this week because it needs a
second Supabase project, not a checkbox. Left deliberately, not forgotten.

`NEXT_PUBLIC_BRANDFETCH_CLIENT_ID` and `COLLEGE_SCORECARD_API_KEY` stay shared
on purpose: the first is publishable by design and already visible in page
source, the second is a free read-only api.data.gov key whose only shared
consequence is a rate limit far above current usage.

---

## 2026-08-02 — CC-001 deferred to a human, revisit before launch

Splitting Preview off the production Supabase project is **not rejected on the
merits.** The exposure is real and confirmed: `vercel env ls` shows
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` each scoped to **Preview and Production**, so every
preview deployment runs against the production database with a key that
bypasses RLS. It is the most likely mechanism behind synthetic providers
reaching the live Browse page twice.

It is marked `rejected` for one mechanical reason: a `proposed` item blocks the
Proposer from running at all, and the queue must keep moving. The status is
bookkeeping, not a verdict.

**Why a human does this, not a Worker.** It needs a second Supabase project
created by hand, and then the genuinely hard part — reconciling the drift
between the 118 files in `supabase/migrations/` and the live schema, which is
unscoped until production's schema is dumped and diffed. A Worker has
placeholder credentials by design and cannot reach either project. This is the
same category as CC-002: the fix lives outside the repo.

**Revisit trigger: before launch.** Deliberately not "before onboarding more
providers" — onboarding is already blocked on provider Stripe setup and could
unblock at any time, which would force this work at the worst possible moment.
Launch is the point where a preview deployment writing to production stops
being embarrassing and starts being a real customer's data.

**Do not re-propose before then.** The bar for raising it early: evidence of an
*actual* write reaching production from a preview deployment — a row nobody
created deliberately, not a theoretical path. That evidence changes it from
scheduled work into an incident, and it should be raised immediately if found.

Note that the nightly agent loop modestly raises the surface: each Worker PR
spins up a preview deployment pointed at production. The agents cannot touch
the database themselves, but the number of live previews aimed at it goes from
"when someone pushes" to "most nights."

---
