# Agent loop

State for the scheduled cloud agents. Design and rationale live in
`docs/plans/2026-08-02-autonomous-agent-system.md`; this directory is the
running state those agents read and write.

**Every cloud routine starts with zero context.** Nothing here is optional
bookkeeping — these files are the only memory the system has.

## The loop

```
Proposer (daytime)  → appends up to 3 items to backlog.md as `proposed`
Zach (evening)      → flips `proposed` → `approved` or `rejected`
Planner (evening)   → writes plans/<id>.md for each `approved` item
Zach                → reads and edits the plan
Worker (overnight)  → executes approved plans, opens PRs, updates status
```

Approving is changing one word. That is deliberate — it has to be doable from
a phone on GitHub's mobile editor in under a minute, or it will not happen.

## Files

| Path | What it is |
|---|---|
| `backlog.md` | The queue. One section per item. |
| `decisions.md` | Append-only. Why things were rejected or how they turned out. Read this before proposing, so dead ideas stay dead. |
| `plans/<id>.md` | One implementation plan per approved item. |
| `runs/<date>-<routine>.md` | Run log, one per firing. |

## Statuses

| Status | Meaning |
|---|---|
| `proposed` | Waiting on Zach. Agents must not act on it. |
| `approved` | Cleared to plan and build. |
| `rejected` | Dead. Record why in `decisions.md`. |
| `in-progress` | A Worker has it. |
| `blocked` | Started, cannot finish. The reason must say what would unblock it. |
| `done` | Merged. Move the entry to `decisions.md` with the outcome. |

## Rules for agents

1. **Never act on a `proposed` item.** Only `approved` work gets built.
2. **Always commit a run log** to `runs/`. Routine output is not readable
   outside the claude.ai UI — an uncommitted run is a run nobody can review.
3. **Read `decisions.md` before proposing.** Re-proposing a rejected idea is
   the most likely way this system becomes annoying.
4. **Cap the Proposer at 3 items per run.** The scarce resource is Zach's
   judgment, not ideas.
5. **Never touch production data.** The cloud environment holds placeholder
   credentials by design. If a task seems to need real ones, mark it `blocked`
   and say so — do not work around it.
6. **One PR per plan.** Branch from `main`, never commit to it directly.
7. **Proposers must land their proposals on `main`, not leave them in a PR.**
   Open the PR, then **merge it yourself**. `main` requires a pull request but
   needs **zero approving reviews**, so this works without a human.

   **Bound it strictly: self-merge only when the diff touches nothing outside
   `docs/agents/`.** If any other path appears in the diff, stop and leave the
   PR open for Zach.

   Why: proposals sitting in an unmerged PR are invisible to anything reading
   `main` — including `@Claude` in Slack, which is where approval happens. On
   2026-08-02 this cost a round trip: Claude was asked to summarize CC-003 to
   CC-005 and correctly reported they did not exist, because they were stranded
   on an unmerged branch. Everything lands as `proposed`, and nothing acts on a
   `proposed` item, so merging early is safe.
7. **If reality diverges from the plan, stop and mark it `blocked`.** Do not
   improvise. Same rule the humans follow.

## Curator

`decisions.md` grows without bound and will eventually crowd the context
window. Periodically collapse resolved entries into one-line summaries and
archive the detail. This is how the system stays current without losing what it
learned.
