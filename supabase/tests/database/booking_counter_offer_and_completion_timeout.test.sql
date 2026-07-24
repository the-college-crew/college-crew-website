begin;

select no_plan();

-- Contract-level only: no rows are written. Dev and prod share one Supabase
-- project, so these assert privileges/enums/constraints rather than seeding
-- synthetic bookings that could leak into live data.

-- ---------------------------------------------------------------------------
-- Time-flexibility + counter-offer surface
-- ---------------------------------------------------------------------------

select is(
  exists (
    select 1 from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'booking_time_flexibility' and e.enumlabel = 'flexible'
  ),
  true,
  'booking_time_flexibility exposes the flexible label'
);
select is(
  exists (
    select 1 from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'booking_status' and e.enumlabel = 'countered'
  ),
  true,
  'booking_status gained the countered state'
);
select is(
  (
    select column_default
    from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings'
      and column_name = 'time_flexibility'
  ),
  '''fixed''::booking_time_flexibility',
  'bookings default to fixed-time so a counter is opt-in, never assumed'
);

select is(
  has_function_privilege(
    'authenticated', 'public.counter_hourly_booking_request(uuid,timestamptz,text)', 'execute'
  ),
  true,
  'a signed-in provider can propose a different time'
);
select is(
  has_function_privilege(
    'anon', 'public.counter_hourly_booking_request(uuid,timestamptz,text)', 'execute'
  ),
  false,
  'anonymous callers cannot propose a different time'
);
select is(
  has_function_privilege(
    'authenticated', 'public.accept_hourly_counter_offer(uuid)', 'execute'
  ),
  true,
  'the customer can accept the proposed time'
);
select is(
  has_function_privilege(
    'anon', 'public.reject_hourly_counter_offer(uuid)', 'execute'
  ),
  false,
  'anonymous callers cannot reject a counter-offer'
);

-- ---------------------------------------------------------------------------
-- Completion timeout
-- ---------------------------------------------------------------------------

select is(
  (
    select pg_get_constraintdef(oid) like '%completion_timeout%'
    from pg_constraint where conname = 'booking_automation_jobs_kind_valid'
  ),
  true,
  'the scheduler accepts the completion_timeout job kind'
);

-- The important security property: auto_complete_hourly_job bills a customer
-- with NO acting provider, so it must never be reachable from a browser session.
select is(
  has_function_privilege('service_role', 'public.auto_complete_hourly_job(uuid)', 'execute'),
  true,
  'the scheduler can auto-complete a stalled job'
);
select is(
  has_function_privilege('authenticated', 'public.auto_complete_hourly_job(uuid)', 'execute'),
  false,
  'signed-in users cannot invoke the actorless auto-complete'
);
select is(
  has_function_privilege('anon', 'public.auto_complete_hourly_job(uuid)', 'execute'),
  false,
  'anonymous callers cannot invoke the actorless auto-complete'
);

select * from finish();
rollback;
