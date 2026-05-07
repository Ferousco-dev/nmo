-- =====================================================
-- NMO Roadmap - Supabase Schema
-- Run this in Supabase SQL Editor (whole file at once)
-- =====================================================

-- Enable extensions
create extension if not exists "uuid-ossp";

-- =====================================================
-- 1. PROFILES TABLE
-- =====================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  display_name text,
  skool_url text,
  tenure text check (tenure in ('warrior','ninja','wizard','dragon')),
  goal text check (goal in ('agency','saas','content','coaching')),
  intensity text check (intensity in ('easy','pro')),
  track_assigned text,
  total_points integer default 0,
  current_level integer default 1,
  streak_count integer default 0,
  last_active_at timestamptz default now(),
  onboarding_completed boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =====================================================
-- 2. USER_TASKS TABLE
-- =====================================================
create table if not exists public.user_tasks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  day_number integer not null check (day_number between 1 and 30),
  task_id text not null,
  task_title text not null,
  task_description text,
  skool_lesson_url text,
  is_completed boolean default false,
  completed_at timestamptz,
  created_at timestamptz default now(),
  unique(user_id, task_id)
);

create index if not exists idx_user_tasks_user_day on public.user_tasks(user_id, day_number);

-- =====================================================
-- 3. EVENT_CODES TABLE
-- =====================================================
create table if not exists public.event_codes (
  code text primary key,
  description text,
  points_value integer not null default 50,
  expires_at timestamptz,
  max_uses integer,
  current_uses integer default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- =====================================================
-- 4. CODE_REDEMPTIONS TABLE (prevents double-redemption)
-- =====================================================
create table if not exists public.code_redemptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  code text references public.event_codes(code) on delete cascade not null,
  points_awarded integer not null,
  redeemed_at timestamptz default now(),
  unique(user_id, code)
);

-- =====================================================
-- 5. FAMILY_TREE TABLE
-- =====================================================
create table if not exists public.family_tree (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  role text not null,
  region text,
  contact_email text,
  photo_url text,
  bio text,
  parent_id uuid references public.family_tree(id) on delete set null,
  display_order integer default 0,
  created_at timestamptz default now()
);

-- =====================================================
-- 6. POINTS_LOG TABLE (audit trail)
-- =====================================================
create table if not exists public.points_log (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  points integer not null,
  source text not null check (source in ('task_complete','event_code','manual','streak_bonus')),
  source_id text,
  created_at timestamptz default now()
);

create index if not exists idx_points_log_user on public.points_log(user_id, created_at desc);

-- =====================================================
-- TRIGGERS: auto-create profile on signup
-- =====================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================
-- TRIGGERS: update updated_at on profiles
-- =====================================================
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- =====================================================
-- RPC: redeem_event_code (atomic redemption)
-- =====================================================
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

  -- Check if code exists and is valid
  select * into v_code from public.event_codes
  where code = upper(p_code) and is_active = true;

  if not found then
    return json_build_object('success', false, 'error', 'invalid_code');
  end if;

  -- Check expiry
  if v_code.expires_at is not null and v_code.expires_at < now() then
    return json_build_object('success', false, 'error', 'expired');
  end if;

  -- Check max uses
  if v_code.max_uses is not null and v_code.current_uses >= v_code.max_uses then
    return json_build_object('success', false, 'error', 'max_uses_reached');
  end if;

  -- Check if already redeemed by this user
  if exists (select 1 from public.code_redemptions where user_id = v_user_id and code = v_code.code) then
    return json_build_object('success', false, 'error', 'already_redeemed');
  end if;

  v_points := v_code.points_value;

  -- Insert redemption
  insert into public.code_redemptions (user_id, code, points_awarded)
  values (v_user_id, v_code.code, v_points);

  -- Update event_code usage
  update public.event_codes set current_uses = current_uses + 1 where code = v_code.code;

  -- Award points to profile
  update public.profiles
    set total_points = total_points + v_points
    where id = v_user_id;

  -- Log points
  insert into public.points_log (user_id, points, source, source_id)
  values (v_user_id, v_points, 'event_code', v_code.code);

  return json_build_object('success', true, 'points', v_points, 'description', v_code.description);
end;
$$ language plpgsql security definer;

-- =====================================================
-- RPC: complete_task (atomic task completion + points)
-- =====================================================
create or replace function public.complete_task(p_task_id text)
returns json as $$
declare
  v_user_id uuid := auth.uid();
  v_task record;
  v_points integer := 10; -- 10 points per task
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

  -- Read current streak state before mutating last_active_at
  select last_active_at, streak_count
    into v_last_active, v_current_streak
    from public.profiles where id = v_user_id;

  v_days_since := (current_date - v_last_active::date);

  if v_days_since <= 0 then
    -- Already active today: keep streak, ensure at least 1
    v_new_streak := greatest(coalesce(v_current_streak, 0), 1);
  elsif v_days_since = 1 then
    -- Consecutive day: increment
    v_new_streak := coalesce(v_current_streak, 0) + 1;
  else
    -- Gap of 2+ days: streak broken, reset to 1
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

  return json_build_object('success', true, 'points', v_points, 'streak', v_new_streak);
