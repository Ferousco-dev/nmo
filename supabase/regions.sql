-- =====================================================
-- Regions (Teams)
--
-- Per Jack: members live in geographic regions (Taipei, Taichung,
-- Tainan, Hong Kong, …). Each region can have its own leaders. This
-- migration sets up:
--
--   • regions table
--   • profiles.region_id FK
--   • family_tree.region_id FK (existing free-text `region` column
--     stays for backwards-compat)
--   • RLS so everyone-authenticated can READ regions; only admins
--     write via SECURITY DEFINER RPCs
--   • Admin RPCs: create / rename / delete / set-member-region
--
-- Idempotent: safe to re-run.
-- =====================================================

create table if not exists public.regions (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Inline UNIQUE(expression) isn't valid in Postgres — case-insensitive
-- uniqueness needs to live in its own index.
create unique index if not exists regions_name_lower_unique
  on public.regions (lower(name));

create index if not exists idx_regions_display_order on public.regions (display_order, name);

-- ---------------------------------------------------------------------
-- FKs
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists region_id uuid references public.regions(id) on delete set null;
create index if not exists idx_profiles_region on public.profiles (region_id);

alter table public.family_tree
  add column if not exists region_id uuid references public.regions(id) on delete set null;
create index if not exists idx_family_tree_region on public.family_tree (region_id);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.regions enable row level security;

drop policy if exists "Regions readable by authenticated" on public.regions;
create policy "Regions readable by authenticated" on public.regions
  for select to authenticated using (true);

-- (No client-facing INSERT/UPDATE/DELETE policies — all writes go
--  through SECURITY DEFINER RPCs below.)

-- ---------------------------------------------------------------------
-- Seed the four regions Jack named.
-- ---------------------------------------------------------------------
insert into public.regions (name, display_order) values
  ('Taipei',     1),
  ('Taichung',   2),
  ('Tainan',     3),
  ('Hong Kong',  4)
on conflict (lower(name)) do update set display_order = excluded.display_order;

-- ---------------------------------------------------------------------
-- Admin RPCs
-- ---------------------------------------------------------------------
create or replace function public.admin_create_region(
  p_name text,
  p_display_order integer default null
)
returns public.regions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.regions;
  v_order integer;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'name_required';
  end if;
  v_order := coalesce(
    p_display_order,
    (select coalesce(max(display_order), 0) + 1 from public.regions)
  );
  insert into public.regions (name, display_order)
    values (trim(p_name), v_order)
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.admin_create_region(text, integer) from public;
grant execute on function public.admin_create_region(text, integer) to authenticated;

create or replace function public.admin_rename_region(p_id uuid, p_name text)
returns public.regions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.regions;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'name_required';
  end if;
  update public.regions set name = trim(p_name) where id = p_id returning * into v_row;
  if not found then raise exception 'region_not_found'; end if;
  return v_row;
end;
$$;
revoke all on function public.admin_rename_region(uuid, text) from public;
grant execute on function public.admin_rename_region(uuid, text) to authenticated;

create or replace function public.admin_delete_region(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted uuid;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  delete from public.regions where id = p_id returning id into v_deleted;
  if v_deleted is null then raise exception 'region_not_found'; end if;
  return v_deleted;
end;
$$;
revoke all on function public.admin_delete_region(uuid) from public;
grant execute on function public.admin_delete_region(uuid) to authenticated;

create or replace function public.admin_set_member_region(
  p_user_id uuid,
  p_region_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.profiles set region_id = p_region_id where id = p_user_id;
  if not found then raise exception 'member_not_found'; end if;
end;
$$;
revoke all on function public.admin_set_member_region(uuid, uuid) from public;
grant execute on function public.admin_set_member_region(uuid, uuid) to authenticated;

create or replace function public.admin_set_family_tree_region(
  p_family_tree_id uuid,
  p_region_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.family_tree set region_id = p_region_id where id = p_family_tree_id;
  if not found then raise exception 'leader_not_found'; end if;
end;
$$;
revoke all on function public.admin_set_family_tree_region(uuid, uuid) from public;
grant execute on function public.admin_set_family_tree_region(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Convenience view: region roster (member counts + leader counts).
-- Read-only, used by /admin/regions.
-- ---------------------------------------------------------------------
create or replace view public.region_roster as
select
  r.id,
  r.name,
  r.display_order,
  r.created_at,
  (select count(*) from public.profiles  p where p.region_id = r.id) as member_count,
  (select count(*) from public.family_tree f where f.region_id = r.id) as leader_count
from public.regions r
order by r.display_order, r.name;
