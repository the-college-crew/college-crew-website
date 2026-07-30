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
  has_function_privilege('authenticated', 'public.begin_balance_payment(uuid,integer)', 'execute'),
  true, 'customers can begin a tipped balance payment'
);
select is(
  has_function_privilege('anon', 'public.begin_balance_payment(uuid,integer)', 'execute'),
  false, 'anonymous users cannot begin a balance payment'
);
select is(
  has_function_privilege('authenticated', 'public.reset_balance_payment_for_retry(uuid,integer)', 'execute'),
  true, 'customers can re-price a retry with a tip'
);
select is(
  has_function_privilege('anon', 'public.reset_balance_payment_for_retry(uuid,integer)', 'execute'),
  false, 'anonymous users cannot re-price a retry'
);

-- ---------------------------------------------------------------------------
-- Fixtures — one customer, one provider, four invoiced jobs
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('30000000-0000-0000-0000-000000009101', 'tip-customer@example.test', now(),
   '{"role":"customer","full_name":"Tip Customer"}'::jsonb),
  ('30000000-0000-0000-0000-000000009102', 'tip-provider@example.test', now(),
   '{"role":"provider","full_name":"Tip Provider"}'::jsonb);

update public.profiles
set address_line1 = '900 Test Street', city = 'Chicago', state = 'IL', postal_code = '60614'
where id = '30000000-0000-0000-0000-000000009101';

insert into public.provider_profiles (
  id, user_id, display_name, bio, verification_status, stripe_account_id,
  service_zip, availability_weekdays, availability_start_local,
  availability_end_local, availability_note, minimum_notice_hours,
  stripe_transfers_active, stripe_transfers_checked_at
)
values (
  '30000000-0000-0000-0000-000000009201',
  '30000000-0000-0000-0000-000000009102',
  'Tip Provider', '', 'approved', 'acct_tip', '60614',
  array[0,1,2,3,4,5,6]::smallint[], '00:00', '23:45', '', 3, true, now()
);

insert into public.services (id, name, slug, category, is_live)
values ('30000000-0000-0000-0000-000000009301', 'Tip Service', 'tip-service', 'Test', true);

insert into public.provider_services (
  id, provider_id, service_id, price_cents, price_type, unit, hourly_rate_cents
)
values (
  '30000000-0000-0000-0000-000000009401',
  '30000000-0000-0000-0000-000000009201',
  '30000000-0000-0000-0000-000000009301',
  0, 'quote', 'per_hour', 5000
);

create function pg_temp.insert_booking(p_id uuid, p_status public.booking_status)
returns void
language sql
as $$
  insert into public.bookings (
    id, customer_id, provider_id, service_id, status, scheduled_at, address,
    details, price_cents, platform_fee_cents, booking_flow, estimated_minutes,
    job_zip, hourly_rate_cents_snapshot, platform_fee_bps, billing_minimum_minutes,
    billing_increment_minutes, cancellation_notice_hours, pilot_timezone,
    response_window_hours, response_alert_at, created_at, accepted_at,
    initial_payment_due_at, arrived_at, work_completed_at,
    customer_name_snapshot, provider_display_name_snapshot, service_name_snapshot,
    fee_policy_version, cancellation_policy_version, terms_version,
    customer_authorization_version, policy_snapshot, customer_authorization_snapshot
  )
  values (
    p_id,
    '30000000-0000-0000-0000-000000009101',
    '30000000-0000-0000-0000-000000009201',
    '30000000-0000-0000-0000-000000009301',
    p_status, now() - interval '3 hours', '900 Test Street, Chicago, IL', 'Synthetic',
    5000, 250, 'hourly_v1', 120, '60614', 5000, 500, 60, 15, 12,
    'America/Chicago', 3,
    now() - interval '1 day' + interval '3 hours',
    now() - interval '1 day',
    now() - interval '1 day',
    now() - interval '12 hours',
    now() - interval '2 hours', now() - interval '1 hour',
    'Tip Customer', 'Tip Provider', 'Tip Service',
    'hourly-v1-500bps', 'hourly-v1-12h', '2026-07-08', 'hourly-v1-saved-method',
    '{"platform_fee_bps":500}'::jsonb,
    '{"version":"hourly-v1-saved-method","scope":"booking_only"}'::jsonb
  );
