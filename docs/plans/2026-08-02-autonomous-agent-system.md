# Autonomous agent system — cloud routines, approval loop, staging database

**Status:** proposed
**Owner:** Zach
**Branch:** docs/autonomous-agent-system
**Updated:** 2026-08-02

## Goal

A reusable system where Claude agents run in Anthropic's cloud — on a schedule,
with the laptop closed — that propose improvements, plan them, and build them,
while Zach's only recurring job is approving or rejecting **ideas and plans**
from his phone. Not approving individual PRs, not babysitting sessions.

College Crew is the **first tenant, not the design target.** The role
definitions and file formats live at user level so any future project adopts
the system by creating one cloud environment and three routines.

Two things must be true for this to be worth building:

1. It produces work Zach would have wanted anyway, not busywork he now feels
   obligated to review.
2. It cannot damage production. Unattended agents with live credentials against
   a database that has no staging copy is the failure mode this plan is
   designed around.

## Background

Modeled loosely on a ~100-agent C-suite setup Zach's uncle runs (agent CEO/CFO/
CTO, each with sub-teams, each team carrying a devil's advocate and research
agents). That system costs $200/mo plus token overage.

The judgment here: the **researcher** and **devil's advocate** roles carry most
of the value and are cheap. The org-chart layer is mostly prompt scaffolding —
a way to get different framings — and is where the token cost goes, because
every hop between agents re-derives context. So: keep the valuable roles, drop
the hierarchy, express roles as **passes inside a session** rather than
separate sessions.

Deliberately deferred until the pilot produces real data: marketing, financial,
legal, and executive strategy agents. With no bookings and no acquisition-cost
data they generate confident ungrounded output, which is worse than none.
Revisit once the pilot has real numbers.

## Architecture

### State lives in git, never in a session

Every cloud routine firing is a **fresh session with zero context.** This is
the property the whole design leans on:

- Nothing accumulates, so nothing degrades. There is no context to reset.
- The real risk is the opposite — **amnesia.** Everything the system knows must
  be in committed files.
- A usage limit or a crash costs nothing. The next firing re-reads state and
  continues. This is what makes the system survive interruption by design
  rather than by retry logic.

Durable state, all committed:

| File | Holds |
|---|---|
| `docs/agents/backlog.md` | Work queue. Every item has status: `proposed` / `approved` / `rejected` / `in-progress` / `done` |
| `docs/agents/decisions.md` | What was tried, what was rejected, **and why** — stops the proposer re-suggesting rejected ideas every week |
| `docs/agents/plans/` | One implementation plan per approved idea; this is what Zach approves and edits |
| The repo + `CLAUDE.md` | Always re-read, so always current |

**Curator:** `decisions.md` grows without bound and will eventually crowd the
context window. A periodic pass collapses finished items into summaries and
archives the rest. This is the "recalibrate without forgetting" requirement.

### Five roles, three routines

Roles are passes, not separate sessions.

**Routine 1 — Proposer** (daytime, while Zach is in class)
1. *Researcher* — current best practices, framework changes, competitor scan.
   Needs outbound web access.
2. *Ideator* — candidate improvements, **hard cap of 3 per run.**
3. *Devil's advocate* — attacks each candidate. Weak ideas die here and never
   reach Zach.

Output: up to 3 surviving items appended to `backlog.md` as `proposed`.

**Routine 2 — Planner** (evening)
Turns `approved` ideas into concrete implementation plans — files touched,
approach, schema impact, test strategy — into `docs/agents/plans/`. This is the
artifact Zach reads and edits.

**Routine 3 — Worker** (overnight)
Executes approved plans. Opens one PR per plan. Updates `backlog.md` status.

**Council** (`llm-council` skill) stays a **manual tool** Zach invokes on genuinely
big decisions. Running five advisors plus peer review plus synthesis on every
backlog item would dominate the usage budget for marginal benefit.

### Why the schedule is shaped this way

