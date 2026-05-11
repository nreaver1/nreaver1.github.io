-- ============================================================
-- Keep Track — Teardown Script
-- Removes ALL data in dependency-safe order
-- WARNING: This wipes everything including preset game types
-- Run this only in development / testing environments
-- ============================================================


-- ─────────────────────────────────────────
-- STEP 1: Clear junction / leaf tables first
-- ─────────────────────────────────────────
delete from audit_log;
delete from game_participants;
delete from game_teams;
delete from games;
delete from group_invites;
delete from group_members;
delete from game_types;
delete from groups;
delete from profiles;


-- ─────────────────────────────────────────
-- STEP 2: Confirm counts (should all be 0)
-- ─────────────────────────────────────────
select 'audit_log'        as table_name, count(*) as remaining from audit_log
union all
select 'game_participants',              count(*) from game_participants
union all
select 'game_teams',                     count(*) from game_teams
union all
select 'games',                          count(*) from games
union all
select 'group_invites',                  count(*) from group_invites
union all
select 'group_members',                  count(*) from group_members
union all
select 'game_types',                     count(*) from game_types
union all
select 'groups',                         count(*) from groups
union all
select 'profiles',                       count(*) from profiles;


-- ─────────────────────────────────────────
-- OPTIONAL: Full schema teardown
-- Uncomment this block if you want to drop
-- all tables and start completely fresh
-- ─────────────────────────────────────────

drop table if exists audit_log          cascade;
drop table if exists game_participants  cascade;
drop table if exists game_teams         cascade;
drop table if exists games              cascade;
drop table if exists group_invites      cascade;
drop table if exists group_members      cascade;
drop table if exists game_types         cascade;
drop table if exists groups             cascade;
drop table if exists profiles           cascade;
drop function if exists set_updated_at  cascade;
drop type if exists group_role          cascade;
drop type if exists scoring_type        cascade;
drop type if exists audit_action        cascade;

-- Drop enums first
drop type if exists group_role   cascade;
drop type if exists scoring_type cascade;
drop type if exists audit_action cascade;