$$;

create function pg_temp.insert_first_hour(p_booking_id uuid)
returns void
language sql
as $$
  insert into public.booking_payments (
    booking_id, kind, amount_cents, application_fee_cents, currency, status,
    idempotency_key, stripe_connected_account_id, stripe_customer_id,
    stripe_payment_method_id, stripe_payment_intent_id,
    customer_authorization_version, succeeded_at
  ) values (
    p_booking_id, 'first_hour', 5000, 250, 'usd', 'succeeded',
    'fh_' || p_booking_id::text, 'acct_tip', 'cus_tip', 'pm_tip',
    'pi_fh_' || p_booking_id::text,
    'hourly-v1-saved-method', now()
  );
$$;

create function pg_temp.insert_invoice(
  p_booking_id uuid, p_minutes smallint, p_subtotal integer, p_fee integer,
  p_remaining integer
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
    'review', now(), now() + interval '24 hours'
  ) returning id;
$$;

-- BK1 90 min ($75 job, $25 balance) — the tipped happy path.
-- BK2 60 min ($50 job, $0 balance) — the tip-only charge.
-- BK3 90 min — retry re-pricing.
-- BK4 90 min — the dispute rewrite clearing an uncharged tip.
select pg_temp.insert_booking('30000000-0000-0000-0000-000000009501', 'invoice_review');
select pg_temp.insert_booking('30000000-0000-0000-0000-000000009502', 'invoice_review');
select pg_temp.insert_booking('30000000-0000-0000-0000-000000009503', 'invoice_review');
select pg_temp.insert_booking('30000000-0000-0000-0000-000000009504', 'invoice_review');
select pg_temp.insert_first_hour('30000000-0000-0000-0000-000000009501');
select pg_temp.insert_first_hour('30000000-0000-0000-0000-000000009502');
select pg_temp.insert_first_hour('30000000-0000-0000-0000-000000009503');
select pg_temp.insert_first_hour('30000000-0000-0000-0000-000000009504');
select pg_temp.insert_invoice('30000000-0000-0000-0000-000000009501', 90::smallint, 7500, 375, 2500);
select pg_temp.insert_invoice('30000000-0000-0000-0000-000000009502', 60::smallint, 5000, 250, 0);
select pg_temp.insert_invoice('30000000-0000-0000-0000-000000009503', 90::smallint, 7500, 375, 2500);
select pg_temp.insert_invoice('30000000-0000-0000-0000-000000009504', 90::smallint, 7500, 375, 2500);

-- ---------------------------------------------------------------------------
-- Defaults and bounds
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select count(*)::int from public.booking_invoices where tip_cents <> 0 $$,
  $$ values (0) $$,
  'a fresh invoice carries no tip'
);
select pg_temp.throws_any_ok(
  $$ update public.booking_invoices set tip_cents = -1
     where booking_id = '30000000-0000-0000-0000-000000009501' $$,
  'a negative tip is rejected'
);
select pg_temp.throws_any_ok(
  $$ update public.booking_invoices set tip_cents = 50001
     where booking_id = '30000000-0000-0000-0000-000000009501' $$,
  'a tip above the $500 ceiling is rejected'
);

-- ---------------------------------------------------------------------------
-- The 100%-to-the-student guarantee (authenticated customer)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000009101', true);
select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000009101","role":"authenticated"}', true);
set local role authenticated;

-- The untipped baseline: $25 balance, split fee 375 - 250 = 125.
select results_eq(
  $$ select amount_cents, application_fee_cents
     from public.begin_balance_payment(
       (select id from public.booking_invoices
        where booking_id = '30000000-0000-0000-0000-000000009501'), 0) $$,
  $$ values (2500, 125) $$,
  'an untipped balance charges the remaining balance at the split fee'
);

