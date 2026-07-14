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
  has_function_privilege('authenticated', 'public.cancel_booking_as_customer(uuid)', 'execute'),
  true, 'customers can cancel their own booking'
);
select is(
  has_function_privilege('anon', 'public.cancel_booking_as_customer(uuid)', 'execute'),
  false, 'anonymous users cannot cancel'
);
select is(
  has_function_privilege('authenticated', 'public.cancel_booking_as_provider(uuid,text)', 'execute'),
  true, 'providers can cancel a job they own'
);
select is(
  has_function_privilege('authenticated', 'public.open_booking_dispute(uuid,public.booking_dispute_category,text)', 'execute'),
  true, 'customers can open a dispute'
);
select is(
  has_function_privilege('authenticated', 'public.resolve_booking_dispute(uuid,public.booking_dispute_resolution,text,integer)', 'execute'),
  true, 'the resolve RPC is exposed to authenticated (admin re-checked in body)'
);
select is(
  has_function_privilege('authenticated', 'public.settle_booking_refund(text,public.booking_refund_status,text,text,text,text)', 'execute'),
  false, 'signed-in users cannot settle refunds'
);
select is(
  has_function_privilege('service_role', 'public.settle_booking_refund(text,public.booking_refund_status,text,text,text,text)', 'execute'),
  true, 'the service role settles refunds'
);
select is(
  has_function_privilege('authenticated', 'public.reconcile_stripe_refund(text,text,integer,text)', 'execute'),
  false, 'signed-in users cannot reconcile refunds'
);
select is(
  has_function_privilege('authenticated', 'public.record_stripe_dispute(jsonb)', 'execute'),
  false, 'signed-in users cannot record card disputes'
);
select is(
  has_table_privilege('authenticated', 'public.stripe_disputes', 'select'),
  false, 'external card disputes are never browser-readable'
);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('40000000-0000-0000-0000-000000004101', 'p6-customer@example.test', now(),
   '{"role":"customer","full_name":"Phase Six Customer"}'::jsonb),
  ('40000000-0000-0000-0000-000000004102', 'p6-provider@example.test', now(),
   '{"role":"provider","full_name":"Phase Six Provider"}'::jsonb),
  ('40000000-0000-0000-0000-000000004103', 'p6-admin@example.test', now(),
   '{"role":"customer","full_name":"Phase Six Admin"}'::jsonb);

update public.profiles set role = 'admin' where id = '40000000-0000-0000-0000-000000004103';

insert into public.provider_profiles (
  id, user_id, display_name, bio, verification_status, stripe_account_id,
  service_zip, availability_weekdays, availability_start_local,
  availability_end_local, availability_note, minimum_notice_hours,
  stripe_transfers_active, stripe_transfers_checked_at
)
values (
  '40000000-0000-0000-0000-000000004201',
  '40000000-0000-0000-0000-000000004102',
  'Phase Six Provider', '', 'approved', 'acct_phase6', '60614',
  array[0,1,2,3,4,5,6]::smallint[], '00:00', '23:45', '', 3, true, now()
);

insert into public.services (id, name, slug, category, is_live)
values ('40000000-0000-0000-0000-000000004301', 'Phase Six Service', 'phase-six-service', 'Test', true);

insert into public.provider_services (
  id, provider_id, service_id, price_cents, price_type, unit, hourly_rate_cents
)
values (
  '40000000-0000-0000-0000-000000004401',
  '40000000-0000-0000-0000-000000004201',
  '40000000-0000-0000-0000-000000004301',
  0, 'quote', 'per_hour', 5000
);

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
    '40000000-0000-0000-0000-000000004101',
    '40000000-0000-0000-0000-000000004201',
    '40000000-0000-0000-0000-000000004301',
    p_status, p_scheduled_at, '400 Test Street, Chicago, IL', 'Synthetic',
    5000, 250, 'hourly_v1', 120, '60614', 5000, 500, 60, 15, 12,
    'America/Chicago', 3,
    least(now(), p_scheduled_at) - interval '1 day' + interval '3 hours',
    least(now(), p_scheduled_at) - interval '1 day',
    least(now(), p_scheduled_at) - interval '1 day',
    least(least(now(), p_scheduled_at) - interval '1 day' + interval '12 hours', p_scheduled_at),
    p_arrived_at, p_work_completed_at,
    'Phase Six Customer', 'Phase Six Provider', 'Phase Six Service',
    'hourly-v1-500bps', 'hourly-v1-12h', '2026-07-08', 'hourly-v1-saved-method',
    '{"platform_fee_bps":500}'::jsonb,
    '{"version":"hourly-v1-saved-method","scope":"booking_only"}'::jsonb
  );
