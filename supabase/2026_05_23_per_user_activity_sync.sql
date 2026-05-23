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
