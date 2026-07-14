begin;

select no_plan();

create function pg_temp.throws_any_ok(statement text, description text)
returns text
language sql
as $$
  select throws_ok(statement, null, null, description);
$$;

-- ---------------------------------------------------------------------------
-- Privilege boundary
-- ---------------------------------------------------------------------------
select is(
  has_function_privilege('authenticated', 'public.mark_booking_arrived(uuid)', 'execute'),
  true, 'providers can mark arrival'
);
select is(
  has_function_privilege('anon', 'public.mark_booking_arrived(uuid)', 'execute'),
  false, 'anonymous users cannot mark arrival'
);
select is(
  has_function_privilege('authenticated', 'public.submit_job_invoice(uuid,integer,text)', 'execute'),
  true, 'providers can submit an invoice'
);
select is(
  has_function_privilege('authenticated', 'public.begin_balance_payment(uuid)', 'execute'),
  true, 'customers can begin a balance payment'
);
select is(
  has_function_privilege('authenticated', 'public.claim_due_invoice(uuid)', 'execute'),
  false, 'signed-in users cannot claim due invoices'
);
select is(
  has_function_privilege('service_role', 'public.claim_due_invoice(uuid)', 'execute'),
  true, 'the service role claims due invoices'
);
select is(
  has_function_privilege('authenticated', 'public.settle_balance_payment(text,timestamptz)', 'execute'),
  false, 'signed-in users cannot settle balances'
);
select is(
  has_function_privilege('service_role', 'public.settle_balance_payment(text,timestamptz)', 'execute'),
  true, 'the service role settles balances'
);
select is(
  has_table_privilege('authenticated', 'public.booking_invoices', 'select'),
  true, 'participants can read invoices'
);
select is(
  has_table_privilege('authenticated', 'public.booking_payments', 'select'),
  false, 'balance payments are never browser-readable'
);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('30000000-0000-0000-0000-000000003101', 'p5-customer@example.test', now(),
   '{"role":"customer","full_name":"Phase Five Customer"}'::jsonb),
  ('30000000-0000-0000-0000-000000003102', 'p5-provider@example.test', now(),
   '{"role":"provider","full_name":"Phase Five Provider"}'::jsonb);

update public.profiles
set address_line1 = '300 Test Street', city = 'Chicago', state = 'IL', postal_code = '60614'
where id = '30000000-0000-0000-0000-000000003101';

insert into public.provider_profiles (
  id, user_id, display_name, bio, verification_status, stripe_account_id,
  service_zip, availability_weekdays, availability_start_local,
  availability_end_local, availability_note, minimum_notice_hours,
  stripe_transfers_active, stripe_transfers_checked_at
)
values (
  '30000000-0000-0000-0000-000000003201',
  '30000000-0000-0000-0000-000000003102',
  'Phase Five Provider', '', 'approved', 'acct_phase5', '60614',
  array[0,1,2,3,4,5,6]::smallint[], '00:00', '23:45', '', 3, true, now()
);

insert into public.services (id, name, slug, category, is_live)
values ('30000000-0000-0000-0000-000000003301', 'Phase Five Service', 'phase-five-service', 'Test', true);

insert into public.provider_services (
  id, provider_id, service_id, price_cents, price_type, unit, hourly_rate_cents
)
values (
  '30000000-0000-0000-0000-000000003401',
  '30000000-0000-0000-0000-000000003201',
  '30000000-0000-0000-0000-000000003301',
  0, 'quote', 'per_hour', 5000
);

