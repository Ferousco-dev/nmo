-- =====================================================
-- ROADMAP DIAGNOSE + RECOVERY
-- =====================================================
-- The questionnaire flow used to mark onboarding_completed=true BEFORE
-- verifying that the 30 user_tasks rows actually persisted. If that
-- task insert silently dropped (e.g. partial prior run, RLS blip),
-- the profile says "done" but the roadmap is empty — and the
-- questionnaire page redirects you to /dashboard from then on, so
-- you can't re-trigger the flow from the UI.
--
-- Use this file in two phases. Replace YOUR_EMAIL in both places.
-- =====================================================

-- =============================================================
-- 1. DIAGNOSE — read-only, run this first to see what's wrong.
-- =============================================================
select
  p.id,
  p.email,
  p.skool_handle,
  p.onboarding_completed,
  p.pathway,
  p.tenure,
  p.goal,
  p.intensity,
  p.track_assigned,
  (select count(*) from public.user_tasks ut where ut.user_id = p.id) as task_count
from public.profiles p
where p.email = 'YOUR_EMAIL';

-- Expected for a healthy account: task_count = 30 (or 60 for pro intensity).
-- If task_count = 0, the roadmap never persisted. Run section 2 to recover.


-- =============================================================
-- 2. RECOVER — flip onboarding_completed back to false so you can
--    re-run the questionnaire from the UI. The improved code path
--    (writes tasks first, verifies count > 0, then marks complete)
--    will save the roadmap correctly this time.
-- =============================================================
update public.profiles
   set onboarding_completed = false,
       questionnaire_answers = null,
       questionnaire_completed_at = null
 where email = 'YOUR_EMAIL'
returning id, email, onboarding_completed;


-- =============================================================
-- 3. (Optional) If you'd rather keep your existing answers and
--    just regenerate the tasks, you'll need access to the same
--    seed data the client generator uses — that lives in
--    src/data/roadmap-days.ts and src/lib/roadmap/generator.ts,
--    not in SQL. Easier to just re-run the questionnaire from
--    /questionnaire after step 2.
-- =============================================================
