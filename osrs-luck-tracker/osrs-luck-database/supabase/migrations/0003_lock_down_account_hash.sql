-- Phase: lock down account_hash before the plugin goes public.
--
-- account_hash is the only thing /register used to need to hand back a
-- player's install_token, so it has to stay private. Before this
-- migration anyone holding the publishable key could read it straight
-- from the REST API via public_players, boss_kc, collection_log_drops,
-- and (for any signed-up user) the driest_* views.
--
-- Nothing legitimate reads these directly: the site and plugin only go
-- through edge functions, which use the secret key and bypass RLS and
-- grants. So all direct anon/authenticated access to player-linked data
-- is removed here. drop_rates stays publicly readable (static reference
-- data, no player info).

revoke select on public_players from anon, authenticated;

drop policy "boss_kc_public_read" on boss_kc;
drop policy "drops_public_read" on collection_log_drops;
revoke all on boss_kc, collection_log_drops, players from anon, authenticated;

-- The leaderboard edge function reads these with the secret key and is
-- gated by LEADERBOARD_ENABLED, so no client grant is needed when that
-- flag is turned on. Do not grant these to anon: they expose account_hash.
revoke select on driest_obtained, driest_in_progress from anon, authenticated;