-- Insert a hourly booking in an arbitrary lifecycle state directly (triggers
-- fire on UPDATE, so a fixture INSERT can seed any state).
create function pg_temp.insert_booking(
  p_id uuid, p_status public.booking_status, p_scheduled_at timestamptz,
  p_arrived_at timestamptz, p_work_completed_at timestamptz
)
returns void
language sql
as $$
  insert into public.bookings (
    id, customer_id, provider_id, service_id, status, scheduled_at, address,
    details, price_cents, platform_fee_cents, booking_flow, estimated_minutes,
    job_zip, hourly_rate_cents_snapshot, platform_fee_bps, billing_minimum_minutes,
    billing_increment_minutes, cancellation_notice_hours, pilot_timezone,
    response_window_hours, response_alert_at, created_at, accepted_at, initial_payment_due_at,
    arrived_at, work_completed_at,
    customer_name_snapshot, provider_display_name_snapshot, service_name_snapshot,
    fee_policy_version, cancellation_policy_version, terms_version,
    customer_authorization_version, policy_snapshot, customer_authorization_snapshot
  )
  values (
    p_id,
    '30000000-0000-0000-0000-000000003101',
    '30000000-0000-0000-0000-000000003201',
    '30000000-0000-0000-0000-000000003301',
    p_status, p_scheduled_at, '300 Test Street, Chicago, IL', 'Synthetic',
    5000, 250, 'hourly_v1', 120, '60614', 5000, 500, 60, 15, 12,
    'America/Chicago', 3,
    least(now(), p_scheduled_at) - interval '1 day' + interval '3 hours',
    least(now(), p_scheduled_at) - interval '1 day',
    least(now(), p_scheduled_at) - interval '1 day',
    least(least(now(), p_scheduled_at) - interval '1 day' + interval '12 hours', p_scheduled_at),
    p_arrived_at, p_work_completed_at,
    'Phase Five Customer', 'Phase Five Provider', 'Phase Five Service',
    'hourly-v1-500bps', 'hourly-v1-12h', '2026-07-08', 'hourly-v1-saved-method',
    '{"platform_fee_bps":500}'::jsonb,
    '{"version":"hourly-v1-saved-method","scope":"booking_only"}'::jsonb
  );
$$;

-- A succeeded first-hour payment carrying the saved off-session method.
create function pg_temp.insert_first_hour(p_booking_id uuid)
returns void
language sql
as $$
  insert into public.booking_payments (
    booking_id, kind, amount_cents, application_fee_cents, currency, status,
    idempotency_key, stripe_connected_account_id, stripe_customer_id,
    stripe_payment_method_id, customer_authorization_version, succeeded_at
  ) values (
    p_booking_id, 'first_hour', 5000, 250, 'usd', 'succeeded',
    'fh_' || p_booking_id::text, 'acct_phase5', 'cus_phase5', 'pm_phase5',
    'hourly-v1-saved-method', now()
  );
$$;

create function pg_temp.insert_invoice(
  p_booking_id uuid, p_minutes smallint, p_subtotal integer, p_fee integer,
  p_remaining integer, p_submitted_at timestamptz
)
returns uuid
language sql
as $$
  insert into public.booking_invoices (
    booking_id, submitted_minutes, estimated_minutes_snapshot,
    hourly_rate_cents_snapshot, platform_fee_bps_snapshot, subtotal_cents,
    total_platform_fee_cents, first_hour_credit_cents, remaining_balance_cents,
    status, submitted_at, autocharge_at
  ) values (
    p_booking_id, p_minutes, 120, 5000, 500, p_subtotal, p_fee, 5000, p_remaining,
    'review', p_submitted_at, p_submitted_at + interval '24 hours'
  ) returning id;
$$;

-- BK1 arrivable now (full arrive->invoice->balance flow); BK2 far-future
-- (too-early arrival); BK3 arrivable (zero balance); BK4 arrivable (overage).
select pg_temp.insert_booking('30000000-0000-0000-0000-000000003501', 'booked', now(), null, null);
select pg_temp.insert_booking('30000000-0000-0000-0000-000000003502', 'booked', now() + interval '2 days', null, null);
select pg_temp.insert_booking('30000000-0000-0000-0000-000000003503', 'booked', now(), null, null);
select pg_temp.insert_booking('30000000-0000-0000-0000-000000003504', 'booked', now(), null, null);
select pg_temp.insert_first_hour('30000000-0000-0000-0000-000000003501');
select pg_temp.insert_first_hour('30000000-0000-0000-0000-000000003503');

