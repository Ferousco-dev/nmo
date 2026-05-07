-- =====================================================
-- NMO Roadmap — Pathway migration (3 pathways replaces 4 tenure types)
-- Idempotent: safe to re-run.
--
-- Per the client product brief: only 3 possible roadmap outcomes
-- (foundation / growth / scale) instead of 4 archetypes (warrior /
-- ninja / wizard / dragon). The `tenure` column stays for backward
-- compatibility but new code drives the roadmap from `pathway`.
-- =====================================================

alter table public.profiles
  add column if not exists pathway text
    check (pathway in ('foundation', 'growth', 'scale'));

-- Backfill existing rows from tenure so users in flight don't lose
-- their assignment when this rolls out.
update public.profiles
   set pathway = case
       when tenure = 'warrior' then 'foundation'
       when tenure = 'ninja' then 'growth'
       when tenure in ('wizard', 'dragon') then 'scale'
       else null
   end
 where pathway is null;
