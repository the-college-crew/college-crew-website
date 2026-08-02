# Plans

Committed markdown for work that outlives a single session. Claude Code and
Codex both read and write these; git is the sync layer between them.

## When to write one

Write a plan file when work is going to span a session, an agent, or a day —
anything a later reader would otherwise have to reconstruct. Skip it for a typo
or a one-line fix.

The plan-first workflow in `CLAUDE.md` still applies: propose, get approval,
then build. This is where the approved plan goes so the next agent starts from
it instead of re-deriving it.

## The convention

One file per piece of work, named `YYYY-MM-DD-short-slug.md`. Keep it in this
directory. Front-load the status so a reader knows in one line whether it is
live.

```markdown
# <what this is>

**Status:** proposed | approved | in progress | done | abandoned
**Owner:** Zach | Ari
**Branch:** feat/whatever (or "none yet")
**Updated:** YYYY-MM-DD

## Goal
One paragraph. What "done" looks like, in terms a person would recognize.

## Approach
The steps. Files to create or change, schema impact, anything with a blast
radius beyond one file.

## Open questions
What is undecided, and who decides it. Delete as they resolve.

## Notes
What was learned while building — especially anything that contradicted the
plan. This is the part the next agent actually needs.
```

## Rules

- **Update the status when it changes.** A plan that says "in progress" three
  weeks after it shipped is worse than no plan.
- **Record what diverged.** When reality contradicts the plan, write it in
  Notes. That is the part worth committing — the approach is guessable, the
  surprise is not.
- **Do not put secrets in here.** This repo is public. Same rule as everywhere
  else: keys live in `.env.local`.
- **Do not duplicate the rules.** Standing conventions belong in `CLAUDE.md`
  (which `AGENTS.md` symlinks to). Plans are for specific work, not policy.
- **Delete or mark abandoned** when work is dropped. An unmarked stale plan
  reads as current.

## Why files and not a memory tool

Both agents can read a file. Neither can read the other's memory store. A
committed plan survives a session ending, a tool being swapped out, and a
second developer joining — and it shows up in a PR diff where it can be
reviewed like anything else.
