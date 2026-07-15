begin;

select plan(15);

select is(
  (select reloptions @> array['security_invoker=true']
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'provider_ratings'),
  true,
  'provider_ratings is security-invoker'
);

select is(
  (select reloptions @> array['security_invoker=true']
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'provider_reviews'),
  true,
  'provider_reviews is security-invoker'
);

select is(
  has_column_privilege('anon', 'public.reviews', 'booking_id', 'select'),
  false,
  'anonymous users cannot read the source booking id'
);
select is(
  has_column_privilege('anon', 'public.reviews', 'provider_id', 'select'),
  true,
  'anonymous users can read the public provider snapshot'
);
select is(
  has_column_privilege('authenticated', 'public.reviews', 'provider_id', 'insert'),
  false,
  'authenticated users cannot spoof the provider snapshot'
);
select is(
  has_column_privilege('authenticated', 'public.reviews', 'service_id', 'insert'),
  false,
  'authenticated users cannot spoof the service snapshot'
);
select is(
  has_column_privilege('authenticated', 'public.reviews', 'booking_id', 'insert'),
  true,
  'authenticated review inserts retain the booking input'
);
select is(
  has_function_privilege('anon', 'public.get_my_booking_reviews()', 'execute'),
  false,
  'anonymous users cannot inspect private review relationships'
);
select is(
  has_function_privilege(
    'authenticated', 'public.get_my_booking_reviews()', 'execute'
  ),
  true,
  'authenticated customers can inspect only their review relationships'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000008001', 'phase8-customer@example.test',
   '{"role":"customer","full_name":"Phase 8 Customer"}'::jsonb),
  ('00000000-0000-0000-0000-000000008002', 'phase8-provider@example.test',
   '{"role":"provider","full_name":"Phase 8 Provider"}'::jsonb);

insert into public.provider_profiles (
  id, user_id, display_name, provider_type, verification_status
) values (
  '00000000-0000-0000-0000-000000008102',
  '00000000-0000-0000-0000-000000008002',
  'Phase 8 Provider', 'individual', 'approved'
);

insert into public.bookings (
  id, customer_id, provider_id, service_id, status, scheduled_at, address,
  price_cents, platform_fee_cents, booking_flow
) select
  '00000000-0000-0000-0000-000000008201',
  '00000000-0000-0000-0000-000000008001',
  '00000000-0000-0000-0000-000000008102',
  s.id, 'completed', now() - interval '1 day', 'Synthetic test address',
  4000, 200, 'legacy'
from public.services s order by s.id limit 1;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000008001","role":"authenticated"}',
  true
);

insert into public.reviews (booking_id, rating, text)
values ('00000000-0000-0000-0000-000000008201', 5, 'Synthetic rollout review');

select ok(
  (select review_id is not null from public.get_my_booking_reviews()
   where booking_id = '00000000-0000-0000-0000-000000008201'),
  'customer dashboard receives its own reviewed booking relationship'
);

reset role;

select is(
  (select provider_id from public.reviews
   where booking_id = '00000000-0000-0000-0000-000000008201'),
  '00000000-0000-0000-0000-000000008102'::uuid,
  'review trigger derives provider id from the booking'
);
select ok(
  (select service_id is not null from public.reviews
   where booking_id = '00000000-0000-0000-0000-000000008201'),
  'review trigger derives service id from the booking'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(
  (select review_count from public.provider_ratings
   where provider_id = '00000000-0000-0000-0000-000000008102'),
  1,
  'anonymous rating aggregate remains readable'
);
select is(
  (select text from public.provider_reviews
   where provider_id = '00000000-0000-0000-0000-000000008102'),
  'Synthetic rollout review',
  'anonymous sanitized review feed remains readable'
);
select lives_ok(
  $$select provider_id, service_id, rating, text from public.reviews limit 1$$,
  'anonymous base review reads are limited to granted public columns'
);

select * from finish();
rollback;
