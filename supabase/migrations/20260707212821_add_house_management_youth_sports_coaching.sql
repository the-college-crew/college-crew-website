-- Add two live pilot services to the curated catalog.
-- UI reads this table for Browse/onboarding/admin service curation.

insert into public.services (name, slug, category, is_live)
values
  ('House Management',       'house-management',       'Home',   true),
  ('Youth Sports Coaching',  'youth-sports-coaching',  'Sports', true)
on conflict (slug) do update
set
  name = excluded.name,
  category = excluded.category,
  is_live = excluded.is_live;
