-- ============================================================
-- Keep Track — Fix Group Delete Cascades
-- 
-- Deleting a group fails because games.game_type_id has
-- ON DELETE RESTRICT on game_types, which itself cascades
-- from groups. This script fixes the constraint chain so
-- group deletion works cleanly.
--
-- Run once in Supabase SQL Editor.
-- Safe to run on a live database — only alters constraints.
-- ============================================================

-- 1. games.game_type_id: RESTRICT → SET NULL
--    When a game type is deleted (e.g. because its group was deleted),
--    historical games retain their row but lose the game type reference.
--    The name is still visible via the stored game_types.name on the game row
--    IF you cache it, but since we don't, this becomes null. Acceptable for
--    a deleted group's history.
alter table games
  drop constraint if exists games_game_type_id_fkey;

alter table games
  add constraint games_game_type_id_fkey
  foreign key (game_type_id)
  references game_types(id)
  on delete set null;

-- 2. games.logged_by: RESTRICT → SET NULL
--    If a user's profile is ever deleted, don't block game deletion.
--    The logged_by field becomes null (game is still preserved).
alter table games
  drop constraint if exists games_logged_by_fkey;

alter table games
  add constraint games_logged_by_fkey
  foreign key (logged_by)
  references profiles(id)
  on delete set null;

-- 3. game_participants.user_id: RESTRICT → SET NULL
--    If a profile is deleted, preserve the participation record
--    but null out the user reference.
alter table game_participants
  drop constraint if exists game_participants_user_id_fkey;

alter table game_participants
  add constraint game_participants_user_id_fkey
  foreign key (user_id)
  references profiles(id)
  on delete set null;

-- 4. audit_log.changed_by: already SET NULL — verify and re-apply cleanly
alter table audit_log
  drop constraint if exists audit_log_changed_by_fkey;

alter table audit_log
  add constraint audit_log_changed_by_fkey
  foreign key (changed_by)
  references profiles(id)
  on delete set null;

-- 5. groups.owner_id: RESTRICT → RESTRICT (keep as-is — intentional)
--    Owners must transfer ownership before their profile can be deleted.
--    This is the correct behavior.

-- Verify the full delete chain for groups:
-- groups deleted →
--   group_members CASCADE ✓
--   group_invites CASCADE ✓
--   game_types CASCADE ✓
--     games SET NULL on game_type_id ✓ (was RESTRICT, now fixed)
--   games CASCADE ✓
--     game_teams CASCADE ✓
--       game_participants CASCADE ✓

do $$ begin
  raise notice 'Cascade fix complete. Group deletion should now work end-to-end.';
end $$;
