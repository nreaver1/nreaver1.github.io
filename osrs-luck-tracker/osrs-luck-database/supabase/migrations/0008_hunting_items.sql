-- Phase: "still hunting" rows.
--
-- A collection log page shows its kill count and which slots are still
-- empty. An empty slot means the player has none of that item from any
-- source, so "N kills from this source and no drop yet" is a known fact,
-- and huntingLuck() in _shared/calculations.ts rates it as the chance a
-- fair-luck player would have had the drop by now.
--
-- One row per (account, item, source), holding the latest kill count the
-- plugin read. /sync-hunting only ever raises it, and removes a row when
-- the log shows the item obtained. get-player-luck also hides any row the
-- account has a drop recorded for, so a tracked drop takes over at once.

create table hunting_items (
  account_hash text not null references players (account_hash) on delete cascade,
  item_id      integer not null,
  source_name  text not null,
  kc           integer not null check (kc > 0),
  updated_at   timestamptz not null default now(),
  primary key (account_hash, item_id, source_name),
  foreign key (item_id, source_name) references drop_rates (item_id, source_name)
);

-- Service role only, like every other player-linked table (migration 0003).
alter table hunting_items enable row level security;
revoke all on hunting_items from anon, authenticated;
