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
  has_function_privilege('authenticated', 'public.begin_first_hour_payment(uuid,text)', 'execute'),
  true, 'customers can begin a first-hour payment'
);
select is(
  has_function_privilege('anon', 'public.begin_first_hour_payment(uuid,text)', 'execute'),
  false, 'anonymous users cannot begin a payment'
);
select is(
  has_function_privilege('authenticated', 'public.settle_first_hour_payment(text,text,timestamptz)', 'execute'),
  false, 'signed-in users cannot settle payments'
);
select is(
  has_function_privilege('service_role', 'public.settle_first_hour_payment(text,text,timestamptz)', 'execute'),
  true, 'the service role settles payments'
);
select is(
  has_function_privilege('authenticated', 'public.record_first_hour_refund(text,text,text,integer)', 'execute'),
  false, 'signed-in users cannot record refunds'
);
select is(
  has_table_privilege('authenticated', 'public.stripe_customers', 'select'),
  false, 'Stripe customer mapping is never browser-readable'
);
select is(
  has_table_privilege('service_role', 'public.stripe_customers', 'insert'),
  true, 'the service role manages the Stripe customer mapping'
);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('20000000-0000-0000-0000-000000002101', 'p4-customer@example.test', now(),
   '{"role":"customer","full_name":"Phase Four Customer"}'::jsonb),
  ('20000000-0000-0000-0000-000000002102', 'p4-provider@example.test', now(),
   '{"role":"provider","full_name":"Phase Four Provider"}'::jsonb);

update public.profiles
set address_line1 = '200 Test Street', city = 'Chicago', state = 'IL', postal_code = '60614'
where id = '20000000-0000-0000-0000-000000002101';

insert into public.provider_profiles (
  id, user_id, display_name, bio, verification_status, stripe_account_id,
  service_zip, availability_weekdays, availability_start_local,
  availability_end_local, availability_note, minimum_notice_hours,
  stripe_transfers_active, stripe_transfers_checked_at
)
values (
  '20000000-0000-0000-0000-000000002201',
  '20000000-0000-0000-0000-000000002102',
  'Phase Four Provider', '', 'approved', 'acct_phase4', '60614',
  array[0,1,2,3,4,5,6]::smallint[], '09:00', '17:00', '', 3, true, now()
);

insert into public.services (id, name, slug, category, is_live)
values ('20000000-0000-0000-0000-000000002301', 'Phase Four Service', 'phase-four-service', 'Test', true);

insert into public.provider_services (
  id, provider_id, service_id, price_cents, price_type, unit, hourly_rate_cents
)
values (
  '20000000-0000-0000-0000-000000002401',
  '20000000-0000-0000-0000-000000002201',
  '20000000-0000-0000-0000-000000002301',
  0, 'quote', 'per_hour', 5000
);

-- Insert an accepted hourly booking with the payment deadline computed to
-- satisfy the check constraint (least(accepted_at + 12h, scheduled_at)).
create function pg_temp.insert_accepted(
  p_id uuid, p_accepted_at timestamptz, p_scheduled_at timestamptz
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
    customer_name_snapshot, provider_display_name_snapshot, service_name_snapshot,
    fee_policy_version, cancellation_policy_version, terms_version,
    customer_authorization_version, policy_snapshot, customer_authorization_snapshot
  )
  values (
    p_id,
    '20000000-0000-0000-0000-000000002101',
    '20000000-0000-0000-0000-000000002201',
    '20000000-0000-0000-0000-000000002301',
    'accepted', p_scheduled_at, '200 Test Street, Chicago, IL', 'Synthetic',
    5000, 250, 'hourly_v1', 120, '60614', 5000, 500, 60, 15, 12,
    'America/Chicago', 3, p_accepted_at + interval '3 hours', p_accepted_at, p_accepted_at,
    least(p_accepted_at + interval '12 hours', p_scheduled_at),
    'Phase Four Customer', 'Phase Four Provider', 'Phase Four Service',
    'hourly-v1-500bps', 'hourly-v1-12h', '2026-07-08', 'hourly-v1-saved-method',
    '{"platform_fee_bps":500}'::jsonb,
    '{"version":"hourly-v1-saved-method","scope":"booking_only"}'::jsonb
  );
