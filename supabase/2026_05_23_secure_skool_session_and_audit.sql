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
