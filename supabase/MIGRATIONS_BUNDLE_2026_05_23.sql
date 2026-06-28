-- =====================================================
-- BUNDLED MIGRATIONS — 2026-05-23 session
-- Apply order is important: secure_skool_session_and_audit MUST run
-- BEFORE admin_update_badge_image (it extends the action_type CHECK
-- constraint that admin_update_badge_image relies on).
--
-- Safe to re-run: every block uses if-not-exists / create-or-replace /
-- drop-policy-if-exists patterns. No data loss.
--
-- Order:
--   1. profiles_skool_identity            — adds skool_user_id, skool_handle, etc.
--   2. per_user_activity_sync             — adds aggregate columns + snapshots table (inert)
--   3. super_admin_and_welcome_flow       — is_super_admin column + auto-grant Jack Liu
--   4. secure_skool_session_and_audit     — P0: move token to private table + extend constraint
--   5. admin_update_badge_image           — uses extended constraint, must come AFTER #4
--   6. award_badges_on_engagement         — points_ledger trigger for tier badge sync
--   7. engagement_refresh_atomic          — reserve_engagement_run RPC for TOCTOU fix
-- =====================================================

-- =====================================================
-- Per-user Skool identity columns on profiles.
--
-- Context: we're switching login from "Supabase email+password" to
-- "Skool email+password, proxied through api2.skool.com/auth/login".
-- Skool returns a JWT in a Set-Cookie. Its payload carries a stable
-- 32-char hex `user_id` — that's the real identity key. Handle is
-- just a UX label and can change; user_id never does.
--
-- Three columns:
--   skool_user_id            — 32-char hex from the JWT payload.
--                              Unique. The join key between us and Skool.
--   skool_auth_token         — the JWT itself, server-side use only.
--                              Lets cron/dashboard sync hit Skool as
--                              this user (richer per-user data than
--                              the shared admin token).
--   skool_auth_token_expires_at — from JWT `exp`. Used to decide when
--                              to force re-login.
--
-- Nullable for now: existing rows (signed up the old way) don't have
-- these yet. They'll be populated on the user's first Skool-login
-- after we ship the new auth route.
--
-- Idempotent (uses `if not exists`) — safe to re-run.
-- =====================================================

alter table public.profiles
  add column if not exists skool_user_id              text,
  add column if not exists skool_auth_token           text,
  add column if not exists skool_auth_token_expires_at timestamptz;

-- Unique constraint: one Skool account = one profile.
-- NULL allowed (one-side migration), but no two profiles can share a
-- non-NULL skool_user_id. Wrapped in a do-block so re-runs don't error.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'profiles_skool_user_id_unique'
  ) then
    alter table public.profiles
      add constraint profiles_skool_user_id_unique unique (skool_user_id);
  end if;
end $$;

-- Lookup index — login flow queries by skool_user_id on every sign-in.
create index if not exists profiles_skool_user_id_idx
  on public.profiles (skool_user_id)
  where skool_user_id is not null;

-- Sanity check — should print the three new columns and the constraint.
select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'profiles'
  and column_name  in ('skool_user_id', 'skool_auth_token', 'skool_auth_token_expires_at')
order by column_name;
-- =====================================================
-- Per-user activity sync: stores Skool's own aggregate stats
-- per profile, refreshed on login + dashboard mount.
--
-- Replaces the Apify-based engagement scrape. Now that every
-- user logs in with their own Skool token, we can call the
-- profile-page JSON endpoint directly and pull Skool's
-- pre-computed aggregates:
--   /_next/data/<buildId>/%40<handle>.json?g=nmo
--
-- Columns on profiles store the LATEST snapshot. The
-- skool_activity_snapshots table appends a row each sync so
-- we can compute deltas (= activity since last login) and
-- award app-side points (+5 per new post, etc).
--
-- Idempotent.
-- =====================================================

-- 1. Latest-snapshot columns on profiles
alter table public.profiles
  add column if not exists skool_total_posts         integer,
  add column if not exists skool_total_contributions integer,
  add column if not exists skool_total_followers     integer,
  add column if not exists skool_total_following     integer,
  add column if not exists skool_pts                 integer,
  add column if not exists skool_lv                  integer,
  add column if not exists skool_pcl                 integer,
  add column if not exists skool_pnl                 integer,
  add column if not exists skool_role                integer,
  add column if not exists skool_daily_activities    jsonb,
  add column if not exists skool_activity_synced_at  timestamptz;

-- 2. Snapshot table — one row per sync, for delta computation
create table if not exists public.skool_activity_snapshots (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  skool_user_id       text not null,
  total_posts         integer,
  total_contributions integer,
  pts                 integer,
  lv                  integer,
  raw                 jsonb,           -- full extracted payload for debugging
  captured_at         timestamptz not null default now()
);