-- ---------------------------------------------------------------------------
-- Arrival (authenticated provider)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000003102', true);
select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000003102","role":"authenticated"}', true);
set local role authenticated;

select is(
  public.mark_booking_arrived('30000000-0000-0000-0000-000000003501'),
  'in_progress', 'the provider can mark a booked job arrived'
);
select results_eq(
  $$ select status::text, (arrived_at is not null)
     from public.bookings where id = '30000000-0000-0000-0000-000000003501' $$,
  $$ values ('in_progress', true) $$,
  'arrival advances booked -> in_progress with a timestamp'
);
select is(
  public.mark_booking_arrived('30000000-0000-0000-0000-000000003501'),
  'in_progress', 'marking arrival twice is idempotent'
);
select pg_temp.throws_any_ok(
  $$ select public.mark_booking_arrived('30000000-0000-0000-0000-000000003502') $$,
  'arriving more than 30 minutes early is rejected'
);

-- A non-provider (the customer) cannot mark arrival.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000003101', true);
select pg_temp.throws_any_ok(
  $$ select public.mark_booking_arrived('30000000-0000-0000-0000-000000003503') $$,
  'a non-owner cannot mark arrival'
);

-- ---------------------------------------------------------------------------
-- Invoice submission (authenticated provider)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000003102', true);

-- Submit 90 minutes for BK1 (under the 120 estimate): subtotal 7500, remaining 2500.
select isnt(
  public.submit_job_invoice('30000000-0000-0000-0000-000000003501', 90, ''),
  null, 'submitting the invoice returns the invoice id'
);
select results_eq(
  $$ select status::text, (work_completed_at is not null)
     from public.bookings where id = '30000000-0000-0000-0000-000000003501' $$,
  $$ values ('invoice_review', true) $$,
  'submission advances in_progress -> invoice_review with a completion timestamp'
);
select results_eq(
  $$ select submitted_minutes, subtotal_cents, total_platform_fee_cents,
            first_hour_credit_cents, remaining_balance_cents, status::text
     from public.booking_invoices where booking_id = '30000000-0000-0000-0000-000000003501' $$,
  $$ values (90::smallint, 7500, 375, 5000, 2500, 'review') $$,
  'the invoice money exactly matches the master formula'
);

-- Idempotent resubmission returns the same invoice without a second row.
select lives_ok(
  $$ select public.submit_job_invoice('30000000-0000-0000-0000-000000003501', 120, 'changed') $$,
  'resubmitting is safe'
);
select is(
  (select count(*) from public.booking_invoices where booking_id = '30000000-0000-0000-0000-000000003501')::integer,
  1, 'a booking has at most one invoice'
);
select results_eq(
  $$ select submitted_minutes from public.booking_invoices where booking_id = '30000000-0000-0000-0000-000000003501' $$,
  $$ values (90::smallint) $$,
  'the original submitted minutes are unchanged by a resubmission'
);

-- Arrive BK3 and BK4 to test zero balance and the overage rule.
select public.mark_booking_arrived('30000000-0000-0000-0000-000000003503');
select public.mark_booking_arrived('30000000-0000-0000-0000-000000003504');

-- Invalid (non-quarter-hour) minutes are rejected.
select pg_temp.throws_any_ok(
  $$ select public.submit_job_invoice('30000000-0000-0000-0000-000000003504', 61, '') $$,
  'minutes off the 15-minute grid are rejected'
);
-- Over-estimate without an explanation is rejected; with one it succeeds.
select pg_temp.throws_any_ok(
  $$ select public.submit_job_invoice('30000000-0000-0000-0000-000000003504', 150, '') $$,
  'time beyond the estimate requires an explanation'
);
select isnt(
  public.submit_job_invoice('30000000-0000-0000-0000-000000003504', 150, 'Larger yard than described.'),
  null, 'an explained over-estimate is accepted'
);

