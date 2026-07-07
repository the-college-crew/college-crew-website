-- Live updates: stream row changes to the dashboards that render them, so the
-- UI reflects new requests, status changes, and approvals without a reload.
--
-- Realtime enforces RLS per subscriber (the socket must carry the user's JWT),
-- so each connection only ever receives rows its existing policies already
-- allow: providers and customers see their own bookings; admins see provider
-- profiles and school-email verifications. Only `messages` was published
-- before (chat); these three tables back the live dashboards.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = 'bookings'
    ) then
      alter publication supabase_realtime add table public.bookings;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = 'provider_profiles'
    ) then
      alter publication supabase_realtime add table public.provider_profiles;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = 'provider_school_emails'
    ) then
      alter publication supabase_realtime add table public.provider_school_emails;
    end if;
  end if;
end;
$$;
