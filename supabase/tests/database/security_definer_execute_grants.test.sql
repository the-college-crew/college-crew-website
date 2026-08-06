begin;

select no_plan();

-- Trigger-only routines must not double as public RPC endpoints.
select is(
  has_function_privilege('anon', 'public.clear_resolution_on_new_message()', 'execute'),
  false,
  'anon cannot invoke the message-resolution trigger function'
);
select is(
  has_function_privilege('authenticated', 'public.resolve_conversation_on_booking_completed()', 'execute'),
  false,
  'signed-in users cannot invoke the booking-resolution trigger function'
);
select is(
  has_function_privilege('anon', 'public.handle_new_user()', 'execute'),
  false,
  'anon cannot invoke the new-user trigger function'
);
select is(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'rls_auto_enable'
      and has_function_privilege('anon', p.oid, 'execute')
  ),
  true,
  'anon cannot invoke the legacy RLS event-trigger function when present'
);

-- Booking calls remain authenticated-only.
select is(
  has_function_privilege(
    'anon',
    'public.create_booking_draft(uuid,uuid,timestamptz,integer,text,text,text,text,text,public.booking_decline_preference,integer,text,text,double precision,double precision,uuid,public.booking_time_flexibility)',
    'execute'
  ),
  false,
  'anon cannot create a booking draft'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.create_booking_draft(uuid,uuid,timestamptz,integer,text,text,text,text,text,public.booking_decline_preference,integer,text,text,double precision,double precision,uuid,public.booking_time_flexibility)',
    'execute'
  ),
  true,
  'signed-in customers retain booking-draft access'
);
select is(
  has_function_privilege('anon', 'public.finalize_hourly_booking(text)', 'execute'),
  false,
  'anon cannot finalize an hourly booking'
);
select is(
  has_function_privilege('authenticated', 'public.finalize_hourly_booking(text)', 'execute'),
  true,
  'signed-in customers retain hourly-booking finalization'
);
select is(
  has_function_privilege(
    'anon', 'public.quote_hourly_offering_slot(uuid,timestamptz,integer)', 'execute'
  ),
  false,
  'anon cannot invoke the hourly booking quote RPC'
);
select is(
  has_function_privilege(
    'authenticated', 'public.quote_hourly_offering_slot(uuid,timestamptz,integer)', 'execute'
  ),
  true,
  'signed-in customers retain hourly booking quote access'
);

-- These predicates are called from public RLS policies and must stay executable
-- by anon; all other predicate helpers above are authenticated-only.
select is(
  has_function_privilege('anon', 'public.is_admin()', 'execute'),
  true,
  'public RLS policies retain their admin predicate'
);
select is(
  has_function_privilege('anon', 'public.owns_provider_profile(uuid)', 'execute'),
  true,
  'public provider-service policy retains its ownership predicate'
);
select is(
  has_function_privilege('anon', 'public.is_provider_approved(uuid)', 'execute'),
  true,
  'public provider policies retain their approval predicate'
);
select is(
  has_function_privilege('anon', 'public.is_conversation_member(uuid)', 'execute'),
  false,
  'anon cannot invoke the conversation-membership predicate'
);
select is(
  has_function_privilege('anon', 'public.shares_thread_with(uuid)', 'execute'),
  false,
  'anon cannot invoke the private-profile predicate'
);

select * from finish();
rollback;
