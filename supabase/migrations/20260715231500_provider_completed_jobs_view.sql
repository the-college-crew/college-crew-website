-- Aggregate completed-job counts per provider, for the recommendation ranking.
-- Owner: Ari.
--
-- Mirrors the provider_ratings view: a SECURITY DEFINER view exposes only the
-- per-provider aggregate to anon/authenticated, so the ranking never reads raw
-- rows from (or "opens up") the bookings table, and never needs the
-- service-role client on the public Browse path. Returns one row per provider,
-- so there is no unbounded read and no row-cap truncation risk as history grows.
--
-- Uses the existing bookings_status_idx / bookings_provider_id_idx indexes.

create view public.provider_completed_jobs
with (security_invoker = off) as
  select
    b.provider_id,
    count(*)::int as completed_jobs
  from public.bookings b
  where b.status = 'completed'
  group by b.provider_id;

grant select on public.provider_completed_jobs to anon, authenticated;
