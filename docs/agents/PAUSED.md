# The loop is paused

**Paused 2026-08-08.** The four routines that make up the Proposer → Planner →
Worker loop are disabled to save usage. They will be re-enabled and improved
later; this file is how.

**The weekly blog routine is NOT paused and must stay that way.** It is a
separate system with its own approval gate (Gianna's Slack canvas) and its own
rules — see rule 7b in `README.md`. Nothing in this file applies to it.

| Routine | ID | Cron (UTC) | State |
|---|---|---|---|
| Proposer | `trig_013cCHRvhW7ub9L3VQbU5mDk` | `57 11 * * *` | disabled |
| Planner | `trig_014pkNEPduunGTJKTLPAQkbC` | `3 23 * * *` | disabled |
| Worker 1 | `trig_01EQxUThVh42fVrk6oVVtQ4M` | `7 4 * * *` | disabled |
| Worker 2 | `trig_01WbSJt6KTYPVWjuzAmeCDBA` | `12 9 * * *` | disabled |
| **Weekly blog** | `trig_01EvgEGuhKANPq89NtWs2Kwp` | `3 13 * * 1` | **enabled — leave alone** |

## Turning it back on

Per routine, send exactly this and nothing else:

```
RemoteTrigger {action: "update", trigger_id: "trig_…", body: {"enabled": true}}
```

Then confirm with `RemoteTrigger {action: "list"}` that all four read
`enabled: true` and that the blog routine is still `enabled: true` too.

⚠ **`body` must contain only `enabled`.** A partial update replaces
`job_config` wholesale, so sending a partial `job_config` alongside it would
silently strip `environment_id`, `session_context`, or `events` — the failure
`prompts/README.md` already warns about. Omitting `job_config` entirely is
safe, and that is the whole trick here.

## Why this can't be a script

The routines API needs an OAuth token that only the `RemoteTrigger` tool holds.
Putting that token anywhere a shell script could reach it means putting it in a
public repo or in the cloud environment's plaintext variable field — neither is
acceptable. This is the same constraint that makes `check_prompt_sync.py` take
a file instead of fetching one.

So the off switch is agent-driven by necessity. Ask any Claude Code session to
"re-enable the agent loop, see docs/agents/PAUSED.md" and it has everything it
needs.

## What pausing did and did not touch

Verified by hashing `job_config` before and after, on all five routines:

- **Unchanged:** every prompt, `cron_expression`, `environment_id`,
  `session_context` (model, tools, sources), `mcp_connections`,
  `persist_session`, and each routine's persistent session ID. Only
  `updated_at` moved.
- **Unchanged:** `docs/agents/prompts/*` stays in sync, so
  `check_prompt_sync.py` still passes. It only flags an *enabled* routine that
  is untracked, so disabled-but-tracked is fine.
- **Unchanged:** the Slack GitHub Action. It fires on run logs merging; no runs
  means no posts, and `NOTIFY_ROUTINES` needed no edit.

`next_run_at` still shows a future timestamp on the disabled routines. That is a
stale computed field, not a scheduled firing — `enabled: false` is what governs.

## State frozen at the pause

- **CC-010** (Open Graph / Twitter Card metadata) — `approved`, built, waiting
  in **PR #231** for Zach to merge. The Worker finished it; nothing is
  half-done.
- **PR #236** — restore anon EXECUTE on the offering readiness predicates, also
  open and awaiting merge.
- `plans/CC-004.md` is the only plan file. Everything else in `backlog.md` is
  `rejected`.

Nothing was mid-flight when the loop stopped, so there is no partial branch to
clean up and no `in-progress` item to resume.

## Read this before re-enabling

The backlog freezes exactly as it is. If the pause runs long, the queue you
resume into will be stale — CC-010's reasoning cites `app/layout.tsx` as having
zero `openGraph` fields, which stops being true the moment PR #231 merges. **Re-read
`backlog.md` and `decisions.md` against the current code before letting the
Proposer run again**, or the first run will propose work that is already done.

Crons were deliberately left untouched, so re-enabling restores the original
daily cadence at the original times. If the reason for pausing was usage rather
than quality, changing the cadence — weekly, or Proposer-only — is the obvious
lever, and it is a `cron_expression` edit on the same `update` call.
