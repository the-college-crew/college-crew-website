begin;

select plan(5);

create function pg_temp.response_deadline_tamper_rejected(p_booking_id uuid)
returns boolean
language plpgsql
as $$
begin
  update public.bookings
  set response_alert_at = response_alert_at + interval '15 minutes'
  where id = p_booking_id;
  return false;
exception
  when others then
    return sqlerrm = 'booking response deadline requires a trusted operation';
end;
$$;

-- This standing local-only regression exercises the complete customer
-- selection path. Every row is synthetic, transaction-scoped, and rolled back.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  (
    '95000000-0000-0000-0000-000000009501',
    'quote-counter-customer@example.test',
    now(),
    '{"role":"customer","full_name":"Quote Counter Customer"}'::jsonb
  ),
  (
    '95000000-0000-0000-0000-000000009502',
    'quote-counter-provider@example.test',
    now(),
    '{"role":"provider","full_name":"Quote Counter Provider Owner"}'::jsonb
  );

update public.profiles
set address_line1 = '950 Test Street',
    city = 'Chicago',
    state = 'IL',
    postal_code = '60614'
where id = '95000000-0000-0000-0000-000000009501';

insert into public.provider_profiles (
  id, user_id, display_name, bio, verification_status, stripe_account_id,
  service_zip, availability_weekdays, availability_start_local,
  availability_end_local, availability_note, minimum_notice_hours,
  stripe_transfers_active, stripe_transfers_checked_at
)
values (
  '95000000-0000-0000-0000-000000009503',
  '95000000-0000-0000-0000-000000009502',
  'Quote Counter Provider',
  '',
  'approved',
  'acct_quote_counter_test',
  '60614',
  array[0,1,2,3,4,5,6]::smallint[],
  '08:00',
  '17:00',
  '',
  12,
  true,
  now()
);

insert into public.provider_availability_windows (
  provider_id, weekday, start_local, end_local
)
select
  '95000000-0000-0000-0000-000000009503',
  weekday,
  '08:00'::time,
  '17:00'::time
from generate_series(0, 6) as weekdays(weekday);

insert into public.provider_services (
  id, provider_id, service_id, price_cents, price_type, unit,
  hourly_rate_cents, pricing_mode, average_quote_cents
)
select
  '95000000-0000-0000-0000-000000009504',
  '95000000-0000-0000-0000-000000009503',
  s.id,
  0,
  'quote',
  'per_job',
  null,
  'quote',
  25000
from public.services s
where s.slug = 'window-washing';

insert into public.legal_acceptances (
  user_id, kind, role, version, content_hash, signer_name, snapshot
)
values
  (
    '95000000-0000-0000-0000-000000009501',
    'platform_terms',
    'customer',
    '2026-07-20',
    '603a6f06820600bed07b092e4281c1d94e8f8b5d56b7dc9fe1c6e307d2047dd8',
    'Quote Counter Customer',
    '{}'::jsonb
  ),
  (
    '95000000-0000-0000-0000-000000009501',
    'customer_booking_terms',
    'customer',
    '2026-07-27',
    '4d0c985ce3809af8b6dacd25728ae38677164470553f2f2ac440d7a2e79f7c9d',
    'Quote Counter Customer',
    '{}'::jsonb
  ),
  (
    '95000000-0000-0000-0000-000000009502',
    'platform_terms',
    'customer',
    '2026-07-20',
    '603a6f06820600bed07b092e4281c1d94e8f8b5d56b7dc9fe1c6e307d2047dd8',
    'Quote Counter Provider Owner',
    '{}'::jsonb
  ),
  (
    '95000000-0000-0000-0000-000000009502',
    'provider_terms',
    'provider',
    '2026-07-15',
    'f0f882fde99647191d17ee6ffa74a33e636ffe6dc8550b0d63cbb6c055973aad',
    'Quote Counter Provider Owner',
    '{}'::jsonb
  );

select set_config(
  'request.jwt.claim.sub',
  '95000000-0000-0000-0000-000000009501',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"95000000-0000-0000-0000-000000009501","role":"authenticated"}',
  true
);
set local role authenticated;

