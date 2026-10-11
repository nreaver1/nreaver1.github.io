-- ══════════════════════════════════════════════════════════════
--  NEXUS — conditions shared by everyone at the table
--  Run in: Supabase Dashboard → SQL Editor. Safe to re-run.
--  Already part of supabase_setup.sql for new installs.
--
--  Conditions (Poisoned, Prone, ...) used to live in each browser's
--  localStorage. They are now a column on the character, so every
--  player sees the same ones. The roster moves a browser's old local
--  conditions into this column the first time an editor opens it.
-- ══════════════════════════════════════════════════════════════

alter table public.party_members add column if not exists conditions jsonb default '[]';
