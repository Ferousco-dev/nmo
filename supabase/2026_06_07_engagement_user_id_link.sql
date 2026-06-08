-- =====================================================
-- CRITICAL BUG FIX: Skool engagement events were inserted with
-- user_id = NULL, so credit_engagement_points bailed without
-- crediting points. Posts/comments/likes weren't gamifying.
--
-- Root cause: admin_upsert_engagement_events (engagement_received_stats.sql)
-- inserts rows keyed by `skool_handle` only — it never set `user_id`.
-- The recovery path `link_engagement_events_on_handle` fires only on
-- profile UPDATE; when a fresh login creates a profile with the handle
-- THEN Apify scrapes minutes later, the events arrive with NULL
-- user_id and stay orphaned forever.
--
-- Fix:
-- 0. (Idempotent) Ensure engagement_received_stats columns exist.
--    Production DB skipped this earlier migration, so the columns
--    likes_received / comments_received may be missing.
-- 1. Replace admin_upsert_engagement_events so each row resolves
--    user_id from profiles at insert time (left join on lower handle).
-- 2. Backfill all existing engagement_events where user_id is NULL
--    but a profile with the matching skool_handle exists. The UPDATE
--    fires credit_engagement_points (which now sees a non-null
--    user_id) and credits the backlog.
-- =====================================================

-- 0. Ensure per-post received-stats columns exist (idempotent — from
-- engagement_received_stats.sql, which never made it to prod).
alter table public.engagement_events
  add column if not exists likes_received    integer not null default 0,
  add column if not exists comments_received integer not null default 0;

create index if not exists idx_engagement_events_likes
  on public.engagement_events (likes_received)
  where event_type = 'post';

-- 1. RPC: keep all the dedup logic, but resolve user_id from profiles
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
      greatest(0, coalesce((e->>'likes_received')::int, 0))    as likes_received,
      greatest(0, coalesce((e->>'comments_received')::int, 0)) as comments_received,
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
  -- Look up the profile that owns each handle. LEFT JOIN so we still
  -- insert events for handles that haven't signed up yet (the existing
  -- link_engagement_events_on_handle trigger will attribute them later
  -- once they sign up).
  resolved as (
    select v.*, p.id as user_id
    from valid v
    left join public.profiles p
      on lower(p.skool_handle) = v.skool_handle
  ),
  ins as (
    insert into public.engagement_events (
      user_id, skool_handle, event_type, source_id,
      target_post_id, target_post_url, content_excerpt,
      occurred_at, likes_received, comments_received, raw
    )
    select
      user_id, skool_handle, event_type, source_id,
      target_post_id, target_post_url,
      case when content_excerpt is null then null
           else left(content_excerpt, 280)
      end,
      occurred_at, likes_received, comments_received, raw
    from resolved
    on conflict (source_id) do update
      set
        -- Late-arriving user_id wins (covers the case where the row
        -- was inserted before the user signed up but a more recent
        -- scrape has the same source_id after they linked).
        user_id           = coalesce(public.engagement_events.user_id, excluded.user_id),
        likes_received    = greatest(public.engagement_events.likes_received, excluded.likes_received),
        comments_received = greatest(public.engagement_events.comments_received, excluded.comments_received),
        content_excerpt   = coalesce(excluded.content_excerpt, public.engagement_events.content_excerpt),
        target_post_url   = coalesce(excluded.target_post_url, public.engagement_events.target_post_url),
        raw               = excluded.raw
      where public.engagement_events.source_id = excluded.source_id
    returning xmax = 0 as was_inserted
  )
  select count(*) filter (where was_inserted) into inserted_count from ins;

  return inserted_count;
end;
$$;

grant execute on function public.admin_upsert_engagement_events(jsonb)
  to authenticated, service_role;

-- 2. One-shot backfill: re-attribute every orphaned event whose
-- skool_handle matches a current profile. The UPDATE fires the
-- credit_engagement_points trigger which credits the backlog. The
-- points_ledger unique-on-ref_id index guards against double credit
-- if some events were already partially credited.
update public.engagement_events e
   set user_id = p.id
  from public.profiles p
 where e.user_id is null
   and p.skool_handle is not null
   and lower(p.skool_handle) = lower(e.skool_handle);

-- 3. Sanity check
select
  (select count(*) from public.engagement_events where user_id is null) as still_orphaned,
  (select count(*) from public.engagement_events where user_id is not null) as attributed,
  (select sum(total_points) from public.profiles where total_points > 0) as total_points_across_users;
