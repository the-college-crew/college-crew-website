begin;

select no_plan();

select is(has_table_privilege('anon', 'public.ai_support_requests', 'select'), false, 'anonymous users cannot read AI request metadata');
select is(has_table_privilege('authenticated', 'public.ai_support_requests', 'select'), false, 'signed-in users cannot read AI request metadata');
select is(has_table_privilege('service_role', 'public.ai_support_requests', 'insert'), true, 'service role can record AI request metadata');
select is(has_function_privilege('anon', 'public.reserve_ai_support_request(uuid,text,text,text,text)', 'execute'), false, 'anonymous users cannot reserve requests');
select is(has_function_privilege('authenticated', 'public.reserve_ai_support_request(uuid,text,text,text,text)', 'execute'), false, 'signed-in users cannot reserve requests');
select is(has_function_privilege('service_role', 'public.reserve_ai_support_request(uuid,text,text,text,text)', 'execute'), true, 'service role owns quota reservations');

select is((select relrowsecurity from pg_class where oid = 'public.ai_support_requests'::regclass), true, 'AI request metadata has RLS enabled');
select is((select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'ai_support_requests'), 0, 'AI request metadata has no browser policies');
select is((select count(*)::integer from pg_indexes where schemaname = 'public' and tablename = 'ai_support_requests' and indexname in ('ai_support_requests_user_created_idx', 'ai_support_requests_created_idx')), 2, 'quota and cleanup indexes exist');
select is((select count(*)::integer from cron.job where jobname = 'delete-old-ai-support-request-metadata'), 1, '30-day cleanup is scheduled once');

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('26000000-0000-0000-0000-000000000001', 'ai-quota@example.test', now(), '{}'),
  ('26000000-0000-0000-0000-000000000002', 'ai-daily@example.test', now(), '{}');

set local role service_role;

select is(
  (select retry_after_seconds from public.reserve_ai_support_request('26000000-0000-0000-0000-000000000001', 'public', 'gpt-5.6-luna', 'p1', 'k1')),
  0,
  'the first request is accepted atomically'
);

insert into public.ai_support_requests (user_id, page_category, status, requested_model, prompt_version, knowledge_version, created_at)
select '26000000-0000-0000-0000-000000000001', 'public', 'accepted', 'gpt-5.6-luna', 'p1', 'k1', now()
from generate_series(1, 14);

select is(
  (select request_id from public.reserve_ai_support_request('26000000-0000-0000-0000-000000000001', 'public', 'gpt-5.6-luna', 'p1', 'k1')),
  null::uuid,
  'the sixteenth request inside ten minutes is rejected'
);
select ok(
  (select retry_after_seconds > 0 from public.reserve_ai_support_request('26000000-0000-0000-0000-000000000001', 'public', 'gpt-5.6-luna', 'p1', 'k1')),
  'ten-minute quota returns a positive Retry-After'
);

insert into public.ai_support_requests (user_id, page_category, status, requested_model, prompt_version, knowledge_version, created_at)
select '26000000-0000-0000-0000-000000000002', 'public', 'completed', 'gpt-5.6-luna', 'p1', 'k1', now() - interval '20 minutes'
from generate_series(1, 100);

select is(
  (select request_id from public.reserve_ai_support_request('26000000-0000-0000-0000-000000000002', 'public', 'gpt-5.6-luna', 'p1', 'k1')),
  null::uuid,
  'the daily quota rejects request 101'
);

update public.ai_support_requests
set status = 'completed', input_tokens = 20, output_tokens = 10, latency_ms = 300, completed_at = now()
where user_id = '26000000-0000-0000-0000-000000000001';
select is((select count(*)::integer from public.ai_support_requests where user_id = '26000000-0000-0000-0000-000000000001' and status = 'completed'), 15, 'service role can record content-free completion metadata');

insert into public.ai_support_requests (user_id, page_category, status, requested_model, prompt_version, knowledge_version, created_at)
values ('26000000-0000-0000-0000-000000000002', 'public', 'failed', 'gpt-5.6-luna', 'p1', 'k1', now() - interval '31 days');
delete from public.ai_support_requests where created_at < now() - interval '30 days';
select is((select count(*)::integer from public.ai_support_requests where created_at < now() - interval '30 days'), 0, 'cleanup removes metadata older than 30 days');

reset role;
select * from finish();
rollback;
