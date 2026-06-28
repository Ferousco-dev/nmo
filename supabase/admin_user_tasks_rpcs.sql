-- =====================================================
-- Admin per-member roadmap editor — RPCs
--
-- Lets admins read/insert/update/delete any user's user_tasks rows.
-- All four functions are SECURITY DEFINER and gated by is_admin(),
-- so a regular signed-in user calling them gets 'forbidden'.
--
-- Safe to re-run.
-- =====================================================

-- ---------------------------------------------------------------------
-- 1. List a target user's roadmap, ordered by day then created time.
-- ---------------------------------------------------------------------
create or replace function public.admin_list_user_tasks(p_user_id uuid)
returns setof public.user_tasks
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  return query
    select * from public.user_tasks
     where user_id = p_user_id
     order by day_number, created_at;
end;
$$;

revoke all on function public.admin_list_user_tasks(uuid) from public;
grant execute on function public.admin_list_user_tasks(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Upsert a task. If the row id is null we treat it as an insert and
--    generate a unique task_id; otherwise we update the row in place.
-- ---------------------------------------------------------------------
create or replace function public.admin_upsert_user_task(
  p_id              uuid,
  p_user_id         uuid,
  p_day_number      integer,
  p_task_title      text,
  p_task_description text default null,
  p_skool_lesson_url text default null,
  p_task_id         text default null      -- explicit task_id, optional
)
returns public.user_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.user_tasks;
  v_task_id text;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  if p_user_id is null then
    raise exception 'user_id_required';
  end if;
  if p_day_number is null or p_day_number < 1 or p_day_number > 30 then
    raise exception 'invalid_day_number';
  end if;
  if p_task_title is null or length(trim(p_task_title)) = 0 then
    raise exception 'title_required';
  end if;

  if p_id is not null then
    -- UPDATE existing row.
    update public.user_tasks
       set day_number       = p_day_number,
           task_title       = p_task_title,
           task_description = p_task_description,
           skool_lesson_url = p_skool_lesson_url,
           task_id          = coalesce(p_task_id, task_id)
     where id = p_id
       and user_id = p_user_id
     returning * into v_row;
    if not found then
      raise exception 'task_not_found';
    end if;
    return v_row;
  end if;

  -- INSERT new row. Generate a unique task_id when caller omitted one.
  v_task_id := coalesce(
    p_task_id,
    'admin_' || p_day_number || '_' || substr(gen_random_uuid()::text, 1, 8)
  );
  insert into public.user_tasks (
    user_id, day_number, task_id, task_title, task_description, skool_lesson_url
  ) values (
    p_user_id, p_day_number, v_task_id, p_task_title, p_task_description, p_skool_lesson_url
  )
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.admin_upsert_user_task(uuid, uuid, integer, text, text, text, text) from public;
grant execute on function public.admin_upsert_user_task(uuid, uuid, integer, text, text, text, text)
  to authenticated;

-- ---------------------------------------------------------------------
-- 3. Delete a single task row. Returns the deleted row id.
-- ---------------------------------------------------------------------
create or replace function public.admin_delete_user_task(p_id uuid, p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  delete from public.user_tasks
   where id = p_id
     and user_id = p_user_id
   returning id into v_deleted;
  if v_deleted is null then
    raise exception 'task_not_found';
  end if;
  return v_deleted;
end;
$$;

revoke all on function public.admin_delete_user_task(uuid, uuid) from public;
grant execute on function public.admin_delete_user_task(uuid, uuid) to authenticated;
