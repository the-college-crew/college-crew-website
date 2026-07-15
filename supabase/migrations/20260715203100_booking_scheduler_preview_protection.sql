-- Allow the scheduler to reach protected Vercel preview deployments without
-- placing the automation bypass secret in a URL or in repository configuration.
create or replace function private.invoke_booking_scheduler()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_origin text;
  v_secret text;
  v_vercel_bypass_secret text;
  v_headers jsonb;
  v_request_id bigint;
begin
  select decrypted_secret into v_origin
  from vault.decrypted_secrets where name = 'booking_scheduler_url'
  order by created_at desc limit 1;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'booking_cron_secret'
  order by created_at desc limit 1;

  if nullif(btrim(v_origin), '') is null or nullif(btrim(v_secret), '') is null then
    return null;
  end if;

  select decrypted_secret into v_vercel_bypass_secret
  from vault.decrypted_secrets where name = 'vercel_automation_bypass_secret'
  order by created_at desc limit 1;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_secret
  );

  if nullif(btrim(v_vercel_bypass_secret), '') is not null then
    v_headers := v_headers || jsonb_build_object(
      'x-vercel-protection-bypass', v_vercel_bypass_secret
    );
  end if;

  select net.http_post(
    url := rtrim(v_origin, '/') || '/api/internal/booking-scheduler',
    headers := v_headers,
    body := '{}'::jsonb,
    timeout_milliseconds := 50000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke execute on function private.invoke_booking_scheduler()
  from public, anon, authenticated, service_role;
