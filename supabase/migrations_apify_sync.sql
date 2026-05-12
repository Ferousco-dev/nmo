-- =====================================================
-- Apify-driven member sync: schema additions
--
-- Adds a `profile_url` column to nmo_members so the daily Apify
-- scrape can persist each member's real Skool URL (instead of
-- callers having to guess it from the handle).
--
-- Safe to run multiple times.
-- =====================================================

alter table public.nmo_members
  add column if not exists profile_url text;

-- Keep the existing `handle` PK semantics, but accept either the
-- numeric Skool user_id or the human-readable username as the row key.
-- (Whichever the scraper finds first wins; the upsert preserves the
-- richer fields.)

create index if not exists idx_nmo_members_profile_url
  on public.nmo_members (profile_url);

-- Optional: drop the old Supabase-cron schedule that hits the edge
-- function, now that Vercel Cron drives the sync. Comment back in if
-- you want to disable the edge-function path entirely.
--
-- select cron.unschedule('check-new-users-daily');
