-- =====================================================
-- One-shot seed for the Skool auth_token (cookie JWT).
--
-- The trigger-skool-direct route and the dashboard's AutoSyncTickle
-- read this value from app_settings to call Skool's data routes.
--
-- Same place as skool_email / skool_password / apify_token —
-- key-value config table, RLS-locked to admins, service-role
-- bypass for server code.
--
-- Steps:
--   1. Open https://www.skool.com/nmo in your watcher Chrome session
--   2. DevTools → Application → Cookies → https://www.skool.com
--      → copy the `auth_token` value (long JWT starting `eyJhbGc…`)
--   3. Replace YOUR_JWT_HERE below with that value
--   4. Run this in the Supabase SQL editor
--
-- Idempotent: re-running just updates the value. Rotate every ~year
-- (or whenever the existing token starts returning 401).
-- =====================================================

insert into public.app_settings (key, value, updated_by, updated_at)
values ('skool_auth_token', 'JWT', null, now())
on conflict (key) do update set
  value      = excluded.value,
  updated_at = now();

-- Sanity check — should print 1 row with the right key and length
select
  key,
  length(value)            as token_length,
  right(value, 8)          as ends_with,
  updated_at
from public.app_settings
where key = 'skool_auth_token';
