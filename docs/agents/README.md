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
7. **Self-merge any PR whose diff touches nothing outside `docs/agents/`.**
   Open the PR, wait for checks, then **merge it yourself**. `main` requires a
   pull request but needs **zero approving reviews**, so this works without a
   human. Applies to every agent — Proposers landing proposals, approval
   sessions recording decisions, curators compacting the log.

   **The bound is strict and absolute: if even one path outside
   `docs/agents/` appears in the diff, do not merge.** Leave the PR open for
   Zach and say so. No exceptions for "it's only a small change elsewhere."

   Why: proposals sitting in an unmerged PR are invisible to anything reading
   `main` — including `@Claude` in Slack, which is where approval happens. On
   2026-08-02 this cost a round trip: Claude was asked to summarize CC-003 to
   CC-005 and correctly reported they did not exist, because they were stranded
   on an unmerged branch. Everything lands as `proposed`, and nothing acts on a
   `proposed` item, so merging early is safe.
7. **If reality diverges from the plan, stop and mark it `blocked`.** Do not
   improvise. Same rule the humans follow.

## Backpressure — the queue must not grow while Zach isn't looking

Every routine is scheduled, and every routine **no-ops quietly when there is
nothing for it to do.** Silence is a valid, correct outcome. Never invent work
to justify a run.

| Routine | Skips entirely when |
|---|---|
| Proposer | Any item is still `proposed`, **or** any plan is awaiting approval. Unhandled work means Zach has not caught up — do not add more. |
| Planner | No item is `approved` with effort above `S` and no plan yet |
| Worker | Nothing buildable (see the Worker's trigger conditions below) |

### The Worker's trigger conditions

Build an item when **either** holds:

1. Its plan at `docs/agents/plans/<ID>.md` has **Status: approved**, **or**
2. The backlog item is **`approved`** with effort **pure `S`** — these skip
   planning by design, so waiting for a plan means waiting forever.

⚠ Condition 2 is not optional. `S` items never get a plan, so a Worker that
only looks for approved plans will silently never build them. CC-003 was
approved on 2026-08-02 and would have sat untouched forever under the
plan-only rule.

Also always resume an in-progress branch before starting anything new.

The effect: if Zach ignores the system for three days, he returns to exactly the
stage he left, not to nine unread proposals. **The queue never grows past what
he has handled.** This is deliberate — the scarce resource is his judgment, not
ideas.

When a routine skips, say so plainly in one line and stop.

## Worker autonomy — no questions mid-flight

Approving a plan approves the approach. The Worker runs unattended with no human
to ask, so it must never pause for input.

1. **Never ask a question mid-task.** There is nobody there.
2. **On any divergence from the plan — a wrong assumption, a missing file, an
   unexpected dependency — stop and mark the item `blocked`**, with a line
   saying what would unblock it. Do not improvise a way around it. This is the
   same rule the humans follow.
3. **Never self-merge a PR touching application code.** Rule 7 permits
   self-merge only for diffs confined to `docs/agents/`. Every code PR waits for
   Zach.
4. **Stay inside the plan's scope.** The plan's *Out of scope* section is
   binding, not advisory. Finding something else worth fixing is a reason to
   propose it, not to build it.

## Work must survive a dead session

The Worker gets **two scheduled attempts a night**, spaced more than five hours
apart so the second lands in a fresh usage window. That only helps if a fresh
zero-context session can continue what the last one started.

So the Worker must:

1. **Commit incrementally to its branch as it goes** — never hold a night's work
   in an uncommitted working tree. A session that dies mid-task must leave its
   progress behind.
2. **Keep a running progress record in the PR description** — what is done, what
   is next, what is untested. This is what the next session reads first.
3. **Before starting anything new, look for an existing `agents/` branch with an
   open PR and resume it.** Finishing started work always beats beginning more.
4. **Commit partial work before marking anything `blocked`.** A block should
   cost the diagnosis, not the work already done.

## Every notification leads with what needs Zach

Any routine that notifies — Slack or otherwise — must **open** with open PRs
awaiting his merge, listed by number and title, before reporting its own work.

Agents cannot merge application code, so PRs accumulate silently unless
something surfaces them. A nightly build that nobody merges is a queue, not
progress.

If nothing is awaiting merge, say so in one line and move on.

## Curator

`decisions.md` grows without bound and will eventually crowd the context
window. Periodically collapse resolved entries into one-line summaries and
archive the detail. This is how the system stays current without losing what it
learned.
