begin;

select no_plan();

create function pg_temp.throws_any_ok(statement text, description text)
returns text
language sql
as $$
  select throws_ok(statement, null, null, description);
$$;

select is(
  has_table_privilege('authenticated', 'public.bookings', 'insert'),
  false,
  'authenticated users cannot insert bookings directly'
);
select is(
  has_table_privilege('authenticated', 'public.bookings', 'update'),
  false,
  'authenticated users cannot update bookings directly'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.create_hourly_booking_request(uuid,timestamptz,integer,integer,text,text,text,text,text,double precision,double precision)',
    'execute'
  ),
  true,
  'authenticated customers can execute trusted request creation'
);
select is(
  has_function_privilege(
    'anon',
    'public.create_hourly_booking_request(uuid,timestamptz,integer,integer,text,text,text,text,text,double precision,double precision)',
    'execute'
  ),
  false,
  'anonymous users cannot execute request creation'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.rank_hourly_provider_ids(text,text)',
    'execute'
  ),
  false,
  'browser roles cannot probe private ZIP ranking'
);
select is(
  has_function_privilege(
    'service_role',
    'public.rank_hourly_provider_ids(text,text)',
    'execute'
  ),
  true,
  'server role can request private ZIP ranking IDs'
);

insert into auth.users (
  id, email, email_confirmed_at, raw_user_meta_data
)
values
  (
    '10000000-0000-0000-0000-000000001101',
    'phase3-customer@example.test',
    now(),
    '{"role":"customer","full_name":"Phase Three Customer"}'::jsonb
  ),
  (
    '10000000-0000-0000-0000-000000001102',
    'phase3-provider-one@example.test',
    now(),
    '{"role":"provider","full_name":"Provider One Owner"}'::jsonb
  ),
  (
    '10000000-0000-0000-0000-000000001103',
    'phase3-provider-two@example.test',
    now(),
    '{"role":"provider","full_name":"Provider Two Owner"}'::jsonb
  );

insert into public.legal_acceptances (
  user_id, kind, role, version, content_hash, signer_name, snapshot
)
values
  (
    '10000000-0000-0000-0000-000000001101', 'master_agreement',
    'customer', '2026-07-15',
    'c23126dcfbd3b87132b66c7786de09a940edac9270bb5c59e423ce52dca43ed1',
    'Phase Three Customer', '{}'::jsonb
  ),
  (
    '10000000-0000-0000-0000-000000001102', 'master_agreement',
    'provider', '2026-07-15',
    'e89347ece1acb4359f73bc6d368bdef77775b7aac84da6e463430f17f7b745ca',
    'Provider One Owner', '{}'::jsonb
  ),
  (
    '10000000-0000-0000-0000-000000001103', 'master_agreement',
    'provider', '2026-07-15',
    'e89347ece1acb4359f73bc6d368bdef77775b7aac84da6e463430f17f7b745ca',
    'Provider Two Owner', '{}'::jsonb
  );

update public.profiles
set address_line1 = '100 Test Street', city = 'Chicago', state = 'IL', postal_code = '60614'
where id = '10000000-0000-0000-0000-000000001101';

insert into public.provider_profiles (
  id, user_id, display_name, bio, verification_status, stripe_account_id,
  service_zip, availability_weekdays, availability_start_local,
  availability_end_local, availability_note, minimum_notice_hours,
  stripe_transfers_active, stripe_transfers_checked_at
)
values
  (
    '10000000-0000-0000-0000-000000001201',
    '10000000-0000-0000-0000-000000001102',
    'Phase Three Provider One', '', 'approved', 'acct_phase3_one', '60614',
    array[0,1,2,3,4,5,6]::smallint[], '09:00', '17:00', '', 3, true, now()
  ),
  (
    '10000000-0000-0000-0000-000000001202',
    '10000000-0000-0000-0000-000000001103',
    'Phase Three Provider Two', '', 'approved', 'acct_phase3_two', '60615',
    array[0,1,2,3,4,5,6]::smallint[], '09:00', '17:00', '', 3, true, now()
  );

