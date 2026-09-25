-- Phase: canonical IGNs.
--
-- OSRS treats space, non-breaking space, "_" and "-" in a name as the
-- same character, and the RuneLite client can report spaces as
-- non-breaking spaces. /register and /get-player-luck now store and look
-- up names with all four turned into a space (normalizeIgn in
-- functions/_shared/http.ts); this brings existing rows into that form
-- so they stay findable.

update players
set ign = btrim(regexp_replace(ign, E'[\u00A0_-]', ' ', 'g'))
where ign ~ E'[\u00A0_-]' or ign <> btrim(ign);
