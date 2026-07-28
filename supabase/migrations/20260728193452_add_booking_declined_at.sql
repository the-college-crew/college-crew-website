-- Keep the exact terminal time for declined requests so customer history can
-- stop surfacing them after its short retention window without deleting the
-- booking, payment, or audit record.
alter table public.bookings
  add column if not exists declined_at timestamptz;

-- Older rows predate this timestamp. Their creation time is the only durable
-- approximation, and makes already-stale declined requests leave the customer
-- dashboard as soon as this migration is deployed.
update public.bookings
set declined_at = created_at
where status = 'declined'
  and declined_at is null;

comment on column public.bookings.declined_at is
  'Time a booking request entered the declined state. Used for customer-dashboard retention.';

create or replace function private.set_booking_declined_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'declined' and old.status is distinct from 'declined' then
    new.declined_at = statement_timestamp();
  elsif new.declined_at is distinct from old.declined_at then
    raise exception 'declined_at is managed by booking status transitions';
  end if;
  return new;
end;
$$;

revoke execute on function private.set_booking_declined_at()
  from public, anon, authenticated;

create trigger booking_set_declined_at
  before update on public.bookings
  for each row execute function private.set_booking_declined_at();