$$;

-- B1 on-time; B2 past-due (for the late-success refund path); B3 past-due
-- unpaid (for expiry); B5 on-time (for a failed attempt).
select pg_temp.insert_accepted('20000000-0000-0000-0000-000000002501', now(), now() + interval '2 days');
select pg_temp.insert_accepted('20000000-0000-0000-0000-000000002502', now() - interval '13 hours', now() + interval '5 hours');
select pg_temp.insert_accepted('20000000-0000-0000-0000-000000002503', now() - interval '13 hours', now() + interval '5 hours');
select pg_temp.insert_accepted('20000000-0000-0000-0000-000000002505', now(), now() + interval '2 days');

-- ---------------------------------------------------------------------------
-- begin_first_hour_payment (authenticated customer)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000002101', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000002101","role":"authenticated"}', true);
set local role authenticated;

select results_eq(
  $$ select amount_cents, application_fee_cents, idempotency_key
     from public.begin_first_hour_payment('20000000-0000-0000-0000-000000002501', 'hourly-v1-saved-method') $$,
  $$ values (5000, 250, 'fh_20000000-0000-0000-0000-000000002501') $$,
  'begin returns the first-hour amount, 5% fee, and a deterministic key'
);

-- Idempotent: a second begin does not create a second payment row.
select lives_ok(
  $$ select public.begin_first_hour_payment('20000000-0000-0000-0000-000000002501', 'hourly-v1-saved-method') $$,
  'begin is safe to call again'
);

-- Past the payment window is rejected.
select pg_temp.throws_any_ok(
  $$ select public.begin_first_hour_payment('20000000-0000-0000-0000-000000002502', 'hourly-v1-saved-method') $$,
  'begin is rejected once the payment window closes'
);

-- Another user cannot begin someone else's payment.
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000002102', true);
select pg_temp.throws_any_ok(
  $$ select public.begin_first_hour_payment('20000000-0000-0000-0000-000000002501', 'hourly-v1-saved-method') $$,
  'a non-owner cannot begin the payment'
);

-- booking_payments is service-role only, so verify its state with elevated role.
reset role;
select results_eq(
  $$ select amount_cents, application_fee_cents, status::text,
            stripe_connected_account_id, (authorized_at is not null)
     from public.booking_payments
     where booking_id = '20000000-0000-0000-0000-000000002501' and kind = 'first_hour' $$,
  $$ values (5000, 250, 'created', 'acct_phase4', true) $$,
  'begin persists exactly one created first-hour payment with the connected account'
);
select is(
  (select count(*) from public.booking_payments where booking_id = '20000000-0000-0000-0000-000000002501')::integer,
  1, 'a booking has at most one first-hour payment'
);

-- ---------------------------------------------------------------------------
-- settle / mark / refund / expire (service role, no auth.uid)
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);
set local role service_role;

-- Attach the PaymentIntent to B1's attempt, then settle within the window.
update public.booking_payments set stripe_payment_intent_id = 'pi_b1'
where booking_id = '20000000-0000-0000-0000-000000002501' and kind = 'first_hour';

select is(
  public.settle_first_hour_payment('pi_b1', 'pm_1', now()),
  'booked', 'an on-time success books the job'
);
select results_eq(
  $$ select status::text from public.bookings where id = '20000000-0000-0000-0000-000000002501' $$,
  $$ values ('booked') $$,
  'the booking advances accepted -> booked'
);
select results_eq(
  $$ select status::text, stripe_payment_method_id, (succeeded_at is not null)
     from public.booking_payments where booking_id = '20000000-0000-0000-0000-000000002501' $$,
  $$ values ('succeeded', 'pm_1', true) $$,
  'the first-hour payment is captured with its saved method'
);
select is(
  (select count(*) from public.booking_audit_events
   where booking_id = '20000000-0000-0000-0000-000000002501'
     and action = 'first_hour_payment_succeeded' and to_status = 'booked')::integer,
  1, 'settlement writes an audit event'
);

