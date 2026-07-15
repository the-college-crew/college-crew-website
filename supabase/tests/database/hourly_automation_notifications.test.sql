begin;

select no_plan();

-- ---------------------------------------------------------------------------
-- Least privilege and infrastructure contracts
-- ---------------------------------------------------------------------------

select is(
  has_table_privilege('authenticated', 'public.booking_automation_jobs', 'select'),
  false,
  'browser users cannot read operational automation jobs'
);
select is(
  has_table_privilege('authenticated', 'public.email_outbox', 'select'),
  false,
  'browser users cannot read email recipients or payloads'
);
select is(
  has_function_privilege(
    'service_role', 'public.claim_booking_automation_jobs(integer,integer)', 'execute'
  ),
  true,
  'service role can claim bounded automation jobs'
);
select is(
  has_function_privilege(
    'authenticated', 'public.claim_booking_automation_jobs(integer,integer)', 'execute'
  ),
  false,
  'browser users cannot claim automation work'
);
select is(
  has_function_privilege(
    'service_role', 'public.claim_email_outbox(integer,integer)', 'execute'
  ),
  true,
  'service role can claim bounded email work'
);
select is(
  (
    select count(*)::integer
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename in ('bookings', 'booking_invoices', 'booking_disputes')
  ),
  3,
  'only RLS-readable booking state tables needed by Phase 7 are published'
);
select is(
  (
    select count(*)::integer
    from cron.job
    where jobname = 'hourly-booking-v1-scheduler'
      and schedule = '* * * * *'
  ),
  1,
  'the stable scheduler Cron job runs once per minute'
);
select is(
  private.invoke_booking_scheduler(),
  null::bigint,
  'Cron invocation safely no-ops before Vault is configured'
);

-- ---------------------------------------------------------------------------
-- A requested hourly booking transaction creates deterministic jobs + email
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('70000000-0000-0000-0000-000000007101', 'p7-customer@example.test', now(),
   '{"role":"customer","full_name":"Phase Seven Customer"}'::jsonb),
  ('70000000-0000-0000-0000-000000007102', 'p7-provider@example.test', now(),
   '{"role":"provider","full_name":"Phase Seven Provider"}'::jsonb);

insert into public.provider_profiles (
  id, user_id, display_name, bio, verification_status, stripe_account_id,
  service_zip, availability_weekdays, availability_start_local,
  availability_end_local, minimum_notice_hours, stripe_transfers_active,
  stripe_transfers_checked_at
)
values (
  '70000000-0000-0000-0000-000000007201',
  '70000000-0000-0000-0000-000000007102',
  'Phase Seven Provider', '', 'approved', 'acct_phase7', '60614',
  array[0,1,2,3,4,5,6]::smallint[], '00:00', '23:45', 3, true, now()
);

insert into public.services (id, name, slug, category, is_live)
values (
  '70000000-0000-0000-0000-000000007301',
  'Phase Seven Service', 'phase-seven-service', 'Test', true
);

insert into public.bookings (
  id, customer_id, provider_id, service_id, status, scheduled_at, address,
  details, price_cents, platform_fee_cents, created_at, booking_flow,
  estimated_minutes, job_zip, hourly_rate_cents_snapshot, platform_fee_bps,
  billing_minimum_minutes, billing_increment_minutes, cancellation_notice_hours,
  pilot_timezone, response_window_hours, response_alert_at,
  customer_name_snapshot, provider_display_name_snapshot, service_name_snapshot,
  fee_policy_version, cancellation_policy_version, terms_version,
  customer_authorization_version, policy_snapshot, customer_authorization_snapshot
)
values (
  '70000000-0000-0000-0000-000000007401',
  '70000000-0000-0000-0000-000000007101',
  '70000000-0000-0000-0000-000000007201',
  '70000000-0000-0000-0000-000000007301',
  'requested', now() + interval '2 days', '700 Test Street', '', 5000, 250,
  now() - interval '2 hours', 'hourly_v1', 120, '60614', 5000, 500, 60, 15,
  12, 'America/Chicago', 1, now() - interval '1 hour',
  'Phase Seven Customer', 'Phase Seven Provider', 'Phase Seven Service',
  'hourly-v1-500bps', 'hourly-v1-12h', '2026-07-08',
  'hourly-v1-saved-method', '{"platform_fee_bps":500}'::jsonb,
  '{"version":"hourly-v1-saved-method","scope":"booking_only"}'::jsonb
);

