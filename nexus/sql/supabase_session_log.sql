-- ══════════════════════════════════════════════════════════════
--  NEXUS Session Log Module — Database Migration
--  Run this in: Supabase Dashboard → SQL Editor
--
--  Use this file if you already have NEXUS set up and just
--  need to add the Session Log tables. It is safe to run
--  on a fresh install too — all statements use IF NOT EXISTS.
-- ══════════════════════════════════════════════════════════════

-- ── 1. SESSION LOG ────────────────────────────────────────────
-- One row per session. Summary and event text fields support
-- ^{npc-slug} citation syntax — see the NPC citation system docs.

create table if not exists session_log (
  id           text        primary key,
  number       int         not null,              -- session number; auto-assigned in JS, editable
  title        text        not null,
  real_date    text,                              -- ISO date string e.g. '2026-03-10'
  world_date   text,                              -- freeform in-world date e.g. '14th of Frostfall'
  summary      text,                              -- freeform recap; ^{npc-slug} citations supported
  status       text        not null default 'draft', -- 'draft' | 'complete'
  quests       jsonb       not null default '[]', -- [{id,text,status},...] stored inline
  session_npcs jsonb       not null default '[]', -- [npc_id,...] NPCs linked to this session
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- ── 2. SESSION EVENTS ─────────────────────────────────────────
-- Notable moments within a session — freeform bullet entries.
-- Deleted and re-inserted on save (no PATCH), hence no updated_at.
-- ON DELETE CASCADE ensures events are cleaned up with their session.

create table if not exists session_events (
  id           text        primary key,
  session_id   text        not null references session_log(id) on delete cascade,
  text         text        not null,              -- ^{npc-slug} citations supported
  members      jsonb       not null default '[]', -- array of party member names tagged to this moment
  sort_order   int         not null default 0,    -- UI ordering; assigned 0,1,2... on create
  created_at   timestamptz default now()
);

-- ── 3. NPC INDEX ─────────────────────────────────────────────
-- Global NPC registry. NPCs exist independently of sessions.
-- A session "references" an NPC via ^{slug} tokens in text fields
-- or via the session_npcs jsonb array on session_log.
-- first_seen is nullable; SET NULL on session delete preserves
-- the NPC record even if the session is removed.

create table if not exists npcs (
  id           text        primary key,
  slug         text        not null unique,       -- URL-safe citation key e.g. 'captain-draegar'
  name         text        not null,
  role         text,                              -- e.g. 'City Guard Captain'
  disposition  text        not null default 'unknown', -- 'allied'|'friendly'|'neutral'|'hostile'|'unknown'
  notes        text,                              -- persistent notes spanning all sessions
  first_seen   text        references session_log(id) on delete set null,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- ── 4. ROW LEVEL SECURITY ─────────────────────────────────────
-- Same open-access pattern as all other NEXUS tables.
-- Single-campaign, no auth required by default.

alter table session_log    enable row level security;
alter table session_events enable row level security;
alter table npcs           enable row level security;

create policy "public_all" on session_log    for all using (true) with check (true);
create policy "public_all" on session_events for all using (true) with check (true);
create policy "public_all" on npcs           for all using (true) with check (true);

-- ── 5. UPDATED_AT TRIGGERS ────────────────────────────────────
-- Creates the set_updated_at() function if it does not already
-- exist (safe for both fresh installs and migrations).

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger trg_session_log_updated
  before update on session_log
  for each row execute function set_updated_at();

create trigger trg_npcs_updated
  before update on npcs
  for each row execute function set_updated_at();

-- session_events intentionally has no trigger — events are
-- replaced wholesale on save, not patched individually.

-- ══════════════════════════════════════════════════════════════
--  Done! The following tables are now live:
--    session_log      — session spine (title, date, summary, quests)
--    session_events   — notable moments per session
--    npcs             — global NPC index with disposition tracking
--
--  Next step: deploy session-log.html and add it to the nav.
-- ══════════════════════════════════════════════════════════════
