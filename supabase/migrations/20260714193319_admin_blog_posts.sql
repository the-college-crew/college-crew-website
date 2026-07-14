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

-- Move the two existing Stories From the Block articles into the CMS without
-- duplicating their bundled artwork in Storage. Replacing either image from
-- the admin page switches that post to a managed blog-images object.
insert into public.blog_posts (
  slug,
  title,
  body,
  image_path,
  created_at,
  updated_at
)
values
  (
    'the-quiet-work-of-keeping-a-home-running',
    'The Quiet Work of Keeping a Home Running',
    $body$Mrs. Alvarez travels for work about a week every month. This past winter she had a pile of packages that needed returning, an empty fridge she wanted filled before she landed, and two houseplants that were not going to make it another few days on their own.

One of our students, a junior at Loyola who lives four blocks over, took care of all of it. Returns dropped at the UPS store, groceries put away, plants watered, and a quick photo texted over so she knew things were handled while she was gone.

Honestly, that's most of what house management is. The little stuff that stacks up when life gets busy, done by someone from the neighborhood you'd recognize at the coffee shop. No app full of strangers, and you always know who has your spare key.$body$,
    '/blog/house-management.jpg',
    '2026-03-04 12:00:00-06',
    '2026-03-04 12:00:00-06'
  ),
  (
    'dog-walking-day-and-night-whatever-the-block-needs',
    'Dog Walking, Day and Night, Whatever the Block Needs',
    $body$Our neighbors don't keep normal hours, so we don't either. Some walks happen at 6am before a shift. Some happen at 10pm when someone's stuck late downtown and the dog has been waiting by the door for an hour.

Take Winnie, a golden who lives on the corner. Most nights she gets walked by the same two students. Her owner never knows exactly when he'll be home, so he books whoever's free and trusts they'll show up. They always do.

Rain, snow, early, late. If your dog needs to get out, one of our students will be there, and you'll get a message the second the walk starts.$body$,
    '/blog/evening-dog-walk.jpg',
    '2026-02-18 12:00:00-06',
    '2026-02-18 12:00:00-06'
  );
