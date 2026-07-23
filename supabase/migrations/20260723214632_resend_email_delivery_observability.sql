-- Resend delivery observability.
--
-- `email_outbox.status = 'sent'` continues to mean that the sending API
-- accepted the message. Delivery state is tracked separately because Resend
-- webhooks arrive later, at least once, and not necessarily in order.

create type public.email_delivery_status as enum (
  'accepted',
  'delivered',
  'delayed',
  'bounced',
  'complained',
  'failed',
  'suppressed'
);

alter table public.email_outbox
  add column delivery_status public.email_delivery_status,
  add column delivery_event_at timestamptz,
  add column delivered_at timestamptz,
  add column delivery_issue_at timestamptz,
  add column delivery_detail text;

update public.email_outbox
set delivery_status = 'accepted',
    delivery_event_at = sent_at
where status = 'sent'
  and provider_message_id is not null
  and sent_at is not null;

create index email_outbox_delivery_attention_idx
  on public.email_outbox (delivery_event_at desc)
  where delivery_status in ('delayed', 'bounced', 'complained', 'failed', 'suppressed');

create index email_outbox_provider_message_id_idx
  on public.email_outbox (provider_message_id)
  where provider_message_id is not null;

create table public.resend_webhook_events (
  id uuid primary key default gen_random_uuid(),
  svix_id text not null unique,
  provider_message_id text not null,
  recipient_email text,
  event_type text not null,
  delivery_status public.email_delivery_status not null,
  event_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz not null default now(),
  detail text,
  is_current boolean not null default false,
  matched_outbox_id uuid references public.email_outbox (id) on delete set null,

  constraint resend_webhook_events_svix_id_not_blank
    check (btrim(svix_id) <> ''),
  constraint resend_webhook_events_provider_message_id_not_blank
    check (btrim(provider_message_id) <> ''),
  constraint resend_webhook_events_recipient_normalized
    check (
      recipient_email is null
      or recipient_email = lower(btrim(recipient_email))
    ),
  constraint resend_webhook_events_type_valid
    check (
      event_type in (
        'email.sent',
        'email.delivered',
        'email.delivery_delayed',
        'email.bounced',
        'email.complained',
        'email.failed',
        'email.suppressed'
      )
    )
);

create index resend_webhook_events_message_idx
  on public.resend_webhook_events (provider_message_id, event_created_at desc);
create index resend_webhook_events_attention_idx
  on public.resend_webhook_events (event_created_at desc)
  where is_current
    and delivery_status in ('delayed', 'bounced', 'complained', 'failed', 'suppressed');
create unique index resend_webhook_events_one_current_idx
  on public.resend_webhook_events (
    provider_message_id,
    coalesce(recipient_email, '')
  )
  where is_current;

create table public.email_suppressions (
  recipient_email text primary key,
  reason text not null,
  detail text,
  provider_message_id text not null,
  suppressed_at timestamptz not null,
  cleared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint email_suppressions_recipient_normalized
    check (
      recipient_email = lower(btrim(recipient_email))
      and btrim(recipient_email) <> ''
    ),
  constraint email_suppressions_reason_valid
    check (reason in ('bounced', 'complained', 'suppressed')),
  constraint email_suppressions_provider_message_id_not_blank
    check (btrim(provider_message_id) <> ''),
  constraint email_suppressions_clear_order
    check (cleared_at is null or cleared_at >= suppressed_at)
);

create index email_suppressions_active_idx
  on public.email_suppressions (suppressed_at desc)
  where cleared_at is null;

alter table public.resend_webhook_events enable row level security;
alter table public.email_suppressions enable row level security;

revoke all on table public.resend_webhook_events
  from public, anon, authenticated;
revoke all on table public.email_suppressions
  from public, anon, authenticated;
grant all on table public.resend_webhook_events to service_role;
grant all on table public.email_suppressions to service_role;

