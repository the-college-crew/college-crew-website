begin;

select no_plan();

create function pg_temp.throws_any_ok(statement text, description text)
returns text
language sql
as $$
  select throws_ok(statement, null, null, description);
$$;

-- ---------------------------------------------------------------------------
-- Schema, RLS, and privilege contracts
-- ---------------------------------------------------------------------------

select is(
  (
    select count(*)::integer
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any (array[
        'booking_invoices',
        'booking_payments',
        'booking_refunds',
        'booking_disputes',
        'booking_audit_events',
        'stripe_webhook_receipts',
        'email_outbox'
      ])
      and c.relkind = 'r'
  ),
  7,
  'all Phase 1 operational tables exist'
);

select is(
  (
    select count(*)::integer
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any (array[
        'booking_invoices',
        'booking_payments',
        'booking_refunds',
        'booking_disputes',
        'booking_audit_events',
        'stripe_webhook_receipts',
        'email_outbox'
      ])
      and c.relrowsecurity
  ),
  7,
  'RLS is enabled on every new public table'
);

select is(
  (
    select array_agg(e.enumlabel::text order by e.enumsortorder)
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'booking_status'
  ),
  array[
    'requested', 'accepted', 'booked', 'in_progress', 'invoice_review',
    'disputed', 'paid', 'completed', 'declined', 'withdrawn', 'expired',
    'cancelled'
  ]::text[],
  'target lifecycle is present while legacy paid remains compatible'
);

select is(
  has_table_privilege('anon', 'public.booking_payments', 'select'),
  false,
  'anon cannot read normalized payment records'
);
select is(
  has_table_privilege('authenticated', 'public.booking_payments', 'insert'),
  false,
  'authenticated cannot insert payment records'
);
select is(
  has_table_privilege('authenticated', 'public.booking_refunds', 'insert'),
  false,
  'authenticated cannot insert refund records'
);
select is(
  has_table_privilege('authenticated', 'public.booking_invoices', 'update'),
  false,
  'authenticated cannot resolve or mutate invoices directly'
);
select is(
  has_table_privilege('service_role', 'public.booking_payments', 'insert'),
  true,
  'service role can perform trusted payment writes'
);

select is(
  has_column_privilege('anon', 'public.provider_profiles', 'service_zip', 'select'),
  false,
  'private service ZIP is not browser-readable'
);
select is(
  has_column_privilege('anon', 'public.provider_profiles', 'stripe_account_id', 'select'),
  false,
  'Stripe account id is not browser-readable'
);
select is(
  has_column_privilege('anon', 'public.provider_profiles', 'id_document_url', 'select'),
  false,
  'identity document paths are not browser-readable'
);
select is(
  has_column_privilege('anon', 'public.provider_profiles', 'verification_status', 'select'),
  false,
  'internal verification status is not in the public base-row shape'
);
select is(
  has_column_privilege('authenticated', 'public.provider_profiles', 'display_name', 'select'),
  true,
  'safe provider display data remains readable'
);
select is(
  has_column_privilege(
    'anon',
    'public.provider_profiles',
    'minimum_notice_hours',
    'select'
  ),
  true,
  'public minimum notice is browser-readable'
);
select is(
  has_column_privilege(
    'anon',
    'public.provider_profiles',
    'avatar_image_path',
    'select'
  ),
  true,
  'public provider avatar paths are browser-readable'
);
select is(
  has_column_privilege(
    'anon',
    'public.provider_profiles',
    'banner_image_path',
    'select'
  ),
  true,
  'public provider banner paths are browser-readable'
);
select is(
  has_column_privilege(
    'anon',
    'public.provider_profiles',
    'banner_style',
    'select'
  ),
  true,
  'public provider banner themes are browser-readable'
);
select is(
  has_column_privilege(
    'anon',
    'public.provider_profiles',
    'stripe_transfers_active',
    'select'
  ),
  false,
  'private payout readiness inputs remain hidden'
);
select is(
  has_column_privilege(
    'authenticated',
    'public.provider_services',
    'hourly_rate_cents',
    'update'
  ),
  true,
  'providers can configure hourly rates in Phase 2'
);
select is(
  has_function_privilege(
    'anon',
    'public.claim_conversation_for_booking(uuid)',
    'execute'
  ),
  false,
  'anon cannot execute the per-booking SECURITY DEFINER claim function'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.claim_conversation_for_booking(uuid)',
    'execute'
  ),
  true,
  'authenticated booking participants retain Ari''s conversation claim RPC'
);

