-- Founder-authored blog posts. Posts publish immediately; the public blog and
-- founder editor both sort by updated_at so the most recently changed post is
-- always first.
create table public.blog_posts (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  title      text not null,
  body       text not null,
  image_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  constraint blog_posts_slug_format
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) <= 180),
  constraint blog_posts_title_length
    check (char_length(btrim(title)) between 1 and 160),
  constraint blog_posts_body_length
    check (char_length(btrim(body)) between 1 and 30000),
  constraint blog_posts_image_path_length
    check (char_length(image_path) between 1 and 500)
);

create index blog_posts_updated_at_idx
  on public.blog_posts (updated_at desc);

create function private.touch_blog_post_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger blog_posts_touch_updated_at
before update on public.blog_posts
for each row execute function private.touch_blog_post_updated_at();

alter table public.blog_posts enable row level security;

create policy "Blog posts are readable by everyone"
  on public.blog_posts for select
  to anon, authenticated
  using (true);

-- Supabase projects created after April 2026 may not expose new tables to the
-- Data API automatically. Grant public reads explicitly, then claw every
-- mutation back so writes only happen through the service-role client after a
-- requireRole("admin") check.
revoke all on table public.blog_posts from anon, authenticated;
grant select (
  id,
  slug,
  title,
  body,
  image_path,
  created_at,
  updated_at
) on table public.blog_posts to anon, authenticated;

-- Blog artwork is public by definition. Standard uploads are most reliable
-- below 6 MB, so the UI and bucket both cap images at 5 MB.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'blog-images',
  'blog-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Deliberately no authenticated storage mutation policies. Admin Server
-- Actions use the service-role client only after checking the real profile
-- role, so a browser session cannot upload, replace, or delete blog artwork.