create function public.record_resend_webhook_event(
  p_svix_id text,
  p_provider_message_id text,
  p_recipient_email text,
  p_event_type text,
  p_event_created_at timestamptz,
  p_detail text default null
)
returns table (
  duplicate boolean,
  matched_outbox_id uuid,
  current_delivery_status public.email_delivery_status
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_current_event_id uuid;
  v_current_event_at timestamptz;
  v_recipient_email text := nullif(lower(btrim(p_recipient_email)), '');
  v_delivery_status public.email_delivery_status;
  v_outbox_id uuid;
  v_is_current boolean := false;
begin
  if nullif(btrim(p_svix_id), '') is null
    or nullif(btrim(p_provider_message_id), '') is null
    or p_event_created_at is null
  then
    raise exception 'invalid_resend_webhook_event';
  end if;

  v_delivery_status := case p_event_type
    when 'email.sent' then 'accepted'::public.email_delivery_status
    when 'email.delivered' then 'delivered'::public.email_delivery_status
    when 'email.delivery_delayed' then 'delayed'::public.email_delivery_status
    when 'email.bounced' then 'bounced'::public.email_delivery_status
    when 'email.complained' then 'complained'::public.email_delivery_status
    when 'email.failed' then 'failed'::public.email_delivery_status
    when 'email.suppressed' then 'suppressed'::public.email_delivery_status
    else null
  end;

  if v_delivery_status is null then
    raise exception 'unsupported_resend_webhook_event';
  end if;

  -- Serialize updates for one provider-message/recipient pair so concurrent
  -- webhook attempts cannot create two current rows.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      btrim(p_provider_message_id) || ':' || coalesce(v_recipient_email, ''),
      0
    )
  );

  insert into public.resend_webhook_events (
    svix_id,
    provider_message_id,
    recipient_email,
    event_type,
    delivery_status,
    event_created_at,
    detail
  )
  values (
    btrim(p_svix_id),
    btrim(p_provider_message_id),
    v_recipient_email,
    p_event_type,
    v_delivery_status,
    p_event_created_at,
    left(nullif(btrim(p_detail), ''), 500)
  )
  on conflict (svix_id) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select e.matched_outbox_id, e.delivery_status
      into v_outbox_id, v_delivery_status
    from public.resend_webhook_events e
    where e.svix_id = btrim(p_svix_id);

    return query select true, v_outbox_id, v_delivery_status;
    return;
  end if;

  select e.id, e.event_created_at
    into v_current_event_id, v_current_event_at
  from public.resend_webhook_events e
  where e.provider_message_id = btrim(p_provider_message_id)
    and e.recipient_email is not distinct from v_recipient_email
    and e.is_current
  for update;

  v_is_current :=
    v_current_event_id is null
    or p_event_created_at >= v_current_event_at;

  select e.id
    into v_outbox_id
  from public.email_outbox e
  where e.provider_message_id = btrim(p_provider_message_id)
  order by e.created_at desc
  limit 1;

  update public.resend_webhook_events
  set matched_outbox_id = v_outbox_id
  where id = v_event_id;

  if v_is_current then
    update public.resend_webhook_events
    set is_current = false
    where id = v_current_event_id;

    update public.resend_webhook_events
    set is_current = true
    where id = v_event_id;

    if v_outbox_id is not null then
      update public.email_outbox
      set delivery_status = v_delivery_status,
          delivery_event_at = p_event_created_at,
          delivered_at = case
            when v_delivery_status = 'delivered' then p_event_created_at
            else delivered_at
          end,
          delivery_issue_at = case
            when v_delivery_status in (
              'delayed', 'bounced', 'complained', 'failed', 'suppressed'
            ) then p_event_created_at
            else delivery_issue_at
          end,
          delivery_detail = left(nullif(btrim(p_detail), ''), 500),
          updated_at = now()
      where id = v_outbox_id;
    end if;

    if v_recipient_email is not null
      and v_delivery_status in ('bounced', 'complained', 'suppressed')
    then
      insert into public.email_suppressions (
        recipient_email,
        reason,
        detail,
        provider_message_id,
        suppressed_at,
        cleared_at
      )
      values (
        v_recipient_email,
        v_delivery_status::text,
        left(nullif(btrim(p_detail), ''), 500),
        btrim(p_provider_message_id),
        p_event_created_at,
        null
      )
      on conflict (recipient_email) do update
      set reason = excluded.reason,
          detail = excluded.detail,
          provider_message_id = excluded.provider_message_id,
          suppressed_at = excluded.suppressed_at,
          cleared_at = null,
          updated_at = now()
      where excluded.suppressed_at >= public.email_suppressions.suppressed_at;
    elsif v_recipient_email is not null
      and v_delivery_status = 'delivered'
    then
      -- A later successful delivery is proof that an old bounce/suppression
      -- is no longer active. Complaints always require an explicit review.
      update public.email_suppressions
      set cleared_at = p_event_created_at,
          updated_at = now()
      where recipient_email = v_recipient_email
        and cleared_at is null
        and reason in ('bounced', 'suppressed')
        and suppressed_at <= p_event_created_at;
    end if;
  end if;

  return query select false, v_outbox_id, v_delivery_status;
end;
$$;

create function public.get_active_email_suppression(p_recipient_email text)
returns table (
  reason text,
  detail text,
  suppressed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.reason, s.detail, s.suppressed_at
  from public.email_suppressions s
  where s.recipient_email = lower(btrim(p_recipient_email))
    and s.cleared_at is null;
$$;

create function public.retry_email_outbox_detailed(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_error_class text,
  p_error_detail text,
  p_retry_after_seconds integer,
  p_terminal boolean default false
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  update public.email_outbox
  set status = 'failed',
      lease_token = null,
      lease_expires_at = null,
      next_attempt_at = case
        when p_terminal then next_attempt_at
        else now() + make_interval(
          secs => greatest(1, least(p_retry_after_seconds, 86400))
        )
      end,
      last_error = left(
        coalesce(
          nullif(btrim(p_error_detail), ''),
          nullif(btrim(p_error_class), ''),
          'unknown'
        ),
        500
      ),
      last_error_class = left(
        coalesce(nullif(btrim(p_error_class), ''), 'unknown'),
        100
      ),
      last_error_at = now(),
      terminal_at = case when p_terminal then now() else null end,
      updated_at = now()
  where id = p_outbox_id
    and status = 'processing'
    and lease_token = p_lease_token
  returning true;
$$;

revoke execute on function public.record_resend_webhook_event(
  text, text, text, text, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.record_resend_webhook_event(
  text, text, text, text, timestamptz, text
) to service_role;

revoke execute on function public.get_active_email_suppression(text)
  from public, anon, authenticated;
grant execute on function public.get_active_email_suppression(text)
  to service_role;

revoke execute on function public.retry_email_outbox_detailed(
  uuid, uuid, text, text, integer, boolean
) from public, anon, authenticated;
grant execute on function public.retry_email_outbox_detailed(
  uuid, uuid, text, text, integer, boolean
) to service_role;
