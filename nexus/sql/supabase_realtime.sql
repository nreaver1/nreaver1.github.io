-- ══════════════════════════════════════════════════════════════
--  NEXUS — live updates between players
--  Run in: Supabase Dashboard → SQL Editor. Safe to re-run.
--  Already part of supabase_setup.sql for new installs.
--
--  Adds the campaign tables to Supabase Realtime, so an open page
--  refreshes when someone else changes something (js/nexus-live.js).
--  Realtime only sends rows the viewer is allowed to read, and every
--  campaign table is publicly readable, so no extra policy is needed.
-- ══════════════════════════════════════════════════════════════

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