insert into public.provider_availability_windows (
  provider_id, weekday, start_local, end_local
)
select provider_id, weekday, '09:00'::time, '17:00'::time
from (
  values
    ('10000000-0000-0000-0000-000000001201'::uuid),
    ('10000000-0000-0000-0000-000000001202'::uuid)
) providers(provider_id)
cross join generate_series(0, 6) as weekdays(weekday);

insert into public.services (id, name, slug, category, is_live)
values (
  '10000000-0000-0000-0000-000000001301',
  'Phase Three Service', 'phase-three-service', 'Test', true
);

insert into public.provider_services (
  id, provider_id, service_id, price_cents, price_type, unit, hourly_rate_cents
)
values
  (
    '10000000-0000-0000-0000-000000001401',
    '10000000-0000-0000-0000-000000001201',
    '10000000-0000-0000-0000-000000001301',
    0, 'quote', 'per_hour', 5000
  ),
  (
    '10000000-0000-0000-0000-000000001402',
    '10000000-0000-0000-0000-000000001202',
    '10000000-0000-0000-0000-000000001301',
    0, 'quote', 'per_hour', 4500
  );

create function pg_temp.insert_hourly_fixture(
  p_id uuid,
  p_provider_id uuid,
  p_scheduled_at timestamptz,
  p_created_at timestamptz
)
returns void
language sql
as $$
  insert into public.bookings (
    id, customer_id, provider_id, service_id, status, scheduled_at, address,
    details, price_cents, platform_fee_cents, created_at, booking_flow,
    estimated_minutes, job_zip, hourly_rate_cents_snapshot, platform_fee_bps,
    billing_minimum_minutes, billing_increment_minutes,
    cancellation_notice_hours, pilot_timezone, response_window_hours,
    response_alert_at, customer_name_snapshot, provider_display_name_snapshot,
    service_name_snapshot, fee_policy_version, cancellation_policy_version,
    terms_version, customer_authorization_version, policy_snapshot,
    customer_authorization_snapshot
  )
  select
    p_id,
    '10000000-0000-0000-0000-000000001101',
    pp.id,
    ps.service_id,
    'requested',
    p_scheduled_at,
    '100 Test Street, Chicago, IL',
    'Synthetic Phase 3 fixture',
    ps.hourly_rate_cents,
    round(ps.hourly_rate_cents::numeric * 500 / 10000)::integer,
    p_created_at,
    'hourly_v1',
    120,
    '60614',
    ps.hourly_rate_cents,
    500,
    60,
    15,
    12,
    'America/Chicago',
    1,
    p_created_at + interval '1 hour',
    'Phase Three Customer',
    pp.display_name,
    s.name,
    'hourly-v1-500bps',
    'hourly-v1-12h',
    '2026-07-08',
    'hourly-v1-saved-method',
    '{"platform_fee_bps":500,"billing_minimum_minutes":60,"billing_increment_minutes":15,"cancellation_notice_hours":12,"pilot_timezone":"America/Chicago"}'::jsonb,
    '{"version":"hourly-v1-saved-method","scope":"booking_only"}'::jsonb
  from public.provider_profiles pp
  join public.provider_services ps on ps.provider_id = pp.id
  join public.services s on s.id = ps.service_id
  where pp.id = p_provider_id;
$$;

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000001101',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000001101","role":"authenticated"}',
  true
);
set local role authenticated;

select pg_temp.throws_any_ok(
  $$
    insert into public.bookings (
      customer_id, provider_id, service_id, scheduled_at, address,
      price_cents, platform_fee_cents
    ) values (
      '10000000-0000-0000-0000-000000001101',
      '10000000-0000-0000-0000-000000001201',
      '10000000-0000-0000-0000-000000001301',
      now() + interval '1 day', 'Bypass attempt', 1, 0
    )
  $$,
  'direct booking insert is rejected'
);