Throughput is capped by **usage, not wall-clock.** Eight unattended hours do not
produce more than four if the cap binds either way. So the schedule optimizes
for **where approval sits**, not for maximizing runtime.

| When | What | Why there |
|---|---|---|
| Daytime (in class) | Proposer | Cheap, needs zero permissions, only writes proposals |
| Evening | Zach approves; Planner runs | He has more time than at breakfast |
| Overnight | Worker | Runs only on already-approved plans |
| Morning | PRs waiting | Reviewed fresh |

Overnight work must run on pre-approved plans, since nothing new can be approved
while asleep. Reasoning *generates* things needing approval, so it must finish
**before** Zach is unavailable, not during. Idea → merged PR is about one day.

### The approval loop

**Zach tried the GitHub mobile path on 2026-08-02 and rejected it.** It works,
but it takes more than one edit and requires tapping through folder trees on
mobile Safari, which is exactly the friction that kills a daily habit. The
markdown format is fine; the *access path* is the problem.

A second lesson from the same feedback: **replying in prose is strictly better
than flipping a status.** "No to CC-001, we're not touching the schema until
after the pilot" is simultaneously a rejection and its `decisions.md` entry,
written once. Status-flipping forces the reason to be typed separately, which
means it won't be.

Options, ranked:

1. **Notification out, phone app back** — the Proposer pushes a notification
   when the day's items are ready; Zach taps it and replies in prose ("approve
   CC-002, reject CC-001 because…"); a cloud session edits `backlog.md` and
   `decisions.md`. **This is the chosen path.** Zero infrastructure, available
   immediately, and no secrets — which matters, because sending real email
   needs a Resend API key and the environment variable field is plaintext.

   **Verified 2026-08-02:** cloud routines send notifications natively and they
   reached Zach's phone (two arrived during the probe runs). This removes the
   only real objection to app-based approval, and makes email a nice-to-have
   rather than a prerequisite.

   Remaining downsides, accepted: each approval spins up a cloud session, so it
   costs usage where a file edit costs nothing; it takes 30–60s rather than
   being instant; and prose is ambiguous about *what* even while it is better at
   *why*. Mitigation: always refer to items by ID (`CC-002`), never by position.
2. **Digest email with one-tap approve/reject links** hitting a signed API route
   in the app. Lowest friction of any option; loses the prose reasoning.
3. **Full email round-trip** — the model Zach's uncle uses, and the eventual
   target. Proposer emails the day's items; Zach replies in plain English; a
   Resend inbound webhook at `/api/webhooks/resend` parses the reply and updates
   the backlog. Most work, best daily experience. Resend, a verified domain, and
   the webhook route already exist.
4. **Reply to a mailbox the next routine reads** — avoids the webhook but
   requires the agent to hold mailbox credentials, which this plan deliberately
   keeps out of the environment. Rejected for now.

**All four require an agent to write to GitHub**, so they are gated on the same
MCP-write question as the Worker. *(Resolved 2026-08-02 — writes work.)*

### Chosen delivery surface: Slack

**Superseded option 1 above.** After the first Proposer run, the app-based path
proved too fragmented in practice: notification → GitHub PR → start a new cloud
session. Three surfaces for one decision. Worse, **routine-created sessions do
not appear in the Claude iOS app's Code tab** — only on web — so the notification
was the only way in, and notifications are ephemeral.

Slack collapses this to one place.

**Claude Code runs in Slack natively.** Mentioning `@Claude` in a channel with a
coding task creates a Claude Code session on the web, running under the
mentioning user's own account, plan limits, and connected repositories. It picks
the repo from conversation context. Channels only — not DMs.

**This is why Slack beats email.** The expensive part of the email design is the
reply-parsing layer: an inbound webhook, prose interpretation, translating that
into file edits, and a GitHub token living in the app. Roughly a day of work and
a new secret to manage. Slack already has that layer. Zach replies in-thread and
Claude acts on the repo — nothing to build.

**The loop:**

1. Proposer posts its proposals to an `#agents` channel (routines inherit
   account connectors, so this is configuration, not code)
