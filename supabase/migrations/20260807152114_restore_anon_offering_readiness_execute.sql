-- Restore anonymous EXECUTE on the two offering-readiness predicates.
--
-- 20260806023629_revoke_unneeded_anon_definer_execute revoked these as
-- "unneeded anonymous RPC access". They are not only RPCs: the
-- public_provider_offerings view calls both in its SELECT list, and a
-- security_invoker view evaluates them as the querying role. Revoking anon
-- EXECUTE therefore made that view raise 42501 for every logged-out visitor,
-- which emptied public Browse (providers with no offerings are filtered out)
-- and 404'd every public provider profile. Signed-in traffic kept working
-- because the authenticated grant was left in place, so the outage was
-- invisible to anyone testing while logged in.
--
-- Both functions take one provider_service_id and return a bare boolean; the
-- private reason and source fields stay unexposed, which is why they were
-- granted to anon when they were created (20260713211137, 20260720223000).

grant execute on function public.is_provider_offering_hourly_bookable(uuid)
  to anon;
grant execute on function public.is_provider_offering_quote_bookable(uuid)
  to anon;
