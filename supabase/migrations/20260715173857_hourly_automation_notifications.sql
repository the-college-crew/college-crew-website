-- Hourly Booking v1 — Phase 7: automation, transactional email, and Realtime.
--
-- This migration deliberately stores no deployment URL or scheduler secret.
-- The two values are created out-of-band in Vault as `booking_scheduler_url`
-- and `booking_cron_secret`. The stable Cron job safely no-ops until both exist.

set lock_timeout = '10s';
set statement_timeout = '2min';

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Durable, bounded automation jobs
-- ---------------------------------------------------------------------------

create table public.booking_automation_jobs (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  kind text not null,
  booking_id uuid not null references public.bookings (id) on delete restrict,
  source_id uuid,
  run_at timestamptz not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  lease_token uuid,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz not null,
  last_error_class text,
  last_error_at timestamptz,
  completed_at timestamptz,
  terminal_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_automation_jobs_event_key_not_blank check (btrim(event_key) <> ''),
  constraint booking_automation_jobs_kind_valid check (
    kind in ('response_alert', 'request_expiration', 'payment_expiration', 'invoice_autocharge')
  ),
  constraint booking_automation_jobs_status_valid check (
    status in ('pending', 'processing', 'retry', 'succeeded', 'failed')
  ),
  constraint booking_automation_jobs_attempt_count_valid check (attempt_count >= 0),
  constraint booking_automation_jobs_lease_shape check (
    (status = 'processing' and lease_token is not null and lease_expires_at is not null)
    or (status <> 'processing' and lease_token is null and lease_expires_at is null)
  )
);

create index booking_automation_jobs_claim_idx
  on public.booking_automation_jobs (next_attempt_at, run_at, created_at)
  where status in ('pending', 'retry');
create index booking_automation_jobs_stale_lease_idx
  on public.booking_automation_jobs (lease_expires_at)
  where status = 'processing';
create index booking_automation_jobs_booking_id_idx
  on public.booking_automation_jobs (booking_id, created_at desc);

alter table public.booking_automation_jobs enable row level security;
revoke all on table public.booking_automation_jobs from public, anon, authenticated;
grant all on table public.booking_automation_jobs to service_role;

alter table public.email_outbox
  add column lease_token uuid,
  add column lease_expires_at timestamptz,
  add column next_attempt_at timestamptz not null default now(),
  add column last_error_class text,
  add column last_error_at timestamptz,
  add column terminal_at timestamptz,
  add column provider_message_id text,
  add constraint email_outbox_lease_shape check (
    (status = 'processing' and lease_token is not null and lease_expires_at is not null)
    or (status <> 'processing' and lease_token is null and lease_expires_at is null)
  );

update public.email_outbox
set next_attempt_at = greatest(available_at, now())
where status in ('pending', 'failed');

drop index if exists public.email_outbox_delivery_idx;
create index email_outbox_claim_idx
  on public.email_outbox (next_attempt_at, available_at, created_at)
  where status in ('pending', 'failed');
create index email_outbox_stale_lease_idx
  on public.email_outbox (lease_expires_at)
  where status = 'processing';

-- ---------------------------------------------------------------------------
-- Transactional job and email enqueueing
-- ---------------------------------------------------------------------------