-- Zero balance: BK3 at exactly 60 minutes -> subtotal 5000, remaining 0.
select public.submit_job_invoice('30000000-0000-0000-0000-000000003503', 60, '');
select results_eq(
  $$ select remaining_balance_cents from public.booking_invoices where booking_id = '30000000-0000-0000-0000-000000003503' $$,
  $$ values (0) $$,
  'a one-hour job has no remaining balance'
);

-- ---------------------------------------------------------------------------
-- Balance payment lifecycle (authenticated customer)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000003101', true);

-- begin_balance_payment for BK1: amount 2500, split fee 375 - 250 = 125.
select results_eq(
  $$ select amount_cents, application_fee_cents
     from public.begin_balance_payment(
       (select id from public.booking_invoices where booking_id = '30000000-0000-0000-0000-000000003501')) $$,
  $$ values (2500, 125) $$,
  'begin returns the remaining balance and the split platform fee'
);
select lives_ok(
  $$ select public.begin_balance_payment(
       (select id from public.booking_invoices where booking_id = '30000000-0000-0000-0000-000000003501')) $$,
  'begin is idempotent'
);

-- Zero-balance settlement takes no Stripe charge.
select is(
  public.settle_zero_balance_invoice(
    (select id from public.booking_invoices where booking_id = '30000000-0000-0000-0000-000000003503')),
  'completed', 'a zero-balance invoice settles with no charge'
);
select results_eq(
  $$ select status::text from public.bookings where id = '30000000-0000-0000-0000-000000003503' $$,
  $$ values ('completed') $$,
  'the zero-balance booking completes'
);
select pg_temp.throws_any_ok(
  $$ select public.begin_balance_payment(
       (select id from public.booking_invoices where booking_id = '30000000-0000-0000-0000-000000003503')) $$,
  'a zero-balance invoice cannot begin a charge'
);

-- ---------------------------------------------------------------------------
-- Settlement + duplicate safety (service role)
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);
set local role service_role;

update public.booking_payments set stripe_payment_intent_id = 'pi_bal1'
where booking_id = '30000000-0000-0000-0000-000000003501' and kind = 'balance';

select is(
  public.settle_balance_payment('pi_bal1', now()),
  'completed', 'a balance success completes the booking'
);
select results_eq(
  $$ select
       (select status::text from public.bookings where id = '30000000-0000-0000-0000-000000003501'),
       (select status::text from public.booking_invoices where booking_id = '30000000-0000-0000-0000-000000003501') $$,
  $$ values ('completed', 'paid') $$,
  'settlement moves invoice_review -> completed and marks the invoice paid'
);
select is(
  public.settle_balance_payment('pi_bal1', now()),
  'already_completed', 'a duplicate balance success does not double-settle'
);

-- ---------------------------------------------------------------------------
-- Failure + recovery + dispute guard
-- ---------------------------------------------------------------------------
-- BK5: invoice_review with a created balance attempt to fail and recover.
select pg_temp.insert_booking('30000000-0000-0000-0000-000000003505', 'invoice_review', now() - interval '3 hours', now() - interval '2 hours', now() - interval '1 hour');
select pg_temp.insert_first_hour('30000000-0000-0000-0000-000000003505');
select pg_temp.insert_invoice('30000000-0000-0000-0000-000000003505', 90::smallint, 7500, 375, 2500, now());
insert into public.booking_payments (
  booking_id, invoice_id, kind, amount_cents, application_fee_cents, currency,
  status, idempotency_key, stripe_connected_account_id, customer_authorization_version,
  stripe_payment_intent_id
) values (
  '30000000-0000-0000-0000-000000003505',
  (select id from public.booking_invoices where booking_id = '30000000-0000-0000-0000-000000003505'),
  'balance', 2500, 125, 'usd', 'created', 'bal_30000000-0000-0000-0000-000000003505_0',
  'acct_phase5', 'hourly-v1-saved-method', 'pi_bal5'
);

