-- ══════════════════════════════════════════════════════════════
--  NEXUS — sign-in and access rules
--  Run in: Supabase Dashboard → SQL Editor, AFTER supabase_setup.sql.
--  Safe to re-run.
--
--  Replaces the open "public_all" policies:
--    • anyone can read every campaign table (the site stays shareable)
--    • only signed-in emails listed in campaign_members can write
--    • only role 'gm' can change nexus_settings (terms, modules, combat target)
--
--  After running it, add yourself as GM (not stored in this file, so
--  your email doesn't end up in the public repo):
--    insert into public.campaign_members (email, role)
--    values ('you@example.com', 'gm')
--    on conflict (email) do update set role = excluded.role;
--
--  Add a player later the same way with role 'player'. Players need to
--  be able to receive the sign-in email: Supabase's built-in mailer only
--  sends to members of your Supabase team, so connect an SMTP provider
--  (Authentication → Emails → SMTP) before inviting players.
--
--  Every table created in supabase_setup.sql must be in the list below,
--  or it keeps the open policy (a test checks this).
-- ══════════════════════════════════════════════════════════════

-- ── Who may edit ──────────────────────────────────────────────
create table if not exists public.campaign_members (
  email       text        primary key check (email = lower(email)),
  role        text        not null default 'player' check (role in ('gm', 'player')),
  created_at  timestamptz default now()
);

alter table public.campaign_members enable row level security;

-- Signed-in users can see their own row (the app reads it to know your
-- role). Nobody can change the list through the API; manage it here.
drop policy if exists "read own membership" on public.campaign_members;
create policy "read own membership" on public.campaign_members
  for select to authenticated
  using (email = lower(coalesce(auth.jwt() ->> 'email', '')));

-- ── Role helpers (security definer, so policies can read the list) ──
create or replace function public.nexus_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select role from public.campaign_members
  where email = lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function public.nexus_can_edit()
returns boolean
language sql stable
set search_path = public
as $$ select coalesce(public.nexus_role() in ('gm', 'player'), false) $$;

create or replace function public.nexus_is_gm()
returns boolean
language sql stable
set search_path = public
as $$ select coalesce(public.nexus_role() = 'gm', false) $$;

-- ── Campaign tables: anyone reads, editors write ──────────────
do $$
declare t text;
begin
  foreach t in array array[
    'party_members', 'loot_items', 'treasury_currencies', 'treasury_ledger',
    'session_log', 'session_events', 'npcs', 'combat_options', 'campaign_library'
  ] loop
    execute format('drop policy if exists "public_all" on public.%I', t);
    execute format('drop policy if exists "nexus read" on public.%I', t);
    execute format('drop policy if exists "nexus edit" on public.%I', t);
    execute format('create policy "nexus read" on public.%I for select using (true)', t);
    execute format(
      'create policy "nexus edit" on public.%I for all to authenticated '
      'using (public.nexus_can_edit()) with check (public.nexus_can_edit())', t);
  end loop;
end $$;

-- ── Settings: anyone reads, only the GM writes ────────────────
drop policy if exists "public read settings"  on public.nexus_settings;
drop policy if exists "public write settings" on public.nexus_settings;
drop policy if exists "nexus read"            on public.nexus_settings;
drop policy if exists "nexus gm edit"         on public.nexus_settings;
create policy "nexus read" on public.nexus_settings for select using (true);
create policy "nexus gm edit" on public.nexus_settings
  for all to authenticated
  using (public.nexus_is_gm()) with check (public.nexus_is_gm());
