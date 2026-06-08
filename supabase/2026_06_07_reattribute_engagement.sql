-- =====================================================
-- Re-attribute engagement → points to current handle owners.
--
-- During testing the dev test account had its skool_handle
-- temporarily set to 'jack-liu-9368', so when Apify scraped Jack's
-- 359 events they got linked + credited to the dev account. When the
-- handle was reverted (and later Jack himself signed up), the events
-- stayed linked to the wrong user_id. Jack's real profile shows 0
-- points; the dev account shows the 369 that should be his.
--
-- Strategy (data-safe, idempotent):
--   1. UPDATE engagement_events.user_id  → owner of skool_handle
--   2. UPDATE points_ledger.user_id      → same owner (for engagement rows)
--   3. RECALCULATE profiles.total_points → SUM(ledger.points) per user
--   4. RECOMPUTE current_level via award_tier_badges
--
-- After this runs, every engagement event is credited to whoever
-- currently owns that handle; legacy mis-attributions are corrected.
-- =====================================================

-- 1. Re-attribute engagement_events to the current handle owner
update public.engagement_events e
   set user_id = p.id
  from public.profiles p
 where lower(p.skool_handle) = lower(e.skool_handle)
   and (e.user_id is distinct from p.id);

-- 2. Re-attribute the corresponding points_ledger rows.
-- ref_id on engagement ledger rows = engagement_events.id (stringified).
update public.points_ledger pl
   set user_id = e.user_id
  from public.engagement_events e
 where pl.source = 'engagement'
   and pl.ref_id = e.id::text
   and pl.user_id is distinct from e.user_id
   and e.user_id is not null;

-- 3. Rebuild total_points on every profile from the ledger. This is
-- the source of truth — any drift gets corrected here.
update public.profiles p
   set total_points = coalesce(s.total, 0),
       updated_at = now()
  from (
    select user_id, sum(points)::integer as total
      from public.points_ledger
     group by user_id
  ) s
 where p.id = s.user_id;

-- Also zero out profiles that have no ledger rows but had stale totals
update public.profiles
   set total_points = 0,
       updated_at = now()
 where id not in (select distinct user_id from public.points_ledger where user_id is not null)
   and total_points <> 0;

-- 4. Recompute tier badges + current_level for everyone with points
do $$
declare r record;
begin
  for r in select id from public.profiles where total_points > 0 loop
    perform public.award_tier_badges(r.id);
  end loop;
end $$;

-- Verification
select
  p.email,
  p.skool_handle,
  p.total_points,
  p.current_level,
  (select count(*) from public.engagement_events e where e.user_id = p.id) as event_count,
  (select coalesce(sum(pl.points), 0) from public.points_ledger pl
    where pl.user_id = p.id and pl.source = 'engagement') as engagement_pts
from public.profiles p
where p.total_points > 0 or p.skool_handle in ('jack-liu-9368', '11829275')
order by p.total_points desc;
