#!/usr/bin/env python3
"""Diff the live routine prompts against the copies in docs/agents/prompts/.

    python3 scripts/agents/check_prompt_sync.py <routines.json>

Exits 0 when every tracked routine matches its committed copy, 1 otherwise.

## Why this takes a file instead of fetching

The claude.ai routines API needs an OAuth token that only the Claude Code
`RemoteTrigger` tool holds — it injects auth in-process and never exposes it, so
a standalone script cannot fetch on its own. Rather than put a token somewhere
(this repo is public, and the cloud environment's variable field is plaintext),
the fetch stays with the agent and this script does the comparison:

    RemoteTrigger {action: "list"}      # save the response to a file
    python3 scripts/agents/check_prompt_sync.py routines.json

The response may start with an `HTTP 200` status line; that is stripped.

Run it after editing any routine. A committed copy that has quietly drifted is
worse than no copy — it reads as authoritative while being wrong.
"""

import difflib
import json
import os
import sys

PROMPTS_DIR = "docs/agents/prompts"
SEPARATOR = "\n---\n\n"

# Tracked routines. Disabled probes and first-runs are deliberately absent.
TRACKED = {
    "trig_013cCHRvhW7ub9L3VQbU5mDk": "proposer",
    "trig_014pkNEPduunGTJKTLPAQkbC": "planner",
    "trig_01EQxUThVh42fVrk6oVVtQ4M": "worker-1",
    "trig_01WbSJt6KTYPVWjuzAmeCDBA": "worker-2",
}


def load(path):
    raw = open(path).read().lstrip()
    if not raw.startswith("{"):
        # Tolerate a leading "HTTP 200" status line from the tool output.
        raw = raw.split("\n", 1)[1]
    data = json.loads(raw)
    # `list` returns {"data": [...]}; `get` returns {"trigger": {...}}.
    if "data" in data:
        return data["data"]
    return [data["trigger"]]


def live_prompt(trigger):
    return trigger["job_config"]["ccr"]["events"][0]["data"]["message"]["content"]


def committed_prompt(slug):
    path = os.path.join(PROMPTS_DIR, f"{slug}.md")
    if not os.path.exists(path):
        return None, path
    text = open(path).read()
    if SEPARATOR not in text:
        return None, path
    return text.split(SEPARATOR, 1)[1].rstrip(), path


def main():
    if len(sys.argv) != 2:
        print(__doc__.strip().split("\n\n")[1])
        return 2

    triggers = load(sys.argv[1])
    by_id = {t["id"]: t for t in triggers}

    drifted = missing = 0

    for tid, slug in sorted(TRACKED.items(), key=lambda kv: kv[1]):
        trigger = by_id.get(tid)
        if trigger is None:
            print(f"?? {slug}: routine {tid} not present in the dump")
            missing += 1
            continue

        committed, path = committed_prompt(slug)
        if committed is None:
            print(f"?? {slug}: {path} missing or has no '---' header separator")
            missing += 1
            continue

        live = live_prompt(trigger).rstrip()
        if live == committed:
            print(f"ok {slug}")
            continue

        drifted += 1
        print(f"\nDRIFT {slug}  ({path})")
        diff = difflib.unified_diff(
            committed.splitlines(), live.splitlines(),
            fromfile=f"{path} (committed)", tofile=f"{trigger['name']} (live)",
            lineterm="", n=1,
        )
        for line in diff:
            print("  " + line)
        print()

    # A routine running unversioned is the failure this whole directory exists
    # to prevent, so surface it even though it is not strictly "drift".
    untracked = [
        t for t in triggers
        if t.get("enabled") and t.get("cron_expression") and t["id"] not in TRACKED
    ]
    for t in untracked:
        print(f"!! untracked enabled routine: {t['id']} — {t['name']!r}")

    total = drifted + missing + len(untracked)
    print(f"\n{len(TRACKED) - drifted - missing}/{len(TRACKED)} in sync", end="")
    print(f", {drifted} drifted, {missing} missing, {len(untracked)} untracked")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
