begin;

select no_plan();

create function pg_temp.throws_any_ok(statement text, description text)
returns text
language sql
as $$
  select throws_ok(statement, null, null, description);
$$;

select is(
  has_table_privilege(
    'authenticated',
    'private.current_legal_acceptance_contract',
    'select'
  ),
  false,
  'browser roles cannot read the exact legal acceptance contract table'
);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  (
    '80000000-0000-0000-0000-000000008101',
    'p8-legal-customer@example.test', now(),
    '{"role":"customer","full_name":"Phase Eight Customer"}'::jsonb
  ),
  (
    '80000000-0000-0000-0000-000000008102',
    'p8-legal-provider@example.test', now(),
    '{"role":"provider","full_name":"Phase Eight Provider Owner"}'::jsonb
  );

update public.profiles
set address_line1 = '800 Test Street', city = 'Chicago', state = 'IL',
  postal_code = '60614'
where id = '80000000-0000-0000-0000-000000008101';

insert into public.provider_profiles (
  id, user_id, display_name, bio, verification_status, stripe_account_id,
  service_zip, availability_weekdays, availability_start_local,
  availability_end_local, availability_note, minimum_notice_hours,
  stripe_transfers_active, stripe_transfers_checked_at
)
values (
  '80000000-0000-0000-0000-000000008201',
  '80000000-0000-0000-0000-000000008102',
  'Phase Eight Provider', '', 'approved', 'acct_phase8_legal', '60614',
  array[0,1,2,3,4,5,6]::smallint[], '09:00', '17:00', '', 3, true, now()
);

insert into public.services (id, name, slug, category, is_live)
values (
  '80000000-0000-0000-0000-000000008301',
  'Phase Eight Legal Service', 'phase-eight-legal-service', 'Test', true
);

insert into public.provider_services (
  id, provider_id, service_id, price_cents, price_type, unit,
  hourly_rate_cents
)
values (
  '80000000-0000-0000-0000-000000008401',
  '80000000-0000-0000-0000-000000008201',
  '80000000-0000-0000-0000-000000008301',
  0, 'quote', 'per_hour', 5000
);

select is(
  public.is_provider_offering_hourly_bookable(
    '80000000-0000-0000-0000-000000008401'
  ),
  false,
  'an otherwise-ready provider is not public-bookable without current acceptance'
);

insert into public.legal_acceptances (
  user_id, kind, role, version, content_hash, signer_name, snapshot
)
values (
  '80000000-0000-0000-0000-000000008102', 'master_agreement',
  'provider', '2026-07-15', repeat('0', 64),
  'Phase Eight Provider Owner', '{}'::jsonb
);

select is(
  public.is_provider_offering_hourly_bookable(
    '80000000-0000-0000-0000-000000008401'
  ),
  false,
  'a forged provider acceptance hash does not satisfy readiness'
);

delete from public.legal_acceptances
where user_id = '80000000-0000-0000-0000-000000008102';

insert into public.legal_acceptances (
  user_id, kind, role, version, content_hash, signer_name, snapshot
)
values (
  '80000000-0000-0000-0000-000000008102', 'master_agreement',
  'provider', '2026-07-15',
  'e89347ece1acb4359f73bc6d368bdef77775b7aac84da6e463430f17f7b745ca',
  'Phase Eight Provider Owner', '{}'::jsonb
);

select is(
  public.is_provider_offering_hourly_bookable(
    '80000000-0000-0000-0000-000000008401'
  ),
  true,
  'the exact current provider acceptance restores public readiness'
);

insert into public.legal_acceptances (
  user_id, kind, role, version, content_hash, signer_name, snapshot
)
values (
  '80000000-0000-0000-0000-000000008101', 'master_agreement',
  'customer', '2026-07-15', repeat('0', 64),
  'Phase Eight Customer', '{}'::jsonb
);

select set_config(
  'request.jwt.claim.sub',
  '80000000-0000-0000-0000-000000008101',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"80000000-0000-0000-0000-000000008101","role":"authenticated"}',
  true
);
set local role authenticated;

select pg_temp.throws_any_ok(
  $$
    select public.create_hourly_booking_request(
      '80000000-0000-0000-0000-000000008401',
      ((current_date + 10)::date + time '10:00')
        at time zone 'America/Chicago',
      120, 1, '800 Test Street, Chicago, IL', '60614', 'Legal gate test'
    )
  $$,
  'a forged customer acceptance hash cannot create an hourly request'
);

reset role;
delete from public.legal_acceptances
where user_id = '80000000-0000-0000-0000-000000008101';
insert into public.legal_acceptances (
  user_id, kind, role, version, content_hash, signer_name, snapshot
)
values (
  '80000000-0000-0000-0000-000000008101', 'master_agreement',
  'customer', '2026-07-15',
  'c23126dcfbd3b87132b66c7786de09a940edac9270bb5c59e423ce52dca43ed1',
  'Phase Eight Customer', '{}'::jsonb
);
set local role authenticated;

select lives_ok(
  $$
    select public.create_hourly_booking_request(
      '80000000-0000-0000-0000-000000008401',
      ((current_date + 10)::date + time '10:00')
        at time zone 'America/Chicago',
      120, 1, '800 Test Street, Chicago, IL', '60614', 'Legal gate test'
    )
  $$,
  'an exact current customer acceptance can create an hourly request'
);

reset role;
select results_eq(
  $$
    select terms_version, customer_authorization_version,
      customer_authorization_snapshot ->> 'version'
    from public.bookings
    where customer_id = '80000000-0000-0000-0000-000000008101'
  $$,
  $$ values (
    '2026-07-15',
    'hourly-v1-saved-method-2026-07-15',
    'hourly-v1-saved-method-2026-07-15'
  ) $$,
  'new hourly requests snapshot the published legal contract'
);

select * from finish();
rollback;
