-- ── Combat module: combat_options table ───────────────────────
-- One row per attack / spell / feature on a character's combat
-- reference sheet (and spell list). Run this in the Supabase SQL Editor on
-- installs created before the Combat module, and again after updates:
-- it is safe to run multiple times and adds any missing columns.
-- (supabase_setup.sql contains the same table for fresh installs.)
--
-- The DM's target (AC + save bonus) lives in nexus_settings under
-- key 'combat_target' and needs no schema change.

create table if not exists public.combat_options (
  id            text        primary key,
  member_id     text        not null references public.party_members(id) on delete cascade,
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
  loot_item_id  text        references public.loot_items(id) on delete set null,
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

create index if not exists combat_options_member_idx on public.combat_options(member_id);

alter table public.combat_options enable row level security;
drop policy if exists "public_all" on public.combat_options;
create policy "public_all" on public.combat_options for all using (true) with check (true);

-- set_updated_at() is defined in supabase_setup.sql
drop trigger if exists trg_combat_options_updated on public.combat_options;
create trigger trg_combat_options_updated
  before update on public.combat_options
  for each row execute function set_updated_at();

-- ── Spell details + prepared (added with the roster Spells tab) ──
-- Safe on tables created before these columns existed.
alter table public.combat_options add column if not exists school        text;
alter table public.combat_options add column if not exists components    text;
alter table public.combat_options add column if not exists material      text;
alter table public.combat_options add column if not exists casting_time  text;
alter table public.combat_options add column if not exists duration      text;
alter table public.combat_options add column if not exists concentration boolean default false;
alter table public.combat_options add column if not exists ritual        boolean default false;
alter table public.combat_options add column if not exists description   text;
alter table public.combat_options add column if not exists prepared      boolean default true;
alter table public.combat_options add column if not exists srd_index     text;
