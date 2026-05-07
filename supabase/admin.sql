-- =====================================================
-- NMO Roadmap — Admin Backstage (Phase 2)
--
-- Adds an admin role + audit trail + RPCs for the actions the
-- client wants in the backstage:
--   - manually grant or deduct points
--   - manually grant or revoke badges
--   - create event-redemption codes
--
-- Idempotent. Run AFTER engagement.sql, badges.sql.
--
-- BOOTSTRAP THE FIRST ADMIN — after running this file, in the SQL
-- Editor:
--
--   insert into public.admin_users (user_id)
--     select id from public.profiles where email = 'YOUR_ADMIN_EMAIL';
--
-- =====================================================

-- =====================================================
-- 1. ADMIN ROSTER
-- Separate table so users can't self-promote via profile UPDATEs.
-- All writes go through service_role (or via admin RPCs, later).
-- =====================================================
create table if not exists public.admin_users (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles(id) on delete set null,
  notes text
);

alter table public.admin_users enable row level security;

-- Anyone authenticated can READ admin_users (so the app knows whether
-- the current user is admin); writes are restricted to service_role.
drop policy if exists "Admin users readable by authenticated" on public.admin_users;
create policy "Admin users readable by authenticated" on public.admin_users
  for select using (auth.role() = 'authenticated');

-- =====================================================
-- 2. is_admin() — convenience predicate used in RLS + RPCs
-- =====================================================
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean as $$
  select exists (select 1 from public.admin_users where user_id = uid);
$$ language sql stable security definer;

