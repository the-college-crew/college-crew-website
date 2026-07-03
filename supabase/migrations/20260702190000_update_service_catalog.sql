-- Pilot catalog tweak (owner: Zach — coordinated with Ari).
-- Remove Housekeeping & cleaning; add Pressure washing and Window washing.
-- Safe to delete 'cleaning': no provider_services or bookings reference it yet.

delete from public.services where slug = 'cleaning';

insert into public.services (name, slug, category, is_live)
values
  ('Pressure washing', 'pressure-washing', 'Outdoor', true),
  ('Window washing',   'window-washing',   'Home',    true)
on conflict (slug) do nothing;
