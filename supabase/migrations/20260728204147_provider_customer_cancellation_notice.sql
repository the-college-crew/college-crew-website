-- Providers keep customer cancellations visible until they explicitly clear
-- the notice. This is separate from the customer's dismissed_at field: each
-- participant resolves their own dashboard attention independently.
alter table public.bookings
  add column provider_cancellation_notice_dismissed_at timestamptz;

comment on column public.bookings.provider_cancellation_notice_dismissed_at is
  'When set, the assigned provider has cleared the customer-cancellation notice from Jobs.';

create function public.dismiss_provider_customer_cancellation_notice(
  p_booking_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  update public.bookings b
  set provider_cancellation_notice_dismissed_at = statement_timestamp()
  where b.id = p_booking_id
    and b.status = 'cancelled'
    and b.cancelled_by_role = 'customer'
    and b.provider_cancellation_notice_dismissed_at is null
    and exists (
      select 1
      from public.provider_profiles pp
      where pp.id = b.provider_id
        and pp.user_id = v_actor
    );

  if not found then
    raise exception 'BOOKING_CANCELLATION_NOTICE_NOT_FOUND';
  end if;

  return p_booking_id;
end;
$$;

revoke all on function public.dismiss_provider_customer_cancellation_notice(uuid)
  from public, anon;
grant execute on function public.dismiss_provider_customer_cancellation_notice(uuid)
  to authenticated;
