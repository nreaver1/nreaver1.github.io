-- Phase: manual backfill support.
--
-- Backfilled entries record "the player told us they already have this
-- item" with NO kc_received, since there is no way to recover which kill
-- produced an already-obtained item. is_backfilled is an explicit,
-- permanent flag — never inferred from kc_received being null alone —
-- so the distinction between "real, computed luck" and "we genuinely
-- don't know" can never get muddled by a future schema change.
--
-- Backfilled entries are created ONLY by explicit player action in the
-- plugin's side panel (picking an item from a dropdown and confirming),
-- never by automated game-state scraping. See the Phase — RuneLite
-- plugin notes for why: an automated scrape was considered and rejected
-- as too unreliable to build with confidence.

alter table collection_log_drops
  alter column kc_received drop not null;

alter table collection_log_drops
  drop constraint collection_log_drops_kc_received_check;

alter table collection_log_drops
  add constraint collection_log_drops_kc_received_check
    check (kc_received is null or kc_received >= 0);

alter table collection_log_drops
  alter column date_received drop not null;

alter table collection_log_drops
  add column is_backfilled boolean not null default false;

-- A backfilled entry has no kc_received to disambiguate against, so the
-- existing 4-column unique constraint (which includes kc_received)
-- would let the same item be backfilled twice — Postgres treats every
-- NULL as distinct for uniqueness purposes, so two NULL-kc_received
-- rows for the same item don't collide under that constraint. This
-- partial index closes that gap: one backfilled row per
-- (account_hash, item_id, source_name), enforced only when kc_received
-- is null, leaving the real-drop constraint above untouched.
create unique index idx_drops_backfilled_unique
  on collection_log_drops (account_hash, item_id, source_name)
  where kc_received is null;
