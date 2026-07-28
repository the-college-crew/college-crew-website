-- A resolved chat is hidden from a user's inbox, so its historical messages
-- must never remain in their unread total. Stamp the same per-user read
-- marker used by the chat UI whenever a resolution is created or refreshed.
-- SECURITY DEFINER is required for booking completion, which resolves both
-- participants' chats in one trigger even though the booking actor only owns
-- one of those read markers.
create function public.mark_resolved_conversation_read()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.conversation_reads (
    conversation_id,
    user_id,
    last_read_at
  )
  values (
    new.conversation_id,
    new.user_id,
    new.resolved_at
  )
  on conflict (conversation_id, user_id) do update
    set last_read_at = greatest(
      public.conversation_reads.last_read_at,
      excluded.last_read_at
    );
  return new;
end;
$$;

revoke execute on function public.mark_resolved_conversation_read() from public;

create trigger conversation_resolutions_mark_read
  after insert or update of resolved_at on public.conversation_resolutions
  for each row execute function public.mark_resolved_conversation_read();

-- Repair resolutions created before the trigger existed. Never move an
-- already-newer read marker backwards.
insert into public.conversation_reads (
  conversation_id,
  user_id,
  last_read_at
)
select
  resolution.conversation_id,
  resolution.user_id,
  resolution.resolved_at
from public.conversation_resolutions as resolution
on conflict (conversation_id, user_id) do update
  set last_read_at = greatest(
    public.conversation_reads.last_read_at,
    excluded.last_read_at
  );

-- The badge is derived from this RPC in both web and mobile clients. Exclude
-- resolved threads as a defense-in-depth guarantee: a hidden chat cannot
-- contribute unread messages even if an old marker predates its resolution.
create or replace function public.unread_message_summary()
returns table (conversation_id uuid, unread_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.conversation_id, count(*) as unread_count
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  left join public.conversation_reads r
    on r.conversation_id = m.conversation_id
   and r.user_id = auth.uid()
  where public.is_conversation_member(c.id)
    and m.sender_id <> auth.uid()
    and m.created_at > coalesce(r.last_read_at, 'epoch'::timestamptz)
    and not exists (
      select 1
      from public.conversation_resolutions resolution
      where resolution.conversation_id = m.conversation_id
        and resolution.user_id = auth.uid()
    )
  group by m.conversation_id;
$$;
