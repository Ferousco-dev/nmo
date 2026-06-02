-- =====================================================
-- Atomic cooldown + bot_runs insert for /api/me/refresh-engagement.
--
-- The previous flow had a TOCTOU race:
--   1. route SELECTs bot_runs to check cooldown
--   2. route POSTs to Apify (slow)
--   3. route INSERTs the bot_runs row
-- Two parallel requests (login fire-and-forget + dashboard mount fire
-- arriving 40ms apart, observed in testing) both passed step 1, both
-- queued Apify runs, both inserted. Wasted an Apify run per double-fire.
--
-- This RPC replaces steps 1+3 with a single transaction-safe check-and-
-- insert. If a recent run exists, it RETURNS null without inserting.
-- The route then knows to skip the Apify call.
--
-- Note: we still can't make the Apify call itself transactional, but
-- by reserving the bot_runs slot first, the SECOND caller bails out
-- before paying the Apify cost.
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
  v_existing   public.bot_runs;
  v_new_id     uuid;
begin
  if v_handle = '' then
    raise exception 'missing_handle' using errcode = 'P0001';
  end if;

  -- Look for a recent run for this handle in engagement_events_apify mode.
  -- Lock the bot_runs table briefly to serialize concurrent callers.
  lock table public.bot_runs in share row exclusive mode;

  select * into v_existing
  from public.bot_runs
  where started_at >= v_cutoff
    and notes ->> 'mode' = 'engagement_events_apify'
    and lower(notes -> 'explicit_handles' ->> 0) = v_handle
  order by started_at desc
  limit 1;

  if found then
    -- Recent run exists — return cooldown info, don't insert
    return query select
      null::uuid                 as bot_run_id,
      true                       as cooldown_active,
      v_existing.id              as recent_run_id,
      v_existing.status          as recent_status;
    return;
  end if;

  -- Clear — reserve a slot now so concurrent callers bail out.
  -- The route then POSTs to Apify and uses an UPDATE to attach the
  -- apify_run_id. Apify-failed path can mark this row failed.
  insert into public.bot_runs (status, notes)
  values (
    'running',
    jsonb_build_object(
      'mode', 'engagement_events_apify',
      'batch_size', 1,
      'only_linked', true,
      'triggered_by', 'user_self_refresh',
      'explicit_handles', jsonb_build_array(v_handle),
      'apify_run_id', null  -- filled in by the route after apifyStartRun
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

revoke all on function public.reserve_engagement_run(text, integer) from public;
grant execute on function public.reserve_engagement_run(text, integer) to authenticated;

-- Sanity check
select proname from pg_proc where proname = 'reserve_engagement_run';
