-- Demo players for the live site (the home page links to Zezima,
-- Newscape and EmptyLogs). Safe to re-run: it deletes every demo player
-- first, which cascades to their drops and boss_kc rows.
--
--   npx supabase db query --linked -f supabase/seed-demo.sql
--
-- Demo account hashes start with "demo-". That prefix fails the
-- account_hash format check in _shared/http.ts, so nobody can register
-- as, or submit drops for, a demo player; get-player-luck also ranks a
-- real player above a demo one that shares its IGN.
--
-- Kill counts are picked to land each drop on a specific luck label
-- (flat rates: P = 1 - (1 - n/d)^(kc * rolls); spooned < 0.1,
-- dry > 0.8, desert > 0.99). The drop_rates table has no multi_roll or
-- unsupported rows yet, so the "not yet supported" state can't be seeded.

begin;

delete from players where account_hash like 'demo%';

insert into players (account_hash, ign, leaderboard_opt_in, created_at, last_updated) values
  ('demo-zezima',     'Zezima',     false, now() - interval '200 days', now() - interval '200 days'),
  ('demo-newscape',   'Newscape',   false, now() - interval '30 days',  now() - interval '30 days'),
  ('demo-emptylogs',  'EmptyLogs',  false, now() - interval '5 days',   now() - interval '5 days'),
  ('demo-spoonfed',   'Spoonfed',   false, now() - interval '90 days',  now() - interval '90 days'),
  ('demo-drybones',   'Dry Bones',  false, now() - interval '365 days', now() - interval '365 days'),
  ('demo-backlogged', 'Backlogged', false, now() - interval '14 days',  now() - interval '14 days');

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
