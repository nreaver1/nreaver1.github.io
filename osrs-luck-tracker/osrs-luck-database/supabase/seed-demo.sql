-- Demo players for the live site (the home page links to Zezima,
-- Newscape and EmptyLogs). Safe to re-run: it deletes every demo player
-- first, which cascades to their drops, boss_kc and hunting_items rows.
--
--   npx supabase db query --linked -f supabase/seed-demo.sql
--
-- Demo account hashes start with "demo-". That prefix fails the
-- account_hash format check in _shared/http.ts, so nobody can register
-- as, or submit drops for, a demo player; get-player-luck also ranks a
-- real player above a demo one that shares its IGN.
--
-- They're all opted in to the leaderboard (leaderboard_opt_in) so it has
-- something to show; the site badges every demo account as "Demo".
--
-- Kill counts are picked to land each drop on a specific luck label
-- (flat rates: P = 1 - (1 - n/d)^(kc * rolls); spooned < 0.1,
-- dry > 0.8, desert > 0.99). The drop_rates table has no multi_roll or
-- unsupported rows yet, so the "not yet supported" state can't be seeded.

begin;

delete from players where account_hash like 'demo%';

insert into players (account_hash, ign, leaderboard_opt_in, created_at, last_updated) values
  ('demo-zezima',     'Zezima',     true,  now() - interval '200 days', now() - interval '200 days'),
  ('demo-newscape',   'Newscape',   true,  now() - interval '30 days',  now() - interval '30 days'),
  ('demo-emptylogs',  'EmptyLogs',  true,  now() - interval '5 days',   now() - interval '5 days'),
  ('demo-spoonfed',   'Spoonfed',   true,  now() - interval '90 days',  now() - interval '90 days'),
  ('demo-drybones',   'Dry Bones',  true,  now() - interval '365 days', now() - interval '365 days'),
  ('demo-backlogged', 'Backlogged', true,  now() - interval '14 days',  now() - interval '14 days');

-- kc_at_previous_drop = kc_received for a first drop, as ingest-drop does.
insert into collection_log_drops
  (account_hash, item_id, source_name, kc_received, kc_at_previous_drop, is_backfilled, date_received, date_submitted)
values
  -- Zezima: every label, exact and estimated, plus a backfilled item.
  ('demo-zezima',  4207, 'The Gauntlet',        12,    12,    false, now() - interval '150 days', now() - interval '150 days'), -- spooned
  ('demo-zezima', 11834, 'General Graardor',    30,    30,    false, now() - interval '140 days', now() - interval '140 days'), -- spooned
  ('demo-zezima', 19677, 'General Graardor',    15,    15,    false, now() - interval '135 days', now() - interval '135 days'), -- average
  ('demo-zezima', 11832, 'General Graardor',    508,   508,   false, now() - interval '100 days', now() - interval '100 days'), -- average
  ('demo-zezima', 11286, 'Vorkath',             9000,  9000,  false, now() - interval '60 days',  now() - interval '60 days'),  -- dry
  ('demo-zezima', 12816, 'Corporeal Beast',     25000, 25000, false, now() - interval '20 days',  now() - interval '20 days'),  -- desert
  ('demo-zezima', 20997, 'Chambers of Xeric',   1900,  1900,  false, now() - interval '40 days',  now() - interval '40 days'),  -- points_based (estimated)
  ('demo-zezima', 27283, 'Tombs of Amascut',    25,    25,    false, now() - interval '30 days',  now() - interval '30 days'),  -- streak_adjusted (estimated)
  ('demo-zezima', 29889, 'Amoxliatl',           null,  null,  true,  null,                        now() - interval '199 days'), -- backfilled

  -- Newscape: a small, all-average log.
  ('demo-newscape', 11812, 'General Graardor',  260,   260,   false, now() - interval '20 days',  now() - interval '20 days'),
  ('demo-newscape',  4207, 'The Gauntlet',      95,    95,    false, now() - interval '10 days',  now() - interval '10 days'),

  -- Spoonfed: everything early.
  ('demo-spoonfed', 12922, 'Zulrah',            20,    20,    false, now() - interval '80 days',  now() - interval '80 days'),
  ('demo-spoonfed', 21992, 'Vorkath',           90,    90,    false, now() - interval '60 days',  now() - interval '60 days'),
  ('demo-spoonfed', 13231, 'Cerberus',          15,    15,    false, now() - interval '45 days',  now() - interval '45 days'),
  ('demo-spoonfed', 12819, 'Corporeal Beast',   200,   200,   false, now() - interval '20 days',  now() - interval '20 days'),

  -- Dry Bones: everything late.
  ('demo-drybones', 12816, 'Corporeal Beast',   30000, 30000, false, now() - interval '300 days', now() - interval '300 days'), -- desert
  ('demo-drybones', 12004, 'Kraken',            1500,  1500,  false, now() - interval '200 days', now() - interval '200 days'), -- dry
  ('demo-drybones', 13200, 'Zulrah',            20000, 20000, false, now() - interval '100 days', now() - interval '100 days'), -- dry
  ('demo-drybones', 23757, 'The Gauntlet',      2400,  2400,  false, now() - interval '50 days',  now() - interval '50 days'),  -- average

  -- Backlogged: imported an existing log, one drop tracked since.
  ('demo-backlogged', 11832, 'General Graardor', null, null,  true,  null,                        now() - interval '14 days'),
  ('demo-backlogged', 11834, 'General Graardor', null, null,  true,  null,                        now() - interval '14 days'),
  ('demo-backlogged', 11836, 'General Graardor', null, null,  true,  null,                        now() - interval '14 days'),
  ('demo-backlogged',  4708, 'Barrows Chests',   null, null,  true,  null,                        now() - interval '14 days'),
  ('demo-backlogged',  4718, 'Barrows Chests',   null, null,  true,  null,                        now() - interval '14 days'),
  ('demo-backlogged', 13227, 'Cerberus',         700,  700,   false, now() - interval '3 days',   now() - interval '3 days');   -- average

