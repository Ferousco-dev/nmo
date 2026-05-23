-- =====================================================
-- Badge sync on every points change — not just task completion.
--
-- The original badges.sql wired award_tier_badges into complete_task
-- and redeem_code, but the engagement → points path (Apify ingest →
-- credit_engagement_points trigger → add_points) bypassed it. Result:
-- users earning points from Skool engagement stayed stuck on the
-- starting tier even after crossing thresholds.
--
-- Fix: a tiny AFTER INSERT trigger on points_ledger that calls
-- award_tier_badges for the user. Cheap (the function is idempotent
-- and short-circuits when the user already has every reachable tier).
--
-- One-shot backfill at the bottom catches anyone currently misaligned.
-- =====================================================

create or replace function public.award_tier_badges_on_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Skip if no actual point movement (defensive — add_points already filters)
  if new.points = 0 then
    return new;
  end if;
  perform public.award_tier_badges(new.user_id);
  return new;
end;
$$;

drop trigger if exists trg_award_tier_badges_on_ledger on public.points_ledger;
create trigger trg_award_tier_badges_on_ledger
  after insert on public.points_ledger
  for each row execute function public.award_tier_badges_on_ledger();

-- Backfill: recompute tier badges for everyone with any points.
-- award_tier_badges is idempotent — calling it on a fully-tiered
-- user is a no-op.
do $$
declare r record;
begin
  for r in select id from public.profiles where total_points > 0 loop
    perform public.award_tier_badges(r.id);
  end loop;
end $$;

-- Sanity check: see who got newly-awarded badges in the backfill
select p.email, p.total_points, p.current_level,
       (select count(*) from public.user_badges ub
          join public.badges b on b.id = ub.badge_id
         where ub.user_id = p.id and b.category = 'tier') as tier_badges
from public.profiles p
where p.total_points > 0
order by p.total_points desc
limit 10;
