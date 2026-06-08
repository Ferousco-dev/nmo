-- =====================================================
-- Cleanup after reattribute: floor negative totals at 0 and revoke
-- tier badges users no longer qualify for.
--
-- Why this is needed:
--   - The reattribute migration set total_points = SUM(ledger). Some
--     legacy ledger entries (task_uncomplete with negative deltas, or
--     manual deductions) summed to negative values. The runtime
--     add_points() floors at 0, but the direct UPDATE didn't.
--
--   - award_tier_badges() is additive — it grants badges when
--     thresholds are crossed but never revokes when totals drop.
--     If a user briefly held the Lv 10 badge and points later moved
--     to another account, the badge sticks and current_level stays
--     at 10 forever.
--
-- This cleanup is idempotent — running on a clean DB is a no-op.
-- =====================================================

-- 1. Floor negative totals at 0
update public.profiles
   set total_points = 0,
       updated_at = now()
 where total_points < 0;

-- 2. Revoke tier badges whose points_threshold exceeds current total
delete from public.user_badges ub
using public.badges b, public.profiles p
where ub.badge_id = b.id
  and ub.user_id = p.id
  and b.category = 'tier'
  and b.points_threshold is not null
  and b.points_threshold > coalesce(p.total_points, 0);

-- 3. Recompute current_level on every profile from remaining badges
update public.profiles p
   set current_level = coalesce((
     select max(b.tier)
       from public.user_badges ub
       join public.badges b on b.id = ub.badge_id
      where ub.user_id = p.id
        and b.category = 'tier'
   ), 1),
   updated_at = now();

-- Verification
select
  p.email,
  p.skool_handle,
  p.total_points,
  p.current_level,
  (select count(*) from public.user_badges ub
     join public.badges b on b.id = ub.badge_id
    where ub.user_id = p.id and b.category = 'tier') as tier_badges_held
from public.profiles p
where p.email in ('biojacknow@gmail.com', 'skoolclaudeuse@gmail.com')
   or p.total_points > 0
order by p.total_points desc;
