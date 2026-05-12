-- =====================================================
-- NMO Roadmap — Lock down profiles UPDATE to safe columns
-- =====================================================
-- Closes audit finding C2: an authenticated user could
-- previously execute
--
--   update public.profiles set total_points = 999999
--    where id = auth.uid();
--
-- because the existing RLS policy "Users update own profile"
-- (schema.sql:313) restricts the ROW but not the COLUMNS,
-- and Supabase's default `grant all on schema public ... to
-- authenticated` gives table-wide UPDATE.
--
-- This migration revokes the wide UPDATE and re-grants it
-- only on columns the client legitimately edits today
-- (questionnaire output + display name + onboarding flag).
-- All privileged columns (total_points, streak_count,
-- current_level, last_active_at, skool_*) are now writable
-- only via SECURITY DEFINER RPCs (complete_task,
-- redeem_event_code, claim_skool_handle, admin_grant_points,
-- ...) which run as their owner and bypass column GRANTs.
--
-- Idempotent: safe to re-run.
-- =====================================================

-- ---- 1. Snapshot the current authenticated grants on profiles
--      so we can confirm the change in the SQL editor output.
do $$
declare
  before_grants text;
begin
  select string_agg(privilege_type || coalesce('(' || column_name || ')', ''), ', ' order by privilege_type, column_name)
    into before_grants
    from (
      select privilege_type, null::text as column_name
        from information_schema.role_table_grants
       where grantee = 'authenticated'
         and table_schema = 'public'
         and table_name   = 'profiles'
      union all
      select privilege_type, column_name
        from information_schema.column_privileges
       where grantee = 'authenticated'
         and table_schema = 'public'
         and table_name   = 'profiles'
    ) g;
  raise notice 'profiles grants BEFORE: %', coalesce(before_grants, '(none)');
end $$;

-- ---- 2. Revoke wide UPDATE on the table from authenticated.
--      This does NOT affect:
--        * service_role (still has all privileges)
--        * postgres / function owners (RPCs run as them)
--        * the RLS policy "Users update own profile" — RLS
--          still constrains row access on top of the new
--          column-level permission grant.
revoke update on public.profiles from authenticated;

-- ---- 3. Re-grant UPDATE only on the columns the user
--      legitimately mutates from the browser today:
--
--        QuestionnaireClient.tsx:88-101 upsert ->
--          email, pathway, tenure, goal, intensity,
--          track_assigned, questionnaire_answers,
--          questionnaire_completed_at
--        QuestionnaireClient.tsx:138-141 update ->
--          onboarding_completed
--        OnboardingClient.tsx:75-88 upsert (legacy) ->
--          email, tenure, goal, intensity,
--          track_assigned, onboarding_completed
--        Future profile editor (forward-compat) ->
--          display_name
--
--      `email` is included for now to keep the existing
--      .upsert() payloads working without a code change.
--      profiles.email drifting from auth.users.email is a
--      cosmetic data-integrity concern only — the
--      authoritative email lives in auth.users. Tighten
--      this once onboarding/questionnaire are migrated to
--      server actions (audit finding H5).
grant update (
  email,
  display_name,
  tenure,
  goal,
  intensity,
  pathway,
  track_assigned,
  questionnaire_answers,
  questionnaire_completed_at,
  onboarding_completed
) on public.profiles to authenticated;

-- ---- 4. INSERT and SELECT are unchanged.
--      INSERT remains gated by the existing RLS policy
--      ("Users insert own profile" + with check auth.uid()=id),
--      which is dead code in practice because handle_new_user()
--      creates the row before the user can ever connect.
--      DELETE has no policy so it stays denied by default.

-- ---- 5. Verify the new grants.
do $$
declare
  after_grants text;
begin
  select string_agg(privilege_type || coalesce('(' || column_name || ')', ''), ', ' order by privilege_type, column_name)
    into after_grants
    from (
      select privilege_type, null::text as column_name
        from information_schema.role_table_grants
       where grantee = 'authenticated'
         and table_schema = 'public'
         and table_name   = 'profiles'
      union all
      select privilege_type, column_name
        from information_schema.column_privileges
       where grantee = 'authenticated'
         and table_schema = 'public'
         and table_name   = 'profiles'
    ) g;
  raise notice 'profiles grants AFTER:  %', coalesce(after_grants, '(none)');
end $$;
