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

1. `* [x] I approve this blog for production`
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

## The weekly Slack message

The routine posts one message to `#weekly-blog` (`C0BMRK02RR8`) at the end of
every run, always `@`-mentioning Gianna as `<@U0BMH9KBZ2P>` — she is the one who
has to act. Keep it short and phone-readable.

**Slack mrkdwn is not GitHub markdown:** `*bold*` not `**bold**`,
`<url|text>` not `[text](url)`, manual `•` bullets.

What to say, by outcome:

| Outcome | The message |
|---|---|
| **Published + new draft** | What went live (title + URL), then the new draft's title and a canvas link, then what she does next: edit, fill in the markers, add a photo, tick both boxes. |
| **Gate closed** | One line naming exactly which of the three checks is missing — approval box, photo box, or the photo itself — and that the draft is untouched and still there. Nothing new was written. |
| **Refused before publishing** | Exactly what to fix, quoting the `[NEEDS …]` marker or naming the problem. |
| **First run** | Just the new draft and what to do with it. |

**Do not invent something needing her attention.** If the run was a clean no-op,
one line saying so is a complete and correct message. This is the counterpart of
the notification rules the other four routines follow: a weekly ping that always
manufactures an action item trains her to stop reading it.

## Why one canvas and not one per week

The trade-off is that last week's draft is gone once it is overwritten. That is
acceptable **only because of the overwrite guard**: the routine refuses to write
a new draft while the previous row in [`published.md`](./published.md) is still
`drafted`. Remove the guard and this arrangement starts losing work.

Published posts are never at risk — they live in git at
`apps/web/content/blog/`.
