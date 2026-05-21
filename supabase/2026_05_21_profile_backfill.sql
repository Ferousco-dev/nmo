-- =====================================================
-- Backfill missing profile rows for orphan auth.users.
--
-- Happens when delete_my_account() removes a profile but the
-- auth.users record persists (Supabase has no portable SQL path
-- for deleting from auth schema). The user can still log in,
-- pass middleware (which only checks auth.uid()), and then
-- crash on any FK-protected insert like user_tasks.
--
-- Idempotent — safe to re-run.
-- =====================================================

-- 1. Insert a profile row for every auth user that lacks one.
insert into public.profiles (id, email, display_name)
select u.id, u.email, split_part(coalesce(u.email, ''), '@', 1)
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
);

-- 2. Award the L1 tier badge to every profile that doesn't hold any
--    tier badge yet (covers the backfilled rows + any earlier signups
--    that pre-date the badge-on-signup trigger).
do $$
declare r record;
begin
  for r in
    select p.id
      from public.profiles p
     where not exists (
       select 1
         from public.user_badges ub
         join public.badges b on b.id = ub.badge_id
        where ub.user_id = p.id
          and b.category = 'tier'
     )
  loop
    perform public.award_tier_badges(r.id);
  end loop;
end$$;

-- Sanity check
select
  (select count(*) from auth.users)        as auth_users,
  (select count(*) from public.profiles)   as profiles,
  (select count(*) from public.user_badges
     where badge_id in (select id from public.badges where tier = 1)) as level1_badges;