select lives_ok(
  $$
    select public.create_hourly_booking_request(
      '10000000-0000-0000-0000-000000001401',
      ((current_date + 10)::date + time '10:00') at time zone 'America/Chicago',
      120, 1, '100 Test Street, Chicago, IL', '60614', 'Two-hour test job'
    )
  $$,
  'customer creates a valid hourly request through the trusted RPC'
);

select results_eq(
  $$
    select
      booking_flow::text,
      status::text,
      estimated_minutes::integer,
      hourly_rate_cents_snapshot,
      platform_fee_bps::integer,
      price_cents,
      platform_fee_cents,
      response_window_hours::integer,
      (response_alert_at = created_at + interval '1 hour')
    from public.bookings
    where customer_id = '10000000-0000-0000-0000-000000001101'
      and booking_flow = 'hourly_v1'
    order by created_at
    limit 1
  $$,
  $$ values ('hourly_v1', 'requested', 120, 5000, 500, 5000, 250, 1, true) $$,
  'request snapshots rate, policy, first-hour amount, fee, and response deadline'
);

select results_eq(
  $$
    select terms_version, customer_authorization_version,
      customer_authorization_snapshot ->> 'version'
    from public.bookings
    where customer_id = '10000000-0000-0000-0000-000000001101'
      and booking_flow = 'hourly_v1'
    order by created_at
    limit 1
  $$,
  $$ values (
    '2026-07-15',
    'hourly-v1-saved-method-2026-07-15',
    'hourly-v1-saved-method-2026-07-15'
  ) $$,
  'new request snapshots the published legal and authorization versions'
);

select pg_temp.throws_any_ok(
  $$
    select public.create_hourly_booking_request(
      '10000000-0000-0000-0000-000000001401',
      ((current_date + 10)::date + time '10:00') at time zone 'America/Chicago',
      61, 1, '100 Test Street, Chicago, IL', '60614', ''
    )
  $$,
  'invalid duration is rejected server-side'
);
select pg_temp.throws_any_ok(
  $$
    select public.create_hourly_booking_request(
      '10000000-0000-0000-0000-000000001401',
      ((current_date + 10)::date + time '16:30') at time zone 'America/Chicago',
      60, 1, '100 Test Street, Chicago, IL', '60614', ''
    )
  $$,
  'a slot ending after provider availability is rejected'
);
select pg_temp.throws_any_ok(
  $$
    select public.create_hourly_booking_request(
      '10000000-0000-0000-0000-000000001401',
      now() + interval '4 hours',
      60, 5, '100 Test Street, Chicago, IL', '60614', ''
    )
  $$,
  'a response deadline at or after the scheduled start is rejected'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000001102',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000001102","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$
    select public.accept_booking_request((
      select id from public.bookings
      where customer_id = '10000000-0000-0000-0000-000000001101'
        and provider_id = '10000000-0000-0000-0000-000000001201'
        and booking_flow = 'hourly_v1'
      order by created_at limit 1
    ))
  $$,
  'provider atomically accepts an open hourly request'
);
select results_eq(
  $$
    select status::text, accepted_at is not null,
      initial_payment_due_at = least(accepted_at + interval '12 hours', scheduled_at)
    from public.bookings
    where provider_id = '10000000-0000-0000-0000-000000001201'
      and status = 'accepted'
  $$,
  $$ values ('accepted', true, true) $$,
  'acceptance reserves the request and persists the payment deadline'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000001101',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000001101","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$
    select public.create_hourly_booking_request(
      '10000000-0000-0000-0000-000000001401',
      ((current_date + 10)::date + time '10:30') at time zone 'America/Chicago',
      60, 1, '100 Test Street, Chicago, IL', '60614', 'Conflict request'
    )
  $$,
  'overlapping requests may coexist until one is accepted'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000001102',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000001102","role":"authenticated"}',
  true
);
set local role authenticated;
select pg_temp.throws_any_ok(
  $$
    select public.accept_booking_request((
      select id from public.bookings
      where details = 'Conflict request' and status = 'requested'
    ))
  $$,
  'provider cannot accept a request overlapping a reserved slot'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);
