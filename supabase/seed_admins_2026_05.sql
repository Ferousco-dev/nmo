-- =====================================================
-- NMO admins seed — 2026-05
--
-- Captured from the live Skool admin/poster stream:
--   • 9 rows with full handle + display_name + avatar
--   • 8 rows with handle + avatar only (display_name still null)
--
-- The first member, Jack Liu (handle: jack-liu-9368), is treated as
-- the founder. The remaining 16 are admins / co-leads. The family_tree
-- placeholder rows from schema.sql are wiped and replaced.
--
-- Safe to re-run: upserts on conflict, deletes placeholders by handle.
--
-- Prereq: supabase/migrations_apify_sync.sql (adds profile_url column).
-- =====================================================

-- ---------------------------------------------------------------------
-- 1. Upsert into nmo_members so search / verify / family_tree all see
--    consistent rows. ON CONFLICT keeps the richer value of each field
--    (won't NULL out an existing display_name).
-- ---------------------------------------------------------------------
insert into public.nmo_members (handle, display_name, avatar_url, level, profile_url) values
  ('jack-liu-9368',        'Jack Liu🚀⭐',     'https://assets.skool.com/f/4d8844727da4477b8b17f919ac7cae70/12a617952af04d8b86301539cd377e3d5fd0987dc00844eda2b966d91ec3c6e2-sm.jpg', null, 'https://www.skool.com/@jack-liu-9368'),
  ('18794392',             'How Zheng',        'https://assets.skool.com/f/061eea8ac4024ab286a600dc93bec3c6/474814346fb848efb704d57cada4061c7dfb1e15dc3c481ba30d8ffc8c6c8b99-sm.jpg', null, null),
  ('20727043',             '吳 承翰',           'https://assets.skool.com/f/8633994b67474fdc9908317945a3f92d/dc26e7b1dd804e80b2ab7f813c0b64974a16efe3988a47fab27e4b196edb7432-sm.jpg', null, null),
  ('david-zheng-8909',     'Hhhow Zheng',      'https://assets.skool.com/f/714814f0398144f9916471683743f299/4d6c05096cdc49b2a3bb89dae0bf7a3f02f5b2c489824b029a0abfcae71c4d1b-sm.jpg', null, 'https://www.skool.com/@david-zheng-8909'),
  ('jay666',               'Jay Chang🚀',       'https://assets.skool.com/f/1efb44416f3b412fb11a076dc7ea4302/f0ee9d9a70574a338c3490b8fb5a6cc8bd09025dbbc54432937fb1f4ccda24ed-sm.jpg', null, 'https://www.skool.com/@jay666'),
  ('18307878',             'Oc Chang',         'https://assets.skool.com/f/b1fa5dffd6504d7ca99cb34236b128af/a1714052224b4371a0a38ef68b5ba77fa1b8af6f6c094a58a465e7510618f4ae-sm.jpg', null, null),
  ('ma-ine-2187',          'Ma Ine',           'https://assets.skool.com/f/63a35272925f40468d2acf64031597b8/4f1b3832cb82429a906a929b25a339aab1e39b5c78744722b5c6bd788ac27716-sm.jpg', null, 'https://www.skool.com/@ma-ine-2187'),
  ('aaron-5177',           'Aaron 子儀',        'https://assets.skool.com/f/4b64662fcb2945faa469d2de61ab47b8/b42d991d6a3b4371b1ed2bd9253d35bedd6de9f58ace443185dbf6975e5230ec-sm.jpg', null, 'https://www.skool.com/@aaron-5177'),
  ('michael-su-9638',      '小Michael Su 宮川', 'https://assets.skool.com/f/188b9c42d34d4f2ab676c224788b008f/f06623337a1e4efaba729221408329d69e704a927bf84eb197c6bb4eda05192f-sm.jpg', null, 'https://www.skool.com/@michael-su-9638'),
  -- Partial rows — display_name still null, will fill in on next Apify sync
  ('tsai-jay-8724',        null, 'https://assets.skool.com/f/8ad6212408dc40c398c60a7b0fa9f1c2/5388a173bfb842a9ab3a62f03e797fcaddfaacc0f61640d58513ab6882fec8ae-sm.jpg', null, 'https://www.skool.com/@tsai-jay-8724'),
  ('11964560',             null, 'https://assets.skool.com/f/5bc0d2a0bae04b7695c4c8695e2e668c/1defd9d4a61849dc8fb9bb4bf3b1927bb67c210550e840cd86fd7ebc23a1d776-sm.jpg', null, null),
  ('chen-jui-hsiang-1908', null, 'https://assets.skool.com/f/c65b2ccb9b1e431cb38dbb0caf7eb460/3a65115f8afe4c079be986543f489744ba86bb75bd374fe8b61f5ce2ad95d5db-sm.jpg', null, 'https://www.skool.com/@chen-jui-hsiang-1908'),
  ('leo-liu-2088',         null, 'https://assets.skool.com/f/bf9cbcf8131544bba59f7d07d23592f5/059c3aaaff464019a69032437412b9a5efde44397a4d44419662a32ded578316-sm.jpg', null, 'https://www.skool.com/@leo-liu-2088'),
  ('li-wei-chi-7787',      null, 'https://assets.skool.com/f/772975662d0d43c1bdf2675d2cccb622/c06a0baac28349f9bf39e5ba0654b77c7ce8c70f379c434e94835da8b162fc4f-sm.jpg', null, 'https://www.skool.com/@li-wei-chi-7787'),
  ('eason-4560',           null, 'https://assets.skool.com/f/7318511dc3bc46fca64797f66bf8d40d/7ea0c3efdeff4b02ad11ecb4d24f15c91acf220f96614c58959b25887a80424e-sm.jpg', null, 'https://www.skool.com/@eason-4560'),
  ('neo-chou-6177',        null, 'https://assets.skool.com/f/eb23b80b9a214a4b93552e23efa2648e/7ced872b43be4a31bbbfe57c2f8de15694565dea01244b5ba4df25496a22a1d8-sm.jpg', null, 'https://www.skool.com/@neo-chou-6177'),
  ('chen-phoenix-7623',    null, 'https://assets.skool.com/f/a347e3f6439e45839d4c24ed2060b6c5/0bf2de12d3bb449fbbdcf055752aa0b39faef602dad94505900eb4b537907709', null, 'https://www.skool.com/@chen-phoenix-7623')
on conflict (handle) do update
set
  display_name = coalesce(excluded.display_name, public.nmo_members.display_name),
  avatar_url   = coalesce(excluded.avatar_url,   public.nmo_members.avatar_url),
  level        = coalesce(excluded.level,        public.nmo_members.level),
  profile_url  = coalesce(excluded.profile_url,  public.nmo_members.profile_url),
  last_seen_at = now();

-- ---------------------------------------------------------------------
-- 2. Wipe the placeholder leaders that shipped in schema.sql so the
--    family tree page renders real Skool admins only.
-- ---------------------------------------------------------------------
delete from public.family_tree
where name in (
  'Jack Chen', 'Sarah Lin', 'Michael Wang', 'David Liu',
  'Emily Zhang', 'Kevin Ho', 'Tina Wu'
);

-- ---------------------------------------------------------------------
-- 3. Seed real admins into family_tree. The page joins nmo_members on
--    skool_handle for live avatar/name, so even partial rows (where
--    display_name is null today) will render correctly the moment the
--    next Apify sync fills the missing fields.
--
--    Roles used:
--      'CEO / Founder' — Jack Liu (treated as the "Jack Lee" founder)
--      'Admin'         — everyone else
--
--    NOTE: if "Jack Lee" is a different handle than jack-liu-9368, just
--    update the row below with the right handle/name.
-- ---------------------------------------------------------------------
delete from public.family_tree where skool_handle in (
  'jack-liu-9368','18794392','20727043','david-zheng-8909','jay666',
  '18307878','ma-ine-2187','aaron-5177','michael-su-9638',
  'tsai-jay-8724','11964560','chen-jui-hsiang-1908','leo-liu-2088',
  'li-wei-chi-7787','eason-4560','neo-chou-6177','chen-phoenix-7623'
);

insert into public.family_tree (name, role, region, skool_handle, photo_url, bio, display_order) values
  ('Jack Liu',         'CEO / Founder', 'Global', 'jack-liu-9368',        'https://assets.skool.com/f/4d8844727da4477b8b17f919ac7cae70/12a617952af04d8b86301539cd377e3d5fd0987dc00844eda2b966d91ec3c6e2-sm.jpg', '創辦人，NMO 社群的主理人。', 1),
  ('How Zheng',        'Admin', 'Global', '18794392',             'https://assets.skool.com/f/061eea8ac4024ab286a600dc93bec3c6/474814346fb848efb704d57cada4061c7dfb1e15dc3c481ba30d8ffc8c6c8b99-sm.jpg', null, 10),
  ('吳 承翰',           'Admin', 'Global', '20727043',             'https://assets.skool.com/f/8633994b67474fdc9908317945a3f92d/dc26e7b1dd804e80b2ab7f813c0b64974a16efe3988a47fab27e4b196edb7432-sm.jpg', null, 11),
  ('Hhhow Zheng',      'Admin', 'Global', 'david-zheng-8909',     'https://assets.skool.com/f/714814f0398144f9916471683743f299/4d6c05096cdc49b2a3bb89dae0bf7a3f02f5b2c489824b029a0abfcae71c4d1b-sm.jpg', null, 12),
  ('Jay Chang',        'Admin', 'Global', 'jay666',               'https://assets.skool.com/f/1efb44416f3b412fb11a076dc7ea4302/f0ee9d9a70574a338c3490b8fb5a6cc8bd09025dbbc54432937fb1f4ccda24ed-sm.jpg', null, 13),
  ('Oc Chang',         'Admin', 'Global', '18307878',             'https://assets.skool.com/f/b1fa5dffd6504d7ca99cb34236b128af/a1714052224b4371a0a38ef68b5ba77fa1b8af6f6c094a58a465e7510618f4ae-sm.jpg', null, 14),
  ('Ma Ine',           'Admin', 'Global', 'ma-ine-2187',          'https://assets.skool.com/f/63a35272925f40468d2acf64031597b8/4f1b3832cb82429a906a929b25a339aab1e39b5c78744722b5c6bd788ac27716-sm.jpg', null, 15),
  ('Aaron 子儀',        'Admin', 'Global', 'aaron-5177',           'https://assets.skool.com/f/4b64662fcb2945faa469d2de61ab47b8/b42d991d6a3b4371b1ed2bd9253d35bedd6de9f58ace443185dbf6975e5230ec-sm.jpg', null, 16),
  ('小Michael Su 宮川',  'Admin', 'Global', 'michael-su-9638',      'https://assets.skool.com/f/188b9c42d34d4f2ab676c224788b008f/f06623337a1e4efaba729221408329d69e704a927bf84eb197c6bb4eda05192f-sm.jpg', null, 17),
  ('Tsai Jay',         'Admin', 'Global', 'tsai-jay-8724',        'https://assets.skool.com/f/8ad6212408dc40c398c60a7b0fa9f1c2/5388a173bfb842a9ab3a62f03e797fcaddfaacc0f61640d58513ab6882fec8ae-sm.jpg', null, 18),
  ('Bruce Tseng',      'Admin', 'Global', '11964560',             'https://assets.skool.com/f/5bc0d2a0bae04b7695c4c8695e2e668c/1defd9d4a61849dc8fb9bb4bf3b1927bb67c210550e840cd86fd7ebc23a1d776-sm.jpg', null, 19),
  ('Chen Jui-Hsiang',  'Admin', 'Global', 'chen-jui-hsiang-1908', 'https://assets.skool.com/f/c65b2ccb9b1e431cb38dbb0caf7eb460/3a65115f8afe4c079be986543f489744ba86bb75bd374fe8b61f5ce2ad95d5db-sm.jpg', null, 20),
  ('Leo Liu',          'Admin', 'Global', 'leo-liu-2088',         'https://assets.skool.com/f/bf9cbcf8131544bba59f7d07d23592f5/059c3aaaff464019a69032437412b9a5efde44397a4d44419662a32ded578316-sm.jpg', null, 21),
  ('Li Wei-Chi',       'Admin', 'Global', 'li-wei-chi-7787',      'https://assets.skool.com/f/772975662d0d43c1bdf2675d2cccb622/c06a0baac28349f9bf39e5ba0654b77c7ce8c70f379c434e94835da8b162fc4f-sm.jpg', null, 22),
  ('Eason',            'Admin', 'Global', 'eason-4560',           'https://assets.skool.com/f/7318511dc3bc46fca64797f66bf8d40d/7ea0c3efdeff4b02ad11ecb4d24f15c91acf220f96614c58959b25887a80424e-sm.jpg', null, 23),
  ('Neo Chou',         'Admin', 'Global', 'neo-chou-6177',        'https://assets.skool.com/f/eb23b80b9a214a4b93552e23efa2648e/7ced872b43be4a31bbbfe57c2f8de15694565dea01244b5ba4df25496a22a1d8-sm.jpg', null, 24),
  ('Chen Phoenix',     'Admin', 'Global', 'chen-phoenix-7623',    'https://assets.skool.com/f/a347e3f6439e45839d4c24ed2060b6c5/0bf2de12d3bb449fbbdcf055752aa0b39faef602dad94505900eb4b537907709', null, 25);
