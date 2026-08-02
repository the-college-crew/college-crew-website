# Give agent routines their own Slack identity, without a credential in the sandbox

**Status:** proposed
**Owner:** Zach
**Branch:** none yet
**Updated:** 2026-08-02

## Goal

Routine notifications currently arrive in `#agents` as **"Zach Brown"** with a
small "Sent using @Claude" footer, because the routines post through the
claude.ai Slack connector, which posts under the mentioning user's own identity.
On a phone, a Planner run and a message Zach actually wrote are indistinguishable
until you open them.

Done looks like: routine posts arrive as **"College Crew Agents"** with its own
icon and an APP badge, while `@Claude` approvals from the phone keep working
exactly as they do today. Getting there without putting a live credential in the
cloud environment — whose variable field is plaintext by design — and, as a
second-order win, making it structurally impossible for a routine's run log and
its Slack post to disagree.

## Why this shape (and not the simpler one)

Three options were compared. The naive one — put a Slack webhook URL in the
cloud environment's variable field and `curl` it from the routine — is roughly
ten minutes of work and was rejected. The environment is plaintext and the repo
is **public**, so the leak path is one step: an agent debugging a failure runs
`env` or echoes the variable into a run log, self-merges under rule 7, and the
URL is public permanently. Agents dump environment variables when debugging as a
matter of course.

The chosen shape ("B-lite") never gives the sandbox a credential at all. The
routine's only path to Slack is committing text to git; a GitHub Action holds
the webhook URL in an encrypted Actions secret and posts what was committed.

Two consequences worth stating plainly, because they are the actual argument:

