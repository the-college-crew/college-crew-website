-- Profile-text moderation: provider bios and display names are scanned for
-- inappropriate content, slander, and off-platform contact info.
--
-- FLAG-ONLY, exactly like chat (SPEC §7): the text is never blocked, rewritten,
-- or hidden. A flagged bio saves and goes live; we log it and email the founders,
-- who review it on /admin/flagged and edit or clear it with the existing admin
-- inline editor.
--
-- Two changes here.
--
-- 1) display_name and bio stop being client-writable.
--    The browser holds the anon key, and the RLS policy "providers update their
--    own profile" lets a provider write their own row. So the column-level UPDATE
--    grant on these two fields lets a provider skip the Server Action entirely —
--    open the console, call supabase.from("provider_profiles").update({ bio }) —
--    and with no server code in the path, THE SCAN NEVER RUNS and no flag is ever
--    recorded. Revoking the grant makes the screened Server Action (service-role)
--    the only write path, so every bio edit is seen. This mirrors chat, where
--    `messages` has no client INSERT policy at all and moderate-message is
--    therefore unbypassable.
--
--    Everything else on the row stays client-writable exactly as before:
--    provider_type, neighborhood, availability, and the two id_document columns
--    (onboarding's license upload writes those with the user's client). INSERT is
--    untouched — onboarding still creates the row with display_name copied from
--    the signed-up full_name.
--
-- 2) profile_moderation_events logs each flag for founder review. It mirrors
--    moderation_events: service-role writes (no client policy), admin-only reads,
--    resolve by setting resolved_at. It is a separate table rather than a reuse of
--    moderation_events because that table's message_id is NOT NULL with an FK to
--    messages — a bio has no message.

-- ---------------------------------------------------------------------------
-- 1) Route the two scanned columns through server code only.
-- ---------------------------------------------------------------------------

revoke update on table public.provider_profiles from anon, authenticated;
grant update (provider_type, neighborhood, availability, id_document_url, id_document_back_url)
  on table public.provider_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Flag log.
-- ---------------------------------------------------------------------------

create table public.profile_moderation_events (
  id               uuid primary key default gen_random_uuid(),
  provider_id      uuid not null references public.provider_profiles (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  -- Which field tripped the scan.
  field            text not null,
  -- The flagged text as submitted. It IS live on the profile (flag-only), but
  -- the provider can edit it again at any time, so this records what the scan
  -- actually saw.
  flagged_text     text not null,
  -- Same tag vocabulary as moderation_events: bare tags come from the regex
  -- layer, `model:*` tags from the gpt-5.4-nano pass.
  matched_patterns text[] not null default '{}',
  resolved_at      timestamptz,
  resolved_by      uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),

  constraint profile_moderation_events_field_valid check (
    field in ('display_name', 'bio')
  )
);

create index profile_moderation_events_provider_id_idx
  on public.profile_moderation_events (provider_id);

-- The dashboard lists open flags only; index those.
create index profile_moderation_events_unresolved_idx
  on public.profile_moderation_events (created_at)
  where resolved_at is null;

alter table public.profile_moderation_events enable row level security;

-- Founders only. No INSERT/UPDATE policy exists: the scan and the resolve action
-- both write with the service-role client after their own authorization check,
-- exactly like moderation_events.
create policy "Admins read profile moderation events"
  on public.profile_moderation_events for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3) Live updates for the admin dashboard (Realtime enforces RLS per subscriber,
--    so only admins ever receive these rows).
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = 'profile_moderation_events'
    ) then
      alter publication supabase_realtime add table public.profile_moderation_events;
    end if;
  end if;
end;
$$;
