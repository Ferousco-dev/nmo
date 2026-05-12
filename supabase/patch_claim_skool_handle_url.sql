-- =====================================================
-- Patch: extend claim_skool_handle to also set skool_url.
-- Original lives in engagement.sql (section 7). This is a drop-in
-- replacement — `create or replace` makes it idempotent.
-- =====================================================
create or replace function public.claim_skool_handle(
  p_handle text,
  p_display_name text,
  p_avatar_url text,
  p_membership_status text default 'pending',
  p_email_match text default 'unknown'
) returns json as $$
declare
  v_user_id uuid := auth.uid();
  v_normalized text := lower(trim(p_handle));
  v_existing record;
begin
  if v_user_id is null then
    return json_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if v_normalized is null or v_normalized = '' then
    return json_build_object('success', false, 'error', 'invalid_handle');
  end if;

  -- Check if another user already claimed this handle
  select id into v_existing
    from public.profiles
   where lower(skool_handle) = v_normalized
     and id <> v_user_id
   limit 1;

  if v_existing.id is not null then
    return json_build_object('success', false, 'error', 'handle_taken');
  end if;

  update public.profiles
     set skool_handle = v_normalized,
         skool_url = 'https://www.skool.com/@' || v_normalized,
         skool_display_name = coalesce(p_display_name, skool_display_name),
         skool_avatar_url = coalesce(p_avatar_url, skool_avatar_url),
         skool_verified_at = now(),
         skool_membership_status = coalesce(p_membership_status, 'pending'),
         skool_email_match = coalesce(p_email_match, 'unknown'),
         display_name = coalesce(p_display_name, v_normalized)
   where id = v_user_id;

  return json_build_object(
    'success', true,
    'handle', v_normalized,
    'display_name', p_display_name,
    'avatar_url', p_avatar_url,
    'membership_status', p_membership_status,
    'email_match', p_email_match
  );
end;
$$ language plpgsql security definer;
