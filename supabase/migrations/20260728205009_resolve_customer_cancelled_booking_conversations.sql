-- A customer cancellation ends the booking just as a completed job does for
-- messaging purposes: keep history, but resolve the booking-specific chat for
-- both participants and clear it from their active inboxes.
create or replace function public.resolve_conversation_on_booking_completed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conv record;
begin
  if new.status is distinct from old.status
    and (
      new.status = 'completed'
      or (
        new.status = 'cancelled'
        and new.cancelled_by_role = 'customer'
      )
    ) then
    select c.id, c.customer_id, pp.user_id as provider_user_id
      into conv
      from public.conversations c
      join public.provider_profiles pp on pp.id = c.provider_id
      where c.booking_id = new.id;

    if found then
      insert into public.conversation_resolutions (conversation_id, user_id, resolved_at)
      values
        (conv.id, conv.customer_id, now()),
        (conv.id, conv.provider_user_id, now())
      on conflict (conversation_id, user_id) do update set resolved_at = now();
    end if;
  end if;
  return new;
end;
$$;

comment on function public.resolve_conversation_on_booking_completed() is
  'Resolves both participants'' booking chat when a job completes or the customer cancels.';
