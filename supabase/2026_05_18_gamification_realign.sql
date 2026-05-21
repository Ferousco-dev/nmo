-- =====================================================
-- Gamification realignment — point values, tier thresholds,
-- default L1 badge on signup, 1-of-1 enforcement, special badges
-- per client spec (2026-05-18).
--
-- Idempotent: safe to re-run.
--
-- PREREQS: schema.sql, engagement.sql, badges.sql, points_ledger.sql,
-- admin.sql have all run.
--
-- AMBIGUITY: the client slide shows L1=50, but also says "every member
-- has a badge from day one". This migration treats slide values as
-- UPPER bounds (option C from the delta report): L1 covers 0..49,
-- L2 covers 50..149, etc. The thresholds below are the LOWER bound
-- of each tier — i.e. the points needed to enter it.
-- If you want option A or B instead, change the points_threshold
-- values in step 2 only — everything else still works.
-- =====================================================

-- =====================================================
-- 1. POINT VALUES — engagement_weights + complete_task literal
-- =====================================================
-- Posts: 10 → 5, Comments: 5 → 2, Replies: 0 → 2, Likes: 1 ✓
update public.engagement_weights set points = 5,  updated_at = now() where event_type = 'post';
update public.engagement_weights set points = 2,  updated_at = now() where event_type = 'comment';
update public.engagement_weights set points = 2,  updated_at = now() where event_type = 'reply';
update public.engagement_weights set points = 1,  updated_at = now() where event_type = 'like';

-- Daily task: 5 → 100. Re-patch complete_task / uncomplete_task RPCs
-- in place. Body is identical to points_ledger.sql except v_points.
create or replace function public.complete_task(p_task_id text)
returns json as $$
declare
  v_user_id uuid := auth.uid();
  v_task record;
  v_points integer := 100;
begin
  if v_user_id is null then
    return json_build_object('success', false, 'error', 'not_authenticated');
  end if;
  select * into v_task from public.user_tasks
   where user_id = v_user_id and task_id = p_task_id;
  if v_task.id is null then
    return json_build_object('success', false, 'error', 'task_not_found');
  end if;
  if v_task.is_completed then
    return json_build_object('success', true, 'already_completed', true);
  end if;
  update public.user_tasks
     set is_completed = true, completed_at = now()
   where id = v_task.id;
  perform public.add_points(
    v_user_id, v_points, 'task_complete', p_task_id,
    'Day ' || v_task.day_number || ' task', now()
  );
  perform public.award_tier_badges(v_user_id);
  return json_build_object('success', true, 'points_awarded', v_points, 'task_id', p_task_id);
end;
$$ language plpgsql security definer;

create or replace function public.uncomplete_task(p_task_id text)
returns json as $$
declare
  v_user_id uuid := auth.uid();
  v_task record;
  v_points integer := 100;
begin
  if v_user_id is null then
    return json_build_object('success', false, 'error', 'not_authenticated');
  end if;
  select * into v_task from public.user_tasks
   where user_id = v_user_id and task_id = p_task_id;
  if v_task.id is null then
    return json_build_object('success', false, 'error', 'task_not_found');
  end if;
  if not v_task.is_completed then
    return json_build_object('success', true, 'already_uncompleted', true);
  end if;
  update public.user_tasks
     set is_completed = false, completed_at = null
   where id = v_task.id;
  perform public.add_points(
    v_user_id, -v_points, 'task_uncomplete', p_task_id,
    'Day ' || v_task.day_number || ' un-tick', now()
  );
  return json_build_object('success', true, 'points_revoked', v_points);
end;
$$ language plpgsql security definer;

