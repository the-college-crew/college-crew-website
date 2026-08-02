# Decisions

Append-only. Why things were rejected, and how finished work turned out.

**Agents must read this before proposing.** Re-proposing a rejected idea is the
fastest way for this system to become noise. If an idea here is proposed again,
the proposal must say what changed.

Newest first.

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