-- Backlogged's log page snapshot at import (migration 0007): the page's
-- KC and each item's quantity, which get-player-luck rates as "k copies
-- after N kills". Zezima's Amoxliatl stays snapshot-free, like an import
-- from before snapshots existed.
update collection_log_drops d
set snapshot_kc = v.kc, snapshot_quantity = v.quantity
from (values
  (11832, 'General Graardor', 1100, 1), -- dry
  (11834, 'General Graardor', 1100, 3), -- average
  (11836, 'General Graardor', 1100, 2), -- average
  ( 4708, 'Barrows Chests',   200, 1),  -- average
  ( 4718, 'Barrows Chests',   200, 2)   -- spooned
) as v(item_id, source_name, kc, quantity)
where d.account_hash = 'demo-backlogged'
  and d.is_backfilled
  and d.item_id = v.item_id
  and d.source_name = v.source_name;

-- "Still hunting" rows (migration 0008): rated items whose log slot was
-- empty at the page's kill count. get-player-luck rates them with
-- huntingLuck(), P = 1 - (1 - n/d)^(kc * rolls).
insert into hunting_items (account_hash, item_id, source_name, kc) values
  ('demo-backlogged', 11812, 'General Graardor', 1100), -- Bandos hilt, dry
  ('demo-backlogged', 12650, 'General Graardor', 1100), -- pet, average
  ('demo-backlogged',  4734, 'Barrows Chests',   200),  -- Karil's crossbow, average
  ('demo-backlogged',  4726, 'Barrows Chests',   200),  -- Guthan's warspear, average
  ('demo-drybones',   12819, 'Corporeal Beast',  30420), -- Elysian sigil, desert
  ('demo-drybones',   12921, 'Zulrah',           20108); -- pet, desert

-- current_kc per boss at or above the highest drop kc, as the plugin reports.
insert into boss_kc (account_hash, boss_name, current_kc) values
  ('demo-zezima',     'The Gauntlet',      310),
  ('demo-zezima',     'General Graardor',  1120),
  ('demo-zezima',     'Vorkath',           9450),
  ('demo-zezima',     'Corporeal Beast',   25210),
  ('demo-zezima',     'Chambers of Xeric', 2050),
  ('demo-zezima',     'Tombs of Amascut',  415),
  ('demo-newscape',   'General Graardor',  301),
  ('demo-newscape',   'The Gauntlet',      112),
  ('demo-emptylogs',  'General Graardor',  18),
  ('demo-spoonfed',   'Zulrah',            64),
  ('demo-spoonfed',   'Vorkath',           140),
  ('demo-spoonfed',   'Cerberus',          38),
  ('demo-spoonfed',   'Corporeal Beast',   205),
  ('demo-drybones',   'Corporeal Beast',   30420),
  ('demo-drybones',   'Kraken',            1733),
  ('demo-drybones',   'Zulrah',            20108),
  ('demo-drybones',   'The Gauntlet',      2461),
  ('demo-backlogged', 'Cerberus',          712);

commit;
