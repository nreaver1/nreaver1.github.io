-- ============================================================
-- Keep Track — Seed Script
-- Run this AFTER the schema migration
-- ============================================================

do $$ declare

  -- ─────────────────────────────────────────
  -- USER IDs — sourced from Supabase Auth
  -- Only these lines need to change if users are recreated
  -- ─────────────────────────────────────────
  v_nick   uuid := '53dc7b39-2abf-43a4-ba8f-40892d34c7e6';
  v_jeff   uuid := '51841bbe-448c-4526-8a6b-53a5cf4732e2';
  v_sarah  uuid := 'bd679d9b-3d8e-4723-806c-bb365745bfc6';
  v_marcus uuid := 'a3eaa595-3816-4fa8-b52b-9e8548c866dd';
  v_priya  uuid := '872914b9-37e5-4774-9964-dcf93e3bd3cb';
  v_tommy  uuid := 'c51a0835-1520-4bc3-ac54-f0d4049606c2';

  -- ─────────────────────────────────────────
  -- GENERATED IDs — group, games, teams
  -- All generated at runtime, nothing hardcoded
  -- ─────────────────────────────────────────
  v_group_id uuid := gen_random_uuid();

  -- Game type IDs resolved by name after insert
  v_gt_ping_pong    uuid;
  v_gt_mario_kart   uuid;
  v_gt_beer_pong    uuid;
  v_gt_chess        uuid;
  v_gt_poker        uuid;

  -- Game IDs
  v_game1 uuid := gen_random_uuid();
  v_game2 uuid := gen_random_uuid();
  v_game3 uuid := gen_random_uuid();
  v_game4 uuid := gen_random_uuid();
  v_game5 uuid := gen_random_uuid();
  v_game6 uuid := gen_random_uuid();
  v_game7 uuid := gen_random_uuid();
  v_game8 uuid := gen_random_uuid();

  -- Team IDs
  v_team1a uuid := gen_random_uuid();  v_team1b uuid := gen_random_uuid();
  v_team2a uuid := gen_random_uuid();  v_team2b uuid := gen_random_uuid();
  v_team3a uuid := gen_random_uuid();  v_team3b uuid := gen_random_uuid();
  v_team3c uuid := gen_random_uuid();  v_team3d uuid := gen_random_uuid();
  v_team4a uuid := gen_random_uuid();  v_team4b uuid := gen_random_uuid();
  v_team5a uuid := gen_random_uuid();  v_team5b uuid := gen_random_uuid();
  v_team6a uuid := gen_random_uuid();  v_team6b uuid := gen_random_uuid();
  v_team6c uuid := gen_random_uuid();  v_team6d uuid := gen_random_uuid();
  v_team6e uuid := gen_random_uuid();  v_team6f uuid := gen_random_uuid();
  v_team7a uuid := gen_random_uuid();  v_team7b uuid := gen_random_uuid();
  v_team8a uuid := gen_random_uuid();  v_team8b uuid := gen_random_uuid();
  v_team8c uuid := gen_random_uuid();  v_team8d uuid := gen_random_uuid();

