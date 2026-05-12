-- =====================================================
-- NMO Roadmap — complete_task: day-lock + restored streak
-- =====================================================
-- Closes audit findings:
--   C3  — complete_task didn't verify previous-day completion.
--         A user could call complete_task('day30_action_step_0')
--         from the browser console on Day 1 and skip the entire
--         30-day product. UI day-lock was the only barrier.
--   H2  — points_ledger.sql's earlier rewrite of complete_task
--         silently dropped the streak_count / last_active_at
--         update block. Dashboard kept showing streak_count but
--         it stopped incrementing.
--   H2.tz — streak day diff used Postgres `current_date` (UTC),
--         unfair for the Asia/Taipei audience. A user ticking a
--         task at 7:00 Taipei (= 23:00 UTC the previous day) was
--         credited to "yesterday" UTC. Now uses Asia/Taipei date.
--
-- This is a `create or replace` so it supersedes the earlier
-- definitions in schema.sql:200, badges.sql:184, and
-- points_ledger.sql:181 regardless of which one is currently live.
-- Idempotent: safe to re-run.
--
-- Return contract (preserved): json_build_object(...)
--   - success=true,  already_completed=true       (no-op replay)
--   - success=true,  points_awarded=N, task_id    (normal path)
--   - success=true,  roadmap_complete=true        (final tick)
--   - success=false, error='not_authenticated'
--   - success=false, error='task_not_found'
--   - success=false, error='previous_day_incomplete', day=N (NEW)
-- =====================================================

create or replace function public.complete_task(p_task_id text)
returns json as $$
declare
  v_user_id uuid := auth.uid();
  v_task record;
  v_points integer := 5;
  v_now timestamptz := now();
  v_today date := (v_now at time zone 'Asia/Taipei')::date;
  v_last_active_date date;
  v_streak integer;
  v_prev_total integer;
  v_prev_done integer;
  v_remaining integer;
begin
  if v_user_id is null then
    return json_build_object('success', false, 'error', 'not_authenticated');
  end if;

  -- Lock the task row to serialize concurrent double-clicks.
  -- Without `for update`, two requests can both read is_completed=false,
  -- both pass the guard, and both call add_points → +10 instead of +5.
  select * into v_task
    from public.user_tasks
   where user_id = v_user_id and task_id = p_task_id
   for update;

  if not found then
    return json_build_object('success', false, 'error', 'task_not_found');
  end if;

  if v_task.is_completed then
    return json_build_object('success', true, 'already_completed', true);
  end if;

  -- C3 — server-side day lock. Day 1 has no predecessor so always allowed.
  -- For day N > 1, every task on day N-1 must be is_completed=true.
  if v_task.day_number > 1 then
    select count(*),
           count(*) filter (where is_completed)
      into v_prev_total, v_prev_done
      from public.user_tasks
     where user_id = v_user_id
       and day_number = v_task.day_number - 1;

    -- v_prev_total = 0 means the roadmap was generated for fewer days
    -- than expected — treat as locked rather than auto-skipping.
    if v_prev_total = 0 or v_prev_done < v_prev_total then
      return json_build_object(
        'success', false,
        'error', 'previous_day_incomplete',
        'day', v_task.day_number
      );
    end if;
  end if;

  -- Mark complete.
  update public.user_tasks
     set is_completed = true,
         completed_at = v_now
   where id = v_task.id;

  -- Award points + ledger row in one atomic helper.
  perform public.add_points(
    v_user_id,
    v_points,
    'task_complete',
    p_task_id,
    'Day ' || v_task.day_number || ' task',
    v_now
  );

  -- H2 — streak update. Compare the user's last active date and today
  -- in Asia/Taipei so users in TW don't lose streaks across the UTC
  -- midnight rollover (which falls at 8am Taipei).
  --
  --   no last_active_at   → streak = 1   (first ever activity)
  --   last_active = today → streak unchanged (same-day repeat tick)
  --   last_active = yest. → streak + 1   (consecutive day)
  --   else                → streak = 1   (chain broken, restart)
  select (last_active_at at time zone 'Asia/Taipei')::date,
         coalesce(streak_count, 0)
    into v_last_active_date, v_streak
    from public.profiles
   where id = v_user_id
   for update;

  update public.profiles
     set last_active_at = v_now,
         streak_count = case
           when v_last_active_date is null         then 1
           when v_last_active_date = v_today       then greatest(v_streak, 1)
           when v_last_active_date = v_today - 1   then v_streak + 1
           else                                         1
         end,
         updated_at = v_now
   where id = v_user_id;

  -- Re-evaluate tier badges in case this push crossed a threshold.
  perform public.award_tier_badges(v_user_id);

  -- Roadmap-complete signal: any incomplete task left?
  select count(*) into v_remaining
    from public.user_tasks
   where user_id = v_user_id and is_completed = false;

  if v_remaining = 0 then
    return json_build_object(
      'success', true,
      'points_awarded', v_points,
      'task_id', p_task_id,
      'roadmap_complete', true
    );
  end if;

  return json_build_object(
    'success', true,
    'points_awarded', v_points,
    'task_id', p_task_id
  );
end;
$$ language plpgsql security definer;

-- Mirror: uncomplete_task should also keep streak/last_active_at sane
-- when the user un-ticks. We do NOT decrement streak on un-tick — the
-- user did the work for the day, even if they untick a sub-task.
-- Existing definition at points_ledger.sql:230 stays as-is; no change.