$$;

create function pg_temp.insert_first_hour(p_booking_id uuid, p_pi text)
returns void
language sql
as $$
  insert into public.booking_payments (
    booking_id, kind, amount_cents, application_fee_cents, currency, status,
    idempotency_key, stripe_payment_intent_id, stripe_connected_account_id,
    stripe_customer_id, stripe_payment_method_id, customer_authorization_version, succeeded_at
  ) values (
    p_booking_id, 'first_hour', 5000, 250, 'usd', 'succeeded',
    'fh_' || p_booking_id::text, p_pi, 'acct_phase6', 'cus_phase6', 'pm_phase6',
    'hourly-v1-saved-method', now()
  );
$$;

create function pg_temp.insert_balance(p_booking_id uuid, p_invoice_id uuid, p_amount integer, p_fee integer, p_pi text)
returns void
language sql
as $$
  insert into public.booking_payments (
    booking_id, invoice_id, kind, amount_cents, application_fee_cents, currency, status,
    idempotency_key, stripe_payment_intent_id, stripe_connected_account_id,
    stripe_customer_id, stripe_payment_method_id, customer_authorization_version, succeeded_at
  ) values (
    p_booking_id, p_invoice_id, 'balance', p_amount, p_fee, 'usd', 'succeeded',
    'bal_' || p_booking_id::text || '_0', p_pi, 'acct_phase6', 'cus_phase6', 'pm_phase6',
    'hourly-v1-saved-method', now()
  );
$$;

create function pg_temp.insert_invoice(
  p_booking_id uuid, p_minutes smallint, p_subtotal integer, p_fee integer,
  p_remaining integer, p_status public.booking_invoice_status, p_resolved_at timestamptz
)
returns uuid
language sql
as $$
  insert into public.booking_invoices (
    booking_id, submitted_minutes, estimated_minutes_snapshot,
    hourly_rate_cents_snapshot, platform_fee_bps_snapshot, subtotal_cents,
    total_platform_fee_cents, first_hour_credit_cents, remaining_balance_cents,
    status, submitted_at, autocharge_at, resolved_at
  ) values (
    p_booking_id, p_minutes, 120, 5000, 500, p_subtotal, p_fee, 5000, p_remaining,
    p_status, now() - interval '1 hour', now() + interval '23 hours', p_resolved_at
  ) returning id;
$$;

create function pg_temp.as_user(p_uid uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true);
  select set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

-- ===========================================================================
-- Customer cancellation matrix
-- ===========================================================================
-- CX1 requested (unpaid); CX2 accepted (unpaid); CX3 booked >12h + captured;
-- CX4 booked <12h + captured; CX5 booked at the 12h boundary + captured;
-- CX6 arrived; CX7 booked start-passed (no-show).
select pg_temp.insert_booking('40000000-0000-0000-0000-000000004501', 'requested', now() + interval '2 days', null, null);
select pg_temp.insert_booking('40000000-0000-0000-0000-000000004502', 'accepted', now() + interval '2 days', null, null);
select pg_temp.insert_booking('40000000-0000-0000-0000-000000004503', 'booked', now() + interval '24 hours', null, null);
select pg_temp.insert_booking('40000000-0000-0000-0000-000000004504', 'booked', now() + interval '6 hours', null, null);
select pg_temp.insert_booking('40000000-0000-0000-0000-000000004505', 'booked', now() + interval '12 hours' + interval '1 minute', null, null);
select pg_temp.insert_booking('40000000-0000-0000-0000-000000004506', 'in_progress', now() - interval '1 hour', now() - interval '30 minutes', null);
select pg_temp.insert_booking('40000000-0000-0000-0000-000000004507', 'booked', now() - interval '1 hour', null, null);
select pg_temp.insert_first_hour('40000000-0000-0000-0000-000000004503', 'pi_cx3');
select pg_temp.insert_first_hour('40000000-0000-0000-0000-000000004504', 'pi_cx4');
select pg_temp.insert_first_hour('40000000-0000-0000-0000-000000004505', 'pi_cx5');
select pg_temp.insert_first_hour('40000000-0000-0000-0000-000000004507', 'pi_cx7');

