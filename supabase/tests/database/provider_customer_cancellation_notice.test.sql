begin;

select no_plan();

-- Contract-only: dev and production share a database, so this test never
-- creates a synthetic booking or user.
select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bookings'
      and column_name = 'provider_cancellation_notice_dismissed_at'
      and data_type = 'timestamp with time zone'
  ),
  'bookings retain a provider-only customer-cancellation dismissal timestamp'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.dismiss_provider_customer_cancellation_notice(uuid)',
    'execute'
  ),
  true,
  'an authenticated provider can resolve their cancellation notice'
);

select is(
  has_function_privilege(
    'anon',
    'public.dismiss_provider_customer_cancellation_notice(uuid)',
    'execute'
  ),
  false,
  'anonymous visitors cannot resolve a provider cancellation notice'
);

select ok(
  position(
    'pp.user_id = v_actor'
    in pg_get_functiondef(
      'public.dismiss_provider_customer_cancellation_notice(uuid)'::regprocedure
    )
  ) > 0,
  'the dismissal RPC verifies ownership through the assigned provider profile'
);

select * from finish();

rollback;
