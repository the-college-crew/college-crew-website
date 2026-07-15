-- Phase 8 rollout security cleanup.
--
-- The original public rating views intentionally bypassed RLS so they could
-- join reviews to the private bookings table. Snapshot the two public booking
-- dimensions onto reviews instead, then make both views security-invoker. This
-- removes the advisor errors without granting public access to booking rows,
-- addresses, customer ids, or financial fields.

alter table public.reviews
  add column provider_id uuid references public.provider_profiles (id),
  add column service_id uuid references public.services (id);

update public.reviews r
set
  provider_id = b.provider_id,
  service_id = b.service_id
from public.bookings b
where b.id = r.booking_id;

alter table public.reviews
  alter column provider_id set not null,
  alter column service_id set not null;

create index reviews_provider_id_created_at_idx
  on public.reviews (provider_id, created_at desc);

create function private.set_review_public_dimensions()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select b.provider_id, b.service_id
  into new.provider_id, new.service_id
  from public.bookings b
  where b.id = new.booking_id;

  if new.provider_id is null or new.service_id is null then
    raise exception 'REVIEW_BOOKING_NOT_FOUND';
  end if;

  return new;
end;
$$;

revoke all on function private.set_review_public_dimensions()
  from public, anon, authenticated, service_role;

create trigger set_review_public_dimensions
  before insert or update of booking_id on public.reviews
  for each row execute function private.set_review_public_dimensions();

create or replace view public.provider_ratings
with (security_invoker = true) as
  select
    r.provider_id,
    round(avg(r.rating)::numeric, 2) as avg_rating,
    count(*)::int as review_count
  from public.reviews r
  group by r.provider_id;

create or replace view public.provider_reviews
with (security_invoker = true) as
  select
    r.id,
    r.provider_id,
    r.service_id,
    r.rating,
    r.text,
    r.created_at
  from public.reviews r;

-- The views need only public review content. Keep the opaque booking id out of
-- anonymous/authenticated base-table reads and restrict browser inserts to the
-- three user-supplied columns; the trigger derives provider/service ids.
revoke select, insert, update, delete on table public.reviews
  from anon, authenticated;
grant select (id, provider_id, service_id, rating, text, created_at)
  on table public.reviews to anon, authenticated;
grant insert (booking_id, rating, text)
  on table public.reviews to authenticated;

revoke all on table public.provider_ratings, public.provider_reviews
  from anon, authenticated;
grant select on table public.provider_ratings, public.provider_reviews
  to anon, authenticated;

-- Dashboard review gating needs the private booking relationship, but exposing
-- reviews.booking_id to every signed-in user would leak opaque booking IDs.
-- Return only the caller's reviewed booking IDs through a scoped server check.
create function public.get_my_booking_reviews()
returns table (booking_id uuid, review_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select r.booking_id, r.id
  from public.reviews r
  join public.bookings b on b.id = r.booking_id
  where b.customer_id = (select auth.uid());
$$;

revoke all on function public.get_my_booking_reviews()
  from public, anon, authenticated;
grant execute on function public.get_my_booking_reviews()
  to authenticated;

comment on column public.reviews.provider_id is
  'Public provider snapshot derived from the immutable reviewed booking.';
comment on column public.reviews.service_id is
  'Public service snapshot derived from the immutable reviewed booking.';
comment on view public.provider_ratings is
  'Security-invoker aggregate of public review facts; never reads bookings.';
comment on view public.provider_reviews is
  'Security-invoker public review feed; excludes booking and customer identity.';
comment on function public.get_my_booking_reviews() is
  'Returns only the authenticated customer own booking/review identifiers.';
