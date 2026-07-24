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

-- ---------------------------------------------------------------------------
-- Held-funds payout model
-- ---------------------------------------------------------------------------

-- Money leaving the platform must never be reachable from a browser session.
select is(
  has_function_privilege('service_role', 'public.provider_payout_plan(uuid)', 'execute'),
  true,
  'the scheduler can compute a payout plan'
);
select is(
  has_function_privilege('authenticated', 'public.provider_payout_plan(uuid)', 'execute'),
  false,
  'signed-in users cannot compute a payout plan'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.record_provider_payout(uuid,uuid,text,integer,text,text,text,text,text)',
    'execute'
  ),
  false,
  'signed-in users cannot record a payout'
);
select is(
  has_table_privilege('authenticated', 'public.booking_provider_payouts', 'select'),
  false,
  'browser users cannot read payout records'
);

select is(
  (
    select pg_get_constraintdef(oid) like '%provider_payout%'
    from pg_constraint where conname = 'booking_automation_jobs_kind_valid'
  ),
  true,
  'the scheduler accepts the provider_payout job kind'
);

-- One transfer per booking+payment: the guard against paying a student twice.
select is(
  (
    select count(*) > 0 from pg_constraint
    where conrelid = 'public.booking_provider_payouts'::regclass
      and contype = 'u'
  ),
  true,
  'payouts are uniquely keyed so a retry cannot pay twice'
);

-- Legacy destination charges were already paid as the transfer leg; the payout
-- plan must ignore them or the student is paid a second time.
select is(
  (
    select count(*)::integer
    from public.booking_payments p
    join public.bookings b on b.id = p.booking_id
    where b.status = 'completed'
      and p.charge_model = 'destination'
      and exists (select 1 from public.provider_payout_plan(b.id))
  ),
  0,
  'completed destination-charge bookings never produce a payout leg'
);

select * from finish();
rollback;
