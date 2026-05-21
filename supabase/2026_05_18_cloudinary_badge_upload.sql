-- =====================================================
-- Admin badge create/delete RPCs — backs the Cloudinary-powered
-- /admin/badges upload flow.
--
-- Idempotent: safe to re-run.
-- =====================================================

-- Create a new badge (admin-only). Caller pre-uploads the image to
-- Cloudinary and passes the resulting URL in p_image_url. Server-side
-- validation enforces unique key + valid category + admin auth.
create or replace function public.admin_create_badge(
  p_key text,
  p_name_en text,
  p_name_zh text,
  p_description_en text default null,
  p_description_zh text default null,
  p_icon text default null,
  p_image_url text default null,
  p_color text default null,
  p_category text default 'special',
  p_is_one_of_one boolean default false
) returns json as $$
declare
  v_admin uuid := auth.uid();
  v_id uuid;
  v_normalized_key text := lower(trim(p_key));
begin
  if v_admin is null or not public.is_admin(v_admin) then
    return json_build_object('success', false, 'error', 'not_admin');
  end if;

  if v_normalized_key is null or v_normalized_key = '' or
     p_name_en is null or trim(p_name_en) = '' or
     p_name_zh is null or trim(p_name_zh) = '' then
    return json_build_object('success', false, 'error', 'invalid_input');
  end if;

  if p_category not in ('tier','streak','milestone','event','special') then
    return json_build_object('success', false, 'error', 'invalid_category');
  end if;

  -- Refuse to create tier badges via this RPC — those are seeded.
  if p_category = 'tier' then
    return json_build_object('success', false, 'error', 'tier_badges_are_seeded');
  end if;

  if exists (select 1 from public.badges where key = v_normalized_key) then
    return json_build_object('success', false, 'error', 'key_taken');
  end if;

  insert into public.badges (
    key, name_en, name_zh, description_en, description_zh,
    icon, image_url, color, category, is_one_of_one,
    is_active, display_order
  ) values (
    v_normalized_key, trim(p_name_en), trim(p_name_zh),
    p_description_en, p_description_zh,
    p_icon, p_image_url, p_color, p_category, coalesce(p_is_one_of_one, false),
    true,
    -- New custom badges go to the end of the special-badge display order.
    coalesce((select max(display_order) + 1 from public.badges where category = p_category), 300)
  ) returning id into v_id;

  insert into public.admin_actions (admin_id, action_type, payload)
  values (v_admin, 'create_badge', jsonb_build_object(
    'badge_id', v_id, 'key', v_normalized_key, 'image_url', p_image_url
  ));

  return json_build_object('success', true, 'badge_id', v_id, 'key', v_normalized_key);
end;
$$ language plpgsql security definer;

revoke all on function public.admin_create_badge(text, text, text, text, text, text, text, text, text, boolean) from public;
grant execute on function public.admin_create_badge(text, text, text, text, text, text, text, text, text, boolean) to authenticated;

-- Soft-delete a badge (sets is_active=false). Keeps history intact so
-- existing user_badges rows still resolve. Tier badges cannot be
-- soft-deleted via this path.
create or replace function public.admin_soft_delete_badge(p_badge_key text)
returns json as $$
declare
  v_admin uuid := auth.uid();
  v_badge record;
begin
  if v_admin is null or not public.is_admin(v_admin) then
    return json_build_object('success', false, 'error', 'not_admin');
  end if;
  select id, category, is_active into v_badge from public.badges where key = p_badge_key;
  if v_badge.id is null then
    return json_build_object('success', false, 'error', 'badge_not_found');
  end if;
  if v_badge.category = 'tier' then
    return json_build_object('success', false, 'error', 'cannot_delete_tier');
  end if;
  update public.badges set is_active = false where id = v_badge.id;
  insert into public.admin_actions (admin_id, action_type, payload)
  values (v_admin, 'soft_delete_badge', jsonb_build_object('badge_key', p_badge_key));
  return json_build_object('success', true);
end;
$$ language plpgsql security definer;

revoke all on function public.admin_soft_delete_badge(text) from public;
grant execute on function public.admin_soft_delete_badge(text) to authenticated;
