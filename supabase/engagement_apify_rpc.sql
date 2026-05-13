-- =====================================================
-- RPCs for the per-user Apify engagement scrape
--
-- 1. admin_upsert_engagement_events(p_events jsonb)
--    Bulk insert into engagement_events. ON CONFLICT (source_id) does
--    nothing — the scraper emits stable source_ids so re-scraping a
--    profile is idempotent. Returns the number of NEW rows inserted.
--
-- 2. admin_handles_for_engagement(p_limit int, p_only_linked boolean)
--    Returns handles to refresh. Default behaviour is "linked
--    profiles only" (handles that are tied to a registered user), so
--    we don't burn Apify credits on the entire community.
--
-- Safe to run repeatedly.
-- =====================================================

-- ---------------------------------------------------------------------
-- 1. Bulk-insert engagement events. SECURITY DEFINER so the API route
--    using the user-context client can write through RLS.
-- ---------------------------------------------------------------------
create or replace function public.admin_upsert_engagement_events(p_events jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    return 0;
  end if;

  with raw as (
    select
      lower(coalesce(nullif(trim(e->>'skool_handle'), ''), '')) as skool_handle,
      e->>'event_type'        as event_type,
      e->>'source_id'         as source_id,
      e->>'target_post_id'    as target_post_id,
      e->>'target_post_url'   as target_post_url,
      e->>'content_excerpt'   as content_excerpt,
      coalesce(
        (e->>'occurred_at')::timestamptz,
        now()
      )                       as occurred_at,
      e                       as raw
    from jsonb_array_elements(p_events) as e
  ),
  valid as (
    select * from raw
    where skool_handle is not null
      and length(skool_handle) >= 2
      and event_type in ('post', 'comment', 'reply', 'like')
      and source_id is not null
      and length(source_id) > 0
  ),
  ins as (
    insert into public.engagement_events (
      skool_handle, event_type, source_id,
      target_post_id, target_post_url, content_excerpt,
      occurred_at, raw
    )
    select
      skool_handle, event_type, source_id,
      target_post_id, target_post_url,
      case when content_excerpt is null then null
           else left(content_excerpt, 280)
      end,
      occurred_at, raw
    from valid
    on conflict (source_id) do nothing
    returning id
  )
  select count(*) into inserted_count from ins;

  return inserted_count;
end;
$$;

grant execute on function public.admin_upsert_engagement_events(jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Pick handles to refresh. Returns linked-profile handles first
--    (most valuable for the dashboard), falls back to all known
--    nmo_members if p_only_linked = false.
-- ---------------------------------------------------------------------
create or replace function public.admin_handles_for_engagement(
  p_limit int default 100,
  p_only_linked boolean default true
)
returns table (handle text)
language sql
security definer
set search_path = public
as $$
  select distinct lower(p.skool_handle) as handle
    from public.profiles p
   where p.skool_handle is not null
     and length(p.skool_handle) >= 2
   order by handle
   limit greatest(1, p_limit)
  union all
  select distinct lower(m.handle) as handle
    from public.nmo_members m
   where not p_only_linked
     and not exists (
       select 1 from public.profiles p
        where lower(p.skool_handle) = lower(m.handle)
     )
   order by handle
   limit greatest(0, p_limit);
$$;

grant execute on function public.admin_handles_for_engagement(int, boolean)
  to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. After events land, the link_engagement_events_on_handle trigger
--    (defined in engagement.sql) backfills user_id where the handle
--    matches a registered profile. Nothing extra needed here.
-- ---------------------------------------------------------------------