1. **It kills the divergence bug class.** On 2026-08-02 the Planner's run log was
   correct while its Slack message asked Zach to approve two items he had already
   approved (fixed procedurally in PR #138). Those were two artifacts composed
   separately, and they drifted. Here the Slack message *is* the committed
   artifact, so there is one source feeding both and they cannot disagree.
2. **An agent cannot post to Slack without leaving a git trail.** This extends
   the principle the environment is already built on — `RESEND_API_KEY` and
   `OPENAI_API_KEY` are deliberately blank so an agent "cannot email a real
   person regardless of what it decides to do at 3am." Under this design the same
   is true of Slack: every message is a reviewable, revertible commit.

Rejected alternatives, for the record:

- **Bot token with `chat:write.customize`** — would allow per-routine display
  names ("Planner", "Worker 1"). Rejected: message bodies already open with
  `*Planner — 2026-08-02*`, so the name duplicates the first line, and a bot
  token is a strictly more powerful credential than a channel-locked webhook URL.
- **Custom `username`/`icon_emoji` on the webhook payload** — does not work.
  Slack: *"You cannot override the default channel, username, or icon when you're
  using incoming webhooks to post messages. Instead, these values will always
  inherit from the associated Slack app configuration."* Only *legacy custom
  integration* webhooks honor those fields, and Slack is migrating people off
  them.

## What does not change

The `@Claude` approval path is a separate mechanism and is untouched. Zach still
mentions `@Claude` in `#agents` from his phone, the session still runs under his
own account and plan limits, still edits `backlog.md` / `decisions.md`, still
opens PRs, and still appears in `claude.ai/code` history. This plan replaces the
routines' *outbound* post only.

## Approach

### Step 0 — Verify the thread-context question first

**Do this before anything else depends on it.** Today a routine's post is
authored by Zach, so replying in-thread gives `@Claude` a thread whose parent is
a human message. After this change the parent is a **bot** message, and it is
unverified whether `@Claude` reads bot messages in thread history.

Test: post one message through the webhook, reply `@Claude what's pending?` in
that thread, and see whether it resolves the context.

Stakes are low either way — `@Claude` reads `backlog.md` from the repo, so
"approve CC-003" works regardless of what it can see in the thread. But confirm
it rather than assume it, and record the answer in Notes.

### Step 1 — Slack app and webhook (manual, Zach)

1. Create a Slack app in the College Crew workspace, named **College Crew
   Agents**, with an icon distinct from Zach's avatar.
2. Enable **Incoming Webhooks**, add one scoped to `#agents`.
3. Copy the `hooks.slack.com/services/...` URL. **It is a credential** — it does
   not go in the repo, the cloud environment, or a plan file.

### Step 2 — GitHub Actions secret

Add the URL as repo secret `SLACK_AGENTS_WEBHOOK`. Actions secrets are encrypted
at rest, masked in logs, and unreadable by collaborators — including on a public
repo.

### Step 3 — Run-log format: a `## Slack` section

Routines gain one required section in `docs/agents/runs/<date>-<routine>.md`,
holding the exact message body to send, fenced so it renders as a readable block
on GitHub and so the Action has an unambiguous delimiter:

~~~markdown
## Slack

```text
*Planner — 2026-08-02*

*Open PRs awaiting your merge:*
• #112 — add optional customer tip on the invoice, 100% to the student
• #96 — gitignore CLAUDE.local.md instead of CLAUDE.md

_Nothing to plan this run._ CC-003 is `approved` but pure effort `S`...
```
~~~

⚠ **Slack mrkdwn is not GitHub markdown.** Bold is `*text*` not `**text**`,
italic is `_text_`, links are `<url|text>`, and there are no tables. The routine
writes Slack-flavored text here. This is the main papercut of the design.

### Step 4 — The workflow

New file `.github/workflows/agent-slack-notify.yml`. **This repo currently has no
`.github/` directory at all** — this is its first GitHub Action. Public repos get
unlimited free Actions minutes, so there is no cost.

```yaml
name: Post agent run to Slack

on:
  push:
    branches: [main]
    paths: ['docs/agents/runs/**']

jobs:
  post:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 2
      - name: Extract and post
        env:
          SLACK_WEBHOOK: ${{ secrets.SLACK_AGENTS_WEBHOOK }}
        run: ./scripts/agents/post-run-to-slack.sh
```

The logic lives in a checked-in script, not inline YAML, so it is testable
locally and reviewable in a normal diff.

The script must:

1. Diff `HEAD~1..HEAD` for changed files under `docs/agents/runs/`.
2. For each, extract the fenced block under `## Slack`.
3. **Post only if that block's content actually changed in this push.** See the
   guard below.
4. POST as `{"text": "<body>"}`, with the body JSON-escaped (use `jq -Rs`, never
   string concatenation).
5. Never echo `$SLACK_WEBHOOK`; no `curl -v`, no `set -x`.

### Step 5 — The guard: diff-based, not identity-based

An earlier draft proposed firing only on commits authored by
`College Crew Agent <agent@thecollegecrew.com>`. **That does not work.** Verified
on commit `1904928`: run-log commits reaching `main` are authored
`Zach Brown <zach@thecollegecrew.com>`, because the cloud agent opens and merges
PRs through Zach's GitHub token. Agent and human commits are indistinguishable by
author on `main`.

Guard on the diff instead: post only when the `## Slack` block's *content*
changed in that push. This is identity-independent and more precise — Zach fixing
a typo elsewhere in an old run log triggers nothing, while a routine committing an
updated block does.

This also gives the Worker its multiple posts per night for free: it commits an
updated `## Slack` section at each notify point, and each push fires one post.

### Step 6 — Missing section fails loudly

If a changed run log has **no** `## Slack` section, fail the workflow rather than
skipping silently. Per the README, every run notifies; a run log without a
message is a bug, and a red workflow emails Zach. Silence must keep meaning
failure.

### Step 7 — Pilot on the Planner, then roll out

Adopt on the **Planner only** first. It is the lowest-stakes routine — one post
per run, usually a skip notice — and it is the one that produced the divergence
bug, so it is the right place to prove the fix.

Leave the Proposer and both Workers on the connector until the Planner has run
cleanly for two consecutive nights. Then move them and update the README.

### Step 8 — README updates

Once the pilot holds, update `docs/agents/README.md`:

- Rule 2 (run logs) gains the `## Slack` section requirement and the mrkdwn note.
- "A skip is still a notification" and "Every notification leads with what needs
  Zach" get a line clarifying the message is delivered *via* the committed run
  log, not a direct post.

The content rules themselves — lead with open PRs, name the skip reason, carry
the deadline, and the `Never invent something waiting on Zach` section from
PR #138 — all stay exactly as written. They now describe what goes in the
`## Slack` block. That is the point of this shape over full message derivation.

## Rollback

Delete the workflow file and re-point routines at the connector. Nothing else
depends on it. If the webhook URL ever leaks, revoke it in the Slack app config
and regenerate — one field to update, and the blast radius is "someone can post
into `#agents`," not production data.

## Known downsides, accepted

1. **Latency.** Notification lands after checks and self-merge, so ~1–2 min
   rather than instant.
2. **Delivery is coupled to git.** A failed self-merge means no Slack post at
   all. Today the post is independent of git.
3. **Two causes of silence.** Routine died, or the workflow broke. Mitigated by
   GitHub emailing on workflow failure, but diagnosis is murkier than today.
4. **Slack mrkdwn in a `.md` file** (Step 3). Fenced, but still a thing routines
   have to get right.
5. **First Actions surface in this repo.** A new CI mechanism to maintain, and
   Action logs on a public repo are public — hence the "never echo the webhook"
   rule in Step 4.

## Open questions

- **Step 0's answer** — can `@Claude` read a bot-authored parent message in
  thread context? Decides nothing structural, but worth knowing before habits
  form. Zach to run the test.
- **Icon for the app.** Cosmetic, Zach's call.
- Whether the Proposer and Workers move together after the pilot or one at a
  time. Recommendation: together, since by then the mechanism is proven and
  staggering costs two more README edits.

## Notes

- Verified against Slack's docs 2026-08-02: app-based incoming webhooks ignore
  `username`/`icon_emoji`/`icon_url` and always inherit the app's configuration
  (`docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/`).
  Per-message display names require a **bot token** with `chat:write.customize`,
  which is bot-token-only — a user token cannot override its owner's name or
  icon.
- The APP badge on bot messages appears to be unsuppressible and is undocumented
  by Slack. Here it is desirable.
- The author-identity guard was designed, then disproven against a real commit
  before any code was written (Step 5). Recorded because the same wrong
  assumption — that agent commits on `main` carry the agent's git identity — is
  easy to make again; `GIT_AUTHOR_NAME` in the cloud environment governs commits
  made *inside the sandbox*, not what lands on `main` through the GitHub API.
