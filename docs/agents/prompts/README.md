# Routine prompts

Versioned copies of the prompts driving the four scheduled cloud routines.

> ⚠ **These are copies. The live prompt is the one in the claude.ai routine.**
> Editing a file here changes nothing. Editing a routine and not updating the
> file here leaves a copy that lies — which is worse than having none.

## Why these are in git at all

The routines already point at `../README.md` for the rules, deliberately, so
rules can change without recreating routines. But the prompts themselves lived
only in claude.ai, where they are invisible to `git log`, unreadable by Codex,
and gone if a routine is deleted — deletion being the one operation the API
cannot do, so it happens by hand in a web UI.

That sits badly with the project's rule that **git is the sync layer** between
agents. A prompt is the most consequential configuration in this system; it
should be reviewable in a diff like everything else.

## The four

| File | Routine | Fires |
|---|---|---|
| `proposer.md` | Proposer | 6:57 AM CDT daily |
| `planner.md` | Planner | 6:03 PM CDT daily |
| `worker-1.md` | Worker, attempt 1 | 11:07 PM CDT daily |
| `worker-2.md` | Worker, attempt 2 | 4:12 AM CDT daily |

Each file's header carries the routine ID, cron, environment, model, and
attached connectors. Disabled test and first-run routines are not tracked.

There are two Worker attempts, spaced 5h05m apart, because usage limits reset on
a rolling five-hour window — a closer retry would share the exhausted one.

## Checking they are in sync

```
RemoteTrigger {action: "list"}      # save the response to a file
python3 scripts/agents/check_prompt_sync.py routines.json
```

Prints one line per routine, a unified diff for anything that drifted, and exits
non-zero if there is anything to fix. It also flags an **enabled routine that is
not tracked here** — a routine running with no versioned prompt is the exact
failure this directory exists to prevent.

The script takes a file rather than fetching, because the routines API needs an
OAuth token that only the `RemoteTrigger` tool holds. Putting a token anywhere a
script could reach it means putting it in a public repo or in the cloud
environment's plaintext variable field, so the fetch stays with the agent and the
script does the comparison.

Run it after editing any routine.

## Keeping them in sync

Read a live prompt:

```
RemoteTrigger {action: "get", trigger_id: "trig_..."}
```

Update one, then update the file here in the same PR. A partial update replaces
`job_config` wholesale, so send the full `job_config.ccr` — `environment_id`,
`session_context`, and `events` — or the routine loses whatever was omitted.

Two things that are easy to break:

- **`persist_session: true` belongs at the top level of the body**, not inside
  `job_config.ccr`. Wrong placement and sessions vanish from the Claude app.
- **Send `mcp_connections` explicitly.** Routines otherwise inherit every
  account connector silently — an early probe came back with Gmail and Drive
  attached unasked.

Routines cannot be deleted through the API. That is done at
<https://claude.ai/code/routines>.