begin

  -- ─────────────────────────────────────────
  -- PROFILES
  -- ─────────────────────────────────────────
  insert into profiles (id, username, email, avatar_url) values
    (v_nick,   'nick',   'nick@example.com',   null),
    (v_jeff,   'jeff',   'jeff@example.com',   null),
    (v_sarah,  'sarah',  'sarah@example.com',  null),
    (v_marcus, 'marcus', 'marcus@example.com', null),
    (v_priya,  'priya',  'priya@example.com',  null),
    (v_tommy,  'tommy',  'tommy@example.com',  null)
  on conflict (id) do nothing;


  -- ─────────────────────────────────────────
  -- PRESET GAME TYPES
  -- group_id = null, is_preset = true
  -- ─────────────────────────────────────────

  -- TABLE & PADDLE
  insert into game_types (group_id, name, category, scoring_type, allows_draws, default_format, is_preset, created_by) values
    (null, 'Ping Pong',    'Table & Paddle', 'numeric', false, '1v1', true, null),
    (null, 'Air Hockey',   'Table & Paddle', 'numeric', false, '1v1', true, null),
    (null, 'Foosball',     'Table & Paddle', 'numeric', false, '2v2', true, null),
    (null, 'Shuffleboard', 'Table & Paddle', 'numeric', false, '2v2', true, null);

  -- CARD GAMES
  insert into game_types (group_id, name, category, scoring_type, allows_draws, default_format, is_preset, created_by) values
    (null, 'Poker',     'Card Games', 'win_loss', false, 'FFA', true, null),
    (null, 'Blackjack', 'Card Games', 'win_loss', false, 'FFA', true, null),
    (null, 'Uno',       'Card Games', 'win_loss', false, 'FFA', true, null),
    (null, 'Spades',    'Card Games', 'numeric',  false, '2v2', true, null),
    (null, 'Hearts',    'Card Games', 'numeric',  false, 'FFA', true, null),
    (null, 'Rummy',     'Card Games', 'numeric',  false, 'FFA', true, null),
    (null, 'Gin Rummy', 'Card Games', 'numeric',  false, '1v1', true, null),
    (null, 'War',       'Card Games', 'win_loss', false, '1v1', true, null),
    (null, 'Cribbage',  'Card Games', 'numeric',  false, '1v1', true, null),
    (null, 'Phase 10',  'Card Games', 'numeric',  false, 'FFA', true, null),
    (null, 'Slapjack',  'Card Games', 'win_loss', false, 'FFA', true, null);

  -- BOARD & DICE GAMES
  insert into game_types (group_id, name, category, scoring_type, allows_draws, default_format, is_preset, created_by) values
    (null, 'Monopoly',        'Board & Dice', 'win_loss', false, 'FFA', true, null),
    (null, 'Risk',            'Board & Dice', 'win_loss', false, 'FFA', true, null),
    (null, 'Catan',           'Board & Dice', 'numeric',  false, 'FFA', true, null),
    (null, 'Yahtzee',         'Board & Dice', 'numeric',  false, 'FFA', true, null),
    (null, 'Scrabble',        'Board & Dice', 'numeric',  false, 'FFA', true, null),
    (null, 'Clue',            'Board & Dice', 'win_loss', false, 'FFA', true, null),
    (null, 'Trivial Pursuit', 'Board & Dice', 'win_loss', false, 'FFA', true, null),
    (null, 'Jenga',           'Board & Dice', 'win_loss', false, 'FFA', true, null),
    (null, 'Connect Four',    'Board & Dice', 'win_loss', false, '1v1', true, null),
    (null, 'Battleship',      'Board & Dice', 'win_loss', false, '1v1', true, null),
    (null, 'Chess',           'Board & Dice', 'win_loss', true,  '1v1', true, null),
    (null, 'Checkers',        'Board & Dice', 'win_loss', true,  '1v1', true, null);

  -- VIDEO GAMES
  insert into game_types (group_id, name, category, scoring_type, allows_draws, default_format, is_preset, created_by) values
    (null, 'Mario Kart',       'Video Games', 'numeric',  false, 'FFA', true, null),
    (null, 'Madden NFL',       'Video Games', 'numeric',  false, '1v1', true, null),
    (null, 'NBA 2K',           'Video Games', 'numeric',  false, '1v1', true, null),
    (null, 'FIFA / EA FC',     'Video Games', 'numeric',  true,  '1v1', true, null),
    (null, 'Mortal Kombat',    'Video Games', 'win_loss', false, '1v1', true, null),
    (null, 'Street Fighter',   'Video Games', 'win_loss', false, '1v1', true, null),
    (null, 'Super Smash Bros', 'Video Games', 'win_loss', false, 'FFA', true, null),
    (null, 'Rocket League',    'Video Games', 'numeric',  true,  '2v2', true, null),
    (null, 'Call of Duty',     'Video Games', 'win_loss', false, 'FFA', true, null),
    (null, 'Halo',             'Video Games', 'win_loss', false, 'FFA', true, null),
    (null, 'Push the Button',  'Video Games', 'win_loss', false, 'FFA', true, null);

  -- PHYSICAL & BACKYARD SPORTS
  insert into game_types (group_id, name, category, scoring_type, allows_draws, default_format, is_preset, created_by) values
    (null, 'Basketball 1v1',    'Physical & Backyard', 'numeric',  false, '1v1',  true, null),
    (null, 'Basketball (Horse)','Physical & Backyard', 'win_loss', false, 'FFA',  true, null),
    (null, 'Basketball (21)',   'Physical & Backyard', 'numeric',  false, 'FFA',  true, null),
    (null, 'Cornhole',          'Physical & Backyard', 'numeric',  false, '2v2',  true, null),
    (null, 'Ladder Toss',       'Physical & Backyard', 'numeric',  false, '2v2',  true, null),
    (null, 'Kan Jam',           'Physical & Backyard', 'win_loss', false, '2v2',  true, null),
    (null, 'Bocce Ball',        'Physical & Backyard', 'numeric',  false, 'FFA',  true, null),
    (null, 'Horseshoes',        'Physical & Backyard', 'numeric',  false, '1v1',  true, null),
    (null, 'Spikeball',         'Physical & Backyard', 'win_loss', false, '2v2',  true, null),
    (null, 'Volleyball',        'Physical & Backyard', 'win_loss', false, 'Team', true, null),
    (null, 'Badminton',         'Physical & Backyard', 'numeric',  false, '1v1',  true, null),
    (null, 'Pickleball',        'Physical & Backyard', 'numeric',  false, '2v2',  true, null),
    (null, 'Darts',             'Physical & Backyard', 'numeric',  false, 'FFA',  true, null),
    (null, 'Bowling',           'Physical & Backyard', 'numeric',  false, 'FFA',  true, null),
    (null, 'Pool / Billiards',  'Physical & Backyard', 'win_loss', false, '1v1',  true, null);

  -- DRINKING & PARTY GAMES
  insert into game_types (group_id, name, category, scoring_type, allows_draws, default_format, is_preset, created_by) values
    (null, 'Beer Pong',   'Drinking & Party', 'win_loss', false, '2v2',  true, null),
    (null, 'Flip Cup',    'Drinking & Party', 'win_loss', false, 'Team', true, null),
    (null, 'Slap Cup',    'Drinking & Party', 'win_loss', false, 'FFA',  true, null),
    (null, 'Baseball',    'Drinking & Party', 'win_loss', false, 'Team', true, null),
    (null, 'Kings Cup',   'Drinking & Party', 'win_loss', false, 'FFA',  true, null),
    (null, 'Quarters',    'Drinking & Party', 'win_loss', false, 'FFA',  true, null),
    (null, 'Snappa',      'Drinking & Party', 'numeric',  false, '2v2',  true, null),
    (null, 'Chandelier',  'Drinking & Party', 'win_loss', false, 'FFA',  true, null),
    (null, 'Power Hour',  'Drinking & Party', 'win_loss', false, 'FFA',  true, null),
    (null, 'Drunk Jenga', 'Drinking & Party', 'win_loss', false, 'FFA',  true, null);

  -- TRIVIA & WORD GAMES
  insert into game_types (group_id, name, category, scoring_type, allows_draws, default_format, is_preset, created_by) values
    (null, 'Trivia (General)',       'Trivia & Word', 'numeric',  false, 'FFA',  true, null),
    (null, 'Codenames',              'Trivia & Word', 'win_loss', false, '2v2',  true, null),
    (null, 'Pictionary',             'Trivia & Word', 'win_loss', false, 'Team', true, null),
    (null, 'Taboo',                  'Trivia & Word', 'win_loss', false, 'Team', true, null),
    (null, 'Catchphrase',            'Trivia & Word', 'win_loss', false, 'Team', true, null),
    (null, 'Apples to Apples',       'Trivia & Word', 'win_loss', false, 'FFA',  true, null),
    (null, 'Cards Against Humanity', 'Trivia & Word', 'win_loss', false, 'FFA',  true, null);


  -- ─────────────────────────────────────────
  -- RESOLVE GAME TYPE IDs BY NAME
  -- Looked up after insert so no hardcoded IDs needed
  -- ─────────────────────────────────────────
  select id into v_gt_ping_pong  from game_types where name = 'Ping Pong'  and is_preset = true limit 1;
  select id into v_gt_mario_kart from game_types where name = 'Mario Kart' and is_preset = true limit 1;
  select id into v_gt_beer_pong  from game_types where name = 'Beer Pong'  and is_preset = true limit 1;
  select id into v_gt_chess      from game_types where name = 'Chess'      and is_preset = true limit 1;
  select id into v_gt_poker      from game_types where name = 'Poker'      and is_preset = true limit 1;


  -- ─────────────────────────────────────────
  -- MOCK GROUP
  -- ─────────────────────────────────────────
  insert into groups (id, name, description, owner_id) values
    (v_group_id, 'The Usual Crew', 'Friday night game nights', v_nick);


  -- ─────────────────────────────────────────
  -- MOCK GROUP MEMBERS
  -- Nick is admin (owner), others are members
  -- ─────────────────────────────────────────
  insert into group_members (group_id, user_id, role) values
    (v_group_id, v_nick,   'admin'),
    (v_group_id, v_jeff,   'member'),
    (v_group_id, v_sarah,  'member'),
    (v_group_id, v_marcus, 'member'),
    (v_group_id, v_priya,  'member'),
    (v_group_id, v_tommy,  'member');


  -- ─────────────────────────────────────────
  -- MOCK GAMES & RESULTS
  -- ─────────────────────────────────────────

  -- GAME 1: Nick vs Jeff — Ping Pong — Nick wins 21-15
  insert into games (id, group_id, game_type_id, logged_by, played_at, is_draw, notes) values
    (v_game1, v_group_id, v_gt_ping_pong, v_nick, now() - interval '30 days', false, 'Best of 3, Nick takes it');

  insert into game_teams (id, game_id, team_label, is_winner, score) values
    (v_team1a, v_game1, null, true,  21),
    (v_team1b, v_game1, null, false, 15);

  insert into game_participants (game_id, game_team_id, user_id) values
    (v_game1, v_team1a, v_nick),
    (v_game1, v_team1b, v_jeff);


  -- GAME 2: Jeff vs Nick — Ping Pong — Jeff wins 21-18
  insert into games (id, group_id, game_type_id, logged_by, played_at, is_draw) values
    (v_game2, v_group_id, v_gt_ping_pong, v_nick, now() - interval '28 days', false);

  insert into game_teams (id, game_id, team_label, is_winner, score) values
    (v_team2a, v_game2, null, false, 18),
    (v_team2b, v_game2, null, true,  21);

  insert into game_participants (game_id, game_team_id, user_id) values
    (v_game2, v_team2a, v_nick),
    (v_game2, v_team2b, v_jeff);


  -- GAME 3: Mario Kart FFA — Nick wins, Sarah 2nd, Marcus 3rd, Tommy 4th
  insert into games (id, group_id, game_type_id, logged_by, played_at, is_draw) values
    (v_game3, v_group_id, v_gt_mario_kart, v_nick, now() - interval '25 days', false);

  insert into game_teams (id, game_id, team_label, is_winner, score) values
    (v_team3a, v_game3, null, true,  58),
    (v_team3b, v_game3, null, false, 45),
    (v_team3c, v_game3, null, false, 38),
    (v_team3d, v_game3, null, false, 22);

  insert into game_participants (game_id, game_team_id, user_id) values
    (v_game3, v_team3a, v_nick),
    (v_game3, v_team3b, v_sarah),
    (v_game3, v_team3c, v_marcus),
    (v_game3, v_team3d, v_tommy);


  -- GAME 4: Beer Pong — Nick & Sarah vs Jeff & Marcus — Nick/Sarah win
  insert into games (id, group_id, game_type_id, logged_by, played_at, is_draw) values
    (v_game4, v_group_id, v_gt_beer_pong, v_nick, now() - interval '20 days', false);

  insert into game_teams (id, game_id, team_label, is_winner, score) values
    (v_team4a, v_game4, 'Team A', true,  null),
    (v_team4b, v_game4, 'Team B', false, null);

  insert into game_participants (game_id, game_team_id, user_id) values
    (v_game4, v_team4a, v_nick),
    (v_game4, v_team4a, v_sarah),
    (v_game4, v_team4b, v_jeff),
    (v_game4, v_team4b, v_marcus);


  -- GAME 5: Chess — Sarah vs Priya — Draw
  insert into games (id, group_id, game_type_id, logged_by, played_at, is_draw) values
    (v_game5, v_group_id, v_gt_chess, v_sarah, now() - interval '15 days', true);

  insert into game_teams (id, game_id, team_label, is_winner, score) values
    (v_team5a, v_game5, null, false, null),
    (v_team5b, v_game5, null, false, null);

  insert into game_participants (game_id, game_team_id, user_id) values
    (v_game5, v_team5a, v_sarah),
    (v_game5, v_team5b, v_priya);


  -- GAME 6: Poker FFA — Marcus wins
  insert into games (id, group_id, game_type_id, logged_by, played_at, is_draw) values
    (v_game6, v_group_id, v_gt_poker, v_nick, now() - interval '10 days', false);

  insert into game_teams (id, game_id, team_label, is_winner, score) values
    (v_team6a, v_game6, null, true,  null),
    (v_team6b, v_game6, null, false, null),
    (v_team6c, v_game6, null, false, null),
    (v_team6d, v_game6, null, false, null),
    (v_team6e, v_game6, null, false, null),
    (v_team6f, v_game6, null, false, null);

  insert into game_participants (game_id, game_team_id, user_id) values
    (v_game6, v_team6a, v_marcus),
    (v_game6, v_team6b, v_nick),
    (v_game6, v_team6c, v_jeff),
    (v_game6, v_team6d, v_sarah),
    (v_game6, v_team6e, v_priya),
    (v_game6, v_team6f, v_tommy);


  -- GAME 7: Nick vs Jeff — Ping Pong — Nick wins 21-11
  insert into games (id, group_id, game_type_id, logged_by, played_at, is_draw) values
    (v_game7, v_group_id, v_gt_ping_pong, v_nick, now() - interval '7 days', false);

  insert into game_teams (id, game_id, team_label, is_winner, score) values
    (v_team7a, v_game7, null, true,  21),
    (v_team7b, v_game7, null, false, 11);

  insert into game_participants (game_id, game_team_id, user_id) values
    (v_game7, v_team7a, v_nick),
    (v_game7, v_team7b, v_jeff);


  -- GAME 8: Mario Kart FFA — Jeff wins
  insert into games (id, group_id, game_type_id, logged_by, played_at, is_draw) values
    (v_game8, v_group_id, v_gt_mario_kart, v_jeff, now() - interval '3 days', false);

  insert into game_teams (id, game_id, team_label, is_winner, score) values
    (v_team8a, v_game8, null, false, 41),
    (v_team8b, v_game8, null, true,  60),
    (v_team8c, v_game8, null, false, 35),
    (v_team8d, v_game8, null, false, 28);

  insert into game_participants (game_id, game_team_id, user_id) values
    (v_game8, v_team8a, v_nick),
    (v_game8, v_team8b, v_jeff),
    (v_game8, v_team8c, v_priya),
    (v_game8, v_team8d, v_tommy);


  -- ─────────────────────────────────────────
  -- MOCK INVITE LINK (already expired — safe for testing)
  -- ─────────────────────────────────────────
  insert into group_invites (group_id, created_by, token, expires_at, revoked) values
    (v_group_id, v_nick, 'mock-invite-token-abc123', now() - interval '1 day', false);

end $$;