create temporary table quote_counter_result (booking_id uuid);

insert into quote_counter_result
select public.create_quote_deposit_booking_request(
  '95000000-0000-0000-0000-000000009504',
  (current_date + 10)::date,
  'morning'::public.quote_daypart,
  '950 Test Street, Chicago, IL',
  '60614',
  jsonb_build_array(jsonb_build_object(
    'path',
    '95000000-0000-0000-0000-000000009501/quote-counter-test.jpg',
    'kind',
    'image',
    'mimeType',
    'image/jpeg',
    'sizeBytes',
    1024,
    'name',
    'quote-counter-test.jpg'
  )),
  'Synthetic quote counter selection regression',
  'home',
  'Chicago',
  null,
  null
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  '95000000-0000-0000-0000-000000009502',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"95000000-0000-0000-0000-000000009502","role":"authenticated"}',
  true
);
set local role authenticated;

select public.counter_quote_booking_request(
  (select booking_id from quote_counter_result),
  60,
  jsonb_build_array(
    jsonb_build_object(
      'localDate',
      (current_date + 11)::text,
      'daypart',
      'afternoon'
    ),
    jsonb_build_object(
      'localDate',
      (current_date + 12)::text,
      'daypart',
      'either'
    )
  ),
  'These windows work instead.'
);

reset role;
select set_config('college_crew.quote_v2_promotion', '', true);
select set_config('college_crew.trusted_booking_operation', '', true);

select ok(
  pg_temp.response_deadline_tamper_rejected(
    (select booking_id from quote_counter_result)
  ),
  'an untrusted caller still cannot rewrite the response deadline'
);

create temporary table saved_request_before_selection as
select
  b.id,
  b.details,
  b.address,
  b.job_zip,
  b.job_photos,
  b.customer_id,
  b.provider_id,
  b.service_id,
  b.policy_snapshot
from public.bookings b
join quote_counter_result r on r.booking_id = b.id;

select set_config(
  'request.jwt.claim.sub',
  '95000000-0000-0000-0000-000000009501',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"95000000-0000-0000-0000-000000009501","role":"authenticated"}',
  true
);
set local role authenticated;

select public.select_quote_counter_option(
  (select booking_id from quote_counter_result),
  (
    select o.id
    from public.booking_quote_counter_options o
    join quote_counter_result r on r.booking_id = o.booking_id
    where o.local_date = current_date + 11
  )
);

reset role;

select is(
  (
    select b.status
    from public.bookings b
    join quote_counter_result r on r.booking_id = b.id
  ),
  'requested'::public.booking_status,
  'selecting a counter option sends the saved request back to the provider'
);

select ok(
  exists (
    select 1
    from public.bookings b
    join quote_counter_result r on r.booking_id = b.id
    join public.booking_quote_counter_options o
      on o.booking_id = b.id and o.selected_at is not null
    where b.requested_local_date = current_date + 11
      and b.requested_daypart = 'afternoon'
      and b.response_alert_at = o.selected_at + interval '2 hours'
  ),
  'the chosen window is saved with a fresh two-hour response deadline'
);

select ok(
  exists (
    select 1
    from public.bookings b
    join saved_request_before_selection s on s.id = b.id
    where (
      b.details,
      b.address,
      b.job_zip,
      b.job_photos,
      b.customer_id,
      b.provider_id,
      b.service_id,
      b.policy_snapshot
    ) is not distinct from (
      s.details,
      s.address,
      s.job_zip,
      s.job_photos,
      s.customer_id,
      s.provider_id,
      s.service_id,
      s.policy_snapshot
    )
  ),
  'counter selection preserves the saved job, address, photos, and snapshots'
);

select ok(
  exists (
    select 1
    from public.email_outbox e
    join quote_counter_result r on r.booking_id = e.booking_id
    where e.recipient_user_id = '95000000-0000-0000-0000-000000009502'
      and e.template = 'quote_option_selected'
  ),
  'the selected option queues the provider notification'
);

select * from finish();
rollback;
