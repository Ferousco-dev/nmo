-- =====================================================
-- admin_handles_for_engagement v2 — cost-saving filter
--
-- Adds `p_skip_recent_hours`: handles whose latest scraped event is
-- newer than that cutoff are excluded. Lets the daily cron skip
-- profiles that were just refreshed by a /api/me/refresh-engagement
-- call, halving Apify compute on overlapping batches.
--
-- Default 24h cutoff matches the daily Apify schedule.
-- =====================================================

create or replace function public.admin_handles_for_engagement(
  p_limit int default 200,
  p_only_linked boolean default true,
  p_skip_recent_hours int default 24
)
returns table (handle text)
language sql
security definer
set search_path = public
as $$
  with cutoff as (
    select now() - make_interval(hours => greatest(0, p_skip_recent_hours)) as ts
  ),
  -- Most-recent event timestamp per handle, used to filter out
  -- handles we've just refreshed.
  freshness as (
    select lower(skool_handle) as handle, max(detected_at) as last_seen
      from public.engagement_events
     group by lower(skool_handle)
  ),
  -- 1) Linked profiles — most valuable, refresh first.
  linked as (
    select distinct lower(p.skool_handle) as handle
      from public.profiles p
     where p.skool_handle is not null
       and length(p.skool_handle) >= 2
  ),
  -- 2) Everyone else (only included when p_only_linked is false).
  unlinked as (
    select distinct lower(m.handle) as handle
      from public.nmo_members m
     where not p_only_linked
       and not exists (
         select 1 from linked l where l.handle = lower(m.handle)
       )
  ),
  candidates as (
    select handle from linked
    union all
    select handle from unlinked
  )
  select c.handle
    from candidates c
    left join freshness f on f.handle = c.handle
    cross join cutoff
   where f.last_seen is null
      or f.last_seen < cutoff.ts
   order by f.last_seen nulls first, c.handle
   limit greatest(1, p_limit);
$$;

grant execute on function public.admin_handles_for_engagement(int, boolean, int)
  to authenticated, service_role;
