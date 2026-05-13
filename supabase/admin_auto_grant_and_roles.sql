-- =====================================================
-- Roles + auto-admin + uniqueness hardening
--
-- 1. Set the right Skool-mirror roles on each family_tree row
--    (Owner / Admin / Moderator) so /family-tree groups match what
--    Skool itself shows.
-- 2. Belt-and-braces unique constraint on profiles.skool_handle
--    (claim_skool_handle already checks, but a constraint guarantees
--    no two profiles can share a Skool handle even if a race slips
--    through).
-- 3. Trigger: when a user's skool_handle is set and that handle has
--    an admin-tier role in family_tree (Owner / Admin / Moderator),
--    insert into admin_users automatically. They'll see /admin on
--    their next page load.
--
-- Safe to re-run.
-- =====================================================

-- ---------------------------------------------------------------------
-- 1. Family-tree role updates (matches the Skool members list shown
--    in the community).
-- ---------------------------------------------------------------------
update public.family_tree set role = 'Owner'
 where skool_handle = 'jack-liu-9368';

update public.family_tree set role = 'Admin'
 where skool_handle in ('jay666', 'david-zheng-8909');

update public.family_tree set role = 'Moderator'
 where skool_handle in (
   '18794392',          -- How Zheng
   '20727043',          -- 吳 承翰
   'ma-ine-2187',       -- Ma Ine
   'aaron-5177',        -- Aaron 子儀
   '18307878',          -- Oc Chang
   'michael-su-9638'    -- 小Michael Su 宮川
 );

-- ---------------------------------------------------------------------
-- 2. Unique skool_handle per profile. Two-step so a re-run doesn't
--    error if the constraint already exists.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'profiles_skool_handle_unique'
  ) then
    alter table public.profiles
      add constraint profiles_skool_handle_unique unique (skool_handle);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Auto-admin trigger
--    When profiles.skool_handle changes (set or rotated), check the
--    handle against family_tree. If the row there has role in the
--    admin-tier set, insert into admin_users. Insert is idempotent
--    on the PK (user_id), so re-claiming doesn't break.
-- ---------------------------------------------------------------------
create or replace function public.auto_grant_admin_on_skool_handle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if new.skool_handle is null then
    return new;
  end if;
  if old is not null
     and old.skool_handle is not distinct from new.skool_handle then
    -- No change; nothing to do.
    return new;
  end if;

  select role into v_role
    from public.family_tree
   where lower(skool_handle) = lower(new.skool_handle)
   limit 1;

  if v_role in ('Owner', 'Admin', 'Moderator', 'CEO / Founder', 'COO', 'CMO', 'CSMO') then
    insert into public.admin_users (user_id, notes)
    values (new.id, 'auto-granted: family_tree.' || v_role)
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists auto_grant_admin_on_skool_handle_trg on public.profiles;
create trigger auto_grant_admin_on_skool_handle_trg
  after insert or update of skool_handle on public.profiles
  for each row execute function public.auto_grant_admin_on_skool_handle();

-- ---------------------------------------------------------------------
-- 4. Backfill: anyone who's already linked their Skool handle and
--    matches an admin-tier family_tree row should be promoted now.
-- ---------------------------------------------------------------------
insert into public.admin_users (user_id, notes)
select p.id, 'auto-granted on backfill'
  from public.profiles p
  join public.family_tree ft on lower(ft.skool_handle) = lower(p.skool_handle)
 where p.skool_handle is not null
   and ft.role in ('Owner', 'Admin', 'Moderator', 'CEO / Founder', 'COO', 'CMO', 'CSMO')
on conflict (user_id) do nothing;