2. Slack notifies Zach's phone
3. He replies in-thread: *"@Claude approve CC-003, reject CC-004 — SEO doesn't
   matter until after the pilot"*
4. Claude edits `backlog.md` and `decisions.md`, opens the PR

**Caveats:**

- ⚠ **PLAN GATING — verify before building on this.** Claude in Slack switches to
  the **Claude Tag** experience on **2026-08-03**, and Claude Tag is documented as
  available on **Team and Enterprise plans, in beta**. Zach is on an individual
  plan. Channel mentions under Claude Tag are **billed to the organization**;
  only DMs bill to individual accounts — a different model from the current
  integration, where each session runs under the mentioning user's own plan
  limits.

  **Therefore: do not set Slack up before 2026-08-03.** After the switchover,
  spend ten minutes confirming `@Claude` in a channel actually works on an
  individual plan. If it is Team-gated, the Team plan is real recurring money for
  two people — which conflicts with the explicit goal of building this at no
  additional cost.

  **Fallback if Team-gated:** email (option 3 above). More work, but Zach owns
  the entire path — Resend, the verified domain, and the
  `/api/webhooks/resend` route are already his, and nothing can be
  plan-gated out from under him later.

  Worth noting Claude Tag's capabilities are a genuine step up and align closely
  with the goal: it remembers context across days, schedules its own follow-ups,
  checks in proactively, and acts under its own identity. If it is affordable, it
  is the better answer.
- Requires a Slack workspace. Free tier is fine, but "one surface" does mean one
  *new* tool.
- iMessage was considered and rejected: Apple has no bot platform, so it would
  mean SMS via a third party — losing threading, formatting, and the ability for
  Claude to act at all.

### Shared workspace with Ari

A single College Crew workspace works, and is worth doing:

- **Sessions bill to the mentioning user.** Each `@Claude` runs under that
  person's own account and plan limits, so Ari cannot drain Zach's usage and
  vice versa. Ari needs their own Claude subscription to use it.
- **Shared visibility.** Today neither dev can see what the other's agents are
  doing. A common `#agents` channel fixes that at zero cost.
- Ari's separate RuFlo/VPS setup stays separate; Slack is just where both can
  surface what happened.
- Personal workspaces are independent — Zach can run his own alongside this one
  and switch between them in the same app.

> **Rule, carried over from `CLAUDE.md`: Slack is a notification and discussion
> surface, never the source of truth.** Decisions still get written to
> `decisions.md`; state still lives in git. Letting Slack hold state would
> recreate exactly the problem the RuFlo SQLite bridge caused — invisible to
> git, unreadable by the other agent, scoped to one tool.

