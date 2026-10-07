-- ── Add quantity column to loot_items ─────────────────────────
-- Run this in Supabase SQL Editor on installs created before the
-- column was added to supabase_setup.sql. Safe to run multiple times.

alter table public.loot_items
  add column if not exists quantity int default 1;
