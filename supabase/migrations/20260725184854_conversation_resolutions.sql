-- conversation_resolutions: per-user "hide this chat" marker, mirroring the
-- shape of conversation_reads. A row present means the conversation is
-- hidden from that user's inbox — either they hit "Resolve" themselves, or
-- the booking it's tied to completed (both sides get a row in that case).
-- Deleting the row (which a trigger below does automatically whenever the
-- *other* party sends a new message) makes it reappear.

create table public.conversation_resolutions (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  resolved_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.conversation_resolutions enable row level security;

create policy "Read own conversation resolution"
  on public.conversation_resolutions for select
  to authenticated
  using (user_id = auth.uid());

create policy "Insert own conversation resolution"
  on public.conversation_resolutions for insert
  to authenticated
  with check (
    user_id = auth.uid() and public.is_conversation_member(conversation_id)
  );

create policy "Delete own conversation resolution"
  on public.conversation_resolutions for delete
  to authenticated
  using (user_id = auth.uid());

grant select, insert, delete on public.conversation_resolutions to authenticated;

-- Un-hides a conversation for whoever isn't the sender, whenever a new
-- message lands. Security definer because messages are only ever written by
-- the moderate-message edge function (service role) and the recipient whose
-- row gets deleted is not necessarily the caller.
create function public.clear_resolution_on_new_message()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  delete from public.conversation_resolutions
  where conversation_id = new.conversation_id
    and user_id <> new.sender_id;
  return new;
end;
$$;

create trigger messages_clear_resolution
  after insert on public.messages
  for each row execute function public.clear_resolution_on_new_message();

-- Hides a booking's conversation for both the customer and the provider the
-- moment it completes. Security definer because a customer's own session can
-- update their booking's status but has no write access to the provider's
-- resolution row (and vice versa).
create function public.resolve_conversation_on_booking_completed()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  conv record;
begin
  if new.status is distinct from old.status and new.status = 'completed' then
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

create trigger bookings_resolve_conversation_on_completed
  after update of status on public.bookings
  for each row execute function public.resolve_conversation_on_booking_completed();
