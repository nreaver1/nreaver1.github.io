-- ============================================================
-- Keep Track — Enable Realtime on Required Tables
--
-- Supabase realtime is disabled by default on all tables.
-- Run this once in the SQL Editor to enable it.
--
-- Alternatively, in the Supabase dashboard go to:
-- Database → Replication → Tables → enable for each table below
-- ============================================================

-- Enable realtime for game inserts/deletes (leaderboard + activity feed)
alter publication supabase_realtime add table games;

-- Enable realtime for new member joins (activity feed + member list)
alter publication supabase_realtime add table group_members;

do $$ begin
  raise notice 'Realtime enabled on games and group_members tables.';
end $$;
