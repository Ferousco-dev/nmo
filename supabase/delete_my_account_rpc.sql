-- =====================================================
-- delete_my_account() — user-initiated account deletion.
--
-- Called from /api/me/account (DELETE). Deletes the caller's
-- profile row, which cascades through:
--   - user_tasks
--   - code_redemptions
--   - points_log
--   - user_badges
--   - admin_users (if they were promoted)
--   - profiles.id ← auth.users.id (FK with on delete cascade)
--
-- The auth.users row itself is NOT deleted here (Supabase doesn't
-- expose a portable SQL path to delete from auth schema). The user
-- can no longer use the app because every gated route requires a
-- profile row. If full auth-row cleanup is needed, add
-- SUPABASE_SERVICE_ROLE_KEY to env and call auth.admin.deleteUser
-- from the API route as a follow-up step.
--
-- SECURITY DEFINER + auth.uid() guard means it only ever deletes
-- the caller's row.
-- =====================================================

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- Cascade deletes do most of the work via FK on delete cascade.
  delete from public.profiles where id = v_uid;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
