begin;

select '1..4';

create function pg_temp.booking_snapshot_tamper_rejected(p_booking_id uuid)
returns boolean
language plpgsql
as $$
begin
  update public.bookings
  set policy_snapshot = policy_snapshot || '{"tampered":true}'::jsonb
  where id = p_booking_id;
  return false;
exception
  when others then
    return sqlerrm =
      'booking identity, pricing, and policy snapshots are immutable';
end;
$$;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  (
    '94000000-0000-0000-0000-000000009401',
    'quote-response-customer@example.test',
    now(),
    '{"role":"customer","full_name":"Quote Response Customer"}'::jsonb
  ),
  (
    '94000000-0000-0000-0000-000000009402',
    'quote-response-provider@example.test',
    now(),
    '{"role":"provider","full_name":"Quote Response Provider Owner"}'::jsonb
  );

update public.profiles
set address_line1 = '940 Test Street',
    city = 'Chicago',
    state = 'IL',
    postal_code = '60614'
where id = '94000000-0000-0000-0000-000000009401';

insert into public.provider_profiles (
  id, user_id, display_name, bio, verification_status, stripe_account_id,
  service_zip, availability_weekdays, availability_start_local,
  availability_end_local, availability_note, minimum_notice_hours,
  stripe_transfers_active, stripe_transfers_checked_at
)
values (
  '94000000-0000-0000-0000-000000009403',
  '94000000-0000-0000-0000-000000009402',
  'Quote Response Provider',
  '',
  'approved',
  'acct_quote_response_test',
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
  '94000000-0000-0000-0000-000000009403',
  weekday,
  '08:00'::time,
  '17:00'::time
from generate_series(0, 6) as weekdays(weekday);

insert into public.provider_services (
  id, provider_id, service_id, price_cents, price_type, unit,
  hourly_rate_cents, pricing_mode, average_quote_cents
)
select
  '94000000-0000-0000-0000-000000009404',
  '94000000-0000-0000-0000-000000009403',
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
    '94000000-0000-0000-0000-000000009401',
    'platform_terms',
    'customer',
    '2026-07-20',
    '603a6f06820600bed07b092e4281c1d94e8f8b5d56b7dc9fe1c6e307d2047dd8',
    'Quote Response Customer',
    '{}'::jsonb
  ),
  (
    '94000000-0000-0000-0000-000000009401',
    'customer_booking_terms',
    'customer',
    '2026-07-27',
    '4d0c985ce3809af8b6dacd25728ae38677164470553f2f2ac440d7a2e79f7c9d',
    'Quote Response Customer',
    '{}'::jsonb
  ),
  (
    '94000000-0000-0000-0000-000000009402',
    'platform_terms',
    'customer',
    '2026-07-20',
    '603a6f06820600bed07b092e4281c1d94e8f8b5d56b7dc9fe1c6e307d2047dd8',
    'Quote Response Provider Owner',
    '{}'::jsonb
  ),
  (
    '94000000-0000-0000-0000-000000009402',
    'provider_terms',
    'provider',
    '2026-07-15',
    'f0f882fde99647191d17ee6ffa74a33e636ffe6dc8550b0d63cbb6c055973aad',
    'Quote Response Provider Owner',
    '{}'::jsonb
  );

select set_config(
  'request.jwt.claim.sub',
  '94000000-0000-0000-0000-000000009401',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"94000000-0000-0000-0000-000000009401","role":"authenticated"}',
  true
);
set local role authenticated;

create temporary table quote_response_result (booking_id uuid);

insert into quote_response_result
select public.create_quote_deposit_booking_request(
  '94000000-0000-0000-0000-000000009404',
  (current_date + 10)::date,
  'morning'::public.quote_daypart,
  '940 Test Street, Chicago, IL',
  '60614',
  jsonb_build_array(jsonb_build_object(
    'path',
    '94000000-0000-0000-0000-000000009401/window-washing-test.jpg',
    'kind',
    'image',
    'mimeType',
    'image/jpeg',
    'sizeBytes',
    1024,
    'name',
    'window-washing-test.jpg'
  )),
  'Synthetic quote response-window regression test',
  'home',
  'Chicago',
  null,
  null
);

reset role;

