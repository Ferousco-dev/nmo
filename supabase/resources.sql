-- =====================================================
-- RESOURCES — admin-curated content cards
-- =====================================================
-- A simple "feed" / "library" the admin posts into. Each card has a
-- title, description, thumbnail, an outbound link (article, video,
-- Skool lesson, etc.), and a tag/category badge. Members of the app
-- see them in a grid at /resources; admins manage them from
-- /admin/resources.
--
-- Bilingual: title and description have _en / _zh columns. The
-- presentation layer picks the right one based on the user's locale,
-- falling back to the other if one is empty.
-- =====================================================

create table if not exists public.resources (
  id uuid primary key default uuid_generate_v4(),
  title_en text,
  title_zh text,
  description_en text,
  description_zh text,
  thumbnail_url text,
  link_url text,
  -- short uppercase label shown on the card (e.g. 'AI BARRIER')
  tag text,
  display_order integer default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create index if not exists idx_resources_visible
  on public.resources (is_active, display_order desc, created_at desc);

alter table public.resources enable row level security;

-- READ: any signed-in user sees active resources
drop policy if exists "Resources visible to authenticated" on public.resources;
create policy "Resources visible to authenticated" on public.resources
  for select
  using (auth.role() = 'authenticated' and is_active = true);

-- WRITE: only admins (uses public.is_admin() defined in admin.sql)
drop policy if exists "Admins can insert resources" on public.resources;
create policy "Admins can insert resources" on public.resources
  for insert
  with check (public.is_admin());

drop policy if exists "Admins can update resources" on public.resources;
create policy "Admins can update resources" on public.resources
  for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can delete resources" on public.resources;
create policy "Admins can delete resources" on public.resources
  for delete
  using (public.is_admin());

-- Admins also need to read soft-deleted (is_active=false) rows from
-- the admin page so they can re-enable. Add a separate select policy
-- that's broader for admins.
drop policy if exists "Admins read all resources" on public.resources;
create policy "Admins read all resources" on public.resources
  for select
  using (public.is_admin());

grant select, insert, update, delete on public.resources to authenticated;
