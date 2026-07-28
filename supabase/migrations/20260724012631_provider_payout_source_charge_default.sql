-- p_source_charge_id is legitimately absent when a payout attempt fails before a
-- charge is resolved. Giving it a DEFAULT makes it optional in the generated
-- TypeScript (`p_source_charge_id?: string`) so callers can omit it.
create or replace function public.record_provider_payout(
  p_booking_id uuid,
  p_payment_id uuid,
  p_idempotency_key text,
  p_amount_cents integer,
  p_destination_account_id text,
  p_source_charge_id text default null,
  p_stripe_transfer_id text default null,
  p_status text default 'pending',
  p_error text default null
)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_id uuid;
begin
  insert into public.booking_provider_payouts (
    booking_id, payment_id, amount_cents, status, idempotency_key,
    stripe_transfer_id, stripe_destination_account_id, stripe_source_charge_id,
    last_error, paid_at
  ) values (
    p_booking_id, p_payment_id, p_amount_cents, p_status, p_idempotency_key,
    p_stripe_transfer_id, p_destination_account_id, p_source_charge_id,
    p_error, case when p_status = 'paid' then now() else null end
  )
  on conflict (idempotency_key) do update
    set status = excluded.status,
        stripe_transfer_id = coalesce(excluded.stripe_transfer_id,
                                      public.booking_provider_payouts.stripe_transfer_id),
        stripe_source_charge_id = coalesce(excluded.stripe_source_charge_id,
                                           public.booking_provider_payouts.stripe_source_charge_id),
        last_error = excluded.last_error,
        paid_at = coalesce(public.booking_provider_payouts.paid_at, excluded.paid_at),
        updated_at = now()
  returning id into v_id;
  return v_id;
end;
$function$;

revoke all on function public.record_provider_payout(uuid, uuid, text, integer, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_provider_payout(uuid, uuid, text, integer, text, text, text, text, text)
  to service_role;