select is(
  public.mark_balance_payment_unsuccessful('pi_bal5', 'failed', 'card_declined', 'Card declined'),
  'failed', 'a failed balance charge is recorded'
);
select results_eq(
  $$ select
       (select status::text from public.booking_payments where stripe_payment_intent_id = 'pi_bal5'),
       (select status::text from public.booking_invoices where booking_id = '30000000-0000-0000-0000-000000003505'),
       (select status::text from public.bookings where id = '30000000-0000-0000-0000-000000003505') $$,
  $$ values ('failed', 'requires_action', 'invoice_review') $$,
  'a failed balance flags the invoice recoverable and keeps the booking in review'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000003101', true);
select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000003101","role":"authenticated"}', true);
set local role authenticated;
select results_eq(
  $$ select idempotency_key, amount_cents
     from public.reset_balance_payment_for_retry(
       (select id from public.booking_invoices where booking_id = '30000000-0000-0000-0000-000000003505')) $$,
  $$ values ('bal_30000000-0000-0000-0000-000000003505_1', 2500) $$,
  'recovery bumps the attempt key so a fresh intent is distinct'
);

reset role;
set local role service_role;
select results_eq(
  $$ select status::text, stripe_payment_intent_id, attempt_count
     from public.booking_payments where booking_id = '30000000-0000-0000-0000-000000003505' and kind = 'balance' $$,
  $$ values ('created', null::text, 1::smallint) $$,
  'recovery clears the stale intent and returns the attempt to created'
);

-- Dispute guard: an open dispute blocks a new balance charge.
select pg_temp.insert_booking('30000000-0000-0000-0000-000000003506', 'invoice_review', now() - interval '3 hours', now() - interval '2 hours', now() - interval '1 hour');
select pg_temp.insert_first_hour('30000000-0000-0000-0000-000000003506');
select pg_temp.insert_invoice('30000000-0000-0000-0000-000000003506', 90::smallint, 7500, 375, 2500, now());
insert into public.booking_disputes (booking_id, customer_id, category, narrative)
values ('30000000-0000-0000-0000-000000003506', '30000000-0000-0000-0000-000000003101',
        'service', 'The work was not completed as agreed and needs review.');

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000003101', true);
select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000003101","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.throws_any_ok(
  $$ select public.begin_balance_payment(
       (select id from public.booking_invoices where booking_id = '30000000-0000-0000-0000-000000003506')) $$,
  'an open dispute blocks the balance charge'
);

-- ---------------------------------------------------------------------------
-- claim_due_invoice (service role, single-flight autocharge)
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);
set local role service_role;

-- BK7: a past-due, undisputed invoice ready to autocharge.
select pg_temp.insert_booking('30000000-0000-0000-0000-000000003507', 'invoice_review', now() - interval '30 hours', now() - interval '29 hours', now() - interval '25 hours');
select pg_temp.insert_first_hour('30000000-0000-0000-0000-000000003507');
select pg_temp.insert_invoice('30000000-0000-0000-0000-000000003507', 90::smallint, 7500, 375, 2500, now() - interval '25 hours');

select results_eq(
  $$ select amount_cents, application_fee_cents, stripe_payment_method_id, stripe_connected_account_id
     from public.claim_due_invoice(
       (select id from public.booking_invoices where booking_id = '30000000-0000-0000-0000-000000003507')) $$,
  $$ values (2500, 125, 'pm_phase5', 'acct_phase5') $$,
  'claiming a due invoice returns the saved method and connected account'
);
select results_eq(
  $$ select status::text from public.booking_invoices where booking_id = '30000000-0000-0000-0000-000000003507' $$,
  $$ values ('processing') $$,
  'claiming flips the invoice to processing'
);
select is(
  (select count(*) from public.claim_due_invoice(
     (select id from public.booking_invoices where booking_id = '30000000-0000-0000-0000-000000003507')))::integer,
  0, 'a claimed invoice is not claimable again'
);
-- BK1's invoice is already paid, so it is never claimable.
select is(
  (select count(*) from public.claim_due_invoice(
     (select id from public.booking_invoices where booking_id = '30000000-0000-0000-0000-000000003501')))::integer,
  0, 'a settled invoice is never claimable'
);

reset role;
select * from finish();
rollback;
