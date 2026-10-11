-- ══════════════════════════════════════════════════════════════
--  NEXUS — all-or-nothing saves
--  Run in: Supabase Dashboard → SQL Editor. Safe to re-run.
--  Already part of supabase_setup.sql for new installs.
--
--  Each function runs as one transaction, so a dropped connection or a
--  refused write can't leave half a save behind. They run as the
--  caller (security invoker), so the access rules in supabase_auth.sql
--  still decide who may write.
--
--    nexus_save_session(p_session, p_events)  session-log.html save
--    nexus_rename_member(p_id, p_name)        roster rename + every
--                                             place that stores the name
--    nexus_restore_snapshot(p_tables)         Admin → Restore Snapshot
-- ══════════════════════════════════════════════════════════════

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
