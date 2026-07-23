begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

select has_table('public', 'resend_webhook_events', 'Resend receipts are durable');
select has_table('public', 'email_suppressions', 'recipient suppressions are durable');
select col_type_is(
  'public',
  'email_outbox',
  'delivery_status',
  'email_delivery_status',
  'outbox API acceptance and delivery state are separate'
);

select is(
  has_function_privilege(
    'anon',
    'public.record_resend_webhook_event(text,text,text,text,timestamptz,text)',
    'execute'
  ),
  false,
  'anonymous callers cannot reconcile Resend events'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.get_active_email_suppression(text)',
    'execute'
  ),
  false,
  'authenticated callers cannot inspect suppressions'
);
select is(
  has_function_privilege(
    'service_role',
    'public.record_resend_webhook_event(text,text,text,text,timestamptz,text)',
    'execute'
  ),
  true,
  'the service role can reconcile Resend events'
);

create temporary table resend_test_outbox as
with inserted as (
  insert into public.email_outbox (
    event_key,
    recipient_email,
    template
  )
  values (
    'synthetic-resend-observability',
    'synthetic-resend@example.test',
    'synthetic_resend_test'
  )
  returning id
)
select id from inserted;

update public.email_outbox
set status = 'sent',
    sent_at = '2026-07-23 20:00:00+00',
    provider_message_id = 'synthetic-provider-message'
where id = (select id from resend_test_outbox);

create temporary table resend_first_result as
select *
from public.record_resend_webhook_event(
  'synthetic-svix-sent',
  'synthetic-provider-message',
  'SYNTHETIC-RESEND@EXAMPLE.TEST',
  'email.sent',
  '2026-07-23 20:00:01+00',
  null
);

select is(
  (select duplicate from resend_first_result),
  false,
  'a new signed event is not treated as a duplicate'
);
select is(
  (
    select delivery_status::text
    from public.email_outbox
    where id = (select id from resend_test_outbox)
  ),
  'accepted',
  'email.sent records provider acceptance'
);
select is(
  (
    select matched_outbox_id
    from public.resend_webhook_events
    where svix_id = 'synthetic-svix-sent'
  ),
  (select id from resend_test_outbox),
  'the provider message id links the receipt to its outbox item'
);

create temporary table resend_duplicate_result as
select *
from public.record_resend_webhook_event(
  'synthetic-svix-sent',
  'synthetic-provider-message',
  'synthetic-resend@example.test',
  'email.sent',
  '2026-07-23 20:00:01+00',
  null
);

select is(
  (select duplicate from resend_duplicate_result),
  true,
  'a repeated svix id is idempotent'
);
select is(
  (
    select count(*)::integer
    from public.resend_webhook_events
    where svix_id = 'synthetic-svix-sent'
  ),
  1,
  'a repeated svix id creates only one receipt'
);

select *
from public.record_resend_webhook_event(
  'synthetic-svix-bounced',
  'synthetic-provider-message',
  'synthetic-resend@example.test',
  'email.bounced',
  '2026-07-23 20:03:00+00',
  'Permanent bounce'
);

select is(
  (
    select delivery_status::text
    from public.email_outbox
    where id = (select id from resend_test_outbox)
  ),
  'bounced',
  'a newer bounce becomes the current outbox delivery state'
);
select is(
  (
    select reason
    from public.get_active_email_suppression('SYNTHETIC-RESEND@EXAMPLE.TEST')
  ),
  'bounced',
  'a hard bounce suppresses future custom sends'
);

select *
from public.record_resend_webhook_event(
  'synthetic-svix-stale-delivered',
  'synthetic-provider-message',
  'synthetic-resend@example.test',
  'email.delivered',
  '2026-07-23 20:02:00+00',
  null
);

select is(
  (
    select delivery_status::text
    from public.email_outbox
    where id = (select id from resend_test_outbox)
  ),
  'bounced',
  'an older out-of-order delivery event cannot regress current state'
);
select is(
  (
    select reason
    from public.get_active_email_suppression('synthetic-resend@example.test')
  ),
  'bounced',
  'an older delivery event cannot clear a newer suppression'
);

select *
from public.record_resend_webhook_event(
  'synthetic-svix-new-delivered',
  'synthetic-provider-message',
  'synthetic-resend@example.test',
  'email.delivered',
  '2026-07-23 20:04:00+00',
  null
);

select is(
  (
    select delivery_status::text
    from public.email_outbox
    where id = (select id from resend_test_outbox)
  ),
  'delivered',
  'a genuinely later delivery event becomes current'
);
select is_empty(
  $$ select * from public.get_active_email_suppression(
    'synthetic-resend@example.test'
  ) $$,
  'a later successful delivery clears an obsolete bounce suppression'
);

select *
from public.record_resend_webhook_event(
  'synthetic-svix-complained',
  'synthetic-provider-message',
  'synthetic-resend@example.test',
  'email.complained',
  '2026-07-23 20:05:00+00',
  'The recipient marked this message as spam.'
);

select is(
  (
    select reason
    from public.get_active_email_suppression('synthetic-resend@example.test')
  ),
  'complained',
  'a complaint creates a suppression that requires explicit review'
);

update public.email_outbox
set status = 'processing',
    lease_token = '00000000-0000-0000-0000-000000000123',
    lease_expires_at = now() + interval '2 minutes'
where id = (select id from resend_test_outbox);

select ok(
  public.retry_email_outbox_detailed(
    (select id from resend_test_outbox),
    '00000000-0000-0000-0000-000000000123',
    'Resend_validation_error',
    'Resend rejected the configured sender.',
    30,
    true
  ),
  'a detailed provider rejection settles the leased outbox item'
);
select is(
  (
    select last_error_class || ':' || last_error
    from public.email_outbox
    where id = (select id from resend_test_outbox)
  ),
  'Resend_validation_error:Resend rejected the configured sender.',
  'the outbox retains both a stable class and a safe diagnostic'
);

select * from finish();
rollback;