select pg_temp.as_user('40000000-0000-0000-0000-000000004101');
set local role authenticated;

select is(
  public.cancel_booking_as_customer('40000000-0000-0000-0000-000000004501'),
  'no_payment', 'cancelling an unpaid request has no refund'
);
select is(
  public.cancel_booking_as_customer('40000000-0000-0000-0000-000000004502'),
  'no_payment', 'cancelling an unpaid acceptance has no refund'
);
select is(
  public.cancel_booking_as_customer('40000000-0000-0000-0000-000000004503'),
  'full_refund', 'cancelling >12h before start fully refunds the first hour'
);
select is(
  public.cancel_booking_as_customer('40000000-0000-0000-0000-000000004504'),
  'no_refund', 'cancelling <12h before start keeps the first-hour charge'
);
select is(
  public.cancel_booking_as_customer('40000000-0000-0000-0000-000000004505'),
  'full_refund', 'cancelling at the 12h boundary fully refunds'
);
select pg_temp.throws_any_ok(
  $$ select public.cancel_booking_as_customer('40000000-0000-0000-0000-000000004506') $$,
  'cancelling an arrived booking is rejected (dispute path)'
);
select pg_temp.throws_any_ok(
  $$ select public.cancel_booking_as_customer('40000000-0000-0000-0000-000000004507') $$,
  'a passed-start no-show cannot be cancelled (dispute path)'
);

-- State assertions read server-only tables under the privileged test role.
reset role;
select results_eq(
  $$ select amount_cents, status::text, idempotency_key
     from public.booking_refunds where booking_id = '40000000-0000-0000-0000-000000004503' $$,
  $$ values (5000, 'created', 'refund_cxl_40000000-0000-0000-0000-000000004503') $$,
  'a full-refund cancellation records one first-hour refund request'
);
select is(
  (select count(*) from public.booking_refunds where booking_id = '40000000-0000-0000-0000-000000004504')::integer,
  0, 'a no-refund cancellation records no refund request'
);
select results_eq(
  $$ select status::text, cancellation_policy_result
     from public.bookings where id = '40000000-0000-0000-0000-000000004504' $$,
  $$ values ('cancelled', 'no_refund') $$,
  'the late cancellation is recorded as no_refund'
);

-- ===========================================================================
-- Provider cancellation
-- ===========================================================================
select pg_temp.insert_booking('40000000-0000-0000-0000-000000004520', 'booked', now() + interval '3 hours', null, null);
select pg_temp.insert_first_hour('40000000-0000-0000-0000-000000004520', 'pi_pc20');
select pg_temp.insert_booking('40000000-0000-0000-0000-000000004521', 'in_progress', now() - interval '1 hour', now() - interval '30 minutes', null);

select pg_temp.as_user('40000000-0000-0000-0000-000000004102');
set local role authenticated;

select pg_temp.throws_any_ok(
  $$ select public.cancel_booking_as_provider('40000000-0000-0000-0000-000000004520', '  ') $$,
  'a provider cancellation requires a reason'
);
select is(
  public.cancel_booking_as_provider('40000000-0000-0000-0000-000000004520', 'Family emergency, cannot make it'),
  'full_refund', 'a provider cancellation before arrival fully refunds even inside 12h'
);
select pg_temp.throws_any_ok(
  $$ select public.cancel_booking_as_provider('40000000-0000-0000-0000-000000004521', 'Too late now') $$,
  'a provider cannot cancel after arrival (dispute path)'
);

reset role;
select results_eq(
  $$ select status::text, cancelled_by_role::text
     from public.bookings where id = '40000000-0000-0000-0000-000000004520' $$,
  $$ values ('cancelled', 'provider') $$,
  'the provider cancellation is attributed to the provider'
);

-- ===========================================================================
-- Refund settlement + webhook reconciliation (service role)
-- ===========================================================================
set local role service_role;

