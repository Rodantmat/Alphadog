-- nba_score.build_ud_tier_map_legs_curr_mf()  -- source of record for the DB function (applied 2026-10-09).
--
-- THE UNDERDOG MARKET-FREE TWIN (round 3, candidate 4; the PrizePicks twin is build_tier_map_legs_sel_mf.sql, round 2 P3#4).
-- The certified Underdog backtest (nba_score.ud_tier_map_legs_curr -> ud_slip_engine_slips_dlt_orig2) ranks six of its
-- fourteen cells by nba_score.final_hp.score, which in the history carries the confidence model's market term (f_books =
-- books/4, f_agree 0.85/0.55 from the Odds API feed). The live Underdog engine (ud_live_slip_engine.load_legs) reads the same
-- column from the DAILY final_hp, where there is no sportsbook feed: f_books = 0, f_agree = 0.55 for every leg. This function
-- rebuilds the leg table exactly as live scores it, so the paper engine's backtest, its validation and the edge-monitor
-- reference (ud_edge_monitor_ref) can be computed on the faithful simulation (tables *_curr_mf; the live engine reads the
-- twin through the tunable nba_config.classification_config['live_backtest_suffix'].ud_suffix).
-- Only rank_key 'final_score' carries the score; 'final_hp' and 'baseline_hp' hold a probability and are copied untouched.
-- Verified 2026-10-09: 1,265,457 rows (= source); 101,052 final_score legs carry a market term (24%), mean shift -5.59,
-- range -12.28..-0.04; the 320,767 without one are byte-identical; n_rank re-ordered for 167,298 legs; cell_size unchanged.
-- Deductions are read from nba_score.confidence_model (never hardcoded). Same formula as the PrizePicks function; the Underdog
-- legs carry player_id, so the join needs no name map. cell_size is unchanged (same legs, re-ordered).
CREATE OR REPLACE FUNCTION nba_score.build_ud_tier_map_legs_curr_mf()
 RETURNS bigint
 LANGUAGE plpgsql
AS $function$
DECLARE n bigint; d_books numeric; d_agree numeric;
BEGIN
  SELECT deduction INTO d_books FROM nba_score.confidence_model WHERE factor = 'f_books';
  SELECT deduction INTO d_agree FROM nba_score.confidence_model WHERE factor = 'f_agree';
  IF d_books IS NULL OR d_agree IS NULL THEN RAISE EXCEPTION 'confidence_model lacks f_books / f_agree'; END IF;
  DROP TABLE IF EXISTS nba_score.ud_tier_map_legs_curr_mf_new;
  CREATE TABLE nba_score.ud_tier_map_legs_curr_mf_new AS
  WITH j AS (
    SELECT s.*, f.confidence AS conf, f.c_market AS cm, f.final_hp AS hp
    FROM nba_score.ud_tier_map_legs_curr s
    LEFT JOIN nba_score.final_hp f ON s.rank_key = 'final_score' AND f.game_date = s.game_date AND f.player_id = s.player_id
                                   AND f.prop = s.prop AND f.side = s.side AND f.line = s.line
  ), r AS (
    -- legs without a market term are untouched (the stored score is the faithful one; recomputing from the 4-decimal stored
    -- hp / confidence adds +-0.02 of rounding noise). Legs with a market term move by the DIFFERENCE between the formula at
    -- the market-free confidence and the formula at the stored confidence, so the same rounding noise cancels.
    SELECT j.*,
      CASE WHEN j.rank_key <> 'final_score' OR j.cm IS NULL OR j.cm = 0 THEN j.score ELSE
        round(least(100.0, greatest(0.0, j.score
          + ( least(100.0, greatest(0.0,
              j.hp*100.0
              + (100.0 - j.hp*100.0) * least(1.0, greatest(0.0, ((j.conf - (d_books*j.cm + d_agree*0.30)/100.0) - 0.85)/0.15)) * 0.5
              - j.hp*100.0 * least(1.0, greatest(0.0, -(((j.conf - (d_books*j.cm + d_agree*0.30)/100.0) - 0.85)/0.15))) * 0.35))
            - least(100.0, greatest(0.0,
              j.hp*100.0
              + (100.0 - j.hp*100.0) * least(1.0, greatest(0.0, (j.conf - 0.85)/0.15)) * 0.5
              - j.hp*100.0 * least(1.0, greatest(0.0, -((j.conf - 0.85)/0.15))) * 0.35)) )
        ))::numeric, 2)::double precision END AS score_mf
    FROM j)
  SELECT rank_key, season, game_date, player, player_id, prop, side, line, kind, tier, factor,
         score_mf AS score, hit,
         CASE WHEN rank_key = 'final_score'
              THEN row_number() OVER (PARTITION BY rank_key, game_date, prop, tier ORDER BY score_mf DESC, player, side, line)::int
              ELSE n_rank END AS n_rank,
         cell_size, now() AS built_at
  FROM r;
  CREATE INDEX ON nba_score.ud_tier_map_legs_curr_mf_new (rank_key, game_date, prop, tier);
  ANALYZE nba_score.ud_tier_map_legs_curr_mf_new;
  DROP TABLE IF EXISTS nba_score.ud_tier_map_legs_curr_mf;
  ALTER TABLE nba_score.ud_tier_map_legs_curr_mf_new RENAME TO ud_tier_map_legs_curr_mf;
  SELECT count(*) INTO n FROM nba_score.ud_tier_map_legs_curr_mf;
  RETURN n;
END $function$;
