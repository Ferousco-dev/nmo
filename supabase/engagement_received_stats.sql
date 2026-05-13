-- =====================================================
-- Per-post "received" stats for engagement_events
--
-- Adds two columns to engagement_events so each post the scraper
-- captures can carry its own audience metrics:
--
--   likes_received    — likes on this specific post/comment
--   comments_received — comments under this specific post (top-level
--                       posts only; null for comment/reply rows)
--
-- The engagement_grades view is extended to expose the aggregates:
--
--   posts_count             — number of posts the user authored
--   likes_received_total    — sum of likes across all their posts
--   comments_received_total — sum of comments across all their posts
--   replies_count           — best-effort scraped count of reply events
--
-- The upsert RPC is also extended to write the new fields. Old callers
-- (which don't pass them) still work — they just leave the new columns
-- at default 0.
--
-- Safe to run repeatedly.
-- =====================================================

alter table public.engagement_events
  add column if not exists likes_received integer not null default 0;

alter table public.engagement_events
  add column if not exists comments_received integer not null default 0;

create index if not exists idx_engagement_events_likes
  on public.engagement_events (likes_received)
  where event_type = 'post';

-- ---------------------------------------------------------------------
-- Rewrite the upsert RPC to also persist the new per-post counts.
-- ON CONFLICT does an UPDATE this time so re-scraping a post with a
-- higher like/comment count refreshes the row instead of being ignored.
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
  ins as (
    insert into public.engagement_events (
      skool_handle, event_type, source_id,
      target_post_id, target_post_url, content_excerpt,
      occurred_at, likes_received, comments_received, raw
    )
    select
      skool_handle, event_type, source_id,
      target_post_id, target_post_url,
      case when content_excerpt is null then null
           else left(content_excerpt, 280)
      end,
      occurred_at, likes_received, comments_received, raw
    from valid
    on conflict (source_id) do update
      set
        likes_received    = greatest(public.engagement_events.likes_received, excluded.likes_received),
        comments_received = greatest(public.engagement_events.comments_received, excluded.comments_received),
        content_excerpt   = coalesce(excluded.content_excerpt, public.engagement_events.content_excerpt),
        target_post_url   = coalesce(excluded.target_post_url, public.engagement_events.target_post_url),
        raw               = excluded.raw
      where public.engagement_events.source_id = excluded.source_id
    returning xmax = 0 as was_inserted  -- xmax=0 means INSERT (vs UPDATE)
  )
  select count(*) filter (where was_inserted) into inserted_count from ins;

  return inserted_count;
end;
$$;

grant execute on function public.admin_upsert_engagement_events(jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Extend the engagement_grades view with received aggregates. Anything
-- not posted/commented stays 0 — no NULLs leak to the dashboard.
-- ---------------------------------------------------------------------
create or replace view public.engagement_grades as
select
  p.id                                       as user_id,
  p.skool_handle                             as skool_handle,
  coalesce(p.skool_display_name, p.skool_handle, p.display_name) as display_name,
  p.skool_avatar_url                         as avatar_url,
  p.tenure                                   as tenure,
  count(*) filter (where e.event_type = 'post')    as posts_count,
  count(*) filter (where e.event_type = 'comment') as comments_count,
  count(*) filter (where e.event_type = 'reply')   as replies_count,
  count(*) filter (where e.event_type = 'like')    as likes_count,
  coalesce(
    sum(e.likes_received) filter (where e.event_type = 'post'),
    0
  ) as likes_received_total,
  coalesce(
    sum(e.comments_received) filter (where e.event_type = 'post'),
    0
  ) as comments_received_total,
  coalesce(sum(w.points), 0)                       as engagement_score,
  max(e.occurred_at)                               as last_active_at
from public.profiles p
left join public.engagement_events e
  on e.user_id = p.id
left join public.engagement_weights w
  on w.event_type = e.event_type
where p.skool_handle is not null
group by p.id, p.skool_handle, p.skool_display_name, p.display_name,
         p.skool_avatar_url, p.tenure;

-- Same shape for the 30-day rolling variant.
create or replace view public.engagement_grades_recent as
select
  p.id                                       as user_id,
  p.skool_handle                             as skool_handle,
  coalesce(p.skool_display_name, p.skool_handle, p.display_name) as display_name,
  p.skool_avatar_url                         as avatar_url,
  p.tenure                                   as tenure,
  count(*) filter (where e.event_type = 'post')    as posts_count,
  count(*) filter (where e.event_type = 'comment') as comments_count,
  count(*) filter (where e.event_type = 'reply')   as replies_count,
  count(*) filter (where e.event_type = 'like')    as likes_count,
  coalesce(
    sum(e.likes_received) filter (where e.event_type = 'post'),
    0
  ) as likes_received_total,
  coalesce(
    sum(e.comments_received) filter (where e.event_type = 'post'),
    0
  ) as comments_received_total,
  coalesce(sum(w.points), 0)                       as engagement_score
from public.profiles p
left join public.engagement_events e
  on e.user_id = p.id
  and e.occurred_at >= now() - interval '30 days'
left join public.engagement_weights w
  on w.event_type = e.event_type
where p.skool_handle is not null
group by p.id, p.skool_handle, p.skool_display_name, p.display_name,
         p.skool_avatar_url, p.tenure;
