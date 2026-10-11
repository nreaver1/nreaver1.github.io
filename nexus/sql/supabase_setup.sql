-- ══════════════════════════════════════════════════════════════
--  NEXUS Campaign System — Supabase Database Setup
--  Run this entire script in: Supabase Dashboard → SQL Editor
--  The policies below leave every table open. Run supabase_auth.sql
--  next to require sign-in for edits.
-- ══════════════════════════════════════════════════════════════

-- ── 1. PARTY ROSTER ──────────────────────────────────────────
create table if not exists party_members (
  id          text        primary key,
  name        text        not null,
  player      text,
  class       text,
  race        text,
  level       int,
  status      text        default 'active',
  prof        int         default 2,
  bio         text,
  tags        jsonb       default '[]',
  color       text,
  photo       text,        -- base64 data URL
  abilities   jsonb       default '{}',   -- {str,dex,con,int,wis,cha}
  combat      jsonb       default '{}',   -- {ac,hp,hpcur,speed,init,spelldc,spellatk,passperc}
  proficiencies jsonb     default '{}',   -- {save_str:true, stealth:true, ...}
  conditions  jsonb       default '[]',   -- ['poisoned','prone', ...]
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ── 2. LOOT TRACKER ──────────────────────────────────────────
create table if not exists loot_items (
  id          text        primary key,
  name        text        not null,
  type        text        default 'Wondrous',
  rarity      text        default 'common',
  holder      text,
  attunement  text        default 'none',
  description text,
  stat_effects jsonb      default '[]',   -- [{stat, type, value}, ...]
  quantity    int         default 1,      -- JS field: qty
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ── 3. TREASURY ───────────────────────────────────────────────
-- Currencies definition (custom coins like Credits, Gold, etc.)
create table if not exists treasury_currencies (
  id          text        primary key,
  name        text        not null,
  abbr        text,
  symbol      text,
  color       text,
  rate        numeric     default 1,   -- conversion rate to base currency
  sort_order  int         default 0,
  created_at  timestamptz default now()
);

-- Ledger entries (each transaction)
create table if not exists treasury_ledger (
  id          text        primary key,
  type        text        not null,    -- 'gain' | 'spend'
  description text,
  coins       jsonb       default '{}', -- {currency_id: amount, ...}
  note        text,
  ts          bigint,                   -- unix timestamp ms
  member_name text        default null, -- set when the tx is against a member's vault
  created_at  timestamptz default now()
);

-- ── 4. ROW LEVEL SECURITY (disable for simple single-campaign use) ──
-- These make the tables publicly readable/writable without auth.
-- If you want auth later, remove these and set up proper RLS policies.
alter table party_members    enable row level security;
alter table loot_items       enable row level security;
alter table treasury_currencies enable row level security;
alter table treasury_ledger  enable row level security;

create policy "public_all" on party_members       for all using (true) with check (true);
create policy "public_all" on loot_items          for all using (true) with check (true);
create policy "public_all" on treasury_currencies for all using (true) with check (true);
create policy "public_all" on treasury_ledger     for all using (true) with check (true);

-- ── 5. UPDATED_AT TRIGGER ─────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger trg_members_updated
  before update on party_members
  for each row execute function set_updated_at();

create trigger trg_items_updated
  before update on loot_items
  for each row execute function set_updated_at();

-- ══════════════════════════════════════════════════════════════
--  Done! Paste your Supabase URL and anon key into nexus-config.js
-- ══════════════════════════════════════════════════════════════

-- ── NEXUS SETTINGS (term mappings, admin config) ──────────────
create table if not exists public.nexus_settings (
  key         text primary key,
  value       jsonb,
  updated_at  timestamptz default now()
);
alter table public.nexus_settings enable row level security;
create policy "public read settings"  on public.nexus_settings for select using (true);
create policy "public write settings" on public.nexus_settings for all    using (true);

-- Seed default term mappings row so it exists immediately
insert into public.nexus_settings (key, value) values
  ('term_mappings', '{}')
on conflict (key) do nothing;

-- ── 5. SESSION LOG ────────────────────────────────────────────
-- session_log: one row per session (the spine of the module)
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

-- session_events: notable moments within a session (freeform bullet entries)
create table if not exists session_events (
  id           text        primary key,
  session_id   text        not null references session_log(id) on delete cascade,
  text         text        not null,              -- ^{npc-slug} citations supported
  members      jsonb       not null default '[]', -- array of party member names tagged to this moment
  sort_order   int         not null default 0,    -- UI ordering; assigned 0,1,2... on create
  created_at   timestamptz default now()
);

-- npcs: global NPC index — records exist independently of any single session
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

-- ── RLS for Session Log tables ────────────────────────────────
alter table session_log    enable row level security;
alter table session_events enable row level security;
alter table npcs           enable row level security;

create policy "public_all" on session_log    for all using (true) with check (true);
create policy "public_all" on session_events for all using (true) with check (true);
create policy "public_all" on npcs           for all using (true) with check (true);

-- ── updated_at triggers for session_log and npcs ─────────────
-- set_updated_at() function is already defined above — shared by all tables.
-- Triggers only on tables with an updated_at column that are PATCHed.
-- session_events has no updated_at — moments are deleted and re-inserted, not patched.
create trigger trg_session_log_updated
  before update on session_log
  for each row execute function set_updated_at();

create trigger trg_npcs_updated
  before update on npcs
  for each row execute function set_updated_at();

-- ── 6. COMBAT ─────────────────────────────────────────────────
-- One row per attack / spell / feature on a character's combat sheet.
-- The DM's target (AC + save) is nexus_settings key 'combat_target'.
create table if not exists combat_options (
  id            text        primary key,
  member_id     text        not null references party_members(id) on delete cascade,
  kind          text        default 'weapon',   -- weapon | spell | feature
  name          text        not null,
  action        text        default 'action',   -- action | bonus | reaction
  resolve       text        default 'attack',   -- attack | save | auto | none
  ability       text        default 'str',      -- str..cha | spell
  save_ability  text,                           -- target's save, display only
  dice          text,                           -- '1d8', '8d6', '3d4+3'
  extra_dice    text,                           -- rider damage, e.g. '1d8'
  damage_type   text,
  add_mod       boolean     default true,       -- add ability mod to damage
  spell_level   int,                            -- 0 = cantrip, null = not a spell
  scales        boolean     default false,      -- cantrip dice scale at 5/11/17
  half_on_save  boolean     default false,
  aoe           boolean     default false,
  range         text,
  notes         text,
  loot_item_id  text        references loot_items(id) on delete set null,
  school        text,                           -- spell details (from the SRD or typed in)
  components    text,                           -- 'V, S, M'
  material      text,
  casting_time  text,                           -- '1 action', '1 minute'
  duration      text,
  concentration boolean     default false,
  ritual        boolean     default false,
  description   text,
  prepared      boolean     default true,       -- unprepared spells are listed but not ranked
  srd_index     text,                           -- dnd5eapi.co index when filled from the SRD
  sort_order    int         default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists combat_options_member_idx on combat_options(member_id);

alter table combat_options enable row level security;
create policy "public_all" on combat_options for all using (true) with check (true);

create trigger trg_combat_options_updated
  before update on combat_options
  for each row execute function set_updated_at();

-- ── 7. CAMPAIGN LIBRARY ───────────────────────────────────────
-- Hand-typed non-SRD content shared by every name search.
create table if not exists campaign_library (
  id          text        primary key,
  kind        text        not null,               -- spell | weapon | item | feature
  name        text        not null,
  data        jsonb       not null default '{}',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create unique index if not exists campaign_library_kind_name on campaign_library (kind, lower(name));

alter table campaign_library enable row level security;
create policy "public_all" on campaign_library for all using (true) with check (true);

create trigger trg_campaign_library_updated
  before update on campaign_library
  for each row execute function set_updated_at();

-- ── 8. ALL-OR-NOTHING SAVES ───────────────────────────────────
-- Same as supabase_atomic.sql (see there for notes).
-- A session row and its moments, saved together.
create or replace function public.nexus_save_session(p_session jsonb, p_events jsonb default '[]')
returns void
language plpgsql security invoker
set search_path = public
as $$
declare
  v_id text := p_session ->> 'id';
begin
  if v_id is null then raise exception 'nexus_save_session: session id missing'; end if;

  insert into session_log (id, number, title, real_date, world_date, summary, status, quests, session_npcs)
  select id, number, title, real_date, world_date, summary,
         coalesce(status, 'draft'), coalesce(quests, '[]'), coalesce(session_npcs, '[]')
  from jsonb_populate_record(null::session_log, p_session)
  on conflict (id) do update set
    number       = excluded.number,
    title        = excluded.title,
    real_date    = excluded.real_date,
    world_date   = excluded.world_date,
    summary      = excluded.summary,
    status       = excluded.status,
    quests       = excluded.quests,
    session_npcs = excluded.session_npcs;

  delete from session_events where session_id = v_id;

  insert into session_events (id, session_id, text, members, sort_order)
  select id, v_id, text, coalesce(members, '[]'), coalesce(sort_order, 0)
  from jsonb_populate_recordset(null::session_events, coalesce(p_events, '[]'));
end $$;

-- Rename a party member and follow the name everywhere it is the join
-- key: loot holders, member-vault ledger rows and tagged moments.
-- Matching is case- and space-insensitive, like the pages.
create or replace function public.nexus_rename_member(p_id text, p_name text)
returns void
language plpgsql security invoker
set search_path = public
as $$
declare
  v_old text;
  v_new text := trim(p_name);
begin
  if v_new is null or v_new = '' then raise exception 'nexus_rename_member: name missing'; end if;
  select name into v_old from party_members where id = p_id for update;
  if not found then raise exception 'nexus_rename_member: member % not found', p_id; end if;
  if v_old = v_new then return; end if;

  update party_members set name = v_new where id = p_id;

  update loot_items      set holder      = v_new where lower(trim(holder))      = lower(trim(v_old));
  update treasury_ledger set member_name = v_new where lower(trim(member_name)) = lower(trim(v_old));

  update session_events e
  set members = (
    select coalesce(jsonb_agg(
             case when jsonb_typeof(m) = 'string' and lower(trim(m #>> '{}')) = lower(trim(v_old))
                  then to_jsonb(v_new) else m end
             order by ord), '[]'::jsonb)
    from jsonb_array_elements(e.members) with ordinality as x(m, ord)
  )
  where jsonb_typeof(e.members) = 'array'
    and exists (select 1 from jsonb_array_elements_text(e.members) t
                where lower(trim(t)) = lower(trim(v_old)));
end $$;

-- Replace every campaign table with a snapshot ({ table: [rows] }).
-- Children are cleared first and parents inserted first, so foreign
-- keys hold throughout. Only columns that exist are copied; a missing
-- column takes its default. nexus_settings is upserted by key, never
-- cleared. Returns the number of rows written.
create or replace function public.nexus_restore_snapshot(p_tables jsonb)
returns int
language plpgsql security invoker
set search_path = public
as $$
declare
  v_table text;
  v_row   jsonb;
  v_cols  text;
  v_count int := 0;
  v_order text[] := array[
    'party_members', 'treasury_currencies', 'treasury_ledger', 'loot_items',
    'combat_options', 'campaign_library', 'session_log', 'session_events', 'npcs'
  ];
begin
  if jsonb_typeof(p_tables) <> 'object' then
    raise exception 'nexus_restore_snapshot: expected an object of tables';
  end if;

  -- Clear children before parents
  for i in reverse array_length(v_order, 1) .. 1 loop
    execute format('delete from public.%I where true', v_order[i]);
  end loop;

  foreach v_table in array v_order || array['nexus_settings'] loop
    if p_tables ? v_table and jsonb_typeof(p_tables -> v_table) <> 'array' then
      raise exception 'nexus_restore_snapshot: % is not an array', v_table;
    end if;
    for v_row in select value from jsonb_array_elements(coalesce(p_tables -> v_table, '[]')) loop
      select string_agg(quote_ident(c.column_name), ', ')
        into v_cols
        from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = v_table and v_row ? c.column_name;
      continue when v_cols is null;
      if v_table = 'nexus_settings' then
        execute format(
          'insert into public.nexus_settings (%1$s) select %1$s from jsonb_populate_record(null::public.nexus_settings, $1) '
          'on conflict (key) do update set value = excluded.value', v_cols) using v_row;
      else
        execute format(
          'insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I, $1)',
          v_table, v_cols) using v_row;
      end if;
      v_count := v_count + 1;
    end loop;
  end loop;

  return v_count;
end $$;

-- ── 9. LIVE UPDATES ───────────────────────────────────────────
-- Same as supabase_realtime.sql.
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'No supabase_realtime publication (not a Supabase database?): skipped.';
    return;
  end if;
  foreach t in array array[
    'party_members', 'loot_items', 'treasury_currencies', 'treasury_ledger',
    'session_log', 'session_events', 'npcs', 'combat_options', 'campaign_library',
    'nexus_settings'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
