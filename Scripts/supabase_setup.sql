-- ══════════════════════════════════════════════════════════════
--  NEXUS Campaign System — Supabase Database Setup
--  Run this entire script in: Supabase Dashboard → SQL Editor
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