select is(
  public.settle_booking_refund('refund_cxl_40000000-0000-0000-0000-000000004503', 'succeeded', 're_cx3', 'trr_cx3'),
  'succeeded', 'settling a full refund succeeds'
);
select results_eq(
  $$ select
       (select status::text from public.booking_refunds where idempotency_key = 'refund_cxl_40000000-0000-0000-0000-000000004503'),
       (select status::text from public.booking_payments where booking_id = '40000000-0000-0000-0000-000000004503' and kind = 'first_hour') $$,
  $$ values ('succeeded', 'refunded') $$,
  'a settled full refund retires the payment'
);
select is(
  public.settle_booking_refund('refund_cxl_40000000-0000-0000-0000-000000004503', 'succeeded', 're_cx3', 'trr_cx3'),
  'already_settled', 'settling a refund twice is idempotent'
);
select is(
  public.reconcile_stripe_refund('pi_cx3', 're_cx3', 5000, 'stripe_charge_refunded'),
  'already_recorded', 'a charge.refunded webhook for an already-settled refund is a no-op'
);
select is(
  public.reconcile_stripe_refund('pi_cx5', 're_cx5_ext', 5000, 'dashboard_refund'),
  'reconciled', 'a dashboard-initiated refund is reconciled from the webhook'
);
select is(
  (select status::text from public.booking_payments where booking_id = '40000000-0000-0000-0000-000000004505' and kind = 'first_hour'),
  'refunded', 'the reconciled full refund retires the first-hour payment'
);

-- ===========================================================================
-- Customer disputes
-- ===========================================================================
reset role;
-- DP1 precharge invoice_review; DP3 no-show booked past start;
-- DP4 late completed in window (with a captured balance); DP5 late out of window.
select pg_temp.insert_booking('40000000-0000-0000-0000-000000004601', 'invoice_review', now() - interval '2 hours', now() - interval '90 minutes', now() - interval '1 hour');
select pg_temp.insert_first_hour('40000000-0000-0000-0000-000000004601', 'pi_dp1');
select pg_temp.insert_invoice('40000000-0000-0000-0000-000000004601', 90::smallint, 7500, 375, 2500, 'review', null);

select pg_temp.insert_booking('40000000-0000-0000-0000-000000004603', 'booked', now() - interval '30 minutes', null, null);
select pg_temp.insert_first_hour('40000000-0000-0000-0000-000000004603', 'pi_dp3');

select pg_temp.insert_booking('40000000-0000-0000-0000-000000004604', 'completed', now() - interval '3 days', now() - interval '3 days', now() - interval '3 days');
select pg_temp.insert_first_hour('40000000-0000-0000-0000-000000004604', 'pi_dp4');
select insert_dp4_invoice.id from (
  select pg_temp.insert_invoice('40000000-0000-0000-0000-000000004604', 90::smallint, 7500, 375, 2500, 'paid', now() - interval '2 days') as id
) insert_dp4_invoice;
select pg_temp.insert_balance('40000000-0000-0000-0000-000000004604',
  (select id from public.booking_invoices where booking_id = '40000000-0000-0000-0000-000000004604'),
  2500, 125, 'pi_dp4_bal');

select pg_temp.insert_booking('40000000-0000-0000-0000-000000004605', 'completed', now() - interval '30 days', now() - interval '30 days', now() - interval '30 days');
select pg_temp.insert_first_hour('40000000-0000-0000-0000-000000004605', 'pi_dp5');
select pg_temp.insert_invoice('40000000-0000-0000-0000-000000004605', 90::smallint, 7500, 375, 2500, 'paid', now() - interval '20 days');

select pg_temp.as_user('40000000-0000-0000-0000-000000004101');
set local role authenticated;

select pg_temp.throws_any_ok(
  $$ select public.open_booking_dispute('40000000-0000-0000-0000-000000004601', 'service', 'too short') $$,
  'a narrative under ten characters is rejected'
);
select isnt(
  public.open_booking_dispute('40000000-0000-0000-0000-000000004601', 'service', 'The lawn was only half finished before they left the site.'),
  null, 'a precharge dispute opens'
);
select results_eq(
  $$ select
       (select status::text from public.bookings where id = '40000000-0000-0000-0000-000000004601'),
       (select autocharge_at is null from public.booking_invoices where booking_id = '40000000-0000-0000-0000-000000004601') $$,
  $$ values ('disputed', true) $$,
  'a precharge dispute freezes the booking and clears the autocharge deadline'
);
select pg_temp.throws_any_ok(
  $$ select public.open_booking_dispute('40000000-0000-0000-0000-000000004601', 'service', 'Trying to open a second dispute on the same booking here.') $$,
  'a second dispute on the same booking is rejected'
);
select isnt(
  public.open_booking_dispute('40000000-0000-0000-0000-000000004603', 'provider_no_show', 'The provider never showed up or tapped arrived.'),
  null, 'a passed-start no-show dispute opens'
);
select is(
  (select status::text from public.bookings where id = '40000000-0000-0000-0000-000000004603'),
  'disputed', 'the no-show booking moves to disputed'
);
select isnt(
  public.open_booking_dispute('40000000-0000-0000-0000-000000004604', 'hours', 'They billed far more time than the job actually took.'),
  null, 'a late dispute within seven days is accepted'
);
select is(
  (select status::text from public.bookings where id = '40000000-0000-0000-0000-000000004604'),
  'completed', 'a late dispute leaves the completed booking unchanged'
);
select pg_temp.throws_any_ok(
  $$ select public.open_booking_dispute('40000000-0000-0000-0000-000000004605', 'hours', 'Trying to dispute long after the seven day window closed.') $$,
  'a dispute past the seven-day late window is rejected'
);

