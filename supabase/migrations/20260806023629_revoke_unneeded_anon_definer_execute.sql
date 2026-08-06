-- SECURITY DEFINER routines otherwise inherit EXECUTE from PUBLIC. Keep the
-- three predicates required while evaluating public RLS policies, but remove
-- anonymous RPC access from trigger-only, authenticated-only, and private
-- predicates. Explicit authenticated grants preserve the customer booking
-- flow; triggers execute as their table owner and need no browser grant.

revoke execute on function public.clear_resolution_on_new_message()
  from public, anon, authenticated;
revoke execute on function public.resolve_conversation_on_booking_completed()
  from public, anon, authenticated;
revoke execute on function public.handle_new_user()
  from public, anon, authenticated;
-- This legacy event-trigger helper exists in the hosted projects but not in
-- every local schema created from the migration history.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;

revoke execute on function public.create_booking_draft(
  uuid, uuid, timestamptz, integer, text, text, text, text, text,
  public.booking_decline_preference, integer, text, text,
  double precision, double precision, uuid
) from public, anon;
grant execute on function public.create_booking_draft(
  uuid, uuid, timestamptz, integer, text, text, text, text, text,
  public.booking_decline_preference, integer, text, text,
  double precision, double precision, uuid
) to authenticated;

revoke execute on function public.create_booking_draft(
  uuid, uuid, timestamptz, integer, text, text, text, text, text,
  public.booking_decline_preference, integer, text, text,
  double precision, double precision, uuid, public.booking_time_flexibility
) from public, anon;
grant execute on function public.create_booking_draft(
  uuid, uuid, timestamptz, integer, text, text, text, text, text,
  public.booking_decline_preference, integer, text, text,
  double precision, double precision, uuid, public.booking_time_flexibility
) to authenticated;

revoke execute on function public.finalize_hourly_booking(text) from public, anon;
grant execute on function public.finalize_hourly_booking(text) to authenticated;

revoke execute on function public.quote_hourly_offering_slot(uuid, timestamptz, integer)
  from public, anon;
grant execute on function public.quote_hourly_offering_slot(uuid, timestamptz, integer)
  to authenticated;

revoke execute on function public.is_conversation_member(uuid) from public, anon;
revoke execute on function public.is_conversation_member(text) from public, anon;
revoke execute on function public.is_provider_offering_hourly_bookable(uuid)
  from public, anon;
revoke execute on function public.is_provider_offering_quote_bookable(uuid)
  from public, anon;
revoke execute on function public.shares_thread_with(uuid) from public, anon;
