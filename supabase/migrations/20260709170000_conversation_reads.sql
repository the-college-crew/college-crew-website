-- conversation_reads: per-user "last read" marker for each conversation, so the
-- app can show unread-message badges. One row per (conversation, user); a user
-- only ever has a marker for threads they belong to.

create table public.conversation_reads (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.conversation_reads enable row level security;

-- A user manages only their own markers. Writes additionally require thread
-- membership (reuse the existing helper) so a stranger can't seed rows against
-- a conversation they aren't part of.
create policy "Read own conversation read-state"
  on public.conversation_reads for select
  to authenticated
  using (user_id = auth.uid());

create policy "Insert own conversation read-state"
  on public.conversation_reads for insert
  to authenticated
  with check (
    user_id = auth.uid() and public.is_conversation_member(conversation_id)
  );

create policy "Update own conversation read-state"
  on public.conversation_reads for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid() and public.is_conversation_member(conversation_id)
  );

grant select, insert, update on public.conversation_reads to authenticated;

-- Per-conversation unread counts for the signed-in user: messages from the
-- other party that are newer than the caller's last-read marker. Security
-- invoker so message RLS still applies — the caller only ever aggregates over
-- threads they can already read.
create function public.unread_message_summary()
returns table (conversation_id uuid, unread_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.conversation_id, count(*) as unread_count
  from public.messages m
  left join public.conversation_reads r
    on r.conversation_id = m.conversation_id
   and r.user_id = auth.uid()
  where m.sender_id <> auth.uid()
    and m.created_at > coalesce(r.last_read_at, 'epoch'::timestamptz)
  group by m.conversation_id;
$$;

grant execute on function public.unread_message_summary() to authenticated;