-- ===========================================================================
-- Founder resolution (admin only)
-- ===========================================================================
select pg_temp.throws_any_ok(
  $$ select * from public.resolve_booking_dispute('40000000-0000-0000-0000-000000004601', 'waive_remaining_balance', 'nope') $$,
  'a non-admin cannot resolve a dispute'
);

reset role;
select pg_temp.as_user('40000000-0000-0000-0000-000000004103');
set local role authenticated;
select is(
  (select outcome from public.resolve_booking_dispute(
     '40000000-0000-0000-0000-000000004601', 'approve_submitted_hours', 'Hours look correct after review.')),
  'charge_required', 'approving an unpaid disputed invoice requires the balance charge'
);
select pg_temp.throws_any_ok(
  $$ select * from public.resolve_booking_dispute('40000000-0000-0000-0000-000000004601', 'waive_remaining_balance', 'again') $$,
  'a resolved dispute cannot be resolved again'
);

reset role;
select is(
  (select status::text from public.booking_disputes where booking_id = '40000000-0000-0000-0000-000000004601'),
  'resolved', 'the dispute is marked resolved with the audit note'
);

-- The approved charge then settles disputed -> completed (service role).
set local role service_role;
update public.booking_payments set stripe_payment_intent_id = 'pi_dp1_bal'
where booking_id = '40000000-0000-0000-0000-000000004601' and kind = 'balance';
select is(
  public.settle_balance_payment('pi_dp1_bal', now()),
  'completed', 'an approved disputed booking completes on the balance charge'
);
select is(
  (select status::text from public.bookings where id = '40000000-0000-0000-0000-000000004601'),
  'completed', 'the disputed booking reaches completed after the approved charge'
);

-- Audit note is mandatory; no-show cancel_and_refund; reduce-paid partial refund.
reset role;
select pg_temp.as_user('40000000-0000-0000-0000-000000004103');
set local role authenticated;
select pg_temp.throws_any_ok(
  $$ select * from public.resolve_booking_dispute('40000000-0000-0000-0000-000000004603', 'waive_remaining_balance', '   ') $$,
  'a resolution without an audit note is rejected'
);
select is(
  (select outcome from public.resolve_booking_dispute(
     '40000000-0000-0000-0000-000000004603', 'cancel_and_refund', 'Provider no-showed; refund the customer.')),
  'refund_required', 'a no-show resolution refunds the captured first hour'
);
select is(
  (select outcome from public.resolve_booking_dispute(
     '40000000-0000-0000-0000-000000004604', 'reduce_billable_minutes',
     'Reduce to 75 minutes per the customer.', 75)),
  'refund_required', 'reducing a paid invoice refunds the difference'
);

reset role;
select results_eq(
  $$ select status::text, cancellation_policy_result
     from public.bookings where id = '40000000-0000-0000-0000-000000004603' $$,
  $$ values ('cancelled', 'full_refund') $$,
  'a no-show cancel_and_refund cancels the booking'
);
select results_eq(
  $$ select amount_cents, status::text
     from public.booking_refunds where idempotency_key = 'refund_admin_fh_40000000-0000-0000-0000-000000004603' $$,
  $$ values (5000, 'created') $$,
  'the no-show refund request targets the first-hour payment'
);
select results_eq(
  $$ select amount_cents, status::text
     from public.booking_refunds where idempotency_key = 'refund_reduce_40000000-0000-0000-0000-000000004604' $$,
  $$ values (1250, 'created') $$,
  'the reduce-paid resolution refunds the 1250-cent difference'
);
select results_eq(
  $$ select resolution_kind::text, resolved_billable_minutes
     from public.booking_disputes where booking_id = '40000000-0000-0000-0000-000000004604' $$,
  $$ values ('reduce_billable_minutes', 75::smallint) $$,
  'the reduction is recorded on the resolved dispute'
);

