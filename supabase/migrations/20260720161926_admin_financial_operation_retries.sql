-- Founder recovery controls for existing refund and webhook records. External
-- Stripe calls remain outside SQL; these short transactions only claim/reset
-- durable rows so concurrent workers cannot replay the same operation.

set lock_timeout = '10s';
set statement_timeout = '2min';

create function public.admin_retry_booking_refund(p_refund_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_refund public.booking_refunds%rowtype;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  select r.* into v_refund
  from public.booking_refunds r
  where r.id = p_refund_id
  for update of r;
  if not found then
    raise exception 'REFUND_NOT_FOUND';
  end if;
  if v_refund.status <> 'failed' then
    raise exception 'REFUND_NOT_FAILED:%', v_refund.status;
  end if;

  update public.booking_refunds
  set status = 'created', failure_code = null, failure_message = null,
      failed_at = null, updated_at = now()
  where id = v_refund.id;

  insert into public.booking_audit_events (
    booking_id, actor_user_id, actor_kind, action, metadata
  )
  values (
    v_refund.booking_id, v_actor, 'admin', 'refund_retry_requested',
    jsonb_build_object(
      'refund_id', v_refund.id,
      'idempotency_key', v_refund.idempotency_key
    )
  );

  return v_refund.booking_id;
end;
$$;

revoke execute on function public.admin_retry_booking_refund(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_retry_booking_refund(uuid) to authenticated;

create function public.claim_stripe_webhook_receipt(
  p_receipt_id uuid,
  p_stale_seconds integer default 300
)
returns table (
  id uuid,
  stripe_event_id text,
  payload jsonb,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce((select auth.jwt() ->> 'role'), '');
  v_receipt public.stripe_webhook_receipts%rowtype;
begin
  if v_role <> 'service_role' and not public.is_admin() then
    raise exception 'ADMIN_OR_SERVICE_ROLE_REQUIRED';
  end if;
  if p_stale_seconds < 30 or p_stale_seconds > 3600 then
    raise exception 'INVALID_STALE_SECONDS';
  end if;

  select r.* into v_receipt
  from public.stripe_webhook_receipts r
  where r.id = p_receipt_id
  for update of r;
  if not found or v_receipt.processed_at is not null then
    return;
  end if;
  if v_receipt.last_error is null
    and coalesce(v_receipt.processing_started_at, v_receipt.received_at)
      > statement_timestamp() - make_interval(secs => p_stale_seconds) then
    return;
  end if;

  return query
  update public.stripe_webhook_receipts r
  set processing_started_at = statement_timestamp(),
      attempt_count = r.attempt_count + 1,
      next_attempt_at = null,
      last_error = null
  where r.id = v_receipt.id and r.processed_at is null
  returning r.id, r.stripe_event_id, r.payload, r.attempt_count;
end;
$$;

revoke execute on function public.claim_stripe_webhook_receipt(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_stripe_webhook_receipt(uuid, integer)
  to authenticated, service_role;
