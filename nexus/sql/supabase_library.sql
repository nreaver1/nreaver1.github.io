-- ── Campaign library: campaign_library table ──────────────────
-- Non-SRD spells, weapons, items and features (Tasha's, Xanathar's,
-- homebrew) that the DM types in once. They then show up in every
-- name search next to SRD results, tagged "Campaign".
-- Run this in the Supabase SQL Editor. Safe to run multiple times.
-- (supabase_setup.sql contains the same table for fresh installs.)

create table if not exists public.campaign_library (
  id          text        primary key,
  kind        text        not null,               -- spell | weapon | item | feature
  name        text        not null,
  data        jsonb       not null default '{}',  -- form fields (combat_options or loot shape)
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- one entry per kind + name (case-insensitive); the app updates instead of duplicating
create unique index if not exists campaign_library_kind_name on public.campaign_library (kind, lower(name));

alter table public.campaign_library enable row level security;
drop policy if exists "public_all" on public.campaign_library;
create policy "public_all" on public.campaign_library for all using (true) with check (true);

-- set_updated_at() is defined in supabase_setup.sql
drop trigger if exists trg_campaign_library_updated on public.campaign_library;
create trigger trg_campaign_library_updated
  before update on public.campaign_library
  for each row execute function set_updated_at();
