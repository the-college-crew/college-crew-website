begin;

set local lock_timeout = '10s';
set local statement_timeout = '2min';

-- Permanently remove the founder-switchable bypass. Several booking functions
-- deployed during end-to-end testing call this helper, so leave a non-toggleable
-- compatibility implementation returning false; every normal notice, response,
-- en-route, arrival, and quote-payment deadline is therefore enforced.
create or replace function private.booking_time_restrictions_disabled()
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select false;
$$;

comment on function private.booking_time_restrictions_disabled() is
  'Permanent compatibility shim. Always false; production booking timing restrictions cannot be disabled.';

revoke all on function private.booking_time_restrictions_disabled()
  from public, anon, authenticated, service_role;

delete from public.site_content
where key = 'booking.test-time-restrictions-disabled';

drop function if exists public.fast_forward_booking_for_testing(uuid);
drop function if exists public.mark_booking_arrived_for_testing(uuid);

commit;
