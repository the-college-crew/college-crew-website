-- Public feedback + customer-support intake for the pilot.
--
-- Anyone can submit through the validated Server Action, but there is no
-- direct browser write path. Founders read the inbox through the normal
-- cookie-backed client under the admin RLS policy; all mutations use the
-- service-role client after server-side authorization.

create table public.support_tickets (
  id             uuid primary key default gen_random_uuid(),
  submitter_id   uuid references public.profiles (id) on delete set null,
  category       text not null,
  sentiment      text,
  message        text not null,
  wants_reply    boolean not null default false,
  contact_email  text,
  source_path    text,
  status         text not null default 'new',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  resolved_at    timestamptz,
  resolved_by    uuid references public.profiles (id) on delete set null,

  constraint support_tickets_category_valid check (
    category in (
      'website',
      'feature_or_service',
      'booking_or_job',
      'account_or_payment',
      'safety_or_trust',
      'other'
    )
  ),
  constraint support_tickets_sentiment_valid check (
    sentiment is null or sentiment in ('positive', 'neutral', 'frustrated')
  ),
  constraint support_tickets_status_valid check (
    status in ('new', 'reviewing', 'resolved')
  ),
  constraint support_tickets_message_length check (
    char_length(message) between 10 and 5000
  ),
  constraint support_tickets_contact_email_length check (
    contact_email is null or char_length(contact_email) between 3 and 320
  ),
  constraint support_tickets_reply_contact check (
    not wants_reply or contact_email is not null
  ),
  constraint support_tickets_source_path_valid check (
    source_path is null
    or (source_path ~ '^/' and char_length(source_path) <= 500)
  ),
  constraint support_tickets_resolution_consistent check (
    (status = 'resolved' and resolved_at is not null)
    or (status <> 'resolved' and resolved_at is null)
  )
);

-- Default inbox query is open work, newest first. Foreign keys are indexed
-- explicitly because Postgres does not create indexes for referencing columns.
create index support_tickets_status_created_at_idx
  on public.support_tickets (status, created_at desc);
create index support_tickets_submitter_id_idx
  on public.support_tickets (submitter_id)
  where submitter_id is not null;
create index support_tickets_resolved_by_idx
  on public.support_tickets (resolved_by)
  where resolved_by is not null;

alter table public.support_tickets enable row level security;

create policy "Admins read support tickets"
  on public.support_tickets for select
  to authenticated
  using (public.is_admin());

-- New Supabase projects may not expose new public tables automatically. Grant
-- only the authenticated read needed by the admin inbox; all writes stay
-- service-role-only behind validated Server Actions.
revoke all on table public.support_tickets from anon, authenticated;
grant select on table public.support_tickets to authenticated;
grant all on table public.support_tickets to service_role;

-- New submissions should appear in an open admin inbox without a refresh.
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'support_tickets'
  ) then
    alter publication supabase_realtime add table public.support_tickets;
  end if;
end;
$$;