-- The whole point: a $10 tip raises the charge by exactly $10 and the platform
-- fee does not move a cent.
select results_eq(
  $$ select amount_cents, application_fee_cents
     from public.begin_balance_payment(
       (select id from public.booking_invoices
        where booking_id = '30000000-0000-0000-0000-000000009501'), 1000) $$,
  $$ values (3500, 125) $$,
  'a tip raises the charge by the tip and never the platform fee'
);
select results_eq(
  $$ select tip_cents, subtotal_cents, total_platform_fee_cents, remaining_balance_cents
     from public.booking_invoices where booking_id = '30000000-0000-0000-0000-000000009501' $$,
  $$ values (1000, 7500, 375, 2500) $$,
  'the tip is recorded outside the subtotal, so the derived money columns stand'
);
-- booking_payments is never browser-readable, so this check reads as the server.
reset role;
set local role service_role;
select results_eq(
  $$ select attempt_count, idempotency_key
     from public.booking_payments
     where booking_id = '30000000-0000-0000-0000-000000009501' and kind = 'balance' $$,
  $$ values (1::smallint, 'bal_30000000-0000-0000-0000-000000009501_1'::text) $$,
  'changing the amount mints a fresh idempotency key rather than replaying the old one'
);
reset role;
set local role authenticated;

-- Changing the tip again re-prices; passing null leaves it alone.
select results_eq(
  $$ select amount_cents from public.begin_balance_payment(
       (select id from public.booking_invoices
        where booking_id = '30000000-0000-0000-0000-000000009501'), 2000) $$,
  $$ values (4500) $$,
  'raising the tip re-prices the pending charge'
);
select results_eq(
  $$ select amount_cents from public.begin_balance_payment(
       (select id from public.booking_invoices
        where booking_id = '30000000-0000-0000-0000-000000009501')) $$,
  $$ values (4500) $$,
  'omitting the tip preserves the recorded one (the single-argument callers)'
);
select results_eq(
  $$ select amount_cents from public.begin_balance_payment(
       (select id from public.booking_invoices
        where booking_id = '30000000-0000-0000-0000-000000009501'), 0) $$,
  $$ values (2500) $$,
  'clearing the tip drops back to the bare balance'
);
select results_eq(
  $$ select amount_cents from public.begin_balance_payment(
       (select id from public.booking_invoices
        where booking_id = '30000000-0000-0000-0000-000000009501'), 999999) $$,
  $$ values (52500) $$,
  'an absurd tip is clamped to the ceiling rather than rejected'
);

-- ---------------------------------------------------------------------------
-- The tip-only charge on a job of an hour or less
-- ---------------------------------------------------------------------------
select pg_temp.throws_any_ok(
  $$ select public.begin_balance_payment(
       (select id from public.booking_invoices
        where booking_id = '30000000-0000-0000-0000-000000009502'), 0) $$,
  'a zero-balance invoice with no tip still has nothing to charge'
);
select results_eq(
  $$ select amount_cents, application_fee_cents
     from public.begin_balance_payment(
       (select id from public.booking_invoices
        where booking_id = '30000000-0000-0000-0000-000000009502'), 1500) $$,
  $$ values (1500, 0) $$,
  'a tipped one-hour job charges the tip alone, with no platform fee on it'
);
select pg_temp.throws_any_ok(
  $$ select public.settle_zero_balance_invoice(
       (select id from public.booking_invoices
        where booking_id = '30000000-0000-0000-0000-000000009502')) $$,
  'the no-charge path refuses to swallow a tip'
);

