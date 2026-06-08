-- =====================================================
-- Fix the FIX: credit_engagement_points trigger fires only on
-- INSERT. My previous backfill UPDATE set user_id correctly but
-- never triggered the credit. Jack still shows total_points = 0.
--
-- Two patches:
--   A. Loop through every engagement_event with user_id set and
--      manually call add_points. The points_ledger unique-on-ref_id
--      index prevents double-credit if some events were already
--      credited (they won't be — total_points was 0, but defensive).
--   B. Extend the trigger to also fire on UPDATE of user_id from
--      NULL → not-NULL, so future re-linkings credit automatically
--      (e.g., when a brand-new user signs up and we attribute their
--      backlog of orphaned events).
--
-- After this runs, total_points should jump to the expected sum:
-- (post × 10) + (comment × 5) + (reply × 3) + (like × 1).
-- =====================================================

-- A. One-shot credit loop. Wrapped in a DO block so it runs as one
-- transaction. add_points is SECURITY DEFINER and idempotent on
-- the engagement uniq index.
do $$
declare
  v_event record;
  v_weight integer;
  v_credited integer := 0;
  v_skipped  integer := 0;
begin
  for v_event in
    select e.id, e.user_id, e.event_type, e.occurred_at
      from public.engagement_events e
     where e.user_id is not null
  loop
    select points into v_weight
      from public.engagement_weights
     where event_type = v_event.event_type;

    if v_weight is null or v_weight <= 0 then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    perform public.add_points(
      v_event.user_id,
      v_weight,
      'engagement',
      v_event.id::text,
      v_event.event_type,
      v_event.occurred_at
    );
    v_credited := v_credited + 1;
  end loop;

  raise notice 'Credited % event(s), skipped % (no weight)', v_credited, v_skipped;
end $$;

-- B. Trigger on UPDATE so future re-attributions credit automatically.
-- AFTER UPDATE OF user_id when NEW has a value and OLD didn't.
create or replace function public.credit_engagement_points_on_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_weight integer;
begin
  -- Only act when user_id transitions from NULL → not-NULL
  if new.user_id is null then
    return new;
  end if;
  if old.user_id is not null then
    return new;
  end if;

  select points into v_weight
    from public.engagement_weights
   where event_type = new.event_type;

  if v_weight is null or v_weight <= 0 then
    return new;
  end if;

  perform public.add_points(
    new.user_id,
    v_weight,
    'engagement',
    new.id::text,
    new.event_type,
    new.occurred_at
  );
  return new;
end;
$$;

drop trigger if exists credit_engagement_points_on_link_trg on public.engagement_events;
create trigger credit_engagement_points_on_link_trg
  after update of user_id on public.engagement_events
  for each row execute function public.credit_engagement_points_on_link();

-- C. Verification — paste the queries below after running the above.

-- Jack's totals
select total_points, current_level
from public.profiles
where skool_handle = 'jack-liu-9368';

-- Ledger breakdown
select source, count(*) as n, sum(points) as pts
from public.points_ledger pl
join public.profiles p on p.id = pl.user_id
where p.skool_handle = 'jack-liu-9368'
group by source;
