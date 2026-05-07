-- =====================================================
-- NMO Roadmap — Engagement tracking migration
-- Idempotent: safe to re-run on an existing DB
-- Run AFTER schema.sql
-- =====================================================

-- =====================================================
-- 1. PROFILE COLUMNS for Skool linking
-- =====================================================
alter table public.profiles
  add column if not exists skool_handle text,
  add column if not exists skool_display_name text,
  add column if not exists skool_avatar_url text,
  add column if not exists skool_verified_at timestamptz,
  add column if not exists skool_membership_status text
    check (skool_membership_status in ('unverified','pending','verified','rejected'))
    default 'unverified',
  add column if not exists skool_email_match text
    check (skool_email_match in ('strong','medium','weak','unknown'))
    default 'unknown';

-- Unique handle (case-insensitive). Use functional index to enforce.
create unique index if not exists idx_profiles_skool_handle_lower
  on public.profiles (lower(skool_handle))
  where skool_handle is not null;

-- =====================================================
-- 2. ENGAGEMENT_EVENTS TABLE
--    Bot writes here; users read their own events.
-- =====================================================
create table if not exists public.engagement_events (
  id uuid primary key default uuid_generate_v4(),
  -- We may detect events for handles that haven't signed up yet.
  -- user_id is filled in via trigger when a profile claims the handle.
  user_id uuid references public.profiles(id) on delete set null,
  skool_handle text not null,
  event_type text not null check (event_type in (
    'post',          -- top-level post in community feed
    'comment',       -- comment on a post
    'reply',         -- reply to a comment
    'like'           -- like given by user on someone else's content
  )),
  -- Stable identifier for the source action so re-polling doesn't double-insert.
  -- Bot constructs this as e.g. "post:abc123", "comment:abc123:def456", "like:user:abc123".
  source_id text not null,
  target_post_id text,        -- the post the action is on/about
  target_post_url text,       -- canonical Skool URL
  content_excerpt text,       -- first ~280 chars of comment/post body, for display
  occurred_at timestamptz not null default now(),
  detected_at timestamptz not null default now(),
  raw jsonb,                  -- everything else the bot scraped, for forensics
  unique (source_id)
);

create index if not exists idx_engagement_events_handle
  on public.engagement_events (lower(skool_handle), occurred_at desc);
create index if not exists idx_engagement_events_user
  on public.engagement_events (user_id, occurred_at desc)
  where user_id is not null;
create index if not exists idx_engagement_events_type_time
  on public.engagement_events (event_type, occurred_at desc);

-- =====================================================
-- 3. POINT WEIGHTS (lookup table; tweakable without code change)
-- =====================================================
create table if not exists public.engagement_weights (
  event_type text primary key,
  points integer not null,
  updated_at timestamptz default now()
);

insert into public.engagement_weights (event_type, points) values
  ('post', 10),
  ('comment', 5),
  ('reply', 3),
  ('like', 1)
on conflict (event_type) do nothing;

-- =====================================================
-- 4. ENGAGEMENT_GRADES VIEW
--    Aggregates per user with subtotals + total score.
-- =====================================================
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

-- =====================================================
-- 5. ENGAGEMENT_GRADES_RECENT VIEW
--    Last 30 days only — used for "current activity" leaderboard.
-- =====================================================
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

-- =====================================================
-- 6. TRIGGER: backfill events when a user claims their handle
--    When profile.skool_handle is set, link any orphan events that match.
-- =====================================================
create or replace function public.link_engagement_events_on_handle()
returns trigger as $$
begin
  if new.skool_handle is not null
     and (old.skool_handle is null or lower(old.skool_handle) <> lower(new.skool_handle)) then
    update public.engagement_events
       set user_id = new.id
     where lower(skool_handle) = lower(new.skool_handle)
       and user_id is distinct from new.id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists profiles_link_engagement on public.profiles;
create trigger profiles_link_engagement
  after insert or update of skool_handle on public.profiles
  for each row execute function public.link_engagement_events_on_handle();