-- =====================================================
-- 2. TIER THRESHOLDS — option C (slide values as upper bounds)
-- =====================================================
update public.badges set points_threshold = 0     where key = 'tier_1';
update public.badges set points_threshold = 50    where key = 'tier_2';
update public.badges set points_threshold = 150   where key = 'tier_3';
update public.badges set points_threshold = 400   where key = 'tier_4';
update public.badges set points_threshold = 900   where key = 'tier_5';
update public.badges set points_threshold = 1800  where key = 'tier_6';
update public.badges set points_threshold = 3500  where key = 'tier_7';
update public.badges set points_threshold = 6500  where key = 'tier_8';
update public.badges set points_threshold = 11000 where key = 'tier_9';
update public.badges set points_threshold = 18000 where key = 'tier_10';

-- =====================================================
-- 3. DEFAULT L1 BADGE ON SIGNUP
-- =====================================================
-- handle_new_user creates the profile row but doesn't grant the L1
-- badge. Wrap it to call award_tier_badges so every new member gets
-- their primary level badge immediately.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1));
  -- Grant L1 — tier_1 has points_threshold=0, will match the new
  -- profile's total_points=0 and insert the user_badges row.
  perform public.award_tier_badges(new.id);
  return new;
end;
$$ language plpgsql security definer;

-- Backfill: any existing user without their L1 badge gets it now.
do $$
declare
  r record;
begin
  for r in select id from public.profiles loop
    perform public.award_tier_badges(r.id);
  end loop;
end$$;

-- =====================================================
-- 4. 1-OF-1 RARE BADGES — system-enforced uniqueness
-- =====================================================
alter table public.badges
  add column if not exists is_one_of_one boolean not null default false;

-- Trigger: if a badge is 1-of-1, refuse to insert if anyone already holds it.
create or replace function public.enforce_one_of_one_badge()
returns trigger as $$
declare
  v_one_of_one boolean;
  v_existing_user uuid;
begin
  select is_one_of_one into v_one_of_one
    from public.badges where id = new.badge_id;
  if not coalesce(v_one_of_one, false) then
    return new;
  end if;
  select user_id into v_existing_user
    from public.user_badges
   where badge_id = new.badge_id
     and user_id <> new.user_id
   limit 1;
  if v_existing_user is not null then
    raise exception 'one_of_one_already_held'
      using detail = format('badge %s is already held by user %s', new.badge_id, v_existing_user);
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists enforce_one_of_one_badge_trg on public.user_badges;
create trigger enforce_one_of_one_badge_trg
  before insert on public.user_badges
  for each row execute function public.enforce_one_of_one_badge();

-- =====================================================
-- 5. SPECIAL BADGES — seed the 5 spec types
-- =====================================================
-- New badge category for admin-assignable specials (Leader, Champion,
-- Event Winner, 1-of-1 Rare, Special Ops). These take slots 2-5 on
-- the member profile. is_active=true so they're available to assign.
insert into public.badges (key, name_zh, name_en, description_zh, description_en, icon, color, category, display_order, is_one_of_one) values
  ('special_leader',       '社群領袖',   'Leader',       '社群領袖與版主',          'Community leader or moderator',           'Crown',    '#3b82f6', 'special', 200, false),
  ('special_champion',     '挑戰冠軍',   'Champion',     '比賽或挑戰的最佳表現者',  'Top performer in competitions/challenges','Trophy',   '#facc15', 'special', 201, false),
  ('special_event_winner', '活動贏家',   'Event Winner', '校園遊戲或特殊活動贏家',  'Winner of school games or special events','Medal',    '#ef4444', 'special', 202, false),
  ('special_one_of_one',   '稀有 1-of-1','1-of-1 Rare',  '系統認證的獨一無二徽章',  'System-enforced unique badge',            'Gem',      '#a855f7', 'special', 203, true),
  ('special_ops',          '特殊行動',   'Special Ops',  '管理員認可的重大貢獻',    'Admin-recognized major contribution',     'Sparkles', '#10b981', 'special', 204, false)
