-- Phase: raid tracking, starting with Tombs of Amascut.
--
-- A raid's drop chances depend on the raid: ToA's purple chance comes
-- from the raid level and the player's points, its jewels and thread from
-- how many raids (any mode) went by without one. One assumed "typical"
-- raid per mode can't rate that, so the plugin now records every
-- completion it sees, and get-player-luck rates raid drops over that
-- history (_shared/raids.ts, toa.ts, raid-luck.ts). Raids from before
-- tracking started still count, using per-mode assumptions.
--
-- mode_counts holds the game's completion count for every mode right
-- after the raid ({"entry": 5, "normal": 21, "expert": 0}), read from the
-- client's own counters, and total_kc their sum. For raid drops,
-- collection_log_drops.kc_received is now that total, with
-- roll_context = { mode, mode_counts, raid_id }.

create table raid_completions (
  id              uuid primary key default gen_random_uuid(),
  account_hash    text not null references players (account_hash) on delete cascade,
  raid            text not null,   -- the log page: 'Tombs of Amascut'
  mode            text not null,   -- 'entry' | 'normal' | 'expert'
  mode_kc         integer not null check (mode_kc > 0),
  total_kc        integer not null check (total_kc >= mode_kc),
  mode_counts     jsonb not null,
  team_size       integer check (team_size between 1 and 8),
  -- The player's own points, without the 5,000 every raid starts with
  -- (ToA's TOA_PERSONAL_CONTRIBUTION). Team totals never reach the client.
  personal_points integer check (personal_points between 0 and 64000),
  purple          boolean,         -- a unique dropped for the team; null = not seen
  purple_mine     boolean,         -- ...and it was this player's
  details         jsonb not null default '{}'::jsonb, -- ToA: { raid_level }
  completed_at    timestamptz not null,
  submitted_at    timestamptz not null default now(),
  unique (account_hash, raid, mode, mode_kc),
  check (purple_mine is not true or purple is true)
);

create index idx_raid_completions_account on raid_completions (account_hash, raid, total_kc);

-- Service role only, like every other player-linked table (migration 0003).
alter table raid_completions enable row level security;
revoke all on raid_completions from anon, authenticated;

-- One source per raid log page. Expert Mode had its own copy of every ToA
-- rate; each raid's level now says what the old split approximated.
update collection_log_drops set source_name = 'Tombs of Amascut'
  where source_name = 'Tombs of Amascut: Expert Mode';
update hunting_items set source_name = 'Tombs of Amascut'
  where source_name = 'Tombs of Amascut: Expert Mode';
delete from drop_rates where source_name = 'Tombs of Amascut: Expert Mode';

-- Rated by the raid model rather than the old fixed-raid approximation.
update drop_rates
  set metadata = metadata || '{"raid_model": "toa"}'::jsonb
  where source_name = 'Tombs of Amascut'
    and item_id in (26219, 25975, 25985, 27226, 27229, 27232, 27277, 27352, 27279, 27283, 27285, 27289, 30893);
