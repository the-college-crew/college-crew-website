-- Fix: the initial migration never issued base table grants to the Supabase
-- API roles (anon, authenticated, service_role). They had schema USAGE but no
-- table SELECT/INSERT/UPDATE/DELETE, so every PostgREST query failed with
-- "permission denied" — breaking app reads, provider edits, and seeding.
--
-- This restores the standard Supabase baseline (broad grants; RLS enforces row
-- access on top) and then RE-APPLIES the column-level UPDATE restrictions the
-- initial migration intended, which the blanket grant above would re-open.

grant all on all tables      in schema public to anon, authenticated, service_role;
grant all on all sequences   in schema public to anon, authenticated, service_role;
grant execute on all routines in schema public to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables       to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences    to anon, authenticated, service_role;
alter default privileges in schema public grant execute on routines to anon, authenticated, service_role;

-- Re-apply column-level UPDATE limits (mirrors initial_schema.sql).
revoke update on table public.profiles from anon, authenticated;
grant update (full_name) on table public.profiles to authenticated;

revoke update on table public.provider_profiles from anon, authenticated;
grant update (display_name, bio, provider_type, neighborhood, availability, id_document_url)
  on table public.provider_profiles to authenticated;

revoke update on table public.bookings from anon, authenticated;
grant update (status) on table public.bookings to authenticated;