create index if not exists skool_activity_snapshots_user_id_captured_at_idx
  on public.skool_activity_snapshots (user_id, captured_at desc);

-- RLS: snapshots are server-side only (service role writes; users read their own)
alter table public.skool_activity_snapshots enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'skool_activity_snapshots'
       and policyname = 'snapshots_own_read'
  ) then
    create policy snapshots_own_read on public.skool_activity_snapshots
      for select using (user_id = auth.uid());
  end if;
end $$;

-- Sanity check
select
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'profiles'
  and column_name like 'skool_%'
order by column_name;
-- =====================================================
-- Super-admin role + manual point awards + first-login
-- identity confirmation.
--
-- 1. is_super_admin flag on admin_users. Auto-granted to the
--    Skool user with handle 'jack-liu-9368'
--    (skool_user_id = '4d8844727da4477b8b17f919ac7cae70').
--    Trigger keeps it in sync — if Jack ever re-signs-in, his
--    profile row gets that user_id and we promote on the spot.
-- 2. admin_award_points(p_user_id, p_points, p_reason) RPC.
--    Gated on is_super_admin(); writes via the existing
--    add_points() helper with source='admin_grant'.
-- 3. skool_identity_confirmed_at on profiles. The /confirm-identity
--    page after first login stamps this; routing keys off it.
--
-- Idempotent.
-- =====================================================

-- Jack Liu's stable Skool user_id (visible in every post he authors).
-- If he ever loses the handle 'jack-liu-9368' this still works because
-- we key on user_id, not handle.
-- =====================================================

-- 1. is_super_admin column
alter table public.admin_users
  add column if not exists is_super_admin boolean not null default false;

-- 2. is_super_admin() helper — checks the calling auth.uid()
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users
     where user_id = auth.uid() and is_super_admin = true
  );
$$;

grant execute on function public.is_super_admin() to authenticated;

-- 3. profile column for first-login confirmation gate
alter table public.profiles
  add column if not exists skool_identity_confirmed_at timestamptz;

-- 4. Auto-grant trigger: any profile that gets Jack's skool_user_id
-- becomes an admin AND super-admin. Idempotent insert + update.
create or replace function public.grant_super_admin_if_jack()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.skool_user_id = '4d8844727da4477b8b17f919ac7cae70' then
    insert into public.admin_users (user_id, is_super_admin, notes)
    values (new.id, true, 'Auto-granted: skool_user_id matches Jack Liu')
    on conflict (user_id) do update
      set is_super_admin = true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_grant_super_admin_if_jack on public.profiles;
create trigger trg_grant_super_admin_if_jack
  after insert or update of skool_user_id on public.profiles
  for each row execute function public.grant_super_admin_if_jack();

-- 5. One-shot backfill: if Jack has already signed in, promote his row
do $$
declare v_uid uuid;
begin
  select id into v_uid from public.profiles
    where skool_user_id = '4d8844727da4477b8b17f919ac7cae70' limit 1;
  if v_uid is not null then
    insert into public.admin_users (user_id, is_super_admin, notes)
    values (v_uid, true, 'Backfill: Jack Liu identified by skool_user_id')
    on conflict (user_id) do update
      set is_super_admin = true;
  end if;
end $$;

-- 6. admin_award_points RPC — gated to super-admin only.
-- Uses existing add_points() helper, which bumps profiles.total_points
-- and writes a points_ledger row with source='admin_grant'.
create or replace function public.admin_award_points(
  p_user_id uuid,
  p_points  integer,
  p_reason  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'not_super_admin' using errcode = 'P0001';
  end if;
  if p_points = 0 then
    raise exception 'zero_points' using errcode = 'P0001';
  end if;
  if p_user_id is null then
    raise exception 'missing_user' using errcode = 'P0001';
  end if;

  perform public.add_points(
    p_user_id,
    p_points,
    'admin_grant',
    null,
    coalesce(p_reason, 'Manual award by super-admin')
  );
end;
$$;

grant execute on function public.admin_award_points(uuid, integer, text) to authenticated;

-- 7. Sanity check
select
  (select count(*) from public.admin_users where is_super_admin = true) as super_admins,
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='profiles'
       and column_name='skool_identity_confirmed_at')               as has_confirm_col,
  (select count(*) from pg_proc
     where proname='admin_award_points')                            as has_rpc;