select pg_temp.insert_hourly_fixture(
  '10000000-0000-0000-0000-000000001601',
  '10000000-0000-0000-0000-000000001201',
  ((current_date + 11)::date + time '10:00') at time zone 'America/Chicago',
  now() - interval '2 hours'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000001101',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000001101","role":"authenticated"}',
  true
);
set local role authenticated;

select results_eq(
  $$
    select provider_service_id, provider_id
    from public.hourly_replacement_candidate_ids(
      '10000000-0000-0000-0000-000000001601'
    )
  $$,
  $$ values (
    '10000000-0000-0000-0000-000000001402'::uuid,
    '10000000-0000-0000-0000-000000001202'::uuid
  ) $$,
  'replacement candidates exclude the original and preserve the service and slot'
);
select lives_ok(
  $$
    select public.mark_hourly_response_alert(
      '10000000-0000-0000-0000-000000001601'
    )
  $$,
  'due response alert can be marked'
);
select lives_ok(
  $$
    select public.mark_hourly_response_alert(
      '10000000-0000-0000-0000-000000001601'
    )
  $$,
  'response alert marking is idempotent'
);
select ok(
  (
    select response_alerted_at is not null
    from public.bookings
    where id = '10000000-0000-0000-0000-000000001601'
  ),
  'response alert timestamp is persisted once'
);

select lives_ok(
  $$
    select public.replace_hourly_booking_request(
      '10000000-0000-0000-0000-000000001601',
      '10000000-0000-0000-0000-000000001402',
      1
    )
  $$,
  'replacement atomically withdraws the original and creates a new request'
);
select results_eq(
  $$
    select original.status::text, replacement.status::text,
      original.replaced_by_booking_id = replacement.id,
      replacement.replacement_for_booking_id = original.id
    from public.bookings original
    join public.bookings replacement
      on replacement.replacement_for_booking_id = original.id
    where original.id = '10000000-0000-0000-0000-000000001601'
  $$,
  $$ values ('withdrawn', 'requested', true, true) $$,
  'replacement linkage and terminal original state are consistent'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000001102',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000001102","role":"authenticated"}',
  true
);
set local role authenticated;
select pg_temp.throws_any_ok(
  $$
    select public.accept_booking_request(
      '10000000-0000-0000-0000-000000001601'
    )
  $$,
  'acceptance loses after replacement withdraws the original'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000001101',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000001101","role":"authenticated"}',
  true
);
set local role authenticated;
select lives_ok(
  $$
    select public.cancel_booking_request((
      select id from public.bookings
      where replacement_for_booking_id = '10000000-0000-0000-0000-000000001601'
    ))
  $$,
  'customer can cancel the unpaid replacement request'
);
select results_eq(
  $$
    select status::text, cancellation_policy_result
    from public.bookings
    where replacement_for_booking_id = '10000000-0000-0000-0000-000000001601'
  $$,
  $$ values ('cancelled', 'no_payment') $$,
  'unpaid hourly cancellation records no-payment policy metadata'
);

reset role;
select pg_temp.insert_hourly_fixture(
  '10000000-0000-0000-0000-000000001602',
  '10000000-0000-0000-0000-000000001202',
  now() - interval '1 minute',
  now() - interval '2 hours'
);
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000001101',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000001101","role":"authenticated"}',
  true
);
set local role authenticated;
select lives_ok(
  $$
    select public.expire_hourly_booking_request(
      '10000000-0000-0000-0000-000000001602'
    )
  $$,
  'customer can reconcile a due request to expired'
);
select results_eq(
  $$
    select status::text, expired_at is not null
    from public.bookings
    where id = '10000000-0000-0000-0000-000000001602'
  $$,
  $$ values ('expired', true) $$,
  'start-time expiry is terminal and timestamped'
);

reset role;
set local role service_role;
select results_eq(
  $$
    select provider_id
    from public.rank_hourly_provider_ids('60615', 'phase-three-service')
    limit 1
  $$,
  $$ values ('10000000-0000-0000-0000-000000001202'::uuid) $$,
  'location ranking puts the exact private service ZIP first without returning it'
);

reset role;
select * from finish();
rollback;
