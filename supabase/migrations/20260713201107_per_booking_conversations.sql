-- Per-booking conversations.
--
-- Before: one thread per customer+provider pair. A customer's second booking
-- with the same provider reused the first booking's thread, so notes from
-- different jobs interleaved and a declined booking card quoted whatever the
-- provider had said last — about any booking. A thread is now about one booking.
--
-- Booking-less "inquiry" threads still exist (the Message button on a public
-- profile): at most one per pair, and the customer's next booking request with
-- that provider claims it, so a pre-booking chat and the job it led to stay
-- together. Every booking after that opens its own thread.

-- Pilot test-data reset. The old rows can't be split into per-booking threads —
-- nothing records which booking a past message was about — so messaging starts
-- over. Cascades to messages, conversation_reads, and the moderation_events
-- hanging off those messages (i.e. the admin flagged list starts empty too).
truncate table public.conversations cascade;

alter table public.conversations
  drop constraint conversations_customer_id_provider_id_key;

-- A thread is about a booking, so it dies with the booking (account deletion
-- hard-deletes bookings; it must not leave orphaned threads behind).
alter table public.conversations
  drop constraint conversations_booking_id_fkey,
  add constraint conversations_booking_id_fkey
    foreign key (booking_id) references public.bookings (id) on delete cascade;

-- Replaces the plain lookup index: one thread per booking...
drop index if exists public.conversations_booking_id_idx;

create unique index conversations_booking_id_key
  on public.conversations (booking_id)
  where booking_id is not null;

-- ...and at most one unclaimed inquiry thread per customer+provider pair.
create unique index conversations_inquiry_key
  on public.conversations (customer_id, provider_id)
  where booking_id is null;

-- A thread may only be attached to a booking between the same two parties, so a
-- member can't hang their thread off someone else's booking.
drop policy "Members open conversations" on public.conversations;

create policy "Members open conversations"
  on public.conversations for insert to authenticated
  with check (
    (customer_id = auth.uid() or public.owns_provider_profile(provider_id))
    and (
      booking_id is null
      or exists (
        select 1
        from public.bookings b
        where b.id = booking_id
          and b.customer_id = conversations.customer_id
          and b.provider_id = conversations.provider_id
      )
    )
  );

-- Adoption. Claiming is the ONLY update anyone may make to a conversation, so
-- there is no client UPDATE policy — this function is the entire write path, and
-- it can only ever move booking_id from null to a booking the caller is party to
-- between the same two people. The single conditional UPDATE also makes the race
-- safe: if two requests try to claim the same inquiry thread, one wins and the
-- other gets null back and opens its own thread.
create function public.claim_conversation_for_booking(target_booking_id uuid)
returns uuid
language sql
security definer
set search_path = ''
as $$
  update public.conversations c
     set booking_id = target_booking_id
    from public.bookings b
   where b.id = target_booking_id
     and c.customer_id = b.customer_id
     and c.provider_id = b.provider_id
     and c.booking_id is null
     and (
       b.customer_id = auth.uid()
       or public.owns_provider_profile(b.provider_id)
     )
  returning c.id;
$$;

grant execute on function public.claim_conversation_for_booking(uuid) to authenticated;
