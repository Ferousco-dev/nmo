-- =====================================================
-- NMO Roadmap — Badges & Tiers (Phase 2)
--
-- 10-tier auto-awarded badge ladder driven by total_points, plus a
-- collectible-badge layer for events / streaks / milestones.
--
-- Idempotent: safe to re-run. Seed rows use ON CONFLICT to upgrade
-- in place.
-- =====================================================

-- =====================================================
-- 1. BADGE CATALOG
-- =====================================================
create table if not exists public.badges (
  id uuid primary key default uuid_generate_v4(),
  -- Stable identifier referenced from app code (e.g. 'tier_5', 'streak_30')
  key text unique not null,
  name_zh text not null,
  name_en text not null,
  description_zh text,
  description_en text,
  -- Lucide icon name (e.g. 'Trophy', 'Crown') resolved client-side
  icon text,
  -- Hex color for the badge background / glow
  color text,
  -- 1-10 for tier badges, null for one-off specials
  tier integer check (tier is null or (tier >= 1 and tier <= 10)),
  -- For tier badges: total_points needed to auto-earn
  points_threshold integer,
  -- 'tier' | 'streak' | 'milestone' | 'event' | 'special'
  category text not null default 'special'
    check (category in ('tier', 'streak', 'milestone', 'event', 'special')),
  is_active boolean default true,
  display_order integer default 0,
  created_at timestamptz default now()
);

create index if not exists idx_badges_category_order
  on public.badges (category, display_order);

-- =====================================================
-- 2. USER → BADGE JUNCTION
-- =====================================================
create table if not exists public.user_badges (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  badge_id uuid references public.badges(id) on delete cascade not null,
  awarded_at timestamptz not null default now(),
  -- Null = auto-awarded by the system. Set = admin who manually granted.
  awarded_by uuid references public.profiles(id) on delete set null,
  reason text,
  unique (user_id, badge_id)
);

create index if not exists idx_user_badges_user
  on public.user_badges (user_id, awarded_at desc);
create index if not exists idx_user_badges_badge
  on public.user_badges (badge_id);

-- =====================================================
-- 3. RLS
-- =====================================================
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;

drop policy if exists "Badges readable by anyone" on public.badges;
create policy "Badges readable by anyone" on public.badges
  for select using (true);

drop policy if exists "User badges readable by anyone" on public.user_badges;
create policy "User badges readable by anyone" on public.user_badges
  for select using (true);

-- Writes go through SECURITY DEFINER RPCs (auto-award + admin assign)
-- so we don't need INSERT policies on user_badges.

-- =====================================================
-- 4. SEED — 10 TIER BADGES
-- =====================================================
insert into public.badges (key, name_zh, name_en, description_zh, description_en, icon, color, tier, points_threshold, category, display_order) values
  ('tier_1',  '新手',     'Newbie',       '剛踏上旅程',         'Just starting out',                   'Sparkles', '#71717a', 1,  0,     'tier',  1),
  ('tier_2',  '初學者',   'Beginner',     '完成首日任務',       'Completed your first day',            'Sparkle',  '#a1a1aa', 2,  50,    'tier',  2),
  ('tier_3',  '學徒',     'Apprentice',   '完成第一週',         'Finished your first week',            'Star',     '#cd7f32', 3,  150,   'tier',  3),
  ('tier_4',  '實踐者',   'Practitioner', '兩週堅持',           'Two weeks strong',                    'Award',    '#cd7f32', 4,  350,   'tier',  4),
  ('tier_5',  '建造者',   'Builder',      '已完成三週',         'Three weeks done',                    'Medal',    '#c0c0c0', 5,  700,   'tier',  5),
  ('tier_6',  '成就者',   'Achiever',     '完成 30 天地圖',     'Completed the 30-day roadmap',        'Trophy',   '#c0c0c0', 6,  1200,  'tier',  6),
  ('tier_7',  '專家',     'Expert',       '社群活躍貢獻者',     'Active community contributor',        'Crown',    '#ffd700', 7,  2000,  'tier',  7),
  ('tier_8',  '大師',     'Master',       '已建立穩定事業',     'Building a steady business',          'Gem',      '#ffd700', 8,  3500,  'tier',  8),
  ('tier_9',  '冠軍',     'Champion',     '社群指標人物',       'Community standout',                  'Flame',    '#ef4444', 9,  6000,  'tier',  9),
  ('tier_10', '傳奇',     'Legend',       '頂尖成就者',         'Top achiever — built and shipped',    'Zap',      '#a855f7', 10, 10000, 'tier', 10)
