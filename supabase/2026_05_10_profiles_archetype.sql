-- =====================================================
-- NMO Roadmap — Add `archetype` to profiles
-- =====================================================
-- Supports the new 6-question archetype-style questionnaire
-- (mind / body / money / direction). Replaces the role of
-- `tenure` / `pathway` as the *primary* signal coming out
-- of the questionnaire — but tenure / pathway / goal /
-- intensity stay as columns because the existing 30-day
-- roadmap generator still reads them. The questionnaire
-- now derives sensible defaults for those legacy columns
-- from the chosen archetype (see src/data/questionnaire.ts).
--
-- Idempotent: safe to re-run.
--
-- Run order: AFTER 2026_05_10_lock_profiles_columns.sql.
-- =====================================================

-- 1. Add the column.
alter table public.profiles
  add column if not exists archetype text
    check (archetype in ('mind','body','money','direction'));

-- 2. Extend the column-level UPDATE grant from C2's migration so
--    the questionnaire client (running as `authenticated`) can
--    write its derived archetype. Without this, .upsert() with
--    archetype in the payload would fail with permission denied
--    on the ON CONFLICT DO UPDATE branch.
grant update (archetype) on public.profiles to authenticated;

-- 3. (Optional) Backfill: existing users keep archetype = null.
--    They will get an archetype the next time they retake the
--    questionnaire. There is no automatic mapping from the old
--    pathway/goal axes onto mind/body/money/direction because
--    they're orthogonal product framings.
