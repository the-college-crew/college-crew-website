-- Editable site copy (mini-CMS). Rows are OVERRIDES; the default text stays
-- hardcoded in the pages. Admins edit copy inline (double-click in edit mode)
-- on the customer-facing pages; deleting a row falls back to the code default.
--
-- Access model mirrors the services catalog: readable by everyone (the copy is
-- public by definition), writable only server-side via the service-role client
-- behind requireRole("admin") — no client write policies, and the blanket
-- default grants from 20260702200000_fix_public_grants.sql are revoked below.

create table public.site_content (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  -- Keys are dot-paths like "home.hero.title" or "home.faq.3.a"; the page
  -- prefix is further allowlisted in the server action.
  constraint site_content_key_format
    check (key ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' and char_length(key) <= 120),
  constraint site_content_value_length
    check (char_length(value) between 1 and 4000)
);

alter table public.site_content enable row level security;

create policy "Site copy is readable by everyone"
  on public.site_content for select
  to anon, authenticated
  using (true);

-- Default privileges grant ALL to the API roles; claw writes back so the only
-- write path is the service-role client (defense in depth on top of "no write
-- policies").
revoke insert, update, delete on table public.site_content from anon, authenticated;

-- Publish changes so open pages refresh live for every visitor (the anon-read
-- policy above is what lets logged-out subscribers hear them).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = 'site_content'
    ) then
      alter publication supabase_realtime add table public.site_content;
    end if;
  end if;
end;
$$;
