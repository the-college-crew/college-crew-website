-- Point the every-minute scheduler cron at the booking-scheduler Edge
-- Function (iOS arch A-4/A-7 step 4: web and mobile share one automation
-- code path).
--
-- Cutover is Vault-driven so this migration is safe to apply BEFORE the
-- function is deployed: with no 'booking_scheduler_function_url' secret the
-- invoker keeps posting to the legacy web route
-- (<booking_scheduler_url>/api/internal/booking-scheduler). Setting the new
-- secret to the full function URL
-- (https://<project-ref>.supabase.co/functions/v1/booking-scheduler)
-- switches the target; deleting it switches back — instant rollback, no
-- migration needed either way. The bearer secret is unchanged
-- ('booking_cron_secret'), which the function checks like the web route did.
--
-- Missing Vault configuration remains an intentional no-op so preview
-- environments never leak or invent secrets.

create or replace function private.invoke_booking_scheduler()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_function_url text;
  v_origin text;
  v_secret text;
  v_url text;
  v_request_id bigint;
begin
  select decrypted_secret into v_function_url
  from vault.decrypted_secrets where name = 'booking_scheduler_function_url'
  order by created_at desc limit 1;
  select decrypted_secret into v_origin
  from vault.decrypted_secrets where name = 'booking_scheduler_url'
  order by created_at desc limit 1;
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'booking_cron_secret'
  order by created_at desc limit 1;

  if nullif(btrim(v_secret), '') is null then
    return null;
  end if;

  if nullif(btrim(v_function_url), '') is not null then
    v_url := rtrim(btrim(v_function_url), '/');
  elsif nullif(btrim(v_origin), '') is not null then
    v_url := rtrim(btrim(v_origin), '/') || '/api/internal/booking-scheduler';
  else
    return null;
  end if;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 50000
  ) into v_request_id;
  return v_request_id;
end;
$$;

revoke execute on function private.invoke_booking_scheduler()
  from public, anon, authenticated, service_role;
