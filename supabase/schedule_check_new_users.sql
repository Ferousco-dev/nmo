-- =====================================================
-- Schedule: call the check-new-users Edge Function daily at 8 PM Taipei (12:00 UTC)
--
-- Run this AFTER deploying the Edge Function and AFTER setting the
-- secrets in Vault (see comments at the bottom).
-- =====================================================

-- 1. Enable the extensions we need
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Vault: store the function URL + service role key + upsert secret
--    so the cron job can read them without hard-coding.
--    Run these one-by-one and replace the values:
--
--    select vault.create_secret('https://YOUR-PROJECT.supabase.co/functions/v1/check-new-users',
--           'check_new_users_url',
--           'URL of the check-new-users Edge Function');
--    select vault.create_secret('eyJ...service_role_jwt...',
--           'service_role_jwt',
--           'Supabase service role JWT for invoking edge functions');
--
-- (You only need to do this once. If you re-run the migration, the
--  secrets stay in place.)

-- 3. Schedule the daily call.
--    "0 12 * * *" = every day at 12:00 UTC = 20:00 Taipei (UTC+8).
--    If you want a different timezone, change the cron expression accordingly.
select cron.schedule(
  'check-new-users-daily',
  '0 12 * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'check_new_users_url'),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_jwt')
    )
  );
  $$
);

-- 4. Confirm the schedule is registered
-- select * from cron.job;

-- 5. Manually trigger once to test (optional)
-- select net.http_get(
--   url := (select decrypted_secret from vault.decrypted_secrets where name = 'check_new_users_url'),
--   headers := jsonb_build_object(
--     'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_jwt')
--   )
-- );

-- 6. To view the audit trail of past runs
-- select started_at, finished_at, status, posts_seen, events_inserted, error, notes
--   from public.bot_runs
--   order by started_at desc
--   limit 10;

-- 7. To unschedule (if you ever want to stop)
-- select cron.unschedule('check-new-users-daily');