select is(
  (
    select array_agg(column_name::text order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'public_provider_directory'
  ),
  array[
    'provider_id', 'display_name', 'bio', 'provider_type', 'neighborhood',
    'availability', 'availability_weekdays', 'availability_start_local',
    'availability_end_local', 'availability_note', 'created_at',
    'minimum_notice_hours', 'company_name', 'avatar_image_path',
    'banner_image_path', 'banner_style'
  ]::text[],
  'public provider directory exposes only its approved safe contract'
);

select is(
  (
    select array_agg(column_name::text order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'public_provider_offerings'
  ),
  array[
    'provider_service_id', 'provider_id', 'service_id', 'price_cents',
    'price_type', 'unit', 'preview_image_path', 'hourly_rate_cents',
    'service_name', 'service_slug', 'service_category', 'service_is_live',
    'is_hourly_bookable'
  ]::text[],
  'public offering view adds only the derived readiness fact'
);

-- ---------------------------------------------------------------------------
-- Deterministic fixtures (all rolled back)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '00000000-0000-0000-0000-000000000101',
    'phase1-customer@example.test',
    '{"role":"customer","full_name":"Test Customer"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000102',
    'phase1-provider@example.test',
    '{"role":"provider","full_name":"Test Provider"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000103',
    'phase1-other@example.test',
    '{"role":"customer","full_name":"Other Customer"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000104',
    'phase1-pending@example.test',
    '{"role":"provider","full_name":"Pending Provider"}'::jsonb
  );

insert into public.provider_profiles (
  id,
  user_id,
  display_name,
  bio,
  avatar_image_path,
  verification_status,
  id_document_url,
  id_document_back_url,
  stripe_account_id,
  service_zip,
  availability_weekdays,
  availability_start_local,
  availability_end_local,
  availability_note,
  minimum_notice_hours,
  stripe_transfers_active,
  stripe_transfers_checked_at
)
values
  (
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000102',
    'Approved Provider',
    'Safe public bio',
    '00000000-0000-0000-0000-000000000102/avatar.jpg',
    'approved',
    'private/front.jpg',
    'private/back.jpg',
    'acct_phase1_private',
    '60614',
    array[0, 2, 4]::smallint[],
    '09:00',
    '17:00',
    'Weekday daytime availability',
    24,
    true,
    '2026-07-13T12:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000202',
    '00000000-0000-0000-0000-000000000104',
    'Pending Provider',
    'Not public yet',
    null,
    'pending',
    null,
    null,
    null,
    '60614',
    array[1]::smallint[],
    '09:00',
    '17:00',
    '',
    24,
    false,
    null
  );

insert into public.services (id, name, slug, category, is_live)
values
  (
    '00000000-0000-0000-0000-000000000301',
    'Phase 1 Service',
    'phase-1-service',
    'Test',
    true
  ),
  (
    '00000000-0000-0000-0000-000000000302',
    'Phase 2 Offering Test',
    'phase-2-offering-test',
    'Test',
    true
  );

insert into public.provider_services (
  id, provider_id, service_id, price_cents, price_type, unit, hourly_rate_cents
)
values
  (
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000301',
    5000,
    'fixed',
    'per_hour',
    5000
  ),
  (
    '00000000-0000-0000-0000-000000000402',
    '00000000-0000-0000-0000-000000000202',
    '00000000-0000-0000-0000-000000000301',
    0,
    'quote',
    'per_hour',
    null
  );

select is(
  public.is_provider_offering_hourly_bookable(
    '00000000-0000-0000-0000-000000000401'
  ),
  true,
  'derived public readiness is true only for the complete approved offering'
);
select is(
  public.is_provider_offering_hourly_bookable(
    '00000000-0000-0000-0000-000000000402'
  ),
  false,
  'pending provider and missing rate remain unbookable'
);

select pg_temp.throws_any_ok(
  $$
    update public.provider_profiles
    set availability_weekdays = array[0, 0]::smallint[]
    where id = '00000000-0000-0000-0000-000000000201'
  $$,
  'duplicate availability weekdays are rejected'
);
select pg_temp.throws_any_ok(
  $$
    update public.provider_profiles
    set minimum_notice_hours = 2
    where id = '00000000-0000-0000-0000-000000000201'
  $$,
  'minimum notice below three hours is rejected'
);
select pg_temp.throws_any_ok(
  $$
    update public.provider_services
    set hourly_rate_cents = 1999
    where id = '00000000-0000-0000-0000-000000000401'
  $$,
  'hourly rate below $20 is rejected'
);
select pg_temp.throws_any_ok(
  $$
    update public.provider_services
    set hourly_rate_cents = 15001
    where id = '00000000-0000-0000-0000-000000000401'
  $$,
  'hourly rate above $150 is rejected'
);

select lives_ok(
  $$
    insert into public.bookings (
      id, customer_id, provider_id, service_id, booking_flow, status,
      scheduled_at, address, details, price_cents, platform_fee_cents,
      created_at, estimated_minutes, job_zip, hourly_rate_cents_snapshot,
      platform_fee_bps, billing_minimum_minutes, billing_increment_minutes,
      cancellation_notice_hours, pilot_timezone, response_window_hours,
      response_alert_at, customer_name_snapshot,
      provider_display_name_snapshot, service_name_snapshot,
      fee_policy_version, cancellation_policy_version, terms_version,
      customer_authorization_version, policy_snapshot,
      customer_authorization_snapshot
    ) values (
      '00000000-0000-0000-0000-000000000501',
      '00000000-0000-0000-0000-000000000101',
      '00000000-0000-0000-0000-000000000201',
      '00000000-0000-0000-0000-000000000301',
      'hourly_v1', 'requested', '2026-07-15T18:00:00Z',
      '123 Private Address', 'Test details', 5000, 250,
      '2026-07-13T12:00:00Z', 90, '60614', 5000, 500, 60, 15, 12,
      'America/Chicago', 3, '2026-07-13T15:00:00Z',
      'Test Customer', 'Approved Provider', 'Phase 1 Service',
      'hourly-v1-500bps', 'hourly-v1-12h', '2026-07-08',
      'hourly-v1-saved-method', '{"fee_bps":500}'::jsonb,
      '{"saved_method":true}'::jsonb
    )
  $$,
  'a complete hourly booking contract can be inserted by a trusted caller'
);

select pg_temp.throws_any_ok(
  $$
    insert into public.bookings (
      id, customer_id, provider_id, service_id, booking_flow, scheduled_at,
      address, price_cents, platform_fee_cents
    ) values (
      '00000000-0000-0000-0000-000000000511',
      '00000000-0000-0000-0000-000000000101',
      '00000000-0000-0000-0000-000000000201',
      '00000000-0000-0000-0000-000000000301',
      'hourly_v1', '2026-07-15T18:00:00Z', '123 Private Address', 5000, 250
    )
  $$,
  'hourly bookings cannot omit immutable pricing and policy snapshots'
);

select pg_temp.throws_any_ok(
  $$
    insert into public.bookings (
      id, customer_id, provider_id, service_id, booking_flow, status,
      scheduled_at, address, price_cents, platform_fee_cents, created_at,
      estimated_minutes, job_zip, hourly_rate_cents_snapshot, platform_fee_bps,
      billing_minimum_minutes, billing_increment_minutes,
      cancellation_notice_hours, response_window_hours, response_alert_at,
      customer_name_snapshot, provider_display_name_snapshot,
      service_name_snapshot, fee_policy_version, cancellation_policy_version,
      terms_version, customer_authorization_version, policy_snapshot,
      customer_authorization_snapshot
    ) values (
      '00000000-0000-0000-0000-000000000512',
      '00000000-0000-0000-0000-000000000101',
      '00000000-0000-0000-0000-000000000201',
      '00000000-0000-0000-0000-000000000301',
      'hourly_v1', 'requested', '2026-07-15T18:00:00Z',
      '123 Private Address', 5000, 250, '2026-07-13T12:00:00Z',
      90, '60614', 5000, 500, 60, 15, 12, 3,
      '2026-07-13T16:00:00Z', 'Test Customer', 'Approved Provider',
      'Phase 1 Service', 'hourly-v1-500bps', 'hourly-v1-12h',
      '2026-07-08', 'hourly-v1-saved-method', '{}'::jsonb, '{}'::jsonb
    )
  $$,
  'response deadline must equal request time plus the selected window'
);

select pg_temp.throws_any_ok(
  $$
    update public.bookings
    set policy_snapshot = '[500]'::jsonb
    where id = '00000000-0000-0000-0000-000000000501'
  $$,
  'policy snapshots must be JSON objects and are immutable'
);

select pg_temp.throws_any_ok(
  $$
    update public.bookings
    set hourly_rate_cents_snapshot = 6000
    where id = '00000000-0000-0000-0000-000000000501'
  $$,
  'booking pricing snapshots are immutable'
);

select pg_temp.throws_any_ok(
  $$
    update public.bookings
    set status = 'booked'
    where id = '00000000-0000-0000-0000-000000000501'
  $$,
  'hourly requested cannot skip acceptance and initial payment'
);

select lives_ok(
  $$
    update public.bookings
    set
      status = 'accepted',
      accepted_at = '2026-07-13T13:00:00Z',
      initial_payment_due_at = '2026-07-14T01:00:00Z'
    where id = '00000000-0000-0000-0000-000000000501'
      and status = 'requested'
  $$,
  'hourly requested to accepted is a legal compare-and-set edge'
);

select pg_temp.throws_any_ok(
  $$
    update public.bookings
    set status = 'completed'
    where id = '00000000-0000-0000-0000-000000000501'
  $$,
  'hourly accepted cannot skip payment and work states'
);

select lives_ok(
  $$
    update public.bookings
    set status = 'booked'
    where id = '00000000-0000-0000-0000-000000000501'
      and status = 'accepted'
  $$,
  'hourly accepted to booked is legal after trusted payment processing'
);

select pg_temp.throws_any_ok(
  $$
    update public.bookings
    set status = 'completed'
    where id = '00000000-0000-0000-0000-000000000501'
  $$,
  'hourly booked cannot skip arrival, invoice, and review'
);

insert into public.bookings (
  id, customer_id, provider_id, service_id, scheduled_at, address,
  price_cents, platform_fee_cents
)
values
  (
    '00000000-0000-0000-0000-000000000502',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000301',
    '2026-07-16T18:00:00Z', '456 Legacy Address', 5000, 750
  ),
  (
    '00000000-0000-0000-0000-000000000503',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000301',
    '2026-07-17T18:00:00Z', '789 Legacy Address', 5000, 750
  ),
  (
    '00000000-0000-0000-0000-000000000504',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000301',
    '2026-07-18T18:00:00Z', '101 Legacy Address', 5000, 750
  );

update public.bookings
set status = 'declined'
where id = '00000000-0000-0000-0000-000000000504';

select lives_ok(
  $$
    update public.bookings set status = 'accepted'
    where id = '00000000-0000-0000-0000-000000000502'
      and status = 'requested'
  $$,
  'legacy requested to accepted remains legal'
);
select pg_temp.throws_any_ok(
  $$
    update public.bookings set status = 'completed'
    where id = '00000000-0000-0000-0000-000000000502'
  $$,
  'legacy accepted cannot skip paid'
);
select lives_ok(
  $$
    update public.bookings set status = 'paid'
    where id = '00000000-0000-0000-0000-000000000502'
      and status = 'accepted'
  $$,
  'legacy accepted to paid remains legal'
);
select lives_ok(
  $$
    update public.bookings set status = 'completed'
    where id = '00000000-0000-0000-0000-000000000502'
      and status = 'paid'
  $$,
  'legacy paid to completed remains legal'
);

select lives_ok(
  $$
    insert into public.booking_invoices (
      id, booking_id, submitted_minutes, estimated_minutes_snapshot,
      hourly_rate_cents_snapshot, platform_fee_bps_snapshot,
      provider_explanation, subtotal_cents, total_platform_fee_cents,
      first_hour_credit_cents, remaining_balance_cents, status,
      submitted_at, autocharge_at
    ) values (
      '00000000-0000-0000-0000-000000000601',
      '00000000-0000-0000-0000-000000000501',
      90, 90, 5000, 500, '', 7500, 375, 5000, 2500, 'review',
      '2026-07-15T20:00:00Z', '2026-07-16T20:00:00Z'
    )
  $$,
  'valid integer-cent invoice math and review deadline are accepted'
);
select pg_temp.throws_any_ok(
  $$
    update public.booking_invoices set subtotal_cents = 7501
    where id = '00000000-0000-0000-0000-000000000601'
  $$,
  'invoice subtotal cannot drift from rate and quarter-hours'
);
select pg_temp.throws_any_ok(
  $$
    update public.booking_invoices set
      submitted_minutes = 105,
      provider_explanation = '',
      subtotal_cents = 8750,
      total_platform_fee_cents = 438,
      remaining_balance_cents = 3750
    where id = '00000000-0000-0000-0000-000000000601'
  $$,
  'time above the estimate requires a provider explanation'
);
select pg_temp.throws_any_ok(
  $$
    update public.booking_invoices set
      autocharge_at = '2026-07-16T19:59:59Z'
    where id = '00000000-0000-0000-0000-000000000601'
  $$,
  'invoice autocharge must be exactly 24 hours after submission'
);

select lives_ok(
  $$
    insert into public.booking_disputes (
      id, booking_id, customer_id, category, narrative, dispute_due_at
    ) values (
      '00000000-0000-0000-0000-000000000701',
      '00000000-0000-0000-0000-000000000501',
      '00000000-0000-0000-0000-000000000101',
      'hours', 'The submitted time needs founder review.',
      '2026-07-22T20:00:00Z'
    )
  $$,
  'a valid open internal dispute can be recorded'
);
select pg_temp.throws_any_ok(
  $$
    insert into public.booking_disputes (
      id, booking_id, customer_id, category, narrative
    ) values (
      '00000000-0000-0000-0000-000000000702',
      '00000000-0000-0000-0000-000000000502',
      '00000000-0000-0000-0000-000000000101',
      'other', 'short'
    )
  $$,
  'dispute narratives shorter than ten characters are rejected'
);
select pg_temp.throws_any_ok(
  $$
    update public.booking_disputes set
      status = 'resolved',
      resolution_kind = 'approve_submitted_hours',
      resolver_id = '00000000-0000-0000-0000-000000000102',
      resolved_at = now()
    where id = '00000000-0000-0000-0000-000000000701'
  $$,
  'dispute resolution requires a nonblank immutable audit note'
);

select lives_ok(
  $$
    insert into public.booking_audit_events (
      id, booking_id, actor_kind, action, from_status, to_status
    ) values (
      '00000000-0000-0000-0000-000000000801',
      '00000000-0000-0000-0000-000000000501',
      'system', 'phase1.test', 'accepted', 'booked'
    )
  $$,
  'trusted callers can append a booking audit event'
);
select pg_temp.throws_any_ok(
  $$
    update public.booking_audit_events set action = 'rewritten'
    where id = '00000000-0000-0000-0000-000000000801'
  $$,
  'booking audit events are append-only even for privileged callers'
);

-- ---------------------------------------------------------------------------
-- Browser-role behavior: grants plus RLS, not just catalog inspection
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

select results_eq(
  $$ select count(*)::bigint from public.public_provider_directory $$,
  $$ values (1::bigint) $$,
  'anon directory returns approved providers only'
);
select results_eq(
  $$ select count(*)::bigint from public.public_provider_offerings $$,
  $$ values (1::bigint) $$,
  'anon offering view returns only approved providers and live services'
);
select results_eq(
  $$
    select minimum_notice_hours::integer
    from public.public_provider_directory
  $$,
  $$ values (24) $$,
  'anon receives public minimum notice through the sanitized directory'
);
select results_eq(
  $$
    select is_hourly_bookable
    from public.public_provider_offerings
  $$,
  $$ values (true) $$,
  'anon receives only the derived bookability fact'
);
select results_eq(
  $$ select count(display_name)::bigint from public.provider_profiles $$,
  $$ values (1::bigint) $$,
  'direct safe base-column access remains approval-gated by RLS'
);
select pg_temp.throws_any_ok(
  $$ select service_zip from public.provider_profiles $$,
  'anon cannot query private provider ZIPs through the Data API role'
);
select pg_temp.throws_any_ok(
  $$ select stripe_account_id from public.provider_profiles $$,
  'anon cannot query Stripe account ids through the Data API role'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000101","role":"authenticated"}',
  true
);
set local role authenticated;

select results_eq(
  $$ select count(*)::bigint from public.bookings $$,
  $$ values (4::bigint) $$,
  'customer reads only their own bookings'
);
select results_eq(
  $$ select count(*)::bigint from public.booking_invoices $$,
  $$ values (1::bigint) $$,
  'customer can read their own safe invoice row'
);
select results_eq(
  $$ select count(*)::bigint from public.booking_disputes $$,
  $$ values (1::bigint) $$,
  'customer can read their own dispute row'
);
select pg_temp.throws_any_ok(
  $$ select service_zip from public.provider_profiles $$,
  'authenticated clients cannot select private provider columns'
);
select pg_temp.throws_any_ok(
  $$
    insert into public.booking_payments (
      booking_id, kind, amount_cents, application_fee_cents,
      idempotency_key, stripe_connected_account_id,
      customer_authorization_version
    ) values (
      '00000000-0000-0000-0000-000000000501', 'first_hour', 5000, 250,
      'browser-must-not-insert', 'acct_private', 'v1'
    )
  $$,
  'authenticated clients cannot mutate financial payment data'
);
select pg_temp.throws_any_ok(
  $$
    update public.booking_invoices set status = 'paid'
    where id = '00000000-0000-0000-0000-000000000601'
  $$,
  'authenticated clients cannot mutate invoice resolution state'
);
select pg_temp.throws_any_ok(
  $$
    update public.bookings set status = 'in_progress'
    where id = '00000000-0000-0000-0000-000000000501'
      and status = 'booked'
  $$,
  'hourly lifecycle transitions require a trusted server operation'
);
select lives_ok(
  $$
    select public.dismiss_booking(
      '00000000-0000-0000-0000-000000000504'
    )
  $$,
  'legacy customer dismissal compatibility remains available through RPC'
);
select pg_temp.throws_any_ok(
  $$
    update public.bookings set status = 'accepted'
    where id = '00000000-0000-0000-0000-000000000503'
      and status = 'requested'
  $$,
  'legacy customer cannot accept their own request'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000102',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000102","role":"authenticated"}',
  true
);
set local role authenticated;

select results_eq(
  $$ select count(*)::bigint from public.bookings $$,
  $$ values (4::bigint) $$,
  'provider reads only bookings for their provider profile'
);
select results_eq(
  $$ select count(*)::bigint from public.booking_invoices $$,
  $$ values (1::bigint) $$,
  'provider can read the safe invoice for their booking'
);
select lives_ok(
  $$
    update public.provider_profiles set availability_note = 'Updated safely'
    where id = '00000000-0000-0000-0000-000000000201'
  $$,
  'provider can update an allowed field on their own profile'
);
select lives_ok(
  $$
    update public.provider_profiles
    set id_document_url = '00000000-0000-0000-0000-000000000102/license-front.jpg',
        id_document_back_url = '00000000-0000-0000-0000-000000000102/license-back.jpg'
    where id = '00000000-0000-0000-0000-000000000201'
  $$,
  'provider can save both identity-document paths on their own profile'
);
select lives_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'id-documents',
      '00000000-0000-0000-0000-000000000102/license-permission-test.jpg',
      '00000000-0000-0000-0000-000000000102'
    )
  $$,
  'provider can upload an identity document under their own storage prefix'
);
select lives_ok(
  $$
    update public.provider_services set hourly_rate_cents = 6000
    where id = '00000000-0000-0000-0000-000000000401'
  $$,
  'provider can update the explicit hourly rate on their own offering'
);
select results_eq(
  $$
    update public.provider_services set hourly_rate_cents = 6000
    where id = '00000000-0000-0000-0000-000000000402'
    returning id
  $$,
  $$
    select id from public.provider_services where false
  $$,
  'provider cannot edit another provider offering'
);
select lives_ok(
  $$
    insert into public.provider_services (
      provider_id, service_id, price_cents, price_type, unit, hourly_rate_cents
    ) values (
      '00000000-0000-0000-0000-000000000201',
      '00000000-0000-0000-0000-000000000302',
      0, 'quote', 'per_hour', 4000
    )
  $$,
  'provider can add an hourly offering with legacy compatibility placeholders'
);
select lives_ok(
  $$
    insert into public.provider_services (
      provider_id, service_id, price_cents, price_type, unit, hourly_rate_cents
    ) values (
      '00000000-0000-0000-0000-000000000201',
      '00000000-0000-0000-0000-000000000302',
      0, 'quote', 'per_hour', 4250
    )
    on conflict (provider_id, service_id) do update set
      provider_id = excluded.provider_id,
      service_id = excluded.service_id,
      price_cents = excluded.price_cents,
      price_type = excluded.price_type,
      unit = excluded.unit,
      hourly_rate_cents = excluded.hourly_rate_cents
  $$,
  'provider pricing upsert can update its conflict-key payload safely'
);
select lives_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'provider-service-images',
      '00000000-0000-0000-0000-000000000102/00000000-0000-0000-0000-000000000401/permission-test.jpg',
      '00000000-0000-0000-0000-000000000102'
    )
  $$,
  'provider can upload a service image for their own offering'
);
select pg_temp.throws_any_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'provider-service-images',
      '00000000-0000-0000-0000-000000000102/00000000-0000-0000-0000-000000000402/not-owned.jpg',
      '00000000-0000-0000-0000-000000000102'
    )
  $$,
  'provider cannot upload a service image for another provider offering'
);
select results_eq(
  $$
    update public.provider_services
    set hourly_rate_cents = 4500
    where provider_id = '00000000-0000-0000-0000-000000000201'
      and service_id = '00000000-0000-0000-0000-000000000302'
    returning hourly_rate_cents
  $$,
  $$ values (4500) $$,
  'provider can edit an hourly offering they added'
);
select lives_ok(
  $$
    delete from public.provider_services
    where provider_id = '00000000-0000-0000-0000-000000000201'
      and service_id = '00000000-0000-0000-0000-000000000302'
  $$,
  'provider can remove an hourly offering they added'
);
select pg_temp.throws_any_ok(
  $$
    update public.provider_profiles set stripe_transfers_active = false
    where id = '00000000-0000-0000-0000-000000000201'
  $$,
  'provider cannot self-assert or edit payout capability state'
);
select lives_ok(
  $$
    select public.accept_booking_request(
      '00000000-0000-0000-0000-000000000503'
    )
  $$,
  'legacy provider can accept a requested booking through RPC'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000101","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$
    select public.transition_legacy_booking(
      '00000000-0000-0000-0000-000000000503',
      'paid'
    )
  $$,
  'legacy customer can move their accepted booking to paid through RPC'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000103',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000103","role":"authenticated"}',
  true
);
set local role authenticated;

select results_eq(
  $$ select count(*)::bigint from public.bookings $$,
  $$ values (0::bigint) $$,
  'unrelated customer cannot read another customer booking'
);
select results_eq(
  $$ select count(*)::bigint from public.booking_invoices $$,
  $$ values (0::bigint) $$,
  'unrelated customer cannot read another customer invoice'
);
select results_eq(
  $$ select count(*)::bigint from public.booking_disputes $$,
  $$ values (0::bigint) $$,
  'unrelated customer cannot read another customer dispute'
);

reset role;

select * from finish();
rollback;
