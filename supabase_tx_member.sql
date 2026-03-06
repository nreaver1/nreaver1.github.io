-- ── Add member_name column to treasury_ledger ──────────────────
-- Run this in Supabase SQL Editor.
-- Safe to run multiple times (uses IF NOT EXISTS equivalent).

alter table public.treasury_ledger
  add column if not exists member_name text default null;
