#!/usr/bin/env python3
"""Post the `## Slack` block from changed agent run logs to Slack.

Runs from .github/workflows/agent-slack-notify.yml on pushes to main that touch
docs/agents/runs/. Design and rationale:
docs/plans/2026-08-02-slack-agent-identity.md

The routine never holds a Slack credential. It commits the message it wants sent
into its run log; this script — running in Actions, where the webhook URL lives
as an encrypted secret — is what actually sends it. That means a run log and its
Slack post cannot disagree, because they are the same text.

⚠ The webhook URL must never reach stdout/stderr. Action logs on this repo are
public. Note that urllib's HTTPError stringifies to include the request URL, so
exceptions are reported by code/reason only, never by repr.
"""

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request

RUNS_DIR = "docs/agents/runs/"

# Pilot scope. A run log for a routine outside this set is ignored entirely —
# including the "missing block" failure below — so routines can migrate off the
# claude.ai connector one at a time. Add a name here when that routine starts
# emitting a `## Slack` block.
NOTIFY_ROUTINES = {"planner"}

SLACK_HEADING = re.compile(r"^##\s+Slack\s*$", re.MULTILINE)
FENCE = re.compile(r"^```[^\n]*\n(.*?)^```", re.DOTALL | re.MULTILINE)
DATE_PREFIX = re.compile(r"^\d{4}-\d{2}-\d{2}-")


def git(*args):
    """Run git, returning stdout, or None if the command failed."""
    r = subprocess.run(["git", *args], capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else None


def routine_name(path):
    """docs/agents/runs/2026-08-02-planner.md -> 'planner'"""
    stem = os.path.basename(path).removesuffix(".md")
    return DATE_PREFIX.sub("", stem).lower()


def slack_block(text):
    """Contents of the first fenced block after a `## Slack` heading."""
    if not text:
        return None
    heading = SLACK_HEADING.search(text)
    if not heading:
        return None
    fence = FENCE.search(text[heading.end():])
    return fence.group(1).strip("\n") if fence else None


def post(webhook, text):
    payload = json.dumps({"text": text}).encode("utf-8")
    req = urllib.request.Request(
        webhook, data=payload, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read().decode("utf-8", "replace").strip()
            if resp.status != 200 or body != "ok":
                # Slack returns a bare "ok" on success.
                print(f"::error::Slack returned {resp.status}: {body}")
                return False
            return True
    except urllib.error.HTTPError as e:
        # Deliberately not printing `e` — its str() contains the webhook URL.
        print(f"::error::Slack rejected the post: HTTP {e.code} {e.reason}")
        return False
    except urllib.error.URLError as e:
        print(f"::error::Could not reach Slack: {e.reason}")
        return False


def changed_run_logs(before, after):
    if before:
        out = git("diff", "--name-only", f"{before}..{after}", "--", RUNS_DIR)
    else:
        # First push, or a force-push whose `before` is the null SHA.
        out = git("show", "--name-only", "--format=", after, "--", RUNS_DIR)
    return [p for p in (out or "").splitlines() if p.strip()]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--text", help="Post this text verbatim and exit (manual test).")
    args = ap.parse_args()

    webhook = os.environ.get("SLACK_AGENTS_WEBHOOK", "").strip()
    if not webhook:
        print("::error::SLACK_AGENTS_WEBHOOK is not set")
        return 1

    if args.text:
        return 0 if post(webhook, args.text) else 1

    before = os.environ.get("BEFORE_SHA", "").strip()
    after = os.environ.get("AFTER_SHA", "HEAD").strip() or "HEAD"
    if not before or set(before) == {"0"}:
        before = None

    failed = False
    posted = 0

    for path in changed_run_logs(before, after):
        routine = routine_name(path)
        if routine not in NOTIFY_ROUTINES:
            print(f"skip {path}: '{routine}' is not in the notify pilot yet")
            continue

        current = git("show", f"{after}:{path}")
        if current is None:
            print(f"skip {path}: deleted in this push")
            continue

        block = slack_block(current)
        if block is None:
            # Step 6: every run notifies, so a run log without a message is a
            # bug. Fail so GitHub emails Zach rather than failing silently —
            # silence has to keep meaning "the routine died".
            print(f"::error file={path}::No `## Slack` fenced block found")
            failed = True
            continue

        previous = slack_block(git("show", f"{before}:{path}")) if before else None
        if block == previous:
            print(f"skip {path}: Slack block unchanged in this push")
            continue

        if post(webhook, block):
            print(f"posted {path} ({len(block)} chars)")
            posted += 1
        else:
            failed = True

    print(f"{posted} message(s) posted")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
