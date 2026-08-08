# Agent loop

> ⏸ **PAUSED since 2026-08-08.** The Proposer, Planner, and both Workers are
> disabled to save usage. Everything below still describes how they work and is
> still binding when they run — but they are not running. See
> **`PAUSED.md`** for the state and the one-line call that turns each back on.
> The weekly blog routine is unaffected and still runs Mondays.

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
                      ↳ writes any plan the Planner missed, first, then notifies
```

Approving is changing one word. That is deliberate — it has to be doable from
a phone on GitHub's mobile editor in under a minute, or it will not happen.

**Every plan and every skip gets a Slack post.** Approval is the one thing the
system cannot do for itself, so anything waiting on Zach has to reach his phone
— and silence has to mean a routine died, never that it ran fine and had nothing
to say.

## Files

| Path | What it is |
|---|---|
| `backlog.md` | The queue. One section per item. |
| `decisions.md` | Append-only. Why things were rejected or how they turned out. Read this before proposing, so dead ideas stay dead. |
| `plans/<id>.md` | One implementation plan per approved item. |
| `runs/<date>-<routine>.md` | Run log, one per firing. |
| `PAUSED.md` | Present only while the loop is paused. Which routines are off, and how to restore them. |

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
   For routines in the notify pilot the run log also *carries* the Slack
   message — see "How a notification reaches Slack".
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

   ### 7b. Blog content is the one other self-mergeable diff

   A diff confined to **`apps/web/content/blog/**`, `apps/web/public/blog/**`,
   and `docs/blog/published.md`** is also self-mergeable. That is published blog
   content and its artwork — prose and a photograph. It cannot change how the
   application behaves.

   The human gate is already there and it is earlier: Gianna reads the draft,
   edits it, and ticks an approval checkbox in the Slack canvas before anything
   is committed. Requiring Zach to also merge would mean a post she approved on
   Tuesday sits until he happens to look, which defeats the point of her
   approving it at all.

   **The same absolute bound applies.** One path outside those three and the PR
   waits for Zach — including anything under `apps/web/app/`, `apps/web/lib/`,
   `supabase/`, or a change to the blog *code* as opposed to blog *content*.
   A PR that adds a post and touches the renderer is a code PR.
8. **If reality diverges from the plan, stop and mark it `blocked`.** Do not
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

### Run order

Do these in order:

1. **Write any missing plan, and notify.** If an item is `approved` with effort
   above `S` and has no plan at `plans/<ID>.md`, write the plan, open the PR,
   self-merge it under rule 7, and post it to Slack. **Do this before building
   anything.**
2. **Resume anything `in-progress`.** Finishing started work beats beginning
   more. Note that an open PR is *not* the test — see "Work must survive a dead
   session" below: the signal is whether the item's status is `in-progress`,
   since completed work sits in an open PR for as long as it takes Zach to merge
   it.
3. **Build the queue** until nothing qualifies.

Step 1 is the fallback for a Planner that never ran, and it is deliberately
first. A plan written at 11:15 PM can still be approved and built the same night;
the same plan written at 2 AM lands while Zach is asleep, and if the session dies
before step 3 finishes it never gets written at all — losing the day precisely
when the fallback was meant to save it. A plan is a small fraction of a session,
so front-loading it costs step 3 almost nothing.

⚠ **Never build from a plan you wrote yourself in the same run.** A plan is
buildable only at **Status: approved**, and only Zach sets that. His approval
sitting between writing and building is the entire purpose of plans — a Worker
that plans and then builds its own plan has removed the review point. If he
happens to approve while you are still running, the queue re-check in step 3
picks it up naturally. **Never wait for that**, and never ask.

**Keep going until nothing is buildable.** A run is not one item — after
finishing an item, check the queue again and start the next. Stop only when
nothing qualifies or the session is cut off. Each item gets its own branch and
its own PR.

**But finish each item completely before starting the next.** Never work two in
parallel. A session cut off mid-flight then leaves at most *one* item partially
done, with everything before it a clean, reviewable PR.

The effect: if Zach ignores the system for three days, he returns to exactly the
stage he left, not to nine unread proposals. **The queue never grows past what
he has handled.** This is deliberate — the scarce resource is his judgment, not
ideas.

### A skip is still a notification

When a routine skips, **post one line to Slack saying so, then stop.** Naming
the reason is what makes it useful: *"Planner: nothing to plan — CC-004's plan is
approved, everything else is `S` or rejected."*

⚠ **Silence must mean failure, not success.** A routine that dies before Claude
Code launches — an exhausted usage window, a bad checkout — produces no Slack
post, no PR, and no run log. If a correct skip were also silent, the two would be
indistinguishable from a phone, and a routine could be dead for a week without
anyone noticing. Posting on skip is what makes the absence of a message
diagnostic.

A run log in `runs/` is still required (rule 2). For a routine still on the
claude.ai connector the Slack line is in addition to it; for one in the notify
pilot the line lives *inside* it, in the `## Slack` block. Either way, skipping
without notifying is not an option.

### When the Planner doesn't run

The Planner fires once a day and there is **no retry** — the platform exposes no
backoff, so a firing lost to an exhausted usage window is simply gone until the
next evening. Nothing corrupts: the Planner is a pure function of backlog state,
so the next run does the same work.

The cost is one day of latency on items above `S`, and the Worker's step 1 (see
"Run order") exists to recover it the same night.

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

There is **no way to see how much usage budget remains.** No tool reports "you
are at 87% of your window" — the platform simply stops the session, possibly
without a chance to shut down cleanly. So do not try to pace against a budget.
**Make the cutoff harmless instead:**

1. **Commit after every meaningful step**, not at the end of an item — never
   hold a night's work in an uncommitted working tree. Whether the session dies
   at 40% or 95%, everything up to that moment is already on the branch.
2. **Keep a running progress record in the PR description** — what is done, what
   is next, what is untested. This is what the next session reads first.
3. **Before *building* anything new, look for genuinely unfinished work and
   resume it.** Finishing started work always beats beginning more. The one
   thing that precedes it is writing a missing plan — step 1 of "Run order",
   which is cheap, time-sensitive, and never leads to building in the same run.

   ⚠ **An open PR does not mean unfinished.** Agents cannot merge application
   code, so completed work sits in an open PR waiting for Zach — possibly for
   days. The signal is the **backlog item's status**, not the PR's state:

   - Item is **`in-progress`** → genuinely unfinished. Resume it.
   - Item is **`done`**, or its PR description says the work is complete →
     finished, just awaiting Zach's merge. **Leave it alone** and move to the
     next buildable item.

   Getting this wrong means a Worker re-opens finished work instead of building
   the next thing, and the queue stops moving while looking busy.
4. **Commit partial work before marking anything `blocked`.** A block should
   cost the diagnosis, not the work already done.

## Every notification leads with what needs Zach

Any routine that notifies — Slack or otherwise — must **open** with open PRs
awaiting his merge, listed by number and title, before reporting its own work.

Agents cannot merge application code, so PRs accumulate silently unless
something surfaces them. A nightly build that nobody merges is a queue, not
progress.

If nothing is awaiting merge, say so in one line and move on.

### The one exception: a Worker's start notice

A Worker sends one short line when it **begins**, naming what it is about to
build. That line does not lead with open PRs and does not `@`-mention Zach.

It is a heartbeat, not a report. Everything else a routine sends arrives at the
*end* of a run, which means a session killed by an exhausted usage window at 1 AM
looks exactly like one that never launched — and those have completely different
fixes. The start notice is the only thing that tells them apart. It also leaves a
record of what the Worker was mid-way through if it never reports back.

Mechanically the Worker creates its run log first, with the start line as the
`## Slack` block, and self-merges that under rule 7 before building anything.
Later notifications rewrite the same block in the same file.

⚠ **This heartbeat travels through the pipeline it is meant to vouch for**
(commit → PR → checks → self-merge), so a Worker that dies during that opening
sequence sends nothing at all — the exact ambiguity the notice exists to remove.
Accepted deliberately on 2026-08-03 in exchange for one identity everywhere;
the residue is an unmerged run-log PR, which is visible on GitHub but will not
reach a phone. If start notices ever start going missing, suspect this before
suspecting the routine.

Everything else a Worker sends comes at the end and follows the rule above.

### How a notification reaches Slack

**Routines do not post to Slack.** They write the message into their run log,
and a GitHub Action posts it as **College Crew Agents** when the run-log PR
merges. Design and rationale:
`docs/plans/2026-08-02-slack-agent-identity.md`.

Why it works this way: the cloud environment's variable field is plaintext and
this repo is public, so a routine holding a Slack credential is one careless
`env` dump away from publishing it. It also means the message *is* the committed
artifact — a run log and its notification cannot disagree, which is the failure
recorded under "Never invent something waiting on Zach" below.

Put the message in a fenced block under a `## Slack` heading:

~~~markdown
## Slack

```text
*Planner — 2026-08-02*

*Open PRs awaiting your merge:*
• #112 — add optional customer tip on the invoice, 100% to the student

_Nothing to plan this run._ CC-003 is `approved` but pure effort `S`...
```
~~~

**Which routines this applies to** is controlled by `NOTIFY_ROUTINES` in
`scripts/agents/post_run_to_slack.py`. A routine outside that set is ignored
entirely and keeps using the claude.ai connector. **As of 2026-08-03 all four
are in the set** — the Planner piloted it, and the Proposer and both Workers
migrated the same day. Removing a name is the revert switch.

For a routine in the set, the block is **required output**. A run log without
one fails the Action, and nothing reaches Zach's phone.

**One run log can send several messages.** The Action posts when the `## Slack`
block's *content changes* in a push, so a routine notifies again by rewriting
that block and merging. A Worker uses this for its start notice, any plan it
writes, and its end-of-run report — all in one file across the night.

⚠ The corollary is the trap: **an unchanged block sends nothing.** A run that
ends without rewriting its block reports as silence, and silence here means the
routine died.

#### Slack mrkdwn is not GitHub markdown

| Want | Write | Not |
|---|---|---|
| bold | `*bold*` | `**bold**` |
| italic | `_italic_` | `*italic*` |
| code | `` `code` `` | — |
| link | `<https://x\|text>` | `[text](https://x)` |
| bullet | `•` typed manually | `-` or `*` |

No headings, no tables — they render as literal characters.

⚠ **Never use a ``` fence inside the message.** It terminates the block early
and silently truncates what gets sent.

⚠ **Refer to the run log by path, not by PR number.** The message is committed
inside that PR, so the number does not exist yet when the message is written.

#### Ping Zach only when the run produced something needing his decision

Include `<@U0BMD6360GM>` in the message **only** when this run created something
he has to act on. Leave it out otherwise.

This is not cosmetic. A plain channel message from an app only notifies a phone
if `#agents` is set to *All new messages* — one accidental tap from silently
breaking the whole notification path. A mention notifies regardless of channel
preference.

⚠ An earlier version of this rule cited *"a bot post with no mention produced no
push"* as the evidence. That was a **misdiagnosis**. Retested 2026-08-02 with
Slack closed on the desktop: an unmentioned bot post pushed fine. The original
silence was Slack suppressing mobile notifications while the same user is active
on another device — nothing to do with the mention.

The rule stands anyway, on the channel-preference argument alone. It is recorded
because the wrong reason is the more memorable one, and a future reader
troubleshooting a missing notification should suspect desktop-active suppression
first.

| This run produced | Ping? |
|---|---|
| A new plan awaiting approval | **yes** — it has a same-night deadline |
| A new open question, or an item newly `blocked` | **yes** — work is stalled on him |
| Only the standing list of open PRs | **no** |
| Nothing pending | **no** |

The standing open-PR list is deliberately excluded. It leads every message by
design, so pinging on it would ping every single run — and a ping that fires
every time carries no information, which is the same failure as inventing work.
Put the mention on the line that says what he has to do, so the ping and its
reason arrive together.

`U0BMD6360GM` is Zach's Slack member ID. Member IDs are visible to the whole
workspace and are not credentials.

### Never invent something waiting on Zach

A notification may ask for approval **only on something actually unapproved.**
Before writing any line asking Zach to approve, establish the item's real state
by reading **both**:

- the item's `**Status:**` in `backlog.md`, and
- the `**Status:**` line inside `plans/<ID>.md` — **a plan file existing is not
  the same as that plan being approved.**

Those are different questions. The Planner's skip condition turns on whether a
plan *exists*; what needs Zach turns on whether it is *approved*. Checking the
first and reporting on the second is how a routine ends up asking for approval
that already happened.

Then state which is true, naming the item:

| Real state | What to write |
|---|---|
| Item `approved`, effort pure `S` | *"CC-003 is approved and buildable — Worker 1 builds it tonight, nothing needed from you."* |
| Plan `Status: approved` | *"CC-004's plan is approved — Worker 1 builds it tonight."* |
| Plan `Status: proposed` | *"CC-004's plan needs approval — approve before 11:07 PM and Worker 1 builds it tonight."* |
| Nothing pending | *"Nothing needs your judgment beyond the PRs above."* |

⚠ On 2026-08-02 the Planner closed an otherwise-correct skip notice with
*"approving CC-003/CC-004 for the Worker whenever you're ready."* Both had been
approved hours earlier — the backlog items at 1:53 PM (PR #125), CC-004's plan
at 4:19 PM (PR #136). Its run-log table recorded only `Plan exists? yes`, never
the plan's `Status:`, so it defaulted to asking. The message contradicted its
own body, which had already reported both as `approved`.

This matters more than a cosmetic slip: the entire reason notifications go to
Slack is that **anything reaching Zach's phone genuinely needs him.** A routine
that manufactures work trains him to skim, and a skimmed notification is
indistinguishable from one that never fired — which is the exact failure the
"silence must mean failure" rule exists to prevent.

**When a run needs nothing from Zach, say so plainly and stop.** "Nothing needs
your judgment" is a complete, correct, useful notification.

### Every plan created gets its own Slack post

Whoever writes a plan — the Planner, or a Worker running step 1 — must post it
to Slack as soon as it is merged. A plan nobody knows about cannot be approved,
and an unapproved plan is never built.

The post must carry enough to approve from a phone in under a minute:

- The item ID and title
- One line on the approach
- The effort estimate
- A direct link to `plans/<ID>.md` on `main`
- **The deadline, and what meeting it buys**

That last line is the point of the message, and it depends on who is writing:

| Written by | Line to include |
|---|---|
| Planner (6:03 PM) | *"Approve before 11:07 PM and Worker 1 builds it tonight."* |
| Worker 1 (~11:15 PM) | *"Approve before 4:12 AM and Worker 2 builds it tonight."* |
| Worker 2 (~4:20 AM) | *"Approve today and tonight's 11:07 PM Worker builds it."* |

Worker 2's row is the fallback's fallback — it only fires if the Planner *and*
Worker 1 both failed to write the plan. There is no same-night deadline left to
offer by then, so it names the next one.

Approving is changing one word in the plan's Status. Stating the deadline turns
a notification into a recoverable day.

⚠ This does not override the rule above: the post still **opens** with open PRs
awaiting Zach's merge, then covers the plan.

## Curator

`decisions.md` grows without bound and will eventually crowd the context
window. Periodically collapse resolved entries into one-line summaries and
archive the detail. This is how the system stays current without losing what it
learned.