-- Duplicate/out-of-order success is a no-op.
select is(
  public.settle_first_hour_payment('pi_b1', 'pm_1', now()),
  'already_booked', 'a duplicate success does not double-book'
);

-- Late success: attach a PI to the past-due booking, settle -> refund owed.
insert into public.booking_payments (
  booking_id, kind, amount_cents, application_fee_cents, currency, status,
  idempotency_key, stripe_connected_account_id, customer_authorization_version,
  stripe_payment_intent_id
) values (
  '20000000-0000-0000-0000-000000002502', 'first_hour', 5000, 250, 'usd', 'created',
  'fh_20000000-0000-0000-0000-000000002502', 'acct_phase4', 'hourly-v1-saved-method', 'pi_b2'
);

select is(
  public.settle_first_hour_payment('pi_b2', 'pm_2', now()),
  'refund_owed', 'a success after the deadline is flagged for refund'
);
select results_eq(
  $$ select status::text from public.bookings where id = '20000000-0000-0000-0000-000000002502' $$,
  $$ values ('accepted') $$,
  'a late success never revives the booking'
);

select is(
  public.record_first_hour_refund('pi_b2', 'late_success_after_deadline', 're_1', 5000),
  'recorded', 'the late-success refund is recorded'
);
select results_eq(
  $$ select amount_cents, reverse_transfer, refund_application_fee, status::text
     from public.booking_refunds where idempotency_key = 'fhr_20000000-0000-0000-0000-000000002502' $$,
  $$ values (5000, true, true, 'succeeded') $$,
  'the refund reverses the transfer and application fee'
);
select results_eq(
  $$ select status::text from public.booking_payments where stripe_payment_intent_id = 'pi_b2' $$,
  $$ values ('refunded') $$,
  'the refunded payment is marked refunded'
);
select is(
  public.record_first_hour_refund('pi_b2', 'late_success_after_deadline', 're_1', 5000),
  'already_recorded', 'recording a refund is idempotent'
);

-- A failed attempt keeps the booking accepted for retry.
insert into public.booking_payments (
  booking_id, kind, amount_cents, application_fee_cents, currency, status,
  idempotency_key, stripe_connected_account_id, customer_authorization_version,
  stripe_payment_intent_id
) values (
  '20000000-0000-0000-0000-000000002505', 'first_hour', 5000, 250, 'usd', 'created',
  'fh_20000000-0000-0000-0000-000000002505', 'acct_phase4', 'hourly-v1-saved-method', 'pi_b5'
);
select is(
  public.mark_first_hour_payment_unsuccessful('pi_b5', 'failed', 'card_declined', 'Card declined'),
  'failed', 'a failed PaymentIntent marks the payment failed'
);
select results_eq(
  $$ select
       (select status::text from public.booking_payments where stripe_payment_intent_id = 'pi_b5'),
       (select status::text from public.bookings where id = '20000000-0000-0000-0000-000000002505') $$,
  $$ values ('failed', 'accepted') $$,
  'a failed payment leaves the acceptance intact for retry'
);

-- ---------------------------------------------------------------------------
-- expire_unpaid_acceptance
-- ---------------------------------------------------------------------------
select is(
  public.expire_unpaid_acceptance('20000000-0000-0000-0000-000000002503'),
  'expired', 'a past-due unpaid acceptance is released'
);
select results_eq(
  $$ select status::text, (expired_at is not null)
     from public.bookings where id = '20000000-0000-0000-0000-000000002503' $$,
  $$ values ('expired', true) $$,
  'the released booking is expired and timestamped'
);
select is(
  public.expire_unpaid_acceptance('20000000-0000-0000-0000-000000002501'),
  'booked', 'a booked job is never expired'
);
select is(
  public.expire_unpaid_acceptance('20000000-0000-0000-0000-000000002505'),
  'accepted', 'an acceptance still inside its window is not expired'
);

reset role;
select * from finish();
rollback;
