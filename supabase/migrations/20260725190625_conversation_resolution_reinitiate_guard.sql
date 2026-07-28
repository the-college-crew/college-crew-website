-- Tightens conversation_resolutions reappearance: a resolved General (booking-
-- less) thread should fully reopen for BOTH parties the moment either one
-- messages again (that's the "message the provider from their profile" path,
-- and it's fine to reinitiate that way). A resolved job-linked thread should
-- only reopen for the RECIPIENT of a new message — the party who resolved it
-- is blocked from sending at all (enforced in the moderate-message edge
-- function), so only the other side messaging first can revive it. Once a
-- completed job auto-resolves both sides, neither can send again — the
-- thread is closed for good, data preserved for admins.
create or replace function public.clear_resolution_on_new_message()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  is_job_linked boolean;
begin
  select booking_id is not null into is_job_linked
    from public.conversations
    where id = new.conversation_id;

  if is_job_linked then
    delete from public.conversation_resolutions
    where conversation_id = new.conversation_id
      and user_id <> new.sender_id;
  else
    delete from public.conversation_resolutions
    where conversation_id = new.conversation_id;
  end if;

  return new;
end;
$$;