-- =====================================================
-- 3. ADMIN ACTIONS AUDIT LOG
-- Every grant / revoke / code-create lands here.
-- =====================================================
create table if not exists public.admin_actions (
  id uuid primary key default uuid_generate_v4(),
  admin_id uuid references public.profiles(id) on delete set null,
  action_type text not null check (action_type in (
    'grant_points', 'deduct_points',
    'grant_badge', 'revoke_badge',
    'create_code', 'deactivate_code'
  )),
  target_user_id uuid references public.profiles(id) on delete set null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_actions_created
  on public.admin_actions (created_at desc);
create index if not exists idx_admin_actions_target
  on public.admin_actions (target_user_id, created_at desc);

alter table public.admin_actions enable row level security;

-- Only admins can read the audit log.
drop policy if exists "Admin actions readable by admins" on public.admin_actions;
create policy "Admin actions readable by admins" on public.admin_actions
  for select using (public.is_admin());

-- =====================================================
-- 4. RPC: admin_grant_points (positive or negative deltas)
-- =====================================================
create or replace function public.admin_grant_points(
  p_target_user_id uuid,
  p_points integer,
  p_reason text default null
) returns json as $$
declare
  v_admin_id uuid := auth.uid();
  v_target_exists boolean;
begin
  if not public.is_admin(v_admin_id) then
    return json_build_object('success', false, 'error', 'not_admin');
  end if;
  if p_points = 0 then
    return json_build_object('success', false, 'error', 'zero_points');
  end if;

  select exists(select 1 from public.profiles where id = p_target_user_id) into v_target_exists;
  if not v_target_exists then
    return json_build_object('success', false, 'error', 'user_not_found');
  end if;

  update public.profiles
     set total_points = greatest(0, total_points + p_points)
   where id = p_target_user_id;

  insert into public.points_log (user_id, points, source, source_id)
    values (p_target_user_id, p_points, 'manual', v_admin_id::text);

  insert into public.admin_actions (admin_id, action_type, target_user_id, payload)
    values (
      v_admin_id,
      case when p_points > 0 then 'grant_points' else 'deduct_points' end,
      p_target_user_id,
      jsonb_build_object('points', p_points, 'reason', p_reason)
    );

  -- Re-evaluate tier badges after the points change
  perform public.award_tier_badges(p_target_user_id);

  return json_build_object('success', true, 'points', p_points);
end;
$$ language plpgsql security definer;

-- =====================================================
-- 5. RPC: admin_grant_badge
-- =====================================================
create or replace function public.admin_grant_badge(
  p_target_user_id uuid,
  p_badge_key text,
  p_reason text default null
) returns json as $$
declare
  v_admin_id uuid := auth.uid();
  v_badge_id uuid;
begin
  if not public.is_admin(v_admin_id) then
    return json_build_object('success', false, 'error', 'not_admin');
  end if;

  select id into v_badge_id from public.badges where key = p_badge_key and is_active = true;
  if v_badge_id is null then
    return json_build_object('success', false, 'error', 'badge_not_found');
  end if;

  insert into public.user_badges (user_id, badge_id, awarded_by, reason)
    values (p_target_user_id, v_badge_id, v_admin_id, coalesce(p_reason, 'admin grant'))
    on conflict (user_id, badge_id) do nothing;

  insert into public.admin_actions (admin_id, action_type, target_user_id, payload)
    values (
      v_admin_id, 'grant_badge', p_target_user_id,
      jsonb_build_object('badge_key', p_badge_key, 'reason', p_reason)
    );

  return json_build_object('success', true, 'badge_key', p_badge_key);
end;
$$ language plpgsql security definer;

-- =====================================================
-- 6. RPC: admin_revoke_badge
-- =====================================================
create or replace function public.admin_revoke_badge(
  p_target_user_id uuid,
  p_badge_key text
) returns json as $$
declare
  v_admin_id uuid := auth.uid();
  v_badge_id uuid;
  v_deleted integer;
begin
  if not public.is_admin(v_admin_id) then
    return json_build_object('success', false, 'error', 'not_admin');
  end if;

  select id into v_badge_id from public.badges where key = p_badge_key;
  if v_badge_id is null then
    return json_build_object('success', false, 'error', 'badge_not_found');
  end if;

  delete from public.user_badges
    where user_id = p_target_user_id and badge_id = v_badge_id;
  get diagnostics v_deleted = row_count;

  insert into public.admin_actions (admin_id, action_type, target_user_id, payload)
    values (
      v_admin_id, 'revoke_badge', p_target_user_id,
      jsonb_build_object('badge_key', p_badge_key, 'deleted', v_deleted)
    );

  return json_build_object('success', true, 'deleted', v_deleted);
end;
$$ language plpgsql security definer;

-- =====================================================
-- 7. RPC: admin_create_event_code
-- =====================================================
create or replace function public.admin_create_event_code(
  p_code text,
  p_points integer,
  p_description text default null,
  p_max_uses integer default null,
  p_expires_at timestamptz default null
) returns json as $$
declare
  v_admin_id uuid := auth.uid();
  v_code text := upper(trim(p_code));
begin
  if not public.is_admin(v_admin_id) then
    return json_build_object('success', false, 'error', 'not_admin');
  end if;
  if v_code is null or length(v_code) < 3 or length(v_code) > 20 then
    return json_build_object('success', false, 'error', 'invalid_code_length');
  end if;
  if p_points <= 0 then
    return json_build_object('success', false, 'error', 'invalid_points');
  end if;

  insert into public.event_codes (code, description, points_value, max_uses, expires_at)
    values (v_code, p_description, p_points, p_max_uses, p_expires_at)
    on conflict (code) do update
      set description = excluded.description,
          points_value = excluded.points_value,
          max_uses = excluded.max_uses,
          expires_at = excluded.expires_at,
          is_active = true;

  insert into public.admin_actions (admin_id, action_type, payload)
    values (
      v_admin_id, 'create_code',
      jsonb_build_object(
        'code', v_code,
        'points', p_points,
        'description', p_description,
        'max_uses', p_max_uses,
        'expires_at', p_expires_at
      )
    );

  return json_build_object('success', true, 'code', v_code);
end;
$$ language plpgsql security definer;
