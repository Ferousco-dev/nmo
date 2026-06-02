-- =====================================================
-- admin_update_badge_image — let super-admin replace any badge's
-- artwork (including the seeded tier badges Newbie → Champion).
--
-- Client wants to swap the AI-generated icons for his own uploaded
-- images. BadgeCard already prefers `image_url` over the Lucide
-- icon, so populating the column is enough — no UI rerender needed.
--
-- Pass p_image_url = null to clear (falls back to Lucide icon).
--
-- Gated on is_super_admin() per the same model as admin_award_points.
-- =====================================================

create or replace function public.admin_update_badge_image(
  p_badge_id  uuid,
  p_image_url text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_existing public.badges;
begin
  if v_admin is null or not public.is_super_admin() then
    raise exception 'not_super_admin' using errcode = 'P0001';
  end if;
  if p_badge_id is null then
    raise exception 'missing_badge_id' using errcode = 'P0001';
  end if;

  select * into v_existing from public.badges where id = p_badge_id;
  if not found then
    raise exception 'badge_not_found' using errcode = 'P0001';
  end if;

  update public.badges
     set image_url = p_image_url,
         updated_at = now()
   where id = p_badge_id;

  -- Audit row in admin_actions so the change shows up in the bot log.
  -- Column names match admin.sql: (admin_id, action_type, payload).
  -- 'update_badge_image' must be in the admin_actions_action_type_check
  -- constraint, which is extended in 2026_05_23_secure_skool_session_and_audit.sql.
  insert into public.admin_actions (admin_id, action_type, payload)
  values (
    v_admin,
    'update_badge_image',
    jsonb_build_object(
      'badge_id', p_badge_id,
      'key', v_existing.key,
      'old_image_url', v_existing.image_url,
      'new_image_url', p_image_url
    )
  );

  return json_build_object(
    'success', true,
    'badge_id', p_badge_id,
    'image_url', p_image_url
  );
end;
$$;

revoke all on function public.admin_update_badge_image(uuid, text) from public;
grant execute on function public.admin_update_badge_image(uuid, text) to authenticated;

-- Sanity check
select proname, proargnames
from pg_proc
where proname = 'admin_update_badge_image';
