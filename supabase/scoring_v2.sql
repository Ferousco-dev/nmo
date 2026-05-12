-- =====================================================
-- ACTIVITY SCORE WEIGHTS — v2 (per latest spec)
-- =====================================================
-- Per Paul's brief, the active score factors are:
--   • posts          (each post the user authors)
--   • comments       (each comment they make)
--   • likes          (received on their posts — fallback model from the bot)
--   • posting timeline / frequency
--   • replies        — set to 0 for now
--
-- The first three are summed by `engagement_grades` (all-time) and
-- `engagement_grades_recent` (last 30 days). The "timeline" factor is
-- captured implicitly by the recent-30-days view: a user who posts
-- frequently has a higher recent score, and stale users decay out of
-- the recent window.
--
-- This file just adjusts the reply weight to 0 — the views already
-- multiply by these weights, so the change is picked up automatically.
-- Idempotent.
-- =====================================================

update public.engagement_weights
   set points = 0,
       updated_at = now()
 where event_type = 'reply';

-- Also update the points_ledger trigger semantics: any reply event
-- still inserts (so we can track replies for analytics later) but
-- credits 0 points. credit_engagement_points already early-returns
-- when v_weight <= 0, so this is automatic — no code change needed.

-- Sanity check
select event_type, points, updated_at
  from public.engagement_weights
 order by event_type;
