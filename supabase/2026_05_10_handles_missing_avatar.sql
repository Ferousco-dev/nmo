-- =====================================================
-- NMO Roadmap — RPC for the avatar-backfill job
-- =====================================================
-- Returns up to p_limit nmo_members.handle values where
-- avatar_url IS NULL. The /api/admin/bot/trigger-backfill-
-- avatars-apify route uses this to know which profiles to
-- visit on Skool. Admin-only.
--
-- Idempotent: safe to re-run.
-- =====================================================

create or replace function public.admin_handles_missing_avatar(p_limit int default 200)
returns table (handle text) as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  return query
    select m.handle
      from public.nmo_members m
     where m.avatar_url is null
       and m.handle is not null
     order by m.last_seen_at desc nulls last
     limit greatest(1, least(coalesce(p_limit, 200), 1000));
end;
$$ language plpgsql security definer stable;

revoke all on function public.admin_handles_missing_avatar(int) from public;
grant execute on function public.admin_handles_missing_avatar(int) to authenticated;
