-- Phase: KC snapshot on backfilled items.
--
-- A backfilled row still has no kc_received: which kill dropped the item
-- stays unknown. What the collection log page does show at import time
-- is the page's kill count and how many of the item the player has. The
-- pair supports a different, well-defined question ("how lucky is having
-- this many after this many kills?"), computed by snapshotLuck() in
-- _shared/calculations.ts and returned separately from `probability`.
--
-- Both columns are set together, only on backfilled rows, and only once:
-- /backfill-drop never overwrites a snapshot, because a later log read
-- would count copies that tracking has since recorded on its own.

alter table collection_log_drops
  add column snapshot_kc integer,
  add column snapshot_quantity integer;

alter table collection_log_drops
  add constraint collection_log_drops_snapshot_check
    check (
      (snapshot_kc is null and snapshot_quantity is null)
      or (
        is_backfilled
        and snapshot_kc >= 0
        and snapshot_quantity >= 1
      )
    );
