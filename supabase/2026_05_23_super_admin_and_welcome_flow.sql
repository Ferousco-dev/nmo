-- =====================================================
-- Super-admin role + manual point awards + first-login
-- identity confirmation.
--
-- 1. is_super_admin flag on admin_users. Auto-granted to the
--    Skool user with handle 'jack-liu-9368'
--    (skool_user_id = '4d8844727da4477b8b17f919ac7cae70').
--    Trigger keeps it in sync — if Jack ever re-signs-in, his
--    profile row gets that user_id and we promote on the spot.
-- 2. admin_award_points(p_user_id, p_points, p_reason) RPC.
--    Gated on is_super_admin(); writes via the existing
--    add_points() helper with source='admin_grant'.
-- 3. skool_identity_confirmed_at on profiles. The /confirm-identity
--    page after first login stamps this; routing keys off it.
--
-- Idempotent.
-- =====================================================

-- Jack Liu's stable Skool user_id (visible in every post he authors).
-- If he ever loses the handle 'jack-liu-9368' this still works because
-- we key on user_id, not handle.
-- =====================================================

-- 1. is_super_admin column
alter table public.admin_users
  add column if not exists is_super_admin boolean not null default false;

-- 2. is_super_admin() helper — checks the calling auth.uid()
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users
     where user_id = auth.uid() and is_super_admin = true
  );
$$;

grant execute on function public.is_super_admin() to authenticated;

-- 3. profile column for first-login confirmation gate
alter table public.profiles
  add column if not exists skool_identity_confirmed_at timestamptz;

-- 4. Auto-grant trigger: any profile that gets Jack's skool_user_id
-- becomes an admin AND super-admin. Idempotent insert + update.
create or replace function public.grant_super_admin_if_jack()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.skool_user_id = '4d8844727da4477b8b17f919ac7cae70' then
    insert into public.admin_users (user_id, is_super_admin, notes)
    values (new.id, true, 'Auto-granted: skool_user_id matches Jack Liu')
    on conflict (user_id) do update
      set is_super_admin = true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_grant_super_admin_if_jack on public.profiles;
create trigger trg_grant_super_admin_if_jack
  after insert or update of skool_user_id on public.profiles
  for each row execute function public.grant_super_admin_if_jack();

-- 5. One-shot backfill: if Jack has already signed in, promote his row
do $$
declare v_uid uuid;
begin
  select id into v_uid from public.profiles
    where skool_user_id = '4d8844727da4477b8b17f919ac7cae70' limit 1;
  if v_uid is not null then
    insert into public.admin_users (user_id, is_super_admin, notes)
    values (v_uid, true, 'Backfill: Jack Liu identified by skool_user_id')
    on conflict (user_id) do update
      set is_super_admin = true;
  end if;
end $$;

-- 6. admin_award_points RPC — gated to super-admin only.
-- Uses existing add_points() helper, which bumps profiles.total_points
-- and writes a points_ledger row with source='admin_grant'.
create or replace function public.admin_award_points(
  p_user_id uuid,
  p_points  integer,
  p_reason  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'not_super_admin' using errcode = 'P0001';
  end if;
  if p_points = 0 then
    raise exception 'zero_points' using errcode = 'P0001';
  end if;
  if p_user_id is null then
    raise exception 'missing_user' using errcode = 'P0001';
  end if;

  perform public.add_points(
    p_user_id,
    p_points,
    'admin_grant',
    null,
    coalesce(p_reason, 'Manual award by super-admin')
  );
end;
$$;

grant execute on function public.admin_award_points(uuid, integer, text) to authenticated;

-- 7. Sanity check
select
  (select count(*) from public.admin_users where is_super_admin = true) as super_admins,
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='profiles'
       and column_name='skool_identity_confirmed_at')               as has_confirm_col,
  (select count(*) from pg_proc
     where proname='admin_award_points')                            as has_rpc;