on conflict (key) do update set
  name_zh = excluded.name_zh,
  name_en = excluded.name_en,
  description_zh = excluded.description_zh,
  description_en = excluded.description_en,
  icon = excluded.icon,
  color = excluded.color,
  tier = excluded.tier,
  points_threshold = excluded.points_threshold,
  display_order = excluded.display_order;

-- =====================================================
-- 5. SEED — SPECIAL / COLLECTIBLE BADGES
-- =====================================================
insert into public.badges (key, name_zh, name_en, description_zh, description_en, icon, color, category, display_order) values
  ('first_task',        '初次完成',       'First Task',        '完成第一項任務',           'Completed your first task',           'Check',    '#10b981', 'milestone', 100),
  ('streak_7',          '七日連勝',       '7-Day Streak',      '連續打卡 7 天',            '7 consecutive days of activity',      'Flame',    '#f97316', 'streak',    101),
  ('streak_30',         '三十日連勝',     '30-Day Streak',     '連續打卡 30 天',           '30 consecutive days of activity',     'Flame',    '#ef4444', 'streak',    102),
  ('roadmap_complete',  '完成 30 天地圖', '30-Day Complete',   '完成全部 30 天路線圖',     'Completed all 30 roadmap days',       'Trophy',   '#a855f7', 'milestone', 103),
  ('event_attendee',    '線下活動參與者', 'Event Attendee',    '參加線下活動',             'Attended an offline event',           'Calendar', '#3b82f6', 'event',     104)
on conflict (key) do update set
  name_zh = excluded.name_zh,
  name_en = excluded.name_en,
  description_zh = excluded.description_zh,
  description_en = excluded.description_en,
  icon = excluded.icon,
  color = excluded.color,
  display_order = excluded.display_order;

-- =====================================================
-- 6. RPC: award_tier_badges
--
-- Called whenever a user's points change (post task-complete, post
-- redeem). Auto-awards every tier badge whose threshold the user has
-- now crossed and that they don't already hold. Idempotent.
-- =====================================================
create or replace function public.award_tier_badges(p_user_id uuid default null)
returns json as $$
declare
  v_user_id uuid := coalesce(p_user_id, auth.uid());
  v_points integer;
  v_badge record;
  v_awarded integer := 0;
begin
  if v_user_id is null then
    return json_build_object('success', false, 'error', 'no_user_id');
  end if;

  select total_points into v_points from public.profiles where id = v_user_id;
  if v_points is null then
    return json_build_object('success', false, 'error', 'profile_not_found');
  end if;

  for v_badge in
    select b.id, b.tier
      from public.badges b
     where b.category = 'tier'
       and b.is_active = true
       and b.points_threshold is not null
       and b.points_threshold <= v_points
       and not exists (
         select 1 from public.user_badges ub
          where ub.user_id = v_user_id and ub.badge_id = b.id
       )
     order by b.tier asc
  loop
    insert into public.user_badges (user_id, badge_id, reason)
      values (v_user_id, v_badge.id, 'auto:points_threshold')
      on conflict (user_id, badge_id) do nothing;
    v_awarded := v_awarded + 1;
  end loop;

  -- Keep profiles.current_level in sync with the highest tier we hold
  update public.profiles
     set current_level = coalesce(
       (select max(b.tier)
          from public.user_badges ub
          join public.badges b on b.id = ub.badge_id
         where ub.user_id = v_user_id
           and b.category = 'tier'),
       1
     )
   where id = v_user_id;

  return json_build_object('success', true, 'awarded', v_awarded);
