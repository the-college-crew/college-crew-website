-- Focal-point offsets for the provider avatar and banner photos. CSS
-- object-position only (no crop/zoom, no re-encoding) -- lets a provider drag
-- the photo within its fixed frame to recenter it. Percent-of-image
-- coordinates, 0-100, default 50/50 (dead center, matching today's hardcoded
-- object-cover behavior so existing photos render unchanged until repositioned).

alter table public.provider_profiles
  add column avatar_focal_x smallint not null default 50
    check (avatar_focal_x between 0 and 100),
  add column avatar_focal_y smallint not null default 50
    check (avatar_focal_y between 0 and 100),
  add column banner_focal_x smallint not null default 50
    check (banner_focal_x between 0 and 100),
  add column banner_focal_y smallint not null default 50
    check (banner_focal_y between 0 and 100);

comment on column public.provider_profiles.avatar_focal_x is
  'Horizontal focal point of avatar_image_path as a 0-100 percent, applied via CSS object-position. 50 = center (default/legacy behavior).';
comment on column public.provider_profiles.avatar_focal_y is
  'Vertical focal point of avatar_image_path as a 0-100 percent, applied via CSS object-position. 50 = center.';
comment on column public.provider_profiles.banner_focal_x is
  'Horizontal focal point of banner_image_path as a 0-100 percent, applied via CSS object-position. 50 = center.';
comment on column public.provider_profiles.banner_focal_y is
  'Vertical focal point of banner_image_path as a 0-100 percent, applied via CSS object-position. 50 = center.';

-- Same client-writable rationale as avatar_image_path/banner_image_path: no
-- free-text moderation risk, so the RLS-scoped client (not the admin client)
-- can write it directly.
grant update (avatar_focal_x, avatar_focal_y, banner_focal_x, banner_focal_y)
  on table public.provider_profiles to authenticated;

-- public_provider_directory is security_invoker -- callers need column-level
-- select on the base table for every column the view exposes, mirroring the
-- avatar/banner repair migrations.
grant select (avatar_focal_x, avatar_focal_y, banner_focal_x, banner_focal_y)
  on table public.provider_profiles to anon, authenticated;

-- Directory view: ADDITIVE change, appended at the END after
-- availability_windows -- CREATE OR REPLACE VIEW can only append output
-- columns, never reorder or drop. Copied from the 20260716150529 definition.
create or replace view public.public_provider_directory
with (security_invoker = true) as
  select
    pp.id as provider_id,
    pp.display_name,
    pp.bio,
    pp.provider_type,
    pp.neighborhood,
    pp.availability,
    pp.availability_weekdays,
    pp.availability_start_local,
    pp.availability_end_local,
    pp.availability_note,
    pp.created_at,
    pp.minimum_notice_hours,
    pp.company_name,
    pp.avatar_image_path,
    pp.banner_image_path,
    pp.banner_style,
    (
      select jsonb_agg(
        jsonb_build_object(
          'weekday', w.weekday,
          'start_local', w.start_local,
          'end_local', w.end_local
        )
        order by w.weekday
      )
      from public.provider_availability_windows w
      where w.provider_id = pp.id
    ) as availability_windows,
    pp.avatar_focal_x,
    pp.avatar_focal_y,
    pp.banner_focal_x,
    pp.banner_focal_y
  from public.provider_profiles pp
  where public.is_provider_approved(pp.id)
    and pp.avatar_image_path is not null;

-- Table-level select grant on the view is unchanged (granted once in
-- 20260716150529 and covers all current/future columns); no re-grant needed
-- here, only the column-level grant on the base table above.