-- ===========================================================================
-- Dispute-versus-payment-success race: an OPEN dispute defers completion.
-- ===========================================================================
select pg_temp.insert_booking('40000000-0000-0000-0000-000000004701', 'disputed', now() - interval '2 hours', now() - interval '90 minutes', now() - interval '1 hour');
select pg_temp.insert_first_hour('40000000-0000-0000-0000-000000004701', 'pi_race');
select pg_temp.insert_invoice('40000000-0000-0000-0000-000000004701', 90::smallint, 7500, 375, 2500, 'processing', null);
insert into public.booking_disputes (booking_id, customer_id, category, narrative)
values ('40000000-0000-0000-0000-000000004701', '40000000-0000-0000-0000-000000004101',
        'payment', 'Disputing the charge while a payment was already in flight.');
insert into public.booking_payments (
  booking_id, invoice_id, kind, amount_cents, application_fee_cents, currency,
  status, idempotency_key, stripe_payment_intent_id, stripe_connected_account_id,
  customer_authorization_version
) values (
  '40000000-0000-0000-0000-000000004701',
  (select id from public.booking_invoices where booking_id = '40000000-0000-0000-0000-000000004701'),
  'balance', 2500, 125, 'usd', 'processing', 'bal_race', 'pi_race_bal', 'acct_phase6', 'hourly-v1-saved-method'
);

set local role service_role;
select is(
  public.settle_balance_payment('pi_race_bal', now()),
  'settled_no_transition', 'a balance success while a dispute is open does not complete the booking'
);
select is(
  (select status::text from public.bookings where id = '40000000-0000-0000-0000-000000004701'),
  'disputed', 'the booking stays disputed for founder review'
);
select is(
  (select status::text from public.booking_payments where stripe_payment_intent_id = 'pi_race_bal'),
  'succeeded', 'the captured payment is still recorded as succeeded'
);

-- ===========================================================================
-- External card dispute recording (service role)
-- ===========================================================================
select is(
  public.record_stripe_dispute(
    jsonb_build_object(
      'data', jsonb_build_object('object', jsonb_build_object(
        'id', 'dp_ext_1', 'charge', 'ch_ext_1', 'payment_intent', 'pi_dp4',
        'amount', 7500, 'currency', 'usd', 'reason', 'fraudulent', 'status', 'needs_response',
        'is_charge_refundable', true,
        'evidence_details', jsonb_build_object('due_by', 1800000000)
      ))
    )
  ),
  'recorded', 'an external card dispute is recorded'
);
select results_eq(
  $$ select stripe_dispute_id, booking_id, status
     from public.stripe_disputes where stripe_dispute_id = 'dp_ext_1' $$,
  $$ values ('dp_ext_1', '40000000-0000-0000-0000-000000004604'::uuid, 'needs_response') $$,
  'the card dispute is matched to its booking by payment intent'
);
select is(
  public.record_stripe_dispute(
    jsonb_build_object('data', jsonb_build_object('object', jsonb_build_object(
      'id', 'dp_ext_1', 'charge', 'ch_ext_1', 'payment_intent', 'pi_dp4',
      'amount', 7500, 'currency', 'usd', 'reason', 'fraudulent', 'status', 'won',
      'is_charge_refundable', false)))),
  'recorded', 'a follow-up card dispute event upserts'
);
select is(
  (select status from public.stripe_disputes where stripe_dispute_id = 'dp_ext_1'),
  'won', 'the card dispute status updates without a new row'
);
select is(
  (select count(*) from public.stripe_disputes where stripe_dispute_id = 'dp_ext_1')::integer,
  1, 'the card dispute is a single upserted row'
);
select is(
  (select count(*) from public.booking_disputes where booking_id = '40000000-0000-0000-0000-000000004604')::integer,
  1, 'the external card dispute never merges into internal disputes'
);

reset role;
select * from finish();
rollback;
