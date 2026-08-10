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
The routine reads **two** things from it before publishing anything:

1. `* [x] I approve this blog for production`
2. A non-empty `Image:` line in the **Photo** section

Both → publish. Either missing → skip the week and leave the canvas untouched,
so the same draft is still there when she comes back to it.

A checked box reads back through `slack_read_canvas` as `* [x] …` and an
unchecked one as `* [ ] …`. That exact-string comparison is the gate — if a line
is missing or reworded, treat it as **not approved** rather than guessing.

## The rewrite bypass

A third line sits under the approval box and is read the same literal way:

```
* [ ] I rewrote this myself, publish it as written
```

**It is not part of the gate.** It changes how the post is published, never
whether. Ticked, it means Gianna wrote this post herself instead of editing the
routine's draft, and the routine then **ignores the Links, Keep these words, and
outbound-citation sections entirely** — they describe a post that no longer
exists. It adds at most one `/browse?service=<slug>` link on words already in her
prose, writes the `imageAlt` itself if the Caption section is gone, and publishes
the rest as written.

It waives polish and nothing else. Every refusal in the prompt's Step 3 still
stands: a `[NEEDS …]` marker, an already-published slug, a malformed image key, a
missing title or description or slug. Those produce a *broken* post; stale
keywords only produce a less-optimized one.

**Why this exists.** On 2026-08-10 the routine held a fully approved post — box
ticked, valid image key — because Gianna had replaced the draft rather than
editing it, and the canvas's own Links and Keep these words sections still
described the patio post she had replaced. It was reading a document that
contradicted itself and had no way to know that a human rewriting from scratch is
correct behaviour, not a mistake. Writing her own story is the most valuable
thing she does; the system just had no way for her to say she had done it.

⚠ **This is the second checkbox that STRATEGY.md used to forbid, and the rule it
broke was narrower than it looked.** The old prohibition existed because a
`* [ ] I inserted a photo below the line` box confirmed something the image key
already proved — Gianna ticking a box nothing read. The real standing rule is
**every box in the canvas must be read by the routine**, and this one is: Step 2
matches it, Step 3 branches on it. A box carrying a signal nothing else carries
does not break that rule. A decorative one still would.

## The Photo section

```
## Photo

Upload at https://www.thecollegecrew.com/admin/blog-photos, tap
"Copy for the canvas", and paste the key here.

Image:
```

She uploads a photo, copies the key it gives her (`2026-08-05-tutor-table-a1b2c3.jpg`),
and pastes it after `Image:`. The routine expands that key against the storage
base URL in [`PUBLISHING.md`](./PUBLISHING.md) and writes the result into the
post's frontmatter.

**Why a key and not an attachment.** Attachments were the original design and
they cannot work: the routine has no way to put a photo into git. GitHub MCP's
`content` parameter is a text field, and `git push` is blocked from the sandbox
— so a JPEG cannot travel through it in any encoding. Three consecutive runs
were lost discovering that. Photos now live in the public `blog-images` Supabase
bucket and only their **address** goes through git, which means the routine only
ever writes text.

The key doubles as the photo checkbox that used to sit here. Pasting one is a
deliberate act; there is nothing left for a second box to confirm.

⚠ **The key licenses no opinion about what the photo shows.** The routine must
not judge subject matter, composition, quality, or whether the image suits the
post — and must never refuse to publish on those grounds. Editorial choice of
image is Gianna's, and Zach reviews the post after it is live.

This is a deliberate loosening, made 2026-08-04 after the routine refused two
consecutive runs on image-content grounds — once for a photo of a meal, once for
a sheet of handwritten sports stats. Both judgments were defensible and both
were the wrong call to be making: a week's publication was blocked by an
opinion, the person who could fix it found out on Monday, and the earlier
version of this passage is what the routine cited as authority. The rule now has
teeth it did not need before — the routine never sees the photo at all — but it
stays written down, because a filename is enough to tempt a guess. Refuse on a
malformed key and on nothing else.

## The weekly Slack message

The routine posts one message to `#weekly-blog` (`C0BMRK02RR8`) at the end of
every run, always `@`-mentioning Gianna as `<@U0BMH9KBZ2P>` — she is the one who
has to act. Keep it short and phone-readable.

**Slack mrkdwn is not GitHub markdown:** `*bold*` not `**bold**`,
`<url|text>` not `[text](url)`, manual `•` bullets.

What to say, by outcome:

| Outcome | The message |
|---|---|
| **Published + new draft** | What went live (title + URL), then the new draft's title and a canvas link, then what she does next: edit, fill in the markers, paste a photo key, tick the box. |
| **Gate closed** | One line naming which of the two checks is missing — the approval box or the image key — and that the draft is untouched and still there. Nothing new was written. |
| **Refused before publishing** | Exactly what to fix, quoting the `[NEEDS …]` marker or naming the problem. |
| **Refused as a rewrite** | That the post reads as a rewrite rather than an edit, one keyword or link that no longer fits, and that ticking `I rewrote this myself, publish it as written` ships it as-is next run. Do not ask her to restore the keywords — the box is the answer. |
| **Published under the bypass** | What went live, plus anything written on her behalf: the alt text if the Caption was gone, and the one Browse link if you added one. She should learn what you filled in from the message, not from the live page. |
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
