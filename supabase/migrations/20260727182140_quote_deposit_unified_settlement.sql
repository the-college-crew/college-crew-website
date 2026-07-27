-- Quote-deposit flow enum bootstrap.
--
-- PostgreSQL does not allow a newly-added enum value to be referenced by
-- functions or constraints until the transaction that added it commits, so
-- the unified settlement contract follows in the next migration.

alter type public.booking_flow add value if not exists 'quote_v2';
alter type public.booking_payment_kind add value if not exists 'quote_deposit';

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'quote_daypart'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.quote_daypart as enum ('morning', 'afternoon', 'either');
  end if;
end
$$;
