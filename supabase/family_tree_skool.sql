-- =====================================================
-- NMO Roadmap — Family-tree Skool deep-link
--
-- Adds skool_handle to family_tree so each leader card on
-- /family-tree can deep-link to https://www.skool.com/@<handle>,
-- where the user lands on the leader's Skool profile and can hit
-- "Send Message" directly.
--
-- Idempotent: safe to re-run.
-- =====================================================

alter table public.family_tree
  add column if not exists skool_handle text;

-- Optional seed: backfill the existing leaders (placeholder handles —
-- the client edits these in the Table Editor with real values).
-- Skipped via where-clause if a handle is already set.
update public.family_tree set skool_handle = 'jack-chen-nmo'   where name = 'Jack Chen'      and skool_handle is null;
update public.family_tree set skool_handle = 'sarah-lin-nmo'   where name = 'Sarah Lin'      and skool_handle is null;
update public.family_tree set skool_handle = 'michael-wang-nmo' where name = 'Michael Wang'   and skool_handle is null;
update public.family_tree set skool_handle = 'david-liu-nmo'   where name = 'David Liu'      and skool_handle is null;
update public.family_tree set skool_handle = 'emily-zhang-nmo' where name = 'Emily Zhang'    and skool_handle is null;
update public.family_tree set skool_handle = 'kevin-ho-nmo'    where name = 'Kevin Ho'       and skool_handle is null;
update public.family_tree set skool_handle = 'tina-wu-nmo'     where name = 'Tina Wu'        and skool_handle is null;
