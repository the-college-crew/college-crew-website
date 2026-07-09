-- Repair unread state introduced after conversations and messages already
-- existed. Missing markers previously made every historical incoming message
-- appear unread. Seed each existing participant at the latest activity, then
-- retain the normal unread behavior for messages that arrive afterwards.
insert into public.conversation_reads (
  conversation_id,
  user_id,
  last_read_at
)
select
  participant.conversation_id,
  participant.user_id,
  participant.last_read_at
from (
  select
    c.id as conversation_id,
    c.customer_id as user_id,
    coalesce(max(m.created_at), c.created_at) as last_read_at
  from public.conversations c
  left join public.messages m on m.conversation_id = c.id
  group by c.id, c.customer_id, c.created_at

  union all

  select
    c.id as conversation_id,
    pp.user_id,
    coalesce(max(m.created_at), c.created_at) as last_read_at
  from public.conversations c
  join public.provider_profiles pp on pp.id = c.provider_id
  left join public.messages m on m.conversation_id = c.id
  group by c.id, pp.user_id, c.created_at
) as participant
on conflict (conversation_id, user_id) do nothing;

-- Keep the RPC's result set aligned with the inbox. The explicit membership
-- predicate protects the aggregate even if a future message policy changes.
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
  group by m.conversation_id;
$$;