-- =====================================================
-- 7. RPC: claim_skool_handle (idempotent + verification)
--    Called from /api/skool/verify after the server confirms the
--    public profile exists. Stores handle + scraped display/avatar.
-- =====================================================
create or replace function public.claim_skool_handle(
  p_handle text,
  p_display_name text,
  p_avatar_url text,
  p_membership_status text default 'pending',
  p_email_match text default 'unknown'
) returns json as $$
declare
  v_user_id uuid := auth.uid();
  v_normalized text := lower(trim(p_handle));
  v_existing record;
begin
  if v_user_id is null then
    return json_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if v_normalized is null or v_normalized = '' then
    return json_build_object('success', false, 'error', 'invalid_handle');
  end if;

  -- Check if another user already claimed this handle
  select id into v_existing
    from public.profiles
   where lower(skool_handle) = v_normalized
     and id <> v_user_id
   limit 1;

  if v_existing.id is not null then
    return json_build_object('success', false, 'error', 'handle_taken');
  end if;

  update public.profiles
     set skool_handle = v_normalized,
         skool_display_name = coalesce(p_display_name, skool_display_name),
         skool_avatar_url = coalesce(p_avatar_url, skool_avatar_url),
         skool_verified_at = now(),
         skool_membership_status = coalesce(p_membership_status, 'pending'),
         skool_email_match = coalesce(p_email_match, 'unknown'),
         display_name = coalesce(p_display_name, v_normalized)
   where id = v_user_id;

  return json_build_object(
    'success', true,
    'handle', v_normalized,
    'display_name', p_display_name,
    'avatar_url', p_avatar_url,
    'membership_status', p_membership_status,
    'email_match', p_email_match
  );
end;
$$ language plpgsql security definer;

-- =====================================================
-- 8. RLS for engagement_events
-- =====================================================
alter table public.engagement_events enable row level security;
alter table public.engagement_weights enable row level security;

drop policy if exists "Users see own engagement events" on public.engagement_events;
create policy "Users see own engagement events" on public.engagement_events
  for select using (auth.uid() = user_id);

-- Aggregate views show everyone (leaderboard); per-row events stay private.
-- Bot writes via service_role which bypasses RLS.

drop policy if exists "Engagement weights readable" on public.engagement_weights;
create policy "Engagement weights readable" on public.engagement_weights
  for select using (auth.role() = 'authenticated');

-- Grant SELECT on aggregate views to authenticated users.
grant select on public.engagement_grades to authenticated;
grant select on public.engagement_grades_recent to authenticated;

-- =====================================================
-- 9. BOT_RUNS TABLE (observability — when did the bot last run?)
-- =====================================================
create table if not exists public.bot_runs (
  id uuid primary key default uuid_generate_v4(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text check (status in ('running','success','failed')) default 'running',
  posts_seen integer default 0,
  events_inserted integer default 0,
  error text,
  notes jsonb
);

create index if not exists idx_bot_runs_started on public.bot_runs (started_at desc);

alter table public.bot_runs enable row level security;
drop policy if exists "Bot runs readable by authenticated" on public.bot_runs;
create policy "Bot runs readable by authenticated" on public.bot_runs
  for select using (auth.role() = 'authenticated');

-- =====================================================
-- 10. NMO_MEMBERS TABLE (the bot's roster of community members)
-- Used as the gate for signups: only handles in this table can register.
-- =====================================================
create table if not exists public.nmo_members (
  handle text primary key,                  -- normalized lowercase
  display_name text,
  avatar_url text,
  level integer,                            -- Skool gem-tier level (1-9 typically)
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Add level column to existing tables (idempotent for users who already ran v1)
alter table public.nmo_members
  add column if not exists level integer;

create index if not exists idx_nmo_members_last_seen on public.nmo_members (last_seen_at desc);
-- Trigram index speeds up ILIKE %text% queries on name/handle for live search.
create extension if not exists pg_trgm;
create index if not exists idx_nmo_members_display_name_trgm
  on public.nmo_members using gin (display_name gin_trgm_ops);
create index if not exists idx_nmo_members_handle_trgm
  on public.nmo_members using gin (handle gin_trgm_ops);

alter table public.nmo_members enable row level security;

-- Public can SELECT to power the pre-signup search (anon role).
-- This is fine — handles are public information on Skool anyway.
drop policy if exists "NMO members readable by anyone" on public.nmo_members;
create policy "NMO members readable by anyone" on public.nmo_members
  for select using (true);