select is(
  (
    select count(*)::integer
    from public.booking_automation_jobs
    where booking_id = '70000000-0000-0000-0000-000000007401'
  ),
  2,
  'request insert transactionally queues response and start-expiration work'
);
select is(
  (
    select count(*)::integer
    from public.email_outbox
    where event_key = 'request_new_70000000-0000-0000-0000-000000007401'
      and template = 'new_provider_request'
  ),
  1,
  'request insert transactionally queues one deterministic provider email'
);

-- ---------------------------------------------------------------------------
-- Claims are bounded, overlapping-safe, retryable, and stale-lease recoverable
-- ---------------------------------------------------------------------------

create temp table phase7_claim as
select * from public.claim_booking_automation_jobs(1, 60);

select is((select count(*)::integer from phase7_claim), 1, 'one due job is claimed');
select is(
  (select attempt_count from phase7_claim),
  1,
  'first claim records its attempt'
);
select is(
  (select count(*)::integer from public.claim_booking_automation_jobs(1, 60)),
  0,
  'an overlapping claim cannot see a live lease'
);
select ok(
  public.retry_booking_automation_job(
    (select id from phase7_claim),
    (select lease_token from phase7_claim),
    'transient_test', 30, false
  ),
  'a claimed failure is released to retry with safe metadata'
);
select results_eq(
  $$
    select status, last_error_class, (next_attempt_at > now())
    from public.booking_automation_jobs
    where id = (select id from phase7_claim)
  $$,
  $$ values ('retry'::text, 'transient_test'::text, true) $$,
  'retry persists its safe class and future backoff'
);

insert into public.booking_automation_jobs (
  event_key, kind, booking_id, source_id, run_at, next_attempt_at
)
values (
  'phase7_stale_lease', 'payment_expiration',
  '70000000-0000-0000-0000-000000007401',
  '70000000-0000-0000-0000-000000007401', now() - interval '1 hour', now()
);
create temp table phase7_stale_first as
select * from public.claim_booking_automation_jobs(1, 60);
update public.booking_automation_jobs
set lease_expires_at = now() - interval '1 second'
where id = (select id from phase7_stale_first);
create temp table phase7_stale_second as
select * from public.claim_booking_automation_jobs(1, 60);
select is(
  (select id from phase7_stale_second),
  (select id from phase7_stale_first),
  'an expired processing lease is recovered and reclaimed'
);
select is(
  (select attempt_count from phase7_stale_second),
  2,
  'stale-lease recovery records a second attempt'
);
select ok(
  public.complete_booking_automation_job(
    (select id from phase7_stale_second),
    (select lease_token from phase7_stale_second)
  ),
  'the current lease token can complete a job'
);

-- ---------------------------------------------------------------------------
-- Outbox delivery is single-claim and exactly-once at the durable boundary
-- ---------------------------------------------------------------------------

create temp table phase7_email_claim as
select * from public.claim_email_outbox(1, 60);
select is((select count(*)::integer from phase7_email_claim), 1, 'one email is claimed');
select is(
  (select count(*)::integer from public.claim_email_outbox(1, 60)),
  0,
  'an overlapping email drain cannot claim a live lease'
);
select ok(
  public.settle_email_outbox(
    (select id from phase7_email_claim),
    (select lease_token from phase7_email_claim),
    'resend_test_message'
  ),
  'the current lease settles the email once'
);
select results_eq(
  $$
    select status::text, attempt_count, provider_message_id, (sent_at is not null)
    from public.email_outbox where id = (select id from phase7_email_claim)
  $$,
  $$ values ('sent'::text, 1, 'resend_test_message'::text, true) $$,
  'settlement stores delivery evidence without changing the event key'
);
select is(
  public.settle_email_outbox(
    (select id from phase7_email_claim),
    (select lease_token from phase7_email_claim),
    'duplicate'
  ),
  null::boolean,
  'the consumed lease cannot settle a second delivery'
);

select * from finish();
rollback;
