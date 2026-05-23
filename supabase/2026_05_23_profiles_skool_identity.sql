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
