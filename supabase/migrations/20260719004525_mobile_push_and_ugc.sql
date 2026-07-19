-- Mobile push + UGC safety schema (iOS Phase 4, arch A-5).
--
-- Three tables the mobile app needs before its feature build-out:
--   * push_tokens         — one row per registered Expo push token.
--   * moderation_reports  — user-filed reports on a message and/or a user
--                           (App Store UGC requirement); read by founders only.
--   * user_blocks         — directed block pairs (App Store UGC requirement).
--
-- Blocking is enforced server-side with a BEFORE INSERT trigger on messages,
-- because message inserts happen ONLY through the moderate-message Edge
-- Function (service role) — an RLS policy would never see them. The trigger
-- rejects a send when a block exists in either direction between the sender
-- and the conversation counterpart. Blocking gates DELIVERY between two
-- users; it does not inspect content — flag-only moderation is untouched.
--
-- Deliberately deferred (decisions 2026-07-18): conversation-list filtering
-- of blocked pairs (mobile messaging feature work), founder notification +
-- admin queue surfacing for reports (required before App Store submission),
-- and stale push-token cleanup on account switch (the later send-push
-- function, driven by Expo delivery receipts).

-- ---------------------------------------------------------------------------
-- push_tokens
-- ---------------------------------------------------------------------------

create table public.push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  expo_token  text not null unique,
  platform    text not null,
  updated_at  timestamptz not null default now(),

  constraint push_tokens_platform_valid check (platform in ('ios', 'android')),
  -- Expo tokens look like ExponentPushToken[…]; bound the length, never parse.
  constraint push_tokens_expo_token_length check (
    char_length(expo_token) between 10 and 400
  )
);

create index push_tokens_user_id_idx on public.push_tokens (user_id);

create function private.touch_push_token_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger push_tokens_touch_updated_at
before update on public.push_tokens
for each row execute function private.touch_push_token_updated_at();

alter table public.push_tokens enable row level security;

create policy "Users manage their own push tokens"
  on public.push_tokens for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on table public.push_tokens from anon, authenticated;
grant select, insert, update, delete on table public.push_tokens to authenticated;
grant all on table public.push_tokens to service_role;

-- ---------------------------------------------------------------------------
-- moderation_reports
-- ---------------------------------------------------------------------------

create table public.moderation_reports (
  id                uuid primary key default gen_random_uuid(),
  reporter_id       uuid not null references public.profiles (id) on delete cascade,
  message_id        uuid references public.messages (id) on delete set null,
  reported_user_id  uuid references public.profiles (id) on delete set null,
  reason            text not null,
  created_at        timestamptz not null default now(),

  constraint moderation_reports_reason_length check (
    char_length(reason) between 3 and 2000
  ),
  constraint moderation_reports_not_self check (
    reported_user_id is null or reported_user_id <> reporter_id
  )
  -- "At least one target" is enforced in the INSERT policy, not a table
  -- constraint: both FKs are ON DELETE SET NULL, and a table constraint
  -- would make deleting the underlying message/profile fail instead of
  -- leaving a degenerate-but-harmless historical row.
);

create index moderation_reports_reporter_id_idx
  on public.moderation_reports (reporter_id);
create index moderation_reports_message_id_idx
  on public.moderation_reports (message_id);
create index moderation_reports_reported_user_id_idx
  on public.moderation_reports (reported_user_id);
-- Founder review queue reads newest-first.
create index moderation_reports_created_at_idx
  on public.moderation_reports (created_at desc);

alter table public.moderation_reports enable row level security;

-- Anyone signed in can file a report as themselves, with at least one target.
-- A reported message must be one the reporter can actually see (the messages
-- RLS select policy applies inside the subquery, restricting it to their own
-- conversations).
create policy "Users file moderation reports as themselves"
  on public.moderation_reports for insert
  to authenticated
  with check (
    reporter_id = auth.uid()
    and (message_id is not null or reported_user_id is not null)
    and (
      message_id is null
      or exists (
        select 1 from public.messages m where m.id = message_id
      )
    )
  );

create policy "Admins read moderation reports"
  on public.moderation_reports for select
  to authenticated
  using (public.is_admin());

revoke all on table public.moderation_reports from anon, authenticated;
grant select, insert on table public.moderation_reports to authenticated;
grant all on table public.moderation_reports to service_role;

-- ---------------------------------------------------------------------------
-- user_blocks
-- ---------------------------------------------------------------------------

create table public.user_blocks (
  blocker_id  uuid not null references public.profiles (id) on delete cascade,
  blocked_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),

  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

-- The PK covers blocker-side lookups; the reverse direction needs its own.
create index user_blocks_blocked_id_idx on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

create policy "Users read their own blocks"
  on public.user_blocks for select
  to authenticated
  using (blocker_id = auth.uid());

create policy "Users create their own blocks"
  on public.user_blocks for insert
  to authenticated
  with check (blocker_id = auth.uid());

create policy "Users remove their own blocks"
  on public.user_blocks for delete
  to authenticated
  using (blocker_id = auth.uid());

revoke all on table public.user_blocks from anon, authenticated;
grant select, insert, delete on table public.user_blocks to authenticated;
grant all on table public.user_blocks to service_role;

-- ---------------------------------------------------------------------------
-- Block enforcement on message sends
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER: runs under the table owner so it can resolve the
-- conversation counterpart (provider_profiles.user_id has no browser grant)
-- and read user_blocks regardless of who triggered the insert.
create function public.enforce_message_block()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_customer_id    uuid;
  v_provider_user  uuid;
  v_counterpart    uuid;
begin
  select c.customer_id, pp.user_id
    into v_customer_id, v_provider_user
  from public.conversations c
  left join public.provider_profiles pp on pp.id = c.provider_id
  where c.id = new.conversation_id;

  -- Unknown conversation: let the FK produce the real error.
  if v_customer_id is null then
    return new;
  end if;

  v_counterpart := case
    when new.sender_id = v_customer_id then v_provider_user
    else v_customer_id
  end;

  if v_counterpart is not null and exists (
    select 1
    from public.user_blocks b
    where (b.blocker_id = new.sender_id and b.blocked_id = v_counterpart)
       or (b.blocker_id = v_counterpart and b.blocked_id = new.sender_id)
  ) then
    -- Recognizable message so moderate-message can map it to a clean
    -- client-facing error instead of a generic 500.
    raise exception 'blocked_pair';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_message_block()
  from public, anon, authenticated;

create trigger messages_enforce_block
before insert on public.messages
for each row execute function public.enforce_message_block();