end;
$$ language plpgsql security definer;

-- =====================================================
-- RPC: uncomplete_task (allow toggling)
-- =====================================================
create or replace function public.uncomplete_task(p_task_id text)
returns json as $$
declare
  v_user_id uuid := auth.uid();
  v_task record;
  v_points integer := 10;
begin
  if v_user_id is null then
    return json_build_object('success', false, 'error', 'not_authenticated');
  end if;

  select * into v_task from public.user_tasks
  where user_id = v_user_id and task_id = p_task_id;

  if not found or not v_task.is_completed then
    return json_build_object('success', false, 'error', 'not_completed');
  end if;

  update public.user_tasks
    set is_completed = false, completed_at = null
    where id = v_task.id;

  update public.profiles
    set total_points = greatest(0, total_points - v_points)
    where id = v_user_id;

  insert into public.points_log (user_id, points, source, source_id)
  values (v_user_id, -v_points, 'task_complete', p_task_id);

  return json_build_object('success', true);
end;
$$ language plpgsql security definer;

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================
alter table public.profiles enable row level security;
alter table public.user_tasks enable row level security;
alter table public.event_codes enable row level security;
alter table public.code_redemptions enable row level security;
alter table public.family_tree enable row level security;
alter table public.points_log enable row level security;

-- Profiles: everyone can read (for leaderboard), users can only update their own
drop policy if exists "Profiles viewable by all authenticated" on public.profiles;
create policy "Profiles viewable by all authenticated" on public.profiles
  for select using (auth.role() = 'authenticated');

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles
  for update using (auth.uid() = id);

drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

-- User tasks: users only see their own
drop policy if exists "Users see own tasks" on public.user_tasks;
create policy "Users see own tasks" on public.user_tasks
  for select using (auth.uid() = user_id);

drop policy if exists "Users insert own tasks" on public.user_tasks;
create policy "Users insert own tasks" on public.user_tasks
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users update own tasks" on public.user_tasks;
create policy "Users update own tasks" on public.user_tasks
  for update using (auth.uid() = user_id);

-- Event codes: read-only for users (they redeem via RPC)
drop policy if exists "Event codes readable" on public.event_codes;
create policy "Event codes readable" on public.event_codes
  for select using (auth.role() = 'authenticated');

-- Code redemptions: users see only their own
drop policy if exists "Users see own redemptions" on public.code_redemptions;
create policy "Users see own redemptions" on public.code_redemptions
  for select using (auth.uid() = user_id);

-- Family tree: anyone authenticated can read
drop policy if exists "Family tree readable" on public.family_tree;
create policy "Family tree readable" on public.family_tree
  for select using (auth.role() = 'authenticated');

-- Points log: users see only their own
drop policy if exists "Users see own points log" on public.points_log;
create policy "Users see own points log" on public.points_log
  for select using (auth.uid() = user_id);

-- =====================================================
-- SEED DATA
-- =====================================================

-- Family tree placeholders (client edits later)
insert into public.family_tree (name, role, region, contact_email, bio, display_order) values
  ('Jack Chen', 'CEO / Founder', 'Global', 'jack@nmo.example', '創辦人，負責整體戰略方向。', 1),
  ('Sarah Lin', 'COO', 'Global', 'sarah@nmo.example', '營運長，管理日常運營。', 2),
  ('Michael Wang', 'CMO', 'Global', 'michael@nmo.example', '行銷長，負責品牌與成長。', 3),
  ('David Liu', 'CSMO', 'Global', 'david@nmo.example', '客戶成功長，協助會員達成目標。', 4),
  ('Emily Zhang', 'Regional Commander', 'Taiwan', 'emily.tw@nmo.example', '台灣地區指揮官，負責本地社群。', 5),
  ('Kevin Ho', 'Regional Commander', 'Hong Kong', 'kevin.hk@nmo.example', '香港地區指揮官。', 6),
  ('Tina Wu', 'Subregional Commander', 'Taipei', 'tina@nmo.example', '台北分區指揮官。', 7)
on conflict do nothing;

-- Event code samples (client adds real ones later)
insert into public.event_codes (code, description, points_value, max_uses) values
  ('LIVE2026', '直播活動參與獎勵', 50, 1000),
  ('LAUNCH', '上線慶祝代碼', 100, 500),
  ('WELCOME', '歡迎獎勵', 25, null)
on conflict do nothing;