create function private.enqueue_booking_automation_job(
  p_event_key text,
  p_kind text,
  p_booking_id uuid,
  p_source_id uuid,
  p_run_at timestamptz
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.booking_automation_jobs (
    event_key, kind, booking_id, source_id, run_at, next_attempt_at
  )
  values (
    p_event_key, p_kind, p_booking_id, p_source_id, p_run_at, p_run_at
  )
  on conflict (event_key) do nothing;
$$;

revoke execute on function private.enqueue_booking_automation_job(text, text, uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;

create function private.enqueue_participant_email(
  p_event_key text,
  p_booking_id uuid,
  p_recipient_kind text,
  p_template text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_email text;
begin
  if p_recipient_kind = 'customer' then
    select b.customer_id, u.email
    into v_user_id, v_email
    from public.bookings b
    join auth.users u on u.id = b.customer_id
    where b.id = p_booking_id;
  elsif p_recipient_kind = 'provider' then
    select pp.user_id, u.email
    into v_user_id, v_email
    from public.bookings b
    join public.provider_profiles pp on pp.id = b.provider_id
    join auth.users u on u.id = pp.user_id
    where b.id = p_booking_id;
  else
    raise exception 'INVALID_RECIPIENT_KIND';
  end if;

  perform private.enqueue_booking_email(
    p_event_key,
    p_booking_id,
    v_user_id,
    v_email,
    p_template,
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('recipient_kind', p_recipient_kind)
  );
end;
$$;

revoke execute on function private.enqueue_participant_email(text, uuid, text, text, jsonb)
  from public, anon, authenticated, service_role;

create function private.queue_booking_automation_and_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_status text := case when tg_op = 'UPDATE' then old.status::text else null end;
begin
  if new.booking_flow <> 'hourly_v1' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    perform private.enqueue_booking_automation_job(
      'response_alert_' || new.id::text, 'response_alert', new.id, new.id, new.response_alert_at
    );
    perform private.enqueue_booking_automation_job(
      'request_expiration_' || new.id::text, 'request_expiration', new.id, new.id, new.scheduled_at
    );
    perform private.enqueue_participant_email(
      'request_new_' || new.id::text, new.id, 'provider', 'new_provider_request',
      jsonb_build_object('booking_id', new.id)
    );
    return new;
  end if;

  if new.response_alerted_at is not null and old.response_alerted_at is null then
    perform private.enqueue_participant_email(
      'response_alert_' || new.id::text, new.id, 'customer', 'response_alert',
      jsonb_build_object('booking_id', new.id)
    );
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  case new.status
    when 'accepted' then
      perform private.enqueue_booking_automation_job(
        'payment_expiration_' || new.id::text, 'payment_expiration', new.id, new.id,
        new.initial_payment_due_at
      );
      perform private.enqueue_participant_email(
        'request_accepted_' || new.id::text, new.id, 'customer', 'accepted_payment_deadline',
        jsonb_build_object('booking_id', new.id)
      );
    when 'declined' then
      perform private.enqueue_participant_email(
        'request_declined_' || new.id::text, new.id, 'customer', 'request_declined',
        jsonb_build_object('booking_id', new.id)
      );
    when 'withdrawn' then
      perform private.enqueue_participant_email(
        'request_withdrawn_' || new.id::text, new.id, 'provider', 'request_withdrawn',
        jsonb_build_object('booking_id', new.id)
      );
    when 'expired' then
      if v_old_status = 'accepted' then
        perform private.enqueue_participant_email(
          'payment_expired_customer_' || new.id::text, new.id, 'customer', 'payment_expired',
          jsonb_build_object('booking_id', new.id)
        );
        perform private.enqueue_participant_email(
          'payment_expired_provider_' || new.id::text, new.id, 'provider', 'payment_expired',
          jsonb_build_object('booking_id', new.id)
        );
      else
        perform private.enqueue_participant_email(
          'request_expired_customer_' || new.id::text, new.id, 'customer', 'request_start_expired',
          jsonb_build_object('booking_id', new.id)
        );
        perform private.enqueue_participant_email(
          'request_expired_provider_' || new.id::text, new.id, 'provider', 'request_start_expired',
          jsonb_build_object('booking_id', new.id)
        );
      end if;
    when 'booked' then
      perform private.enqueue_participant_email(
        'booked_customer_' || new.id::text, new.id, 'customer', 'booked_first_hour_receipt',
        jsonb_build_object('booking_id', new.id)
      );
      perform private.enqueue_participant_email(
        'booked_provider_' || new.id::text, new.id, 'provider', 'booked_job',
        jsonb_build_object('booking_id', new.id)
      );
    when 'in_progress' then
      perform private.enqueue_participant_email(
        'arrived_customer_' || new.id::text, new.id, 'customer', 'provider_arrived',
        jsonb_build_object('booking_id', new.id)
      );
    when 'cancelled' then
      perform private.enqueue_participant_email(
        'cancelled_customer_' || new.id::text, new.id, 'customer', 'booking_cancelled_customer',
        jsonb_build_object('booking_id', new.id, 'actor', new.cancelled_by_role)
      );
      perform private.enqueue_participant_email(
        'cancelled_provider_' || new.id::text, new.id, 'provider', 'booking_cancelled_provider',
        jsonb_build_object('booking_id', new.id, 'actor', new.cancelled_by_role)
      );
    when 'completed' then
      perform private.enqueue_participant_email(
        'completed_customer_' || new.id::text, new.id, 'customer', 'final_payment_success',
        jsonb_build_object('booking_id', new.id)
      );
      perform private.enqueue_participant_email(
        'completed_provider_' || new.id::text, new.id, 'provider', 'job_completed_paid',
        jsonb_build_object('booking_id', new.id)
      );
    else
      null;
  end case;

  return new;
end;
$$;

revoke execute on function private.queue_booking_automation_and_email()
  from public, anon, authenticated, service_role;
create trigger booking_phase7_automation_and_email
  after insert or update on public.bookings
  for each row execute function private.queue_booking_automation_and_email();

create function private.queue_invoice_automation_and_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_template text;
begin
  if tg_op = 'INSERT' then
    if new.status = 'review' and new.autocharge_at is not null and new.remaining_balance_cents > 0 then
      perform private.enqueue_booking_automation_job(
        'invoice_autocharge_' || new.id::text, 'invoice_autocharge',
        new.booking_id, new.id, new.autocharge_at
      );
    end if;
    perform private.enqueue_participant_email(
      'invoice_submitted_' || new.id::text, new.booking_id, 'customer', 'invoice_submitted',
      jsonb_build_object('booking_id', new.booking_id, 'invoice_id', new.id)
    );
  elsif new.status = 'requires_action' and old.status is distinct from new.status then
    select case
      when exists (
        select 1 from public.booking_payments p
        where p.invoice_id = new.id and p.kind = 'balance'
          and p.status in ('failed', 'cancelled')
      ) then 'final_payment_failed'
      else 'final_payment_action_required'
    end into v_customer_template;
    perform private.enqueue_participant_email(
      'payment_action_customer_' || new.id::text, new.booking_id, 'customer',
      v_customer_template, jsonb_build_object('booking_id', new.booking_id, 'invoice_id', new.id)
    );
    perform private.enqueue_founder_alert(
      'payment_action_founder_' || new.id::text, new.booking_id, 'failed_charge_admin',
      jsonb_build_object('booking_id', new.booking_id, 'invoice_id', new.id)
    );
  end if;
  return new;
end;
$$;

revoke execute on function private.queue_invoice_automation_and_email()
  from public, anon, authenticated, service_role;
create trigger booking_invoice_phase7_automation_and_email
  after insert or update on public.booking_invoices
  for each row execute function private.queue_invoice_automation_and_email();

create function private.queue_refund_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status
    and new.status in ('succeeded', 'failed') then
    perform private.enqueue_participant_email(
      'refund_' || new.status::text || '_customer_' || new.id::text,
      new.booking_id, 'customer', 'refund_' || new.status::text,
      jsonb_build_object('booking_id', new.booking_id, 'refund_id', new.id)
    );
    if new.status = 'failed' then
      perform private.enqueue_founder_alert(
        'refund_failed_founder_' || new.id::text, new.booking_id, 'failed_refund_admin',
        jsonb_build_object('booking_id', new.booking_id, 'refund_id', new.id)
      );
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function private.queue_refund_email()
  from public, anon, authenticated, service_role;
create trigger booking_refund_phase7_email
  after update on public.booking_refunds
  for each row execute function private.queue_refund_email();

create function private.queue_dispute_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.enqueue_participant_email(
      'dispute_open_customer_' || new.id::text, new.booking_id, 'customer', 'dispute_opened',
      jsonb_build_object('booking_id', new.booking_id, 'dispute_id', new.id)
    );
    perform private.enqueue_participant_email(
      'dispute_open_provider_' || new.id::text, new.booking_id, 'provider', 'dispute_opened',
      jsonb_build_object('booking_id', new.booking_id, 'dispute_id', new.id)
    );
  elsif new.status = 'resolved' and old.status is distinct from new.status then
    perform private.enqueue_participant_email(
      'dispute_resolved_customer_' || new.id::text, new.booking_id, 'customer', 'dispute_resolved',
      jsonb_build_object('booking_id', new.booking_id, 'dispute_id', new.id)
    );
    perform private.enqueue_participant_email(
      'dispute_resolved_provider_' || new.id::text, new.booking_id, 'provider', 'dispute_resolved',
      jsonb_build_object('booking_id', new.booking_id, 'dispute_id', new.id)
    );
  end if;
  return new;
end;
$$;

revoke execute on function private.queue_dispute_email()
  from public, anon, authenticated, service_role;
create trigger booking_dispute_phase7_email
  after insert or update on public.booking_disputes
  for each row execute function private.queue_dispute_email();

-- ---------------------------------------------------------------------------
-- Service-role claim / settle / retry interfaces
-- ---------------------------------------------------------------------------

create function public.claim_booking_automation_jobs(
  p_limit integer default 20,
  p_lease_seconds integer default 120
)
returns table (
  id uuid,
  kind text,
  booking_id uuid,
  source_id uuid,
  lease_token uuid,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit < 1 or p_limit > 100 or p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'INVALID_CLAIM_BOUNDS';
  end if;

  update public.booking_automation_jobs j
  set status = 'retry', lease_token = null, lease_expires_at = null,
      next_attempt_at = statement_timestamp(), last_error_class = 'stale_lease',
      last_error_at = statement_timestamp(), updated_at = now()
  where j.status = 'processing' and j.lease_expires_at <= statement_timestamp();

  return query
  with due as (
    select j.id
    from public.booking_automation_jobs j
    where j.status in ('pending', 'retry')
      and j.run_at <= statement_timestamp()
      and j.next_attempt_at <= statement_timestamp()
      and j.terminal_at is null
    order by j.next_attempt_at, j.run_at, j.created_at
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.booking_automation_jobs j
    set status = 'processing', lease_token = gen_random_uuid(),
        lease_expires_at = statement_timestamp() + make_interval(secs => p_lease_seconds),
        attempt_count = j.attempt_count + 1, updated_at = now()
    from due
    where j.id = due.id
    returning j.*
  )
  select c.id, c.kind, c.booking_id, c.source_id, c.lease_token, c.attempt_count
  from claimed c;
end;
$$;

create function public.complete_booking_automation_job(
  p_job_id uuid,
  p_lease_token uuid
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  update public.booking_automation_jobs
  set status = 'succeeded', lease_token = null, lease_expires_at = null,
      completed_at = now(), last_error_class = null, updated_at = now()
  where id = p_job_id and status = 'processing' and lease_token = p_lease_token
  returning true;
$$;

create function public.retry_booking_automation_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_error_class text,
  p_retry_after_seconds integer,
  p_terminal boolean default false
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  update public.booking_automation_jobs
  set status = case when p_terminal then 'failed' else 'retry' end,
      lease_token = null, lease_expires_at = null,
      next_attempt_at = case when p_terminal then next_attempt_at
        else now() + make_interval(secs => greatest(1, least(p_retry_after_seconds, 86400))) end,
      last_error_class = left(coalesce(nullif(btrim(p_error_class), ''), 'unknown'), 100),
      last_error_at = now(), terminal_at = case when p_terminal then now() else null end,
      updated_at = now()
  where id = p_job_id and status = 'processing' and lease_token = p_lease_token
  returning true;
$$;

create function public.claim_email_outbox(
  p_limit integer default 20,
  p_lease_seconds integer default 120
)
returns table (
  id uuid,
  event_key text,
  booking_id uuid,
  recipient_email text,
  template text,
  payload jsonb,
  lease_token uuid,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit < 1 or p_limit > 100 or p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'INVALID_CLAIM_BOUNDS';
  end if;

  update public.email_outbox e
  set status = 'failed', lease_token = null, lease_expires_at = null,
      next_attempt_at = statement_timestamp(), last_error_class = 'stale_lease',
      last_error_at = statement_timestamp(), updated_at = now()
  where e.status = 'processing' and e.lease_expires_at <= statement_timestamp();

  return query
  with due as (
    select e.id
    from public.email_outbox e
    where e.status in ('pending', 'failed')
      and e.available_at <= statement_timestamp()
      and e.next_attempt_at <= statement_timestamp()
      and e.terminal_at is null
    order by e.next_attempt_at, e.available_at, e.created_at
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.email_outbox e
    set status = 'processing', locked_at = statement_timestamp(),
        lease_token = gen_random_uuid(),
        lease_expires_at = statement_timestamp() + make_interval(secs => p_lease_seconds),
        attempt_count = e.attempt_count + 1, updated_at = now()
    from due
    where e.id = due.id
    returning e.*
  )
  select c.id, c.event_key, c.booking_id, c.recipient_email, c.template,
         c.payload, c.lease_token, c.attempt_count
  from claimed c;
end;
$$;

create function public.settle_email_outbox(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_provider_message_id text default null
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  update public.email_outbox
  set status = 'sent', lease_token = null, lease_expires_at = null,
      provider_message_id = coalesce(p_provider_message_id, provider_message_id),
      sent_at = now(), last_error = null, last_error_class = null, updated_at = now()
  where id = p_outbox_id and status = 'processing' and lease_token = p_lease_token
  returning true;
$$;

create function public.retry_email_outbox(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_error_class text,
  p_retry_after_seconds integer,
  p_terminal boolean default false
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  update public.email_outbox
  set status = 'failed', lease_token = null, lease_expires_at = null,
      next_attempt_at = case when p_terminal then next_attempt_at
        else now() + make_interval(secs => greatest(1, least(p_retry_after_seconds, 86400))) end,
      last_error = left(coalesce(nullif(btrim(p_error_class), ''), 'unknown'), 500),
      last_error_class = left(coalesce(nullif(btrim(p_error_class), ''), 'unknown'), 100),
      last_error_at = now(), terminal_at = case when p_terminal then now() else null end,
      updated_at = now()
  where id = p_outbox_id and status = 'processing' and lease_token = p_lease_token
  returning true;
$$;

create function public.admin_retry_booking_automation_job(p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  update public.booking_automation_jobs
  set status = 'retry', lease_token = null, lease_expires_at = null,
      next_attempt_at = now(), terminal_at = null, updated_at = now()
  where id = p_job_id and status = 'failed';
  return found;
end;
$$;

create function public.admin_retry_email_outbox(p_outbox_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  update public.email_outbox
  set status = 'failed', lease_token = null, lease_expires_at = null,
      next_attempt_at = now(), terminal_at = null, updated_at = now()
  where id = p_outbox_id and status = 'failed';
  return found;
end;
$$;

-- Safely records an off-session failure even when Stripe never created an ID.
create function public.mark_balance_payment_unsuccessful_by_invoice(
  p_invoice_id uuid,
  p_target_status public.booking_payment_status,
  p_failure_code text default null,
  p_failure_message text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.booking_payments%rowtype;
begin
  if p_target_status not in ('failed', 'cancelled', 'requires_action') then
    raise exception 'INVALID_TARGET_STATUS:%', p_target_status;
  end if;
  select bp.* into v_payment
  from public.booking_payments bp
  where bp.invoice_id = p_invoice_id and bp.kind = 'balance'
  for update of bp;
  if not found then return 'not_found'; end if;
  if v_payment.status = 'succeeded' then return 'already_succeeded'; end if;

  update public.booking_payments
  set status = p_target_status, failure_code = p_failure_code,
      failure_message = p_failure_message,
      action_required_reason = case when p_target_status = 'requires_action'
        then coalesce(p_failure_message, 'authentication_required') else action_required_reason end,
      failed_at = case when p_target_status in ('failed', 'cancelled') then now() else failed_at end,
      updated_at = now()
  where id = v_payment.id;
  update public.booking_invoices
  set status = 'requires_action', updated_at = now()
  where id = p_invoice_id and status in ('review', 'processing', 'requires_action');
  return p_target_status::text;
end;
$$;

create function public.release_due_invoice_claim(p_invoice_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  update public.booking_invoices i
  set status = 'review', updated_at = now()
  where i.id = p_invoice_id
    and i.status = 'processing'
    and not exists (
      select 1
      from public.booking_disputes d
      where d.booking_id = i.booking_id
    )
    and exists (
      select 1
      from public.booking_payments p
      where p.invoice_id = i.id
        and p.kind = 'balance'
        and p.status = 'created'
    )
  returning true;
$$;

-- Least privilege for every new SECURITY DEFINER interface.
revoke execute on function public.claim_booking_automation_jobs(integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_booking_automation_jobs(integer, integer) to service_role;
revoke execute on function public.complete_booking_automation_job(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.complete_booking_automation_job(uuid, uuid) to service_role;
revoke execute on function public.retry_booking_automation_job(uuid, uuid, text, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.retry_booking_automation_job(uuid, uuid, text, integer, boolean) to service_role;
revoke execute on function public.claim_email_outbox(integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_email_outbox(integer, integer) to service_role;
revoke execute on function public.settle_email_outbox(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.settle_email_outbox(uuid, uuid, text) to service_role;
revoke execute on function public.retry_email_outbox(uuid, uuid, text, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.retry_email_outbox(uuid, uuid, text, integer, boolean) to service_role;
revoke execute on function public.mark_balance_payment_unsuccessful_by_invoice(
  uuid, public.booking_payment_status, text, text
) from public, anon, authenticated;
grant execute on function public.mark_balance_payment_unsuccessful_by_invoice(
  uuid, public.booking_payment_status, text, text
) to service_role;
revoke execute on function public.release_due_invoice_claim(uuid)
  from public, anon, authenticated;
grant execute on function public.release_due_invoice_claim(uuid) to service_role;
revoke execute on function public.admin_retry_booking_automation_job(uuid) from public, anon;
grant execute on function public.admin_retry_booking_automation_job(uuid) to authenticated;
revoke execute on function public.admin_retry_email_outbox(uuid) from public, anon;
grant execute on function public.admin_retry_email_outbox(uuid) to authenticated;

-- Backfill active work that predates this trigger migration.
insert into public.booking_automation_jobs (event_key, kind, booking_id, source_id, run_at, next_attempt_at)
select 'response_alert_' || b.id::text, 'response_alert', b.id, b.id, b.response_alert_at, b.response_alert_at
from public.bookings b
where b.booking_flow = 'hourly_v1' and b.status = 'requested' and b.response_alert_at is not null
on conflict (event_key) do nothing;
insert into public.booking_automation_jobs (event_key, kind, booking_id, source_id, run_at, next_attempt_at)
select 'request_expiration_' || b.id::text, 'request_expiration', b.id, b.id, b.scheduled_at, b.scheduled_at
from public.bookings b
where b.booking_flow = 'hourly_v1' and b.status = 'requested'
on conflict (event_key) do nothing;
insert into public.booking_automation_jobs (event_key, kind, booking_id, source_id, run_at, next_attempt_at)
select 'payment_expiration_' || b.id::text, 'payment_expiration', b.id, b.id,
       b.initial_payment_due_at, b.initial_payment_due_at
from public.bookings b
where b.booking_flow = 'hourly_v1' and b.status = 'accepted' and b.initial_payment_due_at is not null
on conflict (event_key) do nothing;
insert into public.booking_automation_jobs (event_key, kind, booking_id, source_id, run_at, next_attempt_at)
select 'invoice_autocharge_' || i.id::text, 'invoice_autocharge', i.booking_id, i.id,
       i.autocharge_at, i.autocharge_at
from public.booking_invoices i
where i.status = 'review' and i.remaining_balance_cents > 0 and i.autocharge_at is not null
on conflict (event_key) do nothing;

-- RLS-safe Realtime refresh hints. The existing SELECT policies remain the
-- source of truth; email/jobs are intentionally never published.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'booking_invoices'
    ) then
      alter publication supabase_realtime add table public.booking_invoices;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'booking_disputes'
    ) then
      alter publication supabase_realtime add table public.booking_disputes;
    end if;
  end if;
end;
$$;

-- Stable scheduler invocation. Missing Vault configuration is an intentional
-- no-op so migrations and preview environments never leak or invent secrets.
create function private.invoke_booking_scheduler()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_origin text;
  v_secret text;
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
  select net.http_post(
    url := rtrim(v_origin, '/') || '/api/internal/booking-scheduler',
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

select cron.schedule(
  'hourly-booking-v1-scheduler',
  '* * * * *',
  $cron$select private.invoke_booking_scheduler();$cron$
);
