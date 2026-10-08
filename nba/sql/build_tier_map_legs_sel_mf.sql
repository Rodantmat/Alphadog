-- nba_score.build_tier_map_legs_sel_mf()  -- source of record for the DB function (applied 2026-10-08).
--
-- THE MARKET-FREE BACKTEST (round 2, P3#4). The certified selection table (nba_score.tier_map_legs_sel) was scored with the
-- confidence model's market term (f_books = books/4, f_agree 0.85/0.55 from the Odds API feed the history had). The LIVE
-- pipeline has no sportsbook feed, so every live leg carries f_books = 0 and f_agree = 0.55 - a uniform deduction that moves
-- `score` (hp100 + headroom x lift - hp100 x drop) for every leg and re-orders n_rank. This function rebuilds the selection
-- table exactly as live scores it, so the slip engine, the validator, the live hurdle calibration and the edge-monitor
-- reference can be computed on the faithful simulation (tables *_mf / *_mf_nosteals; P5 steps 1c / 3c / 3d / 5c / 5d; the
-- live engine's table suffix is the tunable nba_config.classification_config['live_backtest_suffix']).
-- Only rank_key 'final_score' carries the score; the other rank keys hold a probability and are copied untouched.
-- Deductions are read from nba_score.confidence_model (never hardcoded). Verified: 0 score differences on all 2,700,213
-- rows against the scratch study table (2026-10-08); whole-number legs (final_hp_derived) keep their score.
CREATE OR REPLACE FUNCTION nba_score.build_tier_map_legs_sel_mf()
 RETURNS bigint
 LANGUAGE plpgsql
AS $function$
DECLARE n bigint; d_books numeric; d_agree numeric;
BEGIN
  SELECT deduction INTO d_books FROM nba_score.confidence_model WHERE factor = 'f_books';
  SELECT deduction INTO d_agree FROM nba_score.confidence_model WHERE factor = 'f_agree';
  IF d_books IS NULL OR d_agree IS NULL THEN RAISE EXCEPTION 'confidence_model lacks f_books / f_agree'; END IF;
  DROP TABLE IF EXISTS nba_score.tier_map_legs_sel_mf_new;
  CREATE TABLE nba_score.tier_map_legs_sel_mf_new AS
  WITH j AS (
    SELECT s.*, f.confidence AS conf, f.c_market AS cm, f.final_hp AS hp
    FROM nba_score.tier_map_legs_sel s
    LEFT JOIN nba_ref.player_name_map m ON s.rank_key = 'final_score' AND m.norm_name = nba_ref.norm_name(s.player)
    LEFT JOIN nba_score.final_hp f ON s.rank_key = 'final_score' AND f.game_date = s.game_date AND f.player_id = m.player_id::text
                                   AND f.prop = s.prop AND f.side = s.side AND f.line = s.line
  ), r AS (
    SELECT j.*,
      CASE WHEN j.rank_key <> 'final_score' OR j.cm IS NULL THEN j.score ELSE
        round(least(100.0, greatest(0.0,
          j.hp*100.0
          + (100.0 - j.hp*100.0) * least(1.0, greatest(0.0, ((j.conf - (d_books*j.cm + CASE WHEN j.cm > 0 THEN d_agree*0.30 ELSE 0 END)/100.0) - 0.85)/0.15)) * 0.5
          - j.hp*100.0 * least(1.0, greatest(0.0, -(((j.conf - (d_books*j.cm + CASE WHEN j.cm > 0 THEN d_agree*0.30 ELSE 0 END)/100.0) - 0.85)/0.15))) * 0.35
        ))::numeric, 2)::double precision END AS score_mf
    FROM j)
  SELECT rank_key, season, game_date, player, prop, side, line, kind, tier, rung, factor,
         score_mf AS score, hit,
         CASE WHEN rank_key = 'final_score'
              THEN row_number() OVER (PARTITION BY rank_key, game_date, prop, tier ORDER BY score_mf DESC, player, side, line)::int
              ELSE n_rank END AS n_rank,
         cell_size
  FROM r;
  CREATE INDEX ON nba_score.tier_map_legs_sel_mf_new (rank_key, game_date, prop, tier);
  DROP TABLE IF EXISTS nba_score.tier_map_legs_sel_mf;
  ALTER TABLE nba_score.tier_map_legs_sel_mf_new RENAME TO tier_map_legs_sel_mf;
  SELECT count(*) INTO n FROM nba_score.tier_map_legs_sel_mf;
  RETURN n;
END $function$;