Sources: [Claude Code in Slack](https://code.claude.com/docs/en/slack) ·
[What is Claude Tag?](https://support.claude.com/en/articles/15594475-what-is-claude-tag)

**On eventually removing the human:** graduate by *class of change* rather than
removing the gate. Auto-approve dependency bumps, test additions, and doc fixes
once trust is established; keep features and schema changes gated. A fully
autonomous loop optimizes for what it *thinks* is wanted and drifts quietly.

## Environments and secrets

### Per-project cloud environments

One environment per project. Scopes secrets and repo access, and makes the
system genuinely portable: a new project is one environment plus three routines
pointed at the same shared role definitions.

- `Default` (`env_01TmS3c2xYUrQe4CMkLqMS9N`) — scratch/probe only, no secrets
- `college-crew` — **to create**

### `college-crew` environment configuration

**Name:** `college-crew`

**Network access:** `Trusted`. The setup script needs npm and GitHub. If
`npm install` fails on first run, widen it.

**Environment variables.** The claude.ai UI states plainly: *"These are visible
to anyone using this environment — don't add secrets or credentials."* The field
is plaintext and shared, so placeholders are the only option, not merely the
cautious choice.

⚠ **Do not set `NODE_ENV=production`** despite the UI placeholder suggesting it.
Under npm workspaces that makes `npm install` skip devDependencies — where
`typescript` and `eslint` live — breaking typecheck, lint, and build.

```bash
# Git identity — cloud agents have none by default
GIT_AUTHOR_NAME=College Crew Agent
GIT_AUTHOR_EMAIL=agent@thecollegecrew.com
GIT_COMMITTER_NAME=College Crew Agent
GIT_COMMITTER_EMAIL=agent@thecollegecrew.com

# Supabase — PLACEHOLDERS ONLY
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key
SUPABASE_SERVICE_ROLE_KEY=placeholder-service-role-key

# Stripe — placeholders, test-mode shaped
STRIPE_SECRET_KEY=sk_test_placeholder
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_placeholder
STRIPE_WEBHOOK_SECRET=whsec_placeholder
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_placeholder

# Public, non-secret
NEXT_PUBLIC_SITE_URL=https://thecollegecrew.com
EMAIL_FROM="College Crew <no-reply@send.thecollegecrew.com>"

# Deliberately blank so nothing sends or calls out
RESEND_API_KEY=
RESEND_WEBHOOK_SECRET=
OPENAI_API_KEY=
COLLEGE_SCORECARD_API_KEY=
NEXT_PUBLIC_BRANDFETCH_CLIENT_ID=

BOOKING_CRON_SECRET=placeholder-cron-secret-at-least-32-characters-long
FOUNDER_OPERATIONS_EMAILS=

# Rollout flags off
HOURLY_BOOKING_ENABLED=false
BOOKING_REQUESTS_ENABLED=false
```

The blank values are load-bearing. `.env.example` documents that a missing
`RESEND_API_KEY` keeps email testable without delivery, and a missing
`OPENAI_API_KEY` makes the moderation model pass no-op. With those unset an
agent cannot email a real person regardless of what it decides to do at 3am.

**Setup script:**

```bash
#!/bin/bash
set -uo pipefail

git config --global user.name "College Crew Agent"
git config --global user.email "agent@thecollegecrew.com"
git config --global init.defaultBranch main
```

⚠ **The setup script does NOT run inside the repo checkout.** A first attempt
included `npm install` and failed with exit 254:

```
npm error path /home/user/package.json
npm error enoent Could not read package.json
```

The script's working directory is `/home/user` and the repository is not there
when it runs. Because the script also used `set -e`, the failure was fatal —
Claude Code never launched, and the session produced nothing at all.

Two rules follow, both learned the hard way:

1. **Never `set -e` in a setup script.** A recoverable failure becomes a dead
   session with no output.
2. **The setup script may only do repo-independent work.** Anything needing the
   checkout — `npm install` included — belongs in the routine prompt, where the
   agent runs it from inside the repo.

Cost: `npm install` runs per firing. Revisit once it is known where the repo
lands and whether `node_modules` survives between sessions.

### MCP connectors — strip by default

**Routines silently inherit every connector on the claude.ai account.** A probe
routine created 2026-08-02 came back with `Gmail` and `Google_Drive` attached
without being asked for, alongside Anthropic's own `Claude_Code_Remote`.

That means an unattended overnight agent would, by default, be able to read
Zach's email and Drive — a far larger capability than the repo access this plan
scopes so carefully, and one acquired by accident rather than decision. The
inbox holds provider and customer PII.

**Decision (Zach, 2026-08-02):**

| Routine | Connectors |
|---|---|
| Worker | **None** — pass `clear_mcp_connections: true` |
| Planner | **None** — pass `clear_mcp_connections: true` |
| Proposer | **None** — the connected Google account is Zach's personal one, not the College Crew business address, so it carries no useful signal for this project |

The Gmail/Drive connectors were connected by Zach from the Claude app for
unrelated use — nothing anomalous. The lesson is only that **inheritance is the
default** and must be cleared explicitly per routine.

A future email-management agent is a **separate project**, not part of this
system. Note when building it: reading email means acting on untrusted content,
so it needs sender allowlists and content filtering from the start — the
`resend:agent-email-inbox` skill covers those patterns.

### Secrets policy (the important part)

**Do not load `.env.local` into a cloud environment as-is.**

It contains `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS entirely, for a
project where **dev and prod are the same database.** Loading that where agents
run unattended overnight with pre-granted permissions is the highest-risk
configuration available.

Prior art: synthetic providers have reached the live Browse page **twice**,
once from an agent-written E2E test whose cleanup did not run — both times with
a human awake at the keyboard.

What the agent actually needs is weaker than it looks. Its jobs are lint,
typecheck, unit tests, and `npm run build`. Only the build needs env vars, and
mostly it needs them to *exist*, not to be valid.

| Var group | Cloud environment gets |
|---|---|
| Supabase | Placeholders shaped per `.env.example`, until staging exists — then staging creds |
| Supabase service role (prod) | **Never** |
| Stripe | Test-mode only, server and publishable keys matching modes |
| Resend | Test key or sandbox domain only |

Existing guardrail already agrees: E2E specs must use `createLocalAdminClient()`,
which refuses any non-localhost URL.

**Verification happens in Vercel, not the sandbox.** An agent-pushed branch
triggers a preview deploy with real environment variables — so the
real-credential check lands on a PR under review rather than in an unattended
container at 3am.

⚠ Consequence to watch in week one: **agent-pushed branches auto-deploy
previews**, and previews currently talk to the production database. See below.

## Staging database track

This is a prerequisite for letting agents do anything data-adjacent, and is
worth doing on its own merits.

### Promotion model

Databases don't get pushed to other databases. The unit that promotes is a
**migration file**:

```
write migration → apply to staging → verify → merge PR → apply to prod
```

`supabase/migrations/` already holds **118 migrations.** Only the staging target
is missing. **Schema promotes; data does not** — staging gets synthetic seed
data, never a copy of production, which holds real customer and provider rows.

### Prerequisite: migration drift

Remote schema has drifted from the local migration files — this is why changes
go through MCP `apply_migration` rather than `db push`. Replaying the 118 files
into a fresh project therefore yields something *close to* prod, not identical.

Reconciliation needed first: dump prod's actual schema, diff against what the
migrations produce, then either fix the files or seed staging from the dump and
keep the files honest from that point forward.

### Option chosen

**A second free Supabase project.** Free tier allows two, so this costs nothing.
Caveat: free projects pause after ~1 week idle; regular agent traffic should
prevent it, and resuming is one click.

Deferred: **Supabase branching** (ephemeral DB per git branch, auto-seeded from
migrations) is the better long-term fit but needs the Pro plan and bills per
branch-hour.

### Everything else needing the same split

**Verified 2026-08-02 via `vercel env ls` — this is measured, not assumed.**

| Var | Scope today | Verdict |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Preview, Production | ❌ shared |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Preview, Production | ❌ shared |
| `SUPABASE_SERVICE_ROLE_KEY` | Preview, Production | ❌ **shared — RLS bypass** |
| `RESEND_API_KEY` | Preview, Production | ❌ shared |
| `OPENAI_API_KEY` | Preview, Production | ⚠ shared (cost only) |
| `STRIPE_SECRET_KEY` | separate Preview + Production | ✅ split |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | separate Preview + Production | ✅ split |
| `STRIPE_WEBHOOK_SECRET` | separate Preview + Production | ✅ split |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Production only | ⚠ no Preview entry |
| `NEXT_PUBLIC_SITE_URL`, `EMAIL_FROM`, `BOOKING_CRON_SECRET`, `FOUNDER_OPERATIONS_EMAILS` | separate per env | ✅ split |

**This is a live exposure in the current workflow, independent of this plan.**
Every preview deployment — every branch, every PR, Zach's or Ari's — runs
against the **production** Supabase project using the service-role key that
bypasses RLS, and can send real email with the production Resend key. This is
the most likely mechanism behind synthetic providers reaching the live Browse
page twice.

Priority order:

1. **Supabase Preview vars → staging project.** Highest value; fixes a
   real exposure that exists today with or without agents.
2. **Resend** — give Preview its own key or a sandbox domain so a preview
   deploy cannot email a real customer.
3. **Stripe** — already correct. Model the other two on it. Optionally add a
   Preview `STRIPE_CONNECT_WEBHOOK_SECRET`.
4. **Supabase Edge Functions** — the moderation function deploys per project;
   staging needs its own copy.

Storage lives inside the Supabase project, so the split covers it.

## Sequencing

**Phase 0 — capability probe** *(in progress)*
Confirm the cloud environment can commit, push, reach the GitHub API, and reach
the open web. Everything downstream assumes push works; if it does not, the
Worker degrades to writing patch files.

**Phase 1 — de-risk production**
1. Vercel Preview env vars → staging
2. Create staging Supabase project; reconcile drift; apply 118 migrations
3. Synthetic seed data

**Phase 2 — the loop, minimal**
4. `college-crew` cloud environment with the secrets policy above
5. `docs/agents/` scaffold — `backlog.md`, `decisions.md`, `plans/`
6. Proposer + Planner + Worker routines
7. Run one full cycle; review what it actually produces

**Phase 3 — make it portable**
8. Role prompts and file formats → `~/.claude/skills/` alongside the existing 20
9. `docs/agents/` template any repo can adopt

**Phase 4 — widen** *(only once the pilot has real data)*
10. Resend + Stripe webhook split
11. Auto-approve low-risk change classes
12. Marketing / financial / legal roles

## Constraints discovered

- Cloud routines: **minimum interval 1 hour**, cron expressions in **UTC**
  (Zach is America/Chicago)
- Cloud sessions start with **zero context** — every prompt must be
  self-contained
- **No MCP connectors** are connected on claude.ai, so routines have no
  Supabase/Stripe/Vercel access. This enforces the secret-free constraint by
  default rather than by discipline
- The Supabase MCP is not currently project-scoped (`Project reference is
  missing` when listing branches) — fix before agents need it
- CLI `gh` auth authorizes the *terminal*, not Anthropic's cloud; they are
  separate connections

## Open questions

- ~~Can cloud agents push?~~ **ANSWERED 2026-08-02: no.** `git push` returns 403
  from the sandbox's local git proxy. Writes must go through the GitHub MCP
  server. See `docs/agents/decisions.md`. Phase 2 is unblocked, but the Worker
  design changes.
- **Does GitHub MCP actually permit writes?** The probe confirmed the server is
  *present* but only exercised `git push`, which failed. Whether MCP can create
  a branch, commit, and open a PR is **untested** — and it is now the single
  remaining blocker for the Worker. Next probe should test exactly this and
  nothing else.
- **Routine output is invisible outside the claude.ai UI.** The RemoteTrigger
  API exposes list/get/create/update/run and returns no session transcript, so
  neither Claude Code locally nor Codex can read what a routine did. Three
  probes required hand-relaying transcripts through Zach before this was
  understood. **Every real routine must publish its own run log** — and since
  `git push` is blocked, that publication has to go through GitHub MCP too.
  Design this in from the start.
- **What triggers a proposal?** Should the Proposer read open PRs, issues, and
  recent commits for context, or work only from the repo state? *Zach decides.*
- **Codex's role.** Currently a daytime fallback when Claude usage runs out. It
  reads the same `backlog.md`, so no extra work — confirm that stays the scope.
- **How much drift reconciliation is actually needed?** Unknown until prod's
  schema is dumped and diffed. Could be trivial or could be its own project.
- **Free-tier pause risk** on the staging project — acceptable, or worth the
  Pro plan for branching?

## Notes

- Not for Ari. Ari is running a separate OVH VPS + Docker + RuFlo setup for
  their own swarms. This plan is deliberately Claude-and-git only.
- RuFlo is off-trial until 2026-08-15 and nothing here depends on it.
- The bottleneck for College Crew right now is **provider Stripe onboarding**
  (6 providers, 22 offerings blocked on it) — a people problem no agent system
  solves. This plan buys engineering throughput, not pilot launch.
