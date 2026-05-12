-- =====================================================
-- NMO Roadmap — extend admin_actions.action_type to allow 'set_setting'
-- =====================================================
-- Closes the regression introduced by
-- 2026_05_10_app_settings_and_apify.sql:
--   admin_set_setting() inserts into admin_actions with
--   action_type='set_setting', but the existing CHECK constraint in
--   admin.sql:55 only permits the 6 original action types.
--
-- Postgres can't ALTER a CHECK constraint in place, so we drop and
-- recreate. Idempotent: safe to re-run.
-- =====================================================

alter table public.admin_actions
  drop constraint if exists admin_actions_action_type_check;

alter table public.admin_actions
  add constraint admin_actions_action_type_check
  check (action_type in (
    'grant_points', 'deduct_points',
    'grant_badge',  'revoke_badge',
    'create_code',  'deactivate_code',
    'set_setting'
  ));
