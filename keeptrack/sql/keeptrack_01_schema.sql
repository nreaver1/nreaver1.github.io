-- ============================================================
-- Keep Track — Schema Migration
-- Run this first in the Supabase SQL Editor
-- ============================================================

-- ─────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────
create extension if not exists "uuid-ossp";


-- ─────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────
create type group_role      as enum ('admin', 'member');
create type scoring_type    as enum ('win_loss', 'numeric');
create type audit_action    as enum ('edit', 'delete');


-- ─────────────────────────────────────────
-- PROFILES
-- Extends auth.users — one row per user
-- ─────────────────────────────────────────
create table profiles (
  id           uuid        primary key references auth.users(id) on delete cascade,
  username     varchar(50) not null unique,
  email        varchar(255) not null,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);


-- ─────────────────────────────────────────
-- GROUPS
-- ─────────────────────────────────────────
create table groups (
  id           uuid        primary key default uuid_generate_v4(),
  name         varchar(100) not null,
  description  text,
  owner_id     uuid        not null references profiles(id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);


-- ─────────────────────────────────────────
-- GROUP MEMBERS
-- ─────────────────────────────────────────
create table group_members (
  id           uuid        primary key default uuid_generate_v4(),
  group_id     uuid        not null references groups(id) on delete cascade,
  user_id      uuid        not null references profiles(id) on delete cascade,
  role         group_role  not null default 'member',
  joined_at    timestamptz not null default now(),
  unique (group_id, user_id)
);


-- ─────────────────────────────────────────
-- GROUP INVITES
-- ─────────────────────────────────────────
create table group_invites (
  id           uuid        primary key default uuid_generate_v4(),
  group_id     uuid        not null references groups(id) on delete cascade,
  created_by   uuid        not null references profiles(id) on delete cascade,
  token        varchar(64) not null unique,
  expires_at   timestamptz not null default (now() + interval '7 days'),
  revoked      boolean     not null default false,
  created_at   timestamptz not null default now()
);


-- ─────────────────────────────────────────
-- GAME TYPES
-- is_preset = true  → global preset (group_id is null)
-- is_preset = false → custom group game
-- ─────────────────────────────────────────
create table game_types (
  id            uuid          primary key default uuid_generate_v4(),
  group_id      uuid          references groups(id) on delete cascade,
  name          varchar(100)  not null,
  description   text,
  category      varchar(50),
  scoring_type  scoring_type  not null default 'win_loss',
  allows_draws  boolean       not null default false,
  default_format varchar(20),        -- e.g. '1v1', 'FFA', '2v2', 'Team'
  is_preset     boolean       not null default false,
  created_by    uuid          references profiles(id) on delete set null,
  created_at    timestamptz   not null default now()
);


-- ─────────────────────────────────────────
-- GAMES
-- A single match/session
-- ─────────────────────────────────────────
create table games (
  id            uuid        primary key default uuid_generate_v4(),
  group_id      uuid        not null references groups(id) on delete cascade,
  game_type_id  uuid        not null references game_types(id) on delete restrict,
  logged_by     uuid        not null references profiles(id) on delete restrict,
  played_at     timestamptz not null default now(),
  is_draw       boolean     not null default false,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);


-- ─────────────────────────────────────────
-- GAME TEAMS
-- FFA = one row per player (team of 1)
-- Team game = one row per side, multiple players share it
-- ─────────────────────────────────────────
create table game_teams (
  id           uuid        primary key default uuid_generate_v4(),
  game_id      uuid        not null references games(id) on delete cascade,
  team_label   varchar(50),           -- e.g. 'Team A', 'Red', or null for FFA
  is_winner    boolean     not null default false,
  score        numeric
);


-- ─────────────────────────────────────────
-- GAME PARTICIPANTS
-- Links a player to a team within a game
-- ─────────────────────────────────────────
create table game_participants (
  id            uuid  primary key default uuid_generate_v4(),
  game_id       uuid  not null references games(id) on delete cascade,
  game_team_id  uuid  not null references game_teams(id) on delete cascade,
  user_id       uuid  not null references profiles(id) on delete restrict,
  unique (game_id, user_id)
);


-- ─────────────────────────────────────────
-- AUDIT LOG
-- Tracks admin edits and deletions
-- ─────────────────────────────────────────
create table audit_log (
  id            uuid          primary key default uuid_generate_v4(),
  action        audit_action  not null,
  table_name    varchar(50)   not null,
  record_id     uuid          not null,
  changed_by    uuid          not null references profiles(id) on delete restrict,
  previous_data jsonb,
  changed_at    timestamptz   not null default now()
);


-- ─────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────
create index idx_group_members_group   on group_members(group_id);
create index idx_group_members_user    on group_members(user_id);
create index idx_group_invites_token   on group_invites(token);
create index idx_game_types_group      on game_types(group_id);
create index idx_games_group           on games(group_id);
create index idx_games_type            on games(game_type_id);
create index idx_games_played_at       on games(played_at);
create index idx_game_teams_game       on game_teams(game_id);
create index idx_game_participants_game  on game_participants(game_id);
create index idx_game_participants_user  on game_participants(user_id);
create index idx_audit_log_record      on audit_log(record_id);


-- ─────────────────────────────────────────
-- UPDATED_AT TRIGGER
-- ─────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

create trigger trg_groups_updated_at
  before update on groups
  for each row execute function set_updated_at();

create trigger trg_games_updated_at
  before update on games
  for each row execute function set_updated_at();


-- ─────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────
alter table profiles          enable row level security;
alter table groups            enable row level security;
alter table group_members     enable row level security;
alter table group_invites     enable row level security;
alter table game_types        enable row level security;
alter table games             enable row level security;
alter table game_teams        enable row level security;
alter table game_participants enable row level security;
alter table audit_log         enable row level security;

-- Profiles: users can read all profiles, only edit their own
create policy "profiles_select" on profiles
  for select using (true);

create policy "profiles_update" on profiles
  for update using (auth.uid() = id);

-- Groups: only members can see a group
create policy "groups_select" on groups
  for select using (
    exists (
      select 1 from group_members
      where group_members.group_id = groups.id
        and group_members.user_id = auth.uid()
    )
  );

create policy "groups_insert" on groups
  for insert with check (auth.uid() = owner_id);

create policy "groups_update" on groups
  for update using (
    exists (
      select 1 from group_members
      where group_members.group_id = groups.id
        and group_members.user_id = auth.uid()
        and group_members.role = 'admin'
    )
  );

-- Group members: visible to group members only
create policy "group_members_select" on group_members
  for select using (
    exists (
      select 1 from group_members gm
      where gm.group_id = group_members.group_id
        and gm.user_id = auth.uid()
    )
  );

-- Group invites: token lookup is public (for join flow); management requires membership
create policy "group_invites_select_by_token" on group_invites
  for select using (true);

create policy "group_invites_insert" on group_invites
  for insert with check (
    exists (
      select 1 from group_members
      where group_members.group_id = group_invites.group_id
        and group_members.user_id = auth.uid()
    )
  );

-- Game types: visible to group members; presets visible to all
create policy "game_types_select" on game_types
  for select using (
    is_preset = true
    or exists (
      select 1 from group_members
      where group_members.group_id = game_types.group_id
        and group_members.user_id = auth.uid()
    )
  );

-- Games: visible to group members
create policy "games_select" on games
  for select using (
    exists (
      select 1 from group_members
      where group_members.group_id = games.group_id
        and group_members.user_id = auth.uid()
    )
  );

create policy "games_insert" on games
  for insert with check (
    exists (
      select 1 from group_members
      where group_members.group_id = games.group_id
        and group_members.user_id = auth.uid()
    )
  );

-- Games: only admins can update or delete
create policy "games_update" on games
  for update using (
    exists (
      select 1 from group_members
      where group_members.group_id = games.group_id
        and group_members.user_id = auth.uid()
        and group_members.role = 'admin'
    )
  );

create policy "games_delete" on games
  for delete using (
    exists (
      select 1 from group_members
      where group_members.group_id = games.group_id
        and group_members.user_id = auth.uid()
        and group_members.role = 'admin'
    )
  );

-- Game teams and participants: visible to group members
create policy "game_teams_select" on game_teams
  for select using (
    exists (
      select 1 from games
      join group_members on group_members.group_id = games.group_id
      where games.id = game_teams.game_id
        and group_members.user_id = auth.uid()
    )
  );

create policy "game_participants_select" on game_participants
  for select using (
    exists (
      select 1 from games
      join group_members on group_members.group_id = games.group_id
      where games.id = game_participants.game_id
        and group_members.user_id = auth.uid()
    )
  );

-- Audit log: readable by admins only, insert by anyone (system)
create policy "audit_log_select" on audit_log
  for select using (
    exists (
      select 1 from group_members gm
      join games g on g.group_id = gm.group_id
      where g.id = audit_log.record_id
        and gm.user_id = auth.uid()
        and gm.role = 'admin'
    )
  );
