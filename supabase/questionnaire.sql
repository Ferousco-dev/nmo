-- =====================================================
-- NMO Roadmap — Questionnaire migration
-- Idempotent: safe to re-run.
-- Stores the raw 30-question answers so we can re-derive
-- archetypes / personalize the roadmap later without
-- forcing a re-take.
-- =====================================================

alter table public.profiles
  add column if not exists questionnaire_answers jsonb,
  add column if not exists questionnaire_completed_at timestamptz;

