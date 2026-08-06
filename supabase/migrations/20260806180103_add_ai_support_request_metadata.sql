create table public.ai_support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  page_category text not null,
  status text not null check (status in ('accepted', 'completed', 'failed', 'aborted', 'timed_out')),
  requested_model text not null,
  returned_model text,
  prompt_version text not null,
  knowledge_version text not null,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

comment on table public.ai_support_requests is
  'Content-free operational metadata for AI support. Never store prompts, transcripts, context, or answers.';

alter table public.ai_support_requests enable row level security;
revoke all on table public.ai_support_requests from anon, authenticated;
grant select, insert, update, delete on table public.ai_support_requests to service_role;

create index ai_support_requests_user_created_idx
  on public.ai_support_requests (user_id, created_at desc);
create index ai_support_requests_created_idx
  on public.ai_support_requests (created_at);

create or replace function public.reserve_ai_support_request(
  p_user_id uuid,
  p_page_category text,
  p_requested_model text,
  p_prompt_version text,
  p_knowledge_version text
) returns table(request_id uuid, retry_after_seconds integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_ten_minute_count integer;
  v_daily_count integer;
  v_retry integer;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 17461));

  select count(*) into v_ten_minute_count
  from public.ai_support_requests
  where user_id = p_user_id and created_at > v_now - interval '10 minutes';

  select count(*) into v_daily_count
  from public.ai_support_requests
  where user_id = p_user_id and created_at > v_now - interval '24 hours';

  if v_ten_minute_count >= 15 then
    select greatest(1, ceil(extract(epoch from (min(created_at) + interval '10 minutes' - v_now)))::integer)
      into v_retry
    from public.ai_support_requests
    where user_id = p_user_id and created_at > v_now - interval '10 minutes';
    return query select null::uuid, coalesce(v_retry, 600);
    return;
  end if;

  if v_daily_count >= 100 then
    select greatest(1, ceil(extract(epoch from (min(created_at) + interval '24 hours' - v_now)))::integer)
      into v_retry
    from public.ai_support_requests
    where user_id = p_user_id and created_at > v_now - interval '24 hours';
    return query select null::uuid, coalesce(v_retry, 86400);
    return;
  end if;

  insert into public.ai_support_requests (
    user_id, page_category, status, requested_model, prompt_version, knowledge_version
  ) values (
    p_user_id, p_page_category, 'accepted', p_requested_model, p_prompt_version, p_knowledge_version
  ) returning id into v_id;

  return query select v_id, 0;
end;
$$;

revoke all on function public.reserve_ai_support_request(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.reserve_ai_support_request(uuid, text, text, text, text) to service_role;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
  'delete-old-ai-support-request-metadata',
  '17 4 * * *',
  $$delete from public.ai_support_requests where created_at < now() - interval '30 days'$$
);
