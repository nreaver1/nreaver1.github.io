-- Phase: raid tracking for Chambers of Xeric and Theatre of Blood, the
-- same way as Tombs of Amascut (migration 0011). Each raid's log page
-- becomes its single drop_rates source, with its modes (Challenge Mode;
-- Entry and Hard Mode) as counters on it, and its uniques, pet and
-- mode-only extras are rated raid by raid (_shared/cox.ts, tob.ts).

-- CoX points run far past ToA's: a big team's personal points can pass
-- 100,000. The per-raid limit lives in _shared/raids.ts.
alter table raid_completions drop constraint if exists raid_completions_personal_points_check;
alter table raid_completions
  add constraint raid_completions_personal_points_check check (personal_points between 0 and 5000000);

-- Move drops and hunting rows from the mode sources to the page, keeping
-- the mode in roll_context. A row the page already has wins.
delete from collection_log_drops m
  using collection_log_drops p
  where m.account_hash = p.account_hash
    and m.item_id = p.item_id
    and (m.source_name, p.source_name) in (
      ('Chambers of Xeric Challenge Mode', 'Chambers of Xeric'),
      ('Theatre of Blood: Hard Mode', 'Theatre of Blood'))
    and (m.kc_received = p.kc_received or (m.kc_received is null and p.kc_received is null));

update collection_log_drops
  set source_name = 'Chambers of Xeric',
      roll_context = coalesce(roll_context, '{}'::jsonb) || '{"mode": "challenge"}'::jsonb
  where source_name = 'Chambers of Xeric Challenge Mode';
update collection_log_drops
  set source_name = 'Theatre of Blood',
      roll_context = coalesce(roll_context, '{}'::jsonb) || '{"mode": "hard"}'::jsonb
  where source_name = 'Theatre of Blood: Hard Mode';

delete from hunting_items m
  using hunting_items p
  where m.account_hash = p.account_hash
    and m.item_id = p.item_id
    and (m.source_name, p.source_name) in (
      ('Chambers of Xeric Challenge Mode', 'Chambers of Xeric'),
      ('Theatre of Blood: Hard Mode', 'Theatre of Blood'));
update hunting_items set source_name = 'Chambers of Xeric' where source_name = 'Chambers of Xeric Challenge Mode';
update hunting_items set source_name = 'Theatre of Blood' where source_name = 'Theatre of Blood: Hard Mode';

delete from drop_rates where source_name in ('Chambers of Xeric Challenge Mode', 'Theatre of Blood: Hard Mode');

-- Rated by the raid models. data/manual_drop_rates.json holds the same
-- rows; this sets them without a reload. The Challenge Mode and Hard Mode
-- extras, and Lil' Zik, become points_based so no flat rate over every
-- mode's completions is applied to them (a backlog snapshot, say).
update drop_rates
  set metadata = metadata || '{"raid_model": "cox"}'::jsonb
  where source_name = 'Chambers of Xeric'
    and item_id in (21034, 21079, 21000, 21012, 21015, 21018, 21021, 21024, 13652, 21003, 21043, 20997, 20851);
update drop_rates
  set distribution_type = 'points_based', numerator = 1, denominator = 75,
      metadata = '{"avg_points_per_activity": 1, "points_per_roll": 1, "raid_model": "cox"}'::jsonb
  where source_name = 'Chambers of Xeric' and item_id = 24670;
update drop_rates
  set distribution_type = 'points_based', numerator = 1, denominator = 400,
      metadata = '{"avg_points_per_activity": 1, "points_per_roll": 1, "raid_model": "cox"}'::jsonb
  where source_name = 'Chambers of Xeric' and item_id = 22386;

update drop_rates
  set metadata = metadata || '{"raid_model": "tob"}'::jsonb
  where source_name = 'Theatre of Blood'
    and item_id in (22477, 22324, 22481, 22326, 22327, 22328, 22486);
update drop_rates
  set distribution_type = 'points_based', numerator = 1, denominator = v.denominator,
      metadata = '{"avg_points_per_activity": 1, "points_per_roll": 1, "raid_model": "tob"}'::jsonb
  from (values (22473, 650), (25742, 100), (25744, 150), (25746, 275)) as v (item_id, denominator)
  where drop_rates.source_name = 'Theatre of Blood' and drop_rates.item_id = v.item_id;
