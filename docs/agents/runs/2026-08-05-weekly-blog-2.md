# Weekly blog — 2026-08-05 (second firing)

## Gate

Canvas `F0BMQ38NM62` holds the `one-drill-before-fall-sports-tryouts` draft
written in the previous firing. Evaluated both checks individually:

1. `* [ ] I approve this blog for production` — unchecked. ✗
2. `Image:` line — empty, no key pasted. ✗

Both missing. Gate is closed.

## Action

None. Per Step 2, left the canvas **byte-for-byte unchanged** — did not
call `slack_update_canvas`. Did not touch `apps/web/content/blog/`,
`apps/web/public/blog/`, or `docs/blog/published.md`. The
`one-drill-before-fall-sports-tryouts` row stays `drafted`.

## Slack message sent

Posted directly to `#weekly-blog` (`C0BMRK02RR8`) via `slack_send_message`,
mentioning `<@U0BMH9KBZ2P>`:

> :wave: <@U0BMH9KBZ2P> Still waiting on both the approval box and a photo
> key for *One Drill Worth Running Before Your Kid's First Fall Tryout* —
> nothing's changed on the draft, it's exactly where it was.
> <https://college-crewworkspace.slack.com/docs/T0BML6ZJNLC/F0BMQ38NM62|Open the canvas>
> whenever you're ready.

## Definition of done

Gate closed: only items 4 (run log) and 5 (Slack message) apply. Canvas is
byte-for-byte unchanged; `published.md` is unaffected.
