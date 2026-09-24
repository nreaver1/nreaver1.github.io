-- OSRS Collection Log Luck Tracker
-- Phase 1: Initial schema
-- Applies corrections from spec review: distribution_type, source_name in
-- drop uniqueness constraint, opt-in leaderboards, install tokens, sync log.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- players
-- ---------------------------------------------------------------------
create table players (
  account_hash        text primary key,
  ign                 text not null,
  ign_history         jsonb not null default '[]'::jsonb,
  install_token       uuid not null default gen_random_uuid() unique,
  leaderboard_opt_in  boolean not null default false,
  created_at          timestamptz not null default now(),
  last_updated        timestamptz not null default now()
);

create index idx_players_ign on players (lower(ign));

-- ---------------------------------------------------------------------
-- boss_kc
-- ---------------------------------------------------------------------
create table boss_kc (
  id           uuid primary key default gen_random_uuid(),
  account_hash text not null references players (account_hash) on delete cascade,
  boss_name    text not null,
  current_kc   integer not null check (current_kc >= 0),
  updated_at   timestamptz not null default now(),
  unique (account_hash, boss_name)
);

create index idx_boss_kc_account on boss_kc (account_hash);

-- ---------------------------------------------------------------------
-- drop_rates (static reference data, seeded/synced from the OSRS Wiki)
-- ---------------------------------------------------------------------
create type distribution_type as enum (
  'flat_geometric',
  'points_based',
  'streak_adjusted',
  'multi_roll',
  'unsupported'
);

create table drop_rates (
  item_id            integer not null,
  source_name        text not null,
  distribution_type  distribution_type not null default 'flat_geometric',
  denominator        integer not null check (denominator > 0),
  numerator          integer not null default 1 check (numerator > 0),
  rolls_per_kill     integer not null default 1 check (rolls_per_kill > 0),
  metadata           jsonb not null default '{}'::jsonb,
  source_updated_at  timestamptz not null default now(),
  primary key (item_id, source_name)
);

-- ---------------------------------------------------------------------
-- drop_rate_sync_log
-- ---------------------------------------------------------------------
create table drop_rate_sync_log (
  id                       uuid primary key default gen_random_uuid(),
  ran_at                   timestamptz not null default now(),
  items_updated            integer not null default 0,
  items_flagged_for_review integer not null default 0
);

alter table drop_rate_sync_log enable row level security;

-- Internal diagnostic table only — the sync script writes to it with the
-- secret key, and there's no product reason for anon/authenticated
-- clients to read or write it. No public policy at all, so it's
-- service_role-only by default (service_role bypasses RLS entirely).

-- ---------------------------------------------------------------------
-- collection_log_drops (the core flag)
-- ---------------------------------------------------------------------
create table collection_log_drops (
  id                    uuid primary key default gen_random_uuid(),
  account_hash          text not null references players (account_hash) on delete cascade,
  item_id               integer not null,
  source_name           text not null,
  kc_received           integer not null check (kc_received >= 0),
  kc_at_previous_drop   integer,
  roll_context          jsonb,
  date_received         timestamptz not null,
  date_submitted        timestamptz not null default now(),
  unique (account_hash, item_id, source_name, kc_received),
  foreign key (item_id, source_name) references drop_rates (item_id, source_name)
);

create index idx_drops_account on collection_log_drops (account_hash);
create index idx_drops_item_source on collection_log_drops (item_id, source_name);

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table players enable row level security;
alter table boss_kc enable row level security;
alter table collection_log_drops enable row level security;
alter table drop_rates enable row level security;

-- Public read of players is fine (IGN + opt-in flag only matter),
-- but install_token must never be readable by anon/public roles.
--
-- This view is intentionally security definer (the Postgres/Supabase
-- default — do NOT add `security_invoker = true` here). It exists
-- specifically to expose a safe column subset while `players` itself
-- stays fully row-locked (see players_no_direct_public_read below). If
-- this view were security_invoker, it would inherit that row lock and
-- return zero rows for anon/authenticated, breaking every player
-- lookup. The safety property that matters — install_token never
-- leaves this view — comes from the column list below, not from RLS.
create view public_players as
  select account_hash, ign, ign_history, leaderboard_opt_in, created_at, last_updated
  from players;

grant select on public_players to anon, authenticated;

create policy "players_no_direct_public_read"
  on players for select
  using (false); -- reads happen through public_players view / service role only

create policy "players_service_role_all"
  on players for all
  to service_role
  using (true)
  with check (true);

-- boss_kc / collection_log_drops: public read (needed for profile pages +
-- driest_in_progress leaderboard), writes only via service_role
-- (edge functions validate install_token before writing).
create policy "boss_kc_public_read"
  on boss_kc for select
  using (true);

create policy "boss_kc_service_role_write"
  on boss_kc for insert
  to service_role
  with check (true);

create policy "boss_kc_service_role_update"
  on boss_kc for update
  to service_role
  using (true)
  with check (true);

create policy "drops_public_read"
  on collection_log_drops for select
  using (true);

create policy "drops_service_role_write"
  on collection_log_drops for insert
  to service_role
  with check (true);

create policy "drop_rates_public_read"
  on drop_rates for select
  using (true);

create policy "drop_rates_service_role_write"
  on drop_rates for all
  to service_role
  using (true)
  with check (true);

-- ---------------------------------------------------------------------
-- Leaderboard views
-- NOTE: schema + queries are built here per spec, but no edge function
-- exposes these publicly yet (see supabase/functions/leaderboard).
-- driest_obtained: driest among players who HAVE the item.
-- driest_in_progress: current dry streak for players who don't have it yet.
-- Both are gated at the application layer, not the DB layer, so they're
-- ready to flip on without another migration.
--
-- Also intentionally security definer, same reasoning as public_players
-- above: both views join `players` directly to pull `ign`, and
-- `players` blocks all direct row access via RLS. security_invoker
-- would make these views inherit that block and return zero rows.
-- The `where p.leaderboard_opt_in = true` clause in each view is what
-- actually enforces the privacy boundary here, not RLS.
-- ---------------------------------------------------------------------
create view driest_obtained as
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
  order by d.item_id, d.source_name, d.kc_received desc;

create view driest_in_progress as
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
  order by dr.item_id, dr.source_name, current_dry_streak desc;

grant select on driest_obtained, driest_in_progress to authenticated, service_role;
-- Intentionally NOT granted to `anon` yet — flip this grant when the
-- leaderboard feature flag is turned on (see spec decisions log).