end;
$$ language plpgsql security definer;

-- =====================================================
-- 7. Tap-into existing point-grant RPCs so tier awards happen
--    automatically on every points change.
-- =====================================================
-- complete_task: append award_tier_badges call to the existing function
create or replace function public.complete_task(p_task_id text)
returns json as $$
declare
  v_user_id uuid := auth.uid();
  v_task record;
  v_points integer := 10;
  v_last_active timestamptz;
  v_current_streak integer;
  v_new_streak integer;
  v_days_since integer;
begin
  if v_user_id is null then
    return json_build_object('success', false, 'error', 'not_authenticated');
  end if;

  select * into v_task from public.user_tasks
    where user_id = v_user_id and task_id = p_task_id;

  if not found then
    return json_build_object('success', false, 'error', 'task_not_found');
  end if;

  if v_task.is_completed then
    return json_build_object('success', false, 'error', 'already_completed');
  end if;

  select last_active_at, streak_count
    into v_last_active, v_current_streak
    from public.profiles where id = v_user_id;

  v_days_since := (current_date - v_last_active::date);

  if v_days_since <= 0 then
    v_new_streak := greatest(coalesce(v_current_streak, 0), 1);
  elsif v_days_since = 1 then
    v_new_streak := coalesce(v_current_streak, 0) + 1;
  else
    v_new_streak := 1;
  end if;

  update public.user_tasks
    set is_completed = true, completed_at = now()
    where id = v_task.id;

  update public.profiles
    set total_points = total_points + v_points,
        last_active_at = now(),
        streak_count = v_new_streak
    where id = v_user_id;

  insert into public.points_log (user_id, points, source, source_id)
    values (v_user_id, v_points, 'task_complete', p_task_id);

  -- Award any tier badges crossed by this points bump
  perform public.award_tier_badges(v_user_id);

  return json_build_object('success', true, 'points', v_points, 'streak', v_new_streak);
end;
$$ language plpgsql security definer;

-- redeem_event_code: same — also award tiers after points awarded
create or replace function public.redeem_event_code(p_code text)
returns json as $$
declare
  v_user_id uuid := auth.uid();
  v_code record;
  v_points integer;
begin
  if v_user_id is null then
    return json_build_object('success', false, 'error', 'not_authenticated');
  end if;

  select * into v_code from public.event_codes
    where code = upper(p_code) and is_active = true;

  if not found then
    return json_build_object('success', false, 'error', 'invalid_code');
  end if;

  if v_code.expires_at is not null and v_code.expires_at < now() then
    return json_build_object('success', false, 'error', 'expired');
  end if;

  if v_code.max_uses is not null and v_code.current_uses >= v_code.max_uses then
    return json_build_object('success', false, 'error', 'max_uses_reached');
  end if;

  if exists (select 1 from public.code_redemptions where user_id = v_user_id and code = v_code.code) then
    return json_build_object('success', false, 'error', 'already_redeemed');
  end if;

  v_points := v_code.points_value;

  insert into public.code_redemptions (user_id, code, points_awarded)
    values (v_user_id, v_code.code, v_points);

  update public.event_codes set current_uses = current_uses + 1 where code = v_code.code;

  update public.profiles
    set total_points = total_points + v_points
    where id = v_user_id;

  insert into public.points_log (user_id, points, source, source_id)
    values (v_user_id, v_points, 'event_code', v_code.code);

  -- Award any tier badges crossed by this redemption
  perform public.award_tier_badges(v_user_id);

  return json_build_object('success', true, 'points', v_points, 'description', v_code.description);
end;
$$ language plpgsql security definer;