on conflict (key) do update set
  name_zh        = excluded.name_zh,
  name_en        = excluded.name_en,
  description_zh = excluded.description_zh,
  description_en = excluded.description_en,
  icon           = excluded.icon,
  color          = excluded.color,
  display_order  = excluded.display_order,
  is_one_of_one  = excluded.is_one_of_one;

-- =====================================================
-- 6. ADMIN BADGE GRANT RPC
-- =====================================================
-- Admin-only path to assign any badge to a user. The 1-of-1 trigger
-- above guards uniqueness automatically — the RPC just bubbles the
-- exception up as a structured error.
create or replace function public.admin_grant_badge(
  p_target_user_id uuid,
  p_badge_key text,
  p_reason text default null
)
returns json as $$
declare
  v_admin uuid := auth.uid();
  v_badge record;
begin
  if v_admin is null or not public.is_admin(v_admin) then
    return json_build_object('success', false, 'error', 'not_admin');
  end if;
  if p_target_user_id is null or p_badge_key is null then
    return json_build_object('success', false, 'error', 'invalid_input');
  end if;

  select id, is_one_of_one into v_badge from public.badges where key = p_badge_key;
  if v_badge.id is null then
    return json_build_object('success', false, 'error', 'badge_not_found');
  end if;

  begin
    insert into public.user_badges (user_id, badge_id, awarded_by, reason)
    values (p_target_user_id, v_badge.id, v_admin, p_reason)
    on conflict (user_id, badge_id) do nothing;
  exception when others then
    if sqlerrm like '%one_of_one_already_held%' then
      return json_build_object('success', false, 'error', 'one_of_one_already_held');
    end if;
    raise;
  end;

  insert into public.admin_actions (admin_id, action_type, target_user_id, payload)
  values (v_admin, 'grant_badge', p_target_user_id, jsonb_build_object(
    'badge_key', p_badge_key, 'reason', p_reason
  ));

  return json_build_object('success', true, 'badge_key', p_badge_key);
end;
$$ language plpgsql security definer;

revoke all on function public.admin_grant_badge(uuid, text, text) from public;
grant execute on function public.admin_grant_badge(uuid, text, text) to authenticated;

-- Mirror RPC for revoking a badge (so admin can un-assign mistakes).
create or replace function public.admin_revoke_badge(
  p_target_user_id uuid,
  p_badge_key text
)
returns json as $$
declare
  v_admin uuid := auth.uid();
  v_badge record;
  v_deleted integer;
begin
  if v_admin is null or not public.is_admin(v_admin) then
    return json_build_object('success', false, 'error', 'not_admin');
  end if;
  select id, category into v_badge from public.badges where key = p_badge_key;
  if v_badge.id is null then
    return json_build_object('success', false, 'error', 'badge_not_found');
  end if;
  if v_badge.category = 'tier' then
    return json_build_object('success', false, 'error', 'cannot_revoke_tier');
  end if;

  delete from public.user_badges
    where user_id = p_target_user_id and badge_id = v_badge.id;
  get diagnostics v_deleted = row_count;

  if v_deleted > 0 then
    insert into public.admin_actions (admin_id, action_type, target_user_id, payload)
    values (v_admin, 'revoke_badge', p_target_user_id, jsonb_build_object('badge_key', p_badge_key));
  end if;

  return json_build_object('success', true, 'revoked', v_deleted);
end;
$$ language plpgsql security definer;

revoke all on function public.admin_revoke_badge(uuid, text) from public;
grant execute on function public.admin_revoke_badge(uuid, text) to authenticated;

-- =====================================================
-- 7. ADMIN BADGE-UPLOAD HOOK (image_url column only — bucket + UI in a
--     separate phase)
-- =====================================================
alter table public.badges
  add column if not exists image_url text;

-- Sanity check — surface current state for review after running.
select 'engagement_weights'::text as table_, event_type as key, points::text as value
  from public.engagement_weights
union all
select 'tier_thresholds', key, points_threshold::text
  from public.badges where category = 'tier' order by 1, 2;
