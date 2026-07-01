-- =====================================================
-- reserve_engagement_run — v2
--
-- v1 treated ANY row in the cooldown window as blocking, including
-- stuck `running` rows that the reconciler hadn't yet flipped to
-- success/failed. In local dev (no Vercel Cron, admin doesn't open
-- /admin), those running rows pile up and lock the user out forever.
--
-- v2 only blocks on:
--   • status='success'                — real completed cooldown
--   • status='running' AND <5 min old — genuine in-flight, double-click guard
--
-- Anything `failed` or stuck-`running` (>5 min) is ignored.
--
-- Safe to re-run.
-- =====================================================

create or replace function public.reserve_engagement_run(
  p_handle           text,
  p_cooldown_minutes integer default 10
)
returns table (
  bot_run_id      uuid,
  cooldown_active boolean,
  recent_run_id   uuid,
  recent_status   text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handle     text := lower(trim(coalesce(p_handle, '')));
  v_cutoff     timestamptz := now() - make_interval(mins => p_cooldown_minutes);
  v_inflight_cutoff timestamptz := now() - make_interval(mins => 5);
  v_existing   public.bot_runs;
  v_new_id     uuid;
begin
  if v_handle = '' then
    raise exception 'missing_handle' using errcode = 'P0001';
  end if;

  lock table public.bot_runs in share row exclusive mode;

  -- Look for a BLOCKING run:
  --   completed (success) within the cooldown window, OR
  --   running, but young enough that it might actually still finish
  -- (5 min — well past Apify start-up; anything older is stuck)
  select * into v_existing
  from public.bot_runs
  where notes ->> 'mode' = 'engagement_events_apify'
    and lower(notes -> 'explicit_handles' ->> 0) = v_handle
    and (
         (status = 'success'  and started_at >= v_cutoff)
      or (status = 'running'  and started_at >= v_inflight_cutoff)
    )
  order by started_at desc
  limit 1;

  if found then
    return query select
      null::uuid                 as bot_run_id,
      true                       as cooldown_active,
      v_existing.id              as recent_run_id,
      v_existing.status          as recent_status;
    return;
  end if;

  -- Clear — reserve a slot.
  insert into public.bot_runs (status, notes)
  values (
    'running',
    jsonb_build_object(
      'mode', 'engagement_events_apify',
      'batch_size', 1,
      'only_linked', true,
      'triggered_by', 'user_self_refresh',
      'explicit_handles', jsonb_build_array(v_handle),
      'apify_run_id', null
    )
  )
  returning id into v_new_id;

  return query select
    v_new_id      as bot_run_id,
    false         as cooldown_active,
    null::uuid    as recent_run_id,
    null::text    as recent_status;
end;
$$;

-- Permissions unchanged from v1.
revoke all on function public.reserve_engagement_run(text, integer) from public;
grant execute on function public.reserve_engagement_run(text, integer)
  to authenticated;
