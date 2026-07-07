-- Resolve-by-conversation for flagged chat messages.
--
-- Flags live in public.moderation_events (one row per flagged message). Admins
-- review them on /admin/flagged. This adds the ability to RESOLVE flags: an
-- admin clears a whole conversation's flags at once (see resolveConversationFlags
-- in app/(admin)/admin/flagged/actions.ts).
--
-- A moderation_event is "resolved" once resolved_at is set. A conversation is
-- resolved when all its events are; a NEW flag inserted later lands unresolved
-- (resolved_at null), so it re-surfaces on the dashboard automatically.
--
-- Writes stay service-role only (matching every other table here) — the resolve
-- action does its own is-admin check, so no client UPDATE policy is added.

alter table public.moderation_events
  add column resolved_at timestamptz,
  add column resolved_by uuid references public.profiles (id) on delete set null;

-- The dashboard filters on unresolved events; index the open ones.
create index moderation_events_unresolved_idx
  on public.moderation_events (created_at)
  where resolved_at is null;
