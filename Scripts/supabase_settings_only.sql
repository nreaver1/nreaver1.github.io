-- ── NEXUS SETTINGS (term mappings, admin config) ──────────────
-- Run this in Supabase SQL Editor to add the settings table.
-- Safe to run even if other tables already exist.

create table if not exists public.nexus_settings (
  key         text primary key,
  value       jsonb,
  updated_at  timestamptz default now()
);

alter table public.nexus_settings enable row level security;

create policy "public read settings"
  on public.nexus_settings for select using (true);

create policy "public write settings"
  on public.nexus_settings for all using (true);

-- Seed default term mappings row so it exists immediately
insert into public.nexus_settings (key, value)
values ('term_mappings', '{}')
on conflict (key) do nothing;
