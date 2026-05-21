-- =====================================================
-- Open family_tree to anonymous SELECT so the welcome search can
-- surface NMO admins/leaders to visitors who haven't signed up yet.
--
-- Same approach as nmo_members ("readable by anyone"). Family-tree
-- contents are leadership info — name, role, region, public Skool
-- handle — already visible on skool.com/nmo, so no privacy delta.
--
-- Idempotent.
-- =====================================================

drop policy if exists "Family tree readable" on public.family_tree;
create policy "Family tree readable by anyone" on public.family_tree
  for select using (true);

-- Sanity check
select count(*) as family_tree_rows from public.family_tree;