-- ---------------------------------------------------------------------------
-- Retry re-pricing
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select amount_cents from public.begin_balance_payment(
       (select id from public.booking_invoices
        where booking_id = '30000000-0000-0000-0000-000000009503'), 500) $$,
  $$ values (3000) $$,
  'a tipped charge is staged for the job that will fail'
);
reset role;
set local role service_role;
update public.booking_payments set stripe_payment_intent_id = 'pi_tip3'
where booking_id = '30000000-0000-0000-0000-000000009503' and kind = 'balance';
select is(
  public.mark_balance_payment_unsuccessful('pi_tip3', 'failed', 'card_declined', 'Card declined'),
  'failed', 'the tipped charge is recorded as failed'
);
reset role;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000009101', true);
select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000009101","role":"authenticated"}', true);
set local role authenticated;
select results_eq(
  $$ select amount_cents from public.reset_balance_payment_for_retry(
       (select id from public.booking_invoices
        where booking_id = '30000000-0000-0000-0000-000000009503')) $$,
  $$ values (3000) $$,
  'recovery keeps the tip the customer already chose'
);
select results_eq(
  $$ select amount_cents from public.reset_balance_payment_for_retry(
       (select id from public.booking_invoices
        where booking_id = '30000000-0000-0000-0000-000000009503'), 0) $$,
  $$ values (2500) $$,
  'recovery can also drop the tip'
);

-- ---------------------------------------------------------------------------
-- An uncharged tip is discarded when a dispute rewrites the billing
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select amount_cents from public.begin_balance_payment(
       (select id from public.booking_invoices
        where booking_id = '30000000-0000-0000-0000-000000009504'), 1000) $$,
  $$ values (3500) $$,
  'a tip is staged on the job that will be disputed'
);
reset role;
update public.booking_invoices
set remaining_balance_cents = 1250, subtotal_cents = 6250, total_platform_fee_cents = 313,
    submitted_minutes = 75
where booking_id = '30000000-0000-0000-0000-000000009504';
select results_eq(
  $$ select tip_cents from public.booking_invoices
     where booking_id = '30000000-0000-0000-0000-000000009504' $$,
  $$ values (0) $$,
  'rewriting an unpaid balance discards the tip that was never collected'
);

update public.booking_invoices set tip_cents = 1000, status = 'review'
where booking_id = '30000000-0000-0000-0000-000000009501';
update public.booking_invoices set status = 'waived'
where booking_id = '30000000-0000-0000-0000-000000009501';
select results_eq(
  $$ select tip_cents from public.booking_invoices
     where booking_id = '30000000-0000-0000-0000-000000009501' $$,
  $$ values (0) $$,
  'waiving the balance discards the uncharged tip'
);

-- A paid invoice keeps its tip: a partial dispute refund leaves it with the
-- student, and a full refund returns it via the payment amount.
update public.booking_invoices set tip_cents = 1000, status = 'paid'
where booking_id = '30000000-0000-0000-0000-000000009503';
select results_eq(
  $$ select tip_cents from public.booking_invoices
     where booking_id = '30000000-0000-0000-0000-000000009503' $$,
  $$ values (1000) $$,
  'a paid invoice keeps the tip it actually collected'
);

-- ---------------------------------------------------------------------------
-- Payout — the student is transferred the tip in full
-- ---------------------------------------------------------------------------
set local role service_role;
-- BK2 is the one-hour job: a $0 balance and a $15 tip, so the balance leg is
-- pure tip. It is the sharpest possible version of the guarantee.
update public.booking_invoices set status = 'paid'
where booking_id = '30000000-0000-0000-0000-000000009502';
update public.booking_payments
set status = 'succeeded', succeeded_at = now(), stripe_payment_intent_id = 'pi_tip2'
where booking_id = '30000000-0000-0000-0000-000000009502' and kind = 'balance';

-- The rake is withheld from the first hour ($50 - $2.50); the tip leg transfers
-- 1:1, so the student receives all $15.
select results_eq(
  $$ select kind::text, payout_amount_cents
     from public.provider_payout_plan('30000000-0000-0000-0000-000000009502')
     order by kind::text $$,
  $$ values ('balance'::text, 1500), ('first_hour'::text, 4750) $$,
  'the tip transfers to the student in full while the rake stays on the first hour'
);

select * from finish();
rollback;