-- =====================================================
-- P0 security + audit fixes flagged by the multi-agent audit.
--
-- 1. SECURITY: skool_auth_token was stored on profiles, which has a
--    broad "viewable by all authenticated" SELECT policy. ANY logged-in
--    user could read every other user's Skool session JWT and
--    impersonate them on Skool. Moving the token to a separate
--    `user_skool_sessions` table whose RLS denies all role access
--    (service-role bypasses RLS).
--
-- 2. AUDIT: admin_actions.action_type CHECK constraint didn't allow
--    'update_badge_image' or 'award_points', so the new super-admin
--    RPCs would raise a constraint violation when they tried to log
--    audit rows.
-- =====================================================

-- 1. Extend the action_type CHECK constraint
alter table public.admin_actions
  drop constraint if exists admin_actions_action_type_check;

alter table public.admin_actions
  add constraint admin_actions_action_type_check
  check (action_type in (
    'grant_points', 'deduct_points',
    'grant_badge',  'revoke_badge',
    'create_code',  'deactivate_code',
    'set_setting',
    'update_badge_image',
    'award_points'
  ));

-- 2. Private table for per-user Skool session tokens.
-- RLS enabled with NO policies → no role except service_role can
-- read or write. Server-side code uses the service-role client to
-- manage tokens; users never touch this table directly.
create table if not exists public.user_skool_sessions (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  auth_token text not null,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.user_skool_sessions enable row level security;
-- Intentionally no policies — service-role bypasses RLS, authenticated
-- gets denied by default-deny.

-- 3. One-shot backfill: copy any tokens we currently hold on profiles
-- into the new table before we drop the columns.
insert into public.user_skool_sessions (user_id, auth_token, expires_at, updated_at)
select id,
       skool_auth_token,
       skool_auth_token_expires_at,
       now()
from public.profiles
where skool_auth_token is not null
on conflict (user_id) do update
  set auth_token = excluded.auth_token,
      expires_at = excluded.expires_at,
      updated_at = now();

-- 4. Drop the leaky columns from profiles
alter table public.profiles
  drop column if exists skool_auth_token,
  drop column if exists skool_auth_token_expires_at;

-- Sanity checks
select
  (select count(*) from public.user_skool_sessions) as sessions,
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='profiles'
       and column_name like 'skool_auth_token%')   as leaky_cols_remaining,
  (select count(*) from pg_policies
     where schemaname='public' and tablename='user_skool_sessions') as policies_on_sessions;
-- =====================================================
-- admin_update_badge_image — let super-admin replace any badge's
-- artwork (including the seeded tier badges Newbie → Champion).
--
-- Client wants to swap the AI-generated icons for his own uploaded
-- images. BadgeCard already prefers `image_url` over the Lucide
-- icon, so populating the column is enough — no UI rerender needed.
--
-- Pass p_image_url = null to clear (falls back to Lucide icon).
--
-- Gated on is_super_admin() per the same model as admin_award_points.
-- =====================================================

