-- =====================================================
-- POINTS LEDGER + QUARTERLY LEADERBOARD + ENGAGEMENT → POINTS
-- =====================================================
-- Adds an append-only ledger of every points event so we can:
--   1. Show a "this quarter" leaderboard (last 90 days)
--   2. Audit where every user's points came from
--   3. Auto-credit points from engagement events (per the brief —
--      posts/comments/replies/likes feed total_points)
--
-- Idempotent end-to-end: safe to re-run.
-- Run AFTER schema.sql, engagement.sql, admin.sql, badges.sql.
-- =====================================================

-- =============================================================
-- 1. LEDGER TABLE
-- =============================================================
create table if not exists public.points_ledger (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  points integer not null,
  source text not null check (source in (
    'task_complete',
    'task_uncomplete',
    'code_redeem',
    'admin_grant',
    'engagement',
    'backfill'
  )),
  ref_id text,
  reason text,
  earned_at timestamptz not null default now(),
  created_at timestamptz default now()
);

create index if not exists idx_points_ledger_user_time
  on public.points_ledger (user_id, earned_at desc);

create index if not exists idx_points_ledger_time
  on public.points_ledger (earned_at desc);

-- Idempotency for engagement: same engagement_event should never
-- credit twice, regardless of which path inserted it.
create unique index if not exists uniq_points_ledger_engagement_ref
  on public.points_ledger (ref_id)
  where source = 'engagement';

alter table public.points_ledger enable row level security;

drop policy if exists "Users see own ledger" on public.points_ledger;
create policy "Users see own ledger" on public.points_ledger
  for select using (auth.uid() = user_id);

drop policy if exists "Admins see all ledger" on public.points_ledger;
create policy "Admins see all ledger" on public.points_ledger
  for select using (public.is_admin());

grant select on public.points_ledger to authenticated;

-- =============================================================
-- 2. HELPER: add_points(user, delta, source, ref_id, reason, when)
--    Atomic: bumps profiles.total_points AND writes a ledger row.
--    Negative deltas allowed (uncomplete, admin deduct).
-- =============================================================
create or replace function public.add_points(
  p_user_id uuid,
  p_points integer,
  p_source text,
  p_ref_id text default null,
  p_reason text default null,
  p_earned_at timestamptz default null
)
returns void as $$
begin
  if p_user_id is null or p_points = 0 then
    return;
  end if;

  update public.profiles
     set total_points = greatest(0, total_points + p_points),
         updated_at = now()
   where id = p_user_id;

  insert into public.points_ledger
    (user_id, points, source, ref_id, reason, earned_at)
  values
    (p_user_id, p_points, p_source, p_ref_id, p_reason, coalesce(p_earned_at, now()))
  on conflict do nothing;  -- engagement uniq guard
end;
$$ language plpgsql security definer;

-- =============================================================
-- 3. ENGAGEMENT → POINTS
--    Trigger on engagement_events insert: look up the weight and
--    credit it via add_points. Idempotent because of the unique
--    index on points_ledger(ref_id) where source='engagement'.
-- =============================================================
create or replace function public.credit_engagement_points()
returns trigger as $$
declare
  v_weight integer;
begin
  if new.user_id is null then
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
$$ language plpgsql security definer;

drop trigger if exists credit_engagement_points_trg on public.engagement_events;
create trigger credit_engagement_points_trg
  after insert on public.engagement_events
  for each row execute function public.credit_engagement_points();

-- Replace the existing handle-link backfill so it ALSO credits points
-- when it links previously-unattributed events to a freshly-claimed
-- profile. The unique index on ledger ref_id guards against doubles.
create or replace function public.link_engagement_events_on_handle()
returns trigger as $$
declare
  v_event record;
  v_weight integer;
begin
  if new.skool_handle is not null
     and (old.skool_handle is null or old.skool_handle <> new.skool_handle) then

    update public.engagement_events
       set user_id = new.id
     where lower(skool_handle) = lower(new.skool_handle)
       and user_id is null;

    -- Credit points for each linked event
    for v_event in
      select e.id, e.event_type, e.occurred_at
        from public.engagement_events e
       where e.user_id = new.id
    loop
      select points into v_weight
        from public.engagement_weights
       where event_type = v_event.event_type;

      if v_weight is not null and v_weight > 0 then
        perform public.add_points(
          new.id,
          v_weight,
          'engagement',
          v_event.id::text,
          v_event.event_type,
          v_event.occurred_at
        );
      end if;
    end loop;
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- =============================================================
-- 4. PATCH EXISTING POINT-MUTATING RPCs to log to ledger
--    These are `create or replace` — idempotent.
-- =============================================================

-- complete_task — original lives in schema.sql + badges.sql wrap
create or replace function public.complete_task(p_task_id text)
returns json as $$
declare
  v_user_id uuid := auth.uid();
  v_task record;
  v_points integer := 5;
begin
  if v_user_id is null then
    return json_build_object('success', false, 'error', 'not_authenticated');
  end if;

  select * into v_task
    from public.user_tasks
   where user_id = v_user_id and task_id = p_task_id;

  if v_task.id is null then
    return json_build_object('success', false, 'error', 'task_not_found');
  end if;

  if v_task.is_completed then
    return json_build_object('success', true, 'already_completed', true);
  end if;

  update public.user_tasks
     set is_completed = true,
         completed_at = now()
   where id = v_task.id;

  perform public.add_points(
    v_user_id,
    v_points,
    'task_complete',
    p_task_id,
    'Day ' || v_task.day_number || ' task',
    now()
  );

  -- Re-evaluate tier badges in case this push crosses a threshold
  perform public.award_tier_badges(v_user_id);

  return json_build_object(
    'success', true,
    'points_awarded', v_points,
    'task_id', p_task_id
  );
