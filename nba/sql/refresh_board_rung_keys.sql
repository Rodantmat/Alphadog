-- nba_market.refresh_board_rung_keys(d1, d2)  -- source of record for the DB function (round-2 P3#16: critical-path SQL
-- used to live only in the database). Apply with psql -f after any edit; the version in the database must equal this file.
--
-- Rebuilds nba_market.board_rung_keys for [d1, d2]:
--   'real'        every app, every snapshot label, mapped through the scorer's market vocabulary (kept in step with
--                 score_board_legs.MARKET_TO_PROP BY HAND - derived props and the full period set 2026-09-25;
--                 _promo stripped like _alternate 2026-09-27). Names resolve through nba_ref.norm_name.
--   'derived'     the simulated legs in nba_market.prop_universe.
--   'wn_neighbor' (2026-10-08, round-2 P2A#6) the k+0.5 / k-0.5 half-point rungs of every REAL whole-number FULL key.
--                 build_whole_number_hp prices a whole-number line from exactly those two rungs; until today they survived
--                 prune_baseline_to_board only when a goblin/demon or a simulated line happened to sit there (measured
--                 2026-03-15: 15 of 205 whole-number keys unpriced). build_final_hp routes a rung whose ONLY source is
--                 'wn_neighbor' to final_hp_derived (derivation 'wn_neighbor'), never to final_hp, so the certified surface
--                 is unchanged; min(src) keeps 'derived'/'real' for a rung that is also on a board.
CREATE OR REPLACE FUNCTION nba_market.refresh_board_rung_keys(d1 date, d2 date)
 RETURNS bigint
 LANGUAGE plpgsql
AS $function$
DECLARE n bigint;
BEGIN
  DELETE FROM nba_market.board_rung_keys WHERE game_date BETWEEN d1 AND d2;
  INSERT INTO nba_market.board_rung_keys (game_date, player_id, prop, period, line, src)
  WITH real AS (
    SELECT b.game_date, m.player_id::text AS player_id, v.prop, v.period, b.line
    FROM nba_market.board_snapshots b
    JOIN (VALUES
      ('player_points','points','FULL'),('player_rebounds','rebounds','FULL'),('player_assists','assists','FULL'),
      ('player_threes','threes_made','FULL'),('player_blocks','blocks','FULL'),('player_steals','steals','FULL'),
      ('player_turnovers','turnovers','FULL'),('player_points_rebounds_assists','pra','FULL'),
      ('player_points_rebounds','pts_reb','FULL'),('player_points_assists','pts_ast','FULL'),
      ('player_rebounds_assists','reb_ast','FULL'),('player_blocks_steals','stocks','FULL'),
      ('player_double_double','double_double','FULL'),('player_fantasy_points','fantasy_score','FULL'),
      ('player_ftm','ftm','FULL'),('player_fga','fga','FULL'),('player_fgm','fgm','FULL'),('player_fta','fta','FULL'),
      ('player_threes_attempted','fg3a','FULL'),('player_oreb','oreb','FULL'),('player_dreb','dreb','FULL'),
      ('player_personal_fouls','personal_fouls','FULL'),
      ('player_points_q1','points','Q1'),('player_rebounds_q1','rebounds','Q1'),('player_assists_q1','assists','Q1'),
      ('player_threes_q1','threes_made','Q1'),
      ('player_points_h1','points','H1'),('player_rebounds_h1','rebounds','H1'),('player_assists_h1','assists','H1'),
      ('player_threes_h1','threes_made','H1'),
      ('player_points_h2','points','H2'),('player_rebounds_h2','rebounds','H2'),('player_assists_h2','assists','H2'),
      ('player_threes_h2','threes_made','H2'),
      ('player_points_q4','points','Q4'),('player_rebounds_q4','rebounds','Q4'),('player_assists_q4','assists','Q4'),
      ('player_threes_q4','threes_made','Q4')) AS v(mk, prop, period)
      ON replace(replace(b.market_key, '_alternate', ''), '_promo', '') = v.mk
    JOIN nba_ref.player_name_map m ON m.norm_name = nba_ref.norm_name(b.player)
    WHERE b.line IS NOT NULL AND b.game_date BETWEEN d1 AND d2
  )
  SELECT game_date, player_id, prop, period, line, min(src)
  FROM (
    SELECT game_date, player_id, prop, period, line, 'real' AS src FROM real
    UNION ALL
    SELECT u.game_date, u.player_id::text, u.prop, 'FULL', u.line, 'derived'
    FROM nba_market.prop_universe u
    WHERE u.line_source = 'simulated' AND u.line IS NOT NULL AND u.game_date BETWEEN d1 AND d2
    UNION ALL
    SELECT r.game_date, r.player_id, r.prop, 'FULL', r.line + o.off, 'wn_neighbor'
    FROM real r CROSS JOIN (VALUES (0.5::numeric), (-0.5::numeric)) AS o(off)
    WHERE r.period = 'FULL' AND r.line = floor(r.line) AND r.line + o.off >= 0
  ) k
  GROUP BY game_date, player_id, prop, period, line;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $function$;