create or replace function public.admin_update_badge_image(
  p_badge_id  uuid,
  p_image_url text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_existing public.badges;
begin
  if v_admin is null or not public.is_super_admin() then
    raise exception 'not_super_admin' using errcode = 'P0001';
  end if;
  if p_badge_id is null then
    raise exception 'missing_badge_id' using errcode = 'P0001';
  end if;

  select * into v_existing from public.badges where id = p_badge_id;
  if not found then
    raise exception 'badge_not_found' using errcode = 'P0001';
  end if;

  update public.badges
     set image_url = p_image_url,
         updated_at = now()
   where id = p_badge_id;

  -- Audit row in admin_actions so the change shows up in the bot log.
  -- Column names match admin.sql: (admin_id, action_type, payload).
  -- 'update_badge_image' must be in the admin_actions_action_type_check
  -- constraint, which is extended in 2026_05_23_secure_skool_session_and_audit.sql.
  insert into public.admin_actions (admin_id, action_type, payload)
  values (
    v_admin,
    'update_badge_image',
    jsonb_build_object(
      'badge_id', p_badge_id,
      'key', v_existing.key,
      'old_image_url', v_existing.image_url,
      'new_image_url', p_image_url
    )
  );

  return json_build_object(
    'success', true,
    'badge_id', p_badge_id,
    'image_url', p_image_url
  );
end;
$$;

revoke all on function public.admin_update_badge_image(uuid, text) from public;
grant execute on function public.admin_update_badge_image(uuid, text) to authenticated;

-- Sanity check
select proname, proargnames
from pg_proc
where proname = 'admin_update_badge_image';
-- =====================================================
-- Badge sync on every points change — not just task completion.
--
-- The original badges.sql wired award_tier_badges into complete_task
-- and redeem_code, but the engagement → points path (Apify ingest →
-- credit_engagement_points trigger → add_points) bypassed it. Result:
-- users earning points from Skool engagement stayed stuck on the
-- starting tier even after crossing thresholds.
--
-- Fix: a tiny AFTER INSERT trigger on points_ledger that calls
-- award_tier_badges for the user. Cheap (the function is idempotent
-- and short-circuits when the user already has every reachable tier).
--
-- One-shot backfill at the bottom catches anyone currently misaligned.
-- =====================================================

create or replace function public.award_tier_badges_on_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Skip if no actual point movement (defensive — add_points already filters)
  if new.points = 0 then
    return new;
  end if;
  perform public.award_tier_badges(new.user_id);
  return new;
end;
$$;

drop trigger if exists trg_award_tier_badges_on_ledger on public.points_ledger;
create trigger trg_award_tier_badges_on_ledger
  after insert on public.points_ledger
  for each row execute function public.award_tier_badges_on_ledger();

-- Backfill: recompute tier badges for everyone with any points.
-- award_tier_badges is idempotent — calling it on a fully-tiered
-- user is a no-op.
do $$
declare r record;
begin
  for r in select id from public.profiles where total_points > 0 loop
    perform public.award_tier_badges(r.id);
  end loop;
end $$;

-- Sanity check: see who got newly-awarded badges in the backfill
select p.email, p.total_points, p.current_level,
       (select count(*) from public.user_badges ub
          join public.badges b on b.id = ub.badge_id
         where ub.user_id = p.id and b.category = 'tier') as tier_badges
from public.profiles p
where p.total_points > 0
order by p.total_points desc
limit 10;
-- =====================================================
-- Atomic cooldown + bot_runs insert for /api/me/refresh-engagement.
--
-- The previous flow had a TOCTOU race:
--   1. route SELECTs bot_runs to check cooldown
--   2. route POSTs to Apify (slow)
--   3. route INSERTs the bot_runs row
-- Two parallel requests (login fire-and-forget + dashboard mount fire
-- arriving 40ms apart, observed in testing) both passed step 1, both
-- queued Apify runs, both inserted. Wasted an Apify run per double-fire.
--
-- This RPC replaces steps 1+3 with a single transaction-safe check-and-
-- insert. If a recent run exists, it RETURNS null without inserting.
-- The route then knows to skip the Apify call.
--
-- Note: we still can't make the Apify call itself transactional, but
-- by reserving the bot_runs slot first, the SECOND caller bails out
-- before paying the Apify cost.
-- =====================================================

create or replace function public.reserve_engagement_run(
  p_handle           text,
  p_cooldown_minutes integer default 10
)
returns table (
  bot_run_id      uuid,
  cooldown_active boolean,
  recent_run_id   uuid,
  recent_status   text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handle     text := lower(trim(coalesce(p_handle, '')));
  v_cutoff     timestamptz := now() - make_interval(mins => p_cooldown_minutes);
  v_existing   public.bot_runs;
  v_new_id     uuid;
begin
  if v_handle = '' then
    raise exception 'missing_handle' using errcode = 'P0001';
  end if;

  -- Look for a recent run for this handle in engagement_events_apify mode.
  -- Lock the bot_runs table briefly to serialize concurrent callers.
  lock table public.bot_runs in share row exclusive mode;

  select * into v_existing
  from public.bot_runs
  where started_at >= v_cutoff
    and notes ->> 'mode' = 'engagement_events_apify'
    and lower(notes -> 'explicit_handles' ->> 0) = v_handle
  order by started_at desc
  limit 1;

  if found then
    -- Recent run exists — return cooldown info, don't insert
    return query select
      null::uuid                 as bot_run_id,
      true                       as cooldown_active,
      v_existing.id              as recent_run_id,
      v_existing.status          as recent_status;
    return;
  end if;

  -- Clear — reserve a slot now so concurrent callers bail out.
  -- The route then POSTs to Apify and uses an UPDATE to attach the
  -- apify_run_id. Apify-failed path can mark this row failed.
  insert into public.bot_runs (status, notes)
  values (
    'running',
    jsonb_build_object(
      'mode', 'engagement_events_apify',
      'batch_size', 1,
      'only_linked', true,
      'triggered_by', 'user_self_refresh',
      'explicit_handles', jsonb_build_array(v_handle),
      'apify_run_id', null  -- filled in by the route after apifyStartRun
    )
  )
  returning id into v_new_id;

  return query select
    v_new_id      as bot_run_id,
    false         as cooldown_active,
    null::uuid    as recent_run_id,
    null::text    as recent_status;
end;
$$;

revoke all on function public.reserve_engagement_run(text, integer) from public;
grant execute on function public.reserve_engagement_run(text, integer) to authenticated;

-- Sanity check
select proname from pg_proc where proname = 'reserve_engagement_run';
