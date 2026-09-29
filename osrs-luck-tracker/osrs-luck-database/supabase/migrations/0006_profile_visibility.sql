-- Phase: player-controlled visibility.
--
-- Two per-player settings, both set from the RuneLite plugin's config
-- through /update-settings (install_token checked):
--   profile_public      — when false, /get-player-luck?ign= answers 404
--                         exactly as for an unknown name. The player's own
--                         plugin still reads its drops with its token.
--   leaderboard_opt_in  — already existed (migration 0001), still opt-in.
--                         Only counts while profile_public is also true, so
--                         a leaderboard entry never links to a hidden profile.

alter table players
  add column profile_public boolean not null default true;

-- Appending a column is allowed by create or replace. Still security
-- definer and still not granted to anon/authenticated (migration 0003).
create or replace view public_players as
  select account_hash, ign, ign_history, leaderboard_opt_in, created_at, last_updated, profile_public
  from players;

create or replace view driest_obtained as
  select
    d.item_id,
    d.source_name,
    d.account_hash,
    p.ign,
    d.kc_received,
    d.date_received
  from collection_log_drops d
  join players p on p.account_hash = d.account_hash
  where p.leaderboard_opt_in = true
    and p.profile_public = true
  order by d.item_id, d.source_name, d.kc_received desc;

create or replace view driest_in_progress as
  select
    dr.item_id,
    dr.source_name,
    b.account_hash,
    p.ign,
    b.current_kc,
    coalesce(
      (select max(d.kc_received)
       from collection_log_drops d
       where d.account_hash = b.account_hash
         and d.item_id = dr.item_id
         and d.source_name = dr.source_name),
      0
    ) as last_drop_kc,
    b.current_kc - coalesce(
      (select max(d.kc_received)
       from collection_log_drops d
       where d.account_hash = b.account_hash
         and d.item_id = dr.item_id
         and d.source_name = dr.source_name),
      0
    ) as current_dry_streak
  from boss_kc b
  join players p on p.account_hash = b.account_hash
  join drop_rates dr on dr.source_name = b.boss_name
  where p.leaderboard_opt_in = true
    and p.profile_public = true
  order by dr.item_id, dr.source_name, current_dry_streak desc;
