-- Phase: whole-page luck for pooled log pages.
--
-- On pages like Barrows Chests and Moons of Peril many items share one
-- drop rate, so rating them one by one repeats a single fact per item
-- ("206 chests, one copy" gives every piece the same number). Rating the
-- page instead asks two questions: how many uniques in total, and how
-- many different ones. Both need one consistent read of the page, which
-- this table holds: the latest read the plugin synced per page, with its
-- kill count, the obtained item ids and their quantities.
--
-- /sync-hunting writes it; get-player-luck computes pools from it
-- (_shared/pools.ts). kc only goes up, so an older read never replaces a
-- newer one.

create table log_pages (
  account_hash text not null references players (account_hash) on delete cascade,
  source_name  text not null,
  kc           integer not null check (kc > 0),
  obtained     integer[] not null default '{}',
  -- item id (as text) -> quantity, for obtained non-stackable items
  quantities   jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  primary key (account_hash, source_name)
);

-- Service role only, like every other player-linked table (migration 0003).
alter table log_pages enable row level security;
revoke all on log_pages from anon, authenticated;
