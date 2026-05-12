-- =====================================================
-- One-shot backfill: copy display_name + avatar_url from
-- public.nmo_members into public.profiles for any user whose
-- skool_handle is set but whose Skool fields are NULL.
--
-- Caused by earlier signups where /api/skool/verify failed to scrape
-- live (Skool maintenance / region blocks / rate limits) and so
-- claim_skool_handle was called with NULL avatar_url. Since the
-- handle is already in nmo_members (the bot scrapes the community
-- on a schedule), we can backfill from there.
--
-- Safe to re-run: only updates rows that are still missing data.
-- =====================================================

update public.profiles p
   set skool_avatar_url    = nm.avatar_url,
       skool_display_name  = coalesce(p.skool_display_name, nm.display_name),
       display_name        = coalesce(p.display_name, nm.display_name),
       -- Mark verified — being in nmo_members means the bot has seen
       -- this handle as part of the community.
       skool_membership_status = case
         when p.skool_membership_status in ('verified') then p.skool_membership_status
         else 'verified'
       end
  from public.nmo_members nm
 where p.skool_handle is not null
   and lower(p.skool_handle) = lower(nm.handle)
   and (
        p.skool_avatar_url is null
     or p.skool_avatar_url = ''
     or p.skool_display_name is null
   );

-- Quick sanity check — show how many profiles now have an avatar
select
  count(*) filter (where skool_avatar_url is not null) as with_avatar,
  count(*) filter (where skool_avatar_url is null and skool_handle is not null) as missing_avatar,
  count(*) filter (where skool_handle is null) as no_handle,
  count(*) as total
from public.profiles;
