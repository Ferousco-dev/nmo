-- =====================================================
-- NMO Roadmap — admin-managed app settings + Apify writer RPC
-- =====================================================
-- Adds:
--   1. `app_settings` — single key/value store for admin-managed
--      integration credentials (apify_token, skool_email,
--      skool_password). Admins set/rotate via the new Integrations
--      card on /admin. Cleartext, RLS-locked to admins only — same
--      trust model as bot/.env on the host filesystem, just lives
--      somewhere the deployed app can read.
--   2. SECURITY DEFINER RPCs to set / get / list settings, gated by
--      public.is_admin().
--   3. `admin_upsert_nmo_members(jsonb)` — bulk upsert helper called
--      by the new /api/admin/bot/trigger-members-apify route after
--      pulling results from Apify. Avoids needing a service_role
--      client in the Next.js app (audit decision: keep service_role
--      out of the web tier).
--
-- Idempotent: safe to re-run.
-- =====================================================

-- 1. Table
create table if not exists public.app_settings (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

-- 2. RLS — admins only. Service role still has full access.
alter table public.app_settings enable row level security;

drop policy if exists "Admins read settings" on public.app_settings;
create policy "Admins read settings" on public.app_settings
  for select using (public.is_admin());

drop policy if exists "Admins write settings" on public.app_settings;
create policy "Admins write settings" on public.app_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- 3. Set a setting. Upserts on key.
create or replace function public.admin_set_setting(
  p_key text,
  p_value text
) returns void as $$
declare
  v_user_id uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  if p_key is null or length(trim(p_key)) = 0 then
    raise exception 'key_required';
  end if;
  if p_value is null then
    raise exception 'value_required';
  end if;

  insert into public.app_settings(key, value, updated_at, updated_by)
       values (p_key, p_value, now(), v_user_id)
  on conflict (key) do update
    set value = excluded.value,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;

  -- Audit-log the action — payload omits the secret value.
  insert into public.admin_actions(admin_id, action_type, payload)
       values (v_user_id, 'set_setting',
               jsonb_build_object('key', p_key, 'length', length(p_value)));
end;
$$ language plpgsql security definer;

revoke all on function public.admin_set_setting(text, text) from public;
grant execute on function public.admin_set_setting(text, text) to authenticated;

-- 4. Read a setting (full value). Server-side only — called by API
--    route handlers that have already verified admin via cookie session.
create or replace function public.admin_get_setting(p_key text)
returns text as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  return (select value from public.app_settings where key = p_key);
end;
$$ language plpgsql security definer stable;

revoke all on function public.admin_get_setting(text) from public;
grant execute on function public.admin_get_setting(text) to authenticated;

-- 5. List settings, returning ONLY metadata (no secret values).
--    Powers the Integrations card UI which shows "set ✓ · 3m ago" for
--    each known key without exposing the cleartext.
create or replace function public.admin_list_settings()
returns table (
  key text,
  last4 text,
  length integer,
  updated_at timestamptz,
  updated_by uuid
) as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  return query
    select s.key,
           right(s.value, 4) as last4,
           length(s.value)   as length,
           s.updated_at,
           s.updated_by
      from public.app_settings s
     order by s.key;
end;
$$ language plpgsql security definer stable;

revoke all on function public.admin_list_settings() from public;
grant execute on function public.admin_list_settings() to authenticated;

-- 6. Bulk upsert NMO members. Input is a JSONB array of objects with
--    keys: handle (required), display_name, avatar_url, level.
--    Returns the number of rows touched.
create or replace function public.admin_upsert_nmo_members(p_members jsonb)
returns integer as $$
declare
  v_count integer := 0;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  if jsonb_typeof(p_members) <> 'array' then
    raise exception 'members_must_be_array';
  end if;

  with rows as (
    select
      lower(trim(elem->>'handle'))                as handle,
      nullif(trim(elem->>'display_name'), '')     as display_name,
      nullif(trim(elem->>'avatar_url'), '')       as avatar_url,
      case when (elem->>'level') ~ '^\d+$'
           then (elem->>'level')::int
           else null end                          as level
    from jsonb_array_elements(p_members) elem
    where coalesce(trim(elem->>'handle'), '') <> ''
  ),
  upserted as (
    insert into public.nmo_members(handle, display_name, avatar_url, level, last_seen_at)
         select handle, display_name, avatar_url, level, now() from rows
    on conflict (handle) do update
       set display_name = coalesce(excluded.display_name, public.nmo_members.display_name),
           avatar_url   = coalesce(excluded.avatar_url,   public.nmo_members.avatar_url),
           level        = coalesce(excluded.level,        public.nmo_members.level),
           last_seen_at = excluded.last_seen_at
    returning 1
  )
  select count(*) into v_count from upserted;

  return v_count;
end;
$$ language plpgsql security definer;

revoke all on function public.admin_upsert_nmo_members(jsonb) from public;
grant execute on function public.admin_upsert_nmo_members(jsonb) to authenticated;