end;
$$ language plpgsql security definer;

-- uncomplete_task — log a NEGATIVE entry so the ledger stays honest
create or replace function public.uncomplete_task(p_task_id text)
returns json as $$
declare
  v_user_id uuid := auth.uid();
  v_task record;
  v_points integer := 5;
begin
  if v_user_id is null then
    return json_build_object('success', false, 'error', 'not_authenticated');
  end if;

  select * into v_task
    from public.user_tasks
   where user_id = v_user_id and task_id = p_task_id;

  if v_task.id is null then
    return json_build_object('success', false, 'error', 'task_not_found');
  end if;

  if not v_task.is_completed then
    return json_build_object('success', true, 'already_uncompleted', true);
  end if;

  update public.user_tasks
     set is_completed = false,
         completed_at = null
   where id = v_task.id;

  perform public.add_points(
    v_user_id,
    -v_points,
    'task_uncomplete',
    p_task_id,
    'Day ' || v_task.day_number || ' un-tick',
    now()
  );

  return json_build_object('success', true, 'points_revoked', v_points);
end;
$$ language plpgsql security definer;

-- redeem_event_code
create or replace function public.redeem_event_code(p_code text)
returns json as $$
declare
  v_user_id uuid := auth.uid();
  v_code record;
  v_points integer;
begin
  if v_user_id is null then
    return json_build_object('success', false, 'error', 'not_authenticated');
  end if;

  select * into v_code
    from public.event_codes
   where lower(code) = lower(trim(p_code))
     and is_active = true
   for update;

  if v_code.code is null then
    return json_build_object('success', false, 'error', 'invalid_code');
  end if;

  if v_code.expires_at is not null and v_code.expires_at < now() then
    return json_build_object('success', false, 'error', 'expired');
  end if;

  if v_code.max_uses is not null and v_code.current_uses >= v_code.max_uses then
    return json_build_object('success', false, 'error', 'max_uses_reached');
  end if;

  if exists (
    select 1 from public.user_event_codes
     where user_id = v_user_id and code = v_code.code
  ) then
    return json_build_object('success', false, 'error', 'already_redeemed');
  end if;

  insert into public.user_event_codes (user_id, code)
  values (v_user_id, v_code.code);

  update public.event_codes
     set current_uses = current_uses + 1
   where code = v_code.code;

  v_points := v_code.points_value;

  perform public.add_points(
    v_user_id,
    v_points,
    'code_redeem',
    v_code.code,
    coalesce(v_code.description, v_code.code),
    now()
  );

  perform public.award_tier_badges(v_user_id);

  return json_build_object(
    'success', true,
    'points', v_points,
    'description', v_code.description,
    'code', v_code.code
  );
end;
$$ language plpgsql security definer;

-- admin_grant_points
create or replace function public.admin_grant_points(
  p_target_user_id uuid,
  p_points integer,
  p_reason text default null
)
returns json as $$
declare
  v_admin uuid := auth.uid();
begin
  if v_admin is null or not public.is_admin(v_admin) then
    return json_build_object('success', false, 'error', 'not_admin');
  end if;

  if p_target_user_id is null or p_points = 0 then
    return json_build_object('success', false, 'error', 'invalid_input');
  end if;

  perform public.add_points(
    p_target_user_id,
    p_points,
    'admin_grant',
    null,
    p_reason,
    now()
  );

  insert into public.admin_actions (admin_id, action_type, target_user_id, payload)
  values (v_admin, 'grant_points', p_target_user_id, jsonb_build_object(
    'points', p_points, 'reason', p_reason
  ));

  -- Tier re-eval after grant
  perform public.award_tier_badges(p_target_user_id);

  return json_build_object('success', true, 'points', p_points);
end;
$$ language plpgsql security definer;

-- =============================================================
-- 5. QUARTERLY VIEW (last 90 days from points_ledger)
-- =============================================================
create or replace view public.leaderboard_quarter as
select
  user_id,
  sum(points)::integer as quarter_points,
  count(*)::integer    as ledger_entries,
  max(earned_at)       as last_earned_at
from public.points_ledger
where earned_at >= now() - interval '90 days'
group by user_id;

grant select on public.leaderboard_quarter to authenticated;

-- =============================================================
-- 6. ONE-TIME BACKFILL (only runs if ledger is empty)
--    For each user with total_points > 0, insert a single
--    'backfill' row dated to their profile creation. This keeps
--    the all-time totals consistent. The quarterly view will
--    only include users whose backfill row falls within 90 days
--    of profile creation, which is honest given we have no
--    historical timeline for their accumulated points.
-- =============================================================
do $$
begin
  if not exists (select 1 from public.points_ledger limit 1) then
    insert into public.points_ledger (user_id, points, source, reason, earned_at)
    select id, total_points, 'backfill', 'historical total', created_at
      from public.profiles
     where total_points > 0;
  end if;
end$$;

-- Sanity check
select
  (select count(*) from public.points_ledger)         as ledger_rows,
  (select count(distinct user_id) from public.points_ledger) as users_with_history,
  (select count(*) from public.leaderboard_quarter)   as quarter_active_users;
