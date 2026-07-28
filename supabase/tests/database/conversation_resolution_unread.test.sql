begin;

select plan(3);

-- Local-only regression: these rows are synthetic and transaction-scoped.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  (
    '97000000-0000-0000-0000-000000009701',
    'resolved-unread-customer@example.test',
    now(),
    '{"role":"customer","full_name":"Resolved Unread Customer"}'::jsonb
  ),
  (
    '97000000-0000-0000-0000-000000009702',
    'resolved-unread-provider@example.test',
    now(),
    '{"role":"provider","full_name":"Resolved Unread Provider"}'::jsonb
  );

insert into public.provider_profiles (id, user_id, display_name)
values (
  '97000000-0000-0000-0000-000000009703',
  '97000000-0000-0000-0000-000000009702',
  'Resolved Unread Provider'
);

insert into public.conversations (id, customer_id, provider_id)
values (
  '97000000-0000-0000-0000-000000009704',
  '97000000-0000-0000-0000-000000009701',
  '97000000-0000-0000-0000-000000009703'
);

insert into public.messages (conversation_id, sender_id, body, created_at)
values (
  '97000000-0000-0000-0000-000000009704',
  '97000000-0000-0000-0000-000000009702',
  'Message before resolve',
  now() - interval '1 minute'
);

insert into public.conversation_resolutions (conversation_id, user_id, resolved_at)
values (
  '97000000-0000-0000-0000-000000009704',
  '97000000-0000-0000-0000-000000009701',
  now()
);

select is(
  (
    select count(*)::integer
    from public.conversation_reads
    where conversation_id = '97000000-0000-0000-0000-000000009704'
      and user_id = '97000000-0000-0000-0000-000000009701'
  ),
  1,
  'resolving a chat writes a read marker for the resolver'
);

select set_config(
  'request.jwt.claim.sub',
  '97000000-0000-0000-0000-000000009701',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"97000000-0000-0000-0000-000000009701","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.unread_message_summary()),
  0,
  'a resolved chat contributes no unread messages'
);

reset role;

insert into public.messages (conversation_id, sender_id, body, created_at)
values (
  '97000000-0000-0000-0000-000000009704',
  '97000000-0000-0000-0000-000000009702',
  'Message after resolve',
  now() + interval '1 minute'
);

set local role authenticated;

select is(
  (select count(*)::integer from public.unread_message_summary()),
  1,
  'a new counterpart message reopens the chat and is unread'
);

select * from finish();

rollback;