select case when exists (
  select 1
  from public.bookings b
  join quote_response_result r on r.booking_id = b.id
  where b.booking_flow = 'quote_v2'
    and b.status = 'requested'
    and b.response_window_hours = 2
    and b.scheduled_at is null
    and b.estimated_minutes is null
    and b.requested_daypart = 'morning'
) then
  'ok 1 - a valid quote date window creates a quote-v2 request with a two-hour response window'
else
  'not ok 1 - a valid quote date window creates a quote-v2 request with a two-hour response window'
end;

select case when (
  select count(*)
  from public.booking_automation_jobs j
  join quote_response_result r on r.booking_id = j.booking_id
  where j.kind = 'quote_response_expiration'
    and j.run_at = (
      select b.created_at + interval '2 hours'
      from public.bookings b
      where b.id = r.booking_id
    )
) = 1 then
  'ok 2 - the quote response automation is scheduled for the same two-hour deadline'
else
  'not ok 2 - the quote response automation is scheduled for the same two-hour deadline'
end;

do $$
begin
  if not exists (
    select 1
    from public.bookings b
    join quote_response_result r on r.booking_id = b.id
    where b.booking_flow = 'quote_v2'
      and b.status = 'requested'
      and b.response_window_hours = 2
      and b.scheduled_at is null
      and b.estimated_minutes is null
      and b.requested_daypart = 'morning'
  ) then
    raise exception 'quote-v2 request verification failed';
  end if;

  if (
    select count(*)
    from public.booking_automation_jobs j
    join quote_response_result r on r.booking_id = j.booking_id
    where j.kind = 'quote_response_expiration'
      and j.run_at = (
        select b.created_at + interval '2 hours'
        from public.bookings b
        where b.id = r.booking_id
      )
  ) <> 1 then
    raise exception 'quote response automation verification failed';
  end if;
end;
$$;

select case when pg_temp.booking_snapshot_tamper_rejected(
  (select booking_id from quote_response_result)
) then
  'ok 3 - the promotion flag cannot authorize an arbitrary snapshot rewrite'
else
  'not ok 3 - the promotion flag cannot authorize an arbitrary snapshot rewrite'
end;

select set_config(
  'request.jwt.claim.sub',
  '94000000-0000-0000-0000-000000009402',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"94000000-0000-0000-0000-000000009402","role":"authenticated"}',
  true
);
set local role authenticated;

select public.send_booking_quote(
  (select booking_id from quote_response_result),
  25000,
  ((current_date + 10)::timestamp + time '08:00') at time zone 'America/Chicago',
  60
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  '94000000-0000-0000-0000-000000009401',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"94000000-0000-0000-0000-000000009401","role":"authenticated"}',
  true
);
set local role authenticated;

insert into public.legal_acceptances (
  user_id, booking_id, kind, role, version, content_hash, signer_name, snapshot
)
select
  b.customer_id,
  b.id,
  'payment_authorization',
  'customer',
  b.customer_authorization_version,
  repeat('a', 64),
  'Quote Response Customer',
  jsonb_build_object(
    'version', b.customer_authorization_version,
    'bookingId', b.id,
    'quoteTotalCents', b.price_cents,
    'depositCents', b.upfront_payment_cents,
    'remainingBalanceCents', b.price_cents - b.upfront_payment_cents,
    'dueAt', b.initial_payment_due_at,
    'remainingBalanceAfterJob', true,
    'savedMethodScope', 'booking_only'
  )
from public.bookings b
join quote_response_result r on r.booking_id = b.id;

reset role;

select case when exists (
  select 1
  from public.legal_acceptances la
  join quote_response_result r on r.booking_id = la.booking_id
  where la.kind = 'payment_authorization'
    and la.version = 'quote-v2-20pct-deposit'
) then
  'ok 4 - a customer can save the exact quote-deposit authorization'
else
  'not ok 4 - a customer can save the exact quote-deposit authorization'
end;

do $$
begin
  if not exists (
    select 1
    from public.legal_acceptances la
    join quote_response_result r on r.booking_id = la.booking_id
    where la.kind = 'payment_authorization'
      and la.version = 'quote-v2-20pct-deposit'
  ) then
    raise exception 'quote deposit payment authorization was rejected';
  end if;
end;
$$;

rollback;
