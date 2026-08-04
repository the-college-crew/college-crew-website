# The standing blog canvas

The weekly blog routine writes each draft into **one** Slack canvas that it
overwrites every week, rather than creating a new one each time. Slack's
connector can create, read, and update canvases but **cannot delete them**, so a
new canvas per week would accumulate with no way to clean up.

A zero-context routine has no other way to find the canvas it is supposed to
update. That is what this file is for.

| | |
|---|---|
| **Canvas ID** | `F0BMQ38NM62` |
| **URL** | https://college-crewworkspace.slack.com/docs/T0BML6ZJNLC/F0BMQ38NM62 |
| **Channel** | `#weekly-blog` (`C0BMRK02RR8`) |
| **Created** | 2026-08-03 |

**Never create a second canvas.** If reading `F0BMQ38NM62` fails, stop and say
so in Slack — a duplicate canvas splits Gianna's approvals across two documents,
and the connector cannot delete the extra one.

## The approval gate

The canvas is not just a handover document; it is the **authorization record**.
The routine reads **three** things from it before publishing anything:

1. `* [x] I, Gianna, approve this blog for production`
2. `* [x] I inserted a photo below the line`
3. An actual image in the canvas

All three → publish. Any one missing → skip the week and leave the canvas
untouched, so the same draft is still there when she comes back to it.

A checked box reads back through `slack_read_canvas` as `* [x] …` and an
unchecked one as `* [ ] …`. That exact-string comparison is the gate — if a line
is missing or reworded, treat it as **not approved** rather than guessing.

**Why the photo gets both a checkbox and a presence check.** They fail
differently. The image check catches "she forgot the photo entirely"; the
checkbox catches "there is an image in the canvas, but it is not the one she
meant for this post" — a leftover from last week, or something pasted into a
comment. The box is her saying *this* photo is the one. Requiring both means a
stale image can never be silently published under a new post.

## Why one canvas and not one per week

The trade-off is that last week's draft is gone once it is overwritten. That is
acceptable **only because of the overwrite guard**: the routine refuses to write
a new draft while the previous row in [`published.md`](./published.md) is still
`drafted`. Remove the guard and this arrangement starts losing work.

Published posts are never at risk — they live in git at
`apps/web/content/blog/`.
