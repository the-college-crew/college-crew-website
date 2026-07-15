-- The public provider directory is a security-invoker view, so callers also
-- need column-level access to every intentionally public base-table column the
-- view selects. Keep all private provider fields inaccessible.
grant select (banner_image_path, banner_style)
  on table public.provider_profiles
  to anon, authenticated;
