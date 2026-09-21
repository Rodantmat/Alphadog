-- ============================================================================================================
-- ITEM 1 - THE MODEL AGAINST PRIZEPICKS' PRICES AND REAL OUTCOMES, TWO SEASONS (prepared 2026-09-21)
-- Inputs: nba_score.board_scored (point-in-time model scores, app='prizepicks'), nba_market.pp_leg_price
-- (current pricing version, latest snapshot per leg), nba_market.board_outcomes (realized results).
-- Leg value = 2 x factor x hit: a leg's multiplicative contribution to a slip. Breakeven per leg:
--   2-pick Power (3.0x): sqrt(4/3) = 1.1547   |   3-pick Power (6.0x): (4/3)^(1/3) = 1.1006
-- Leg-level value ignores slip compression above 9.1x and rounding - it OVERSTATES big demons (use
-- nba_market.pp_slip_power for exact slips). Extrapolated prices are excluded from every pricing verdict.
-- ============================================================================================================

-- STEP 1: the per-leg base table (one row per model-scored PrizePicks leg)
DROP TABLE IF EXISTS nba_market.pp_model_vs_price;
CREATE TABLE nba_market.pp_model_vs_price AS
WITH m(prop, base_market) AS (VALUES
  ('points','player_points'),('rebounds','player_rebounds'),('assists','player_assists'),('threes_made','player_threes'),
  ('pts_reb','player_points_rebounds'),('pts_ast','player_points_assists'),('reb_ast','player_rebounds_assists'),
  ('pra','player_points_rebounds_assists'),('blocks','player_blocks'),('steals','player_steals'),
  ('stocks','player_blocks_steals'),('turnovers','player_turnovers')
), s AS (
  SELECT b.game_date, b.season, b.player, b.prop, m.base_market, b.line, b.side,
         b.baseline_hp, b.cal_shift, b.final_hp, b.confidence, b.score
  FROM nba_score.board_scored b JOIN m USING (prop)
  WHERE b.app = 'prizepicks'
), p AS (
  SELECT DISTINCT ON (game_date, player, base_market, line, side)
         game_date, player, base_market, line, side, kind, anchor_type, implied_p, factor, price_source, price_reason
  FROM nba_market.pp_leg_price
  ORDER BY game_date, player, base_market, line, side, snapshot_label DESC
), o AS (
  SELECT DISTINCT ON (game_date, player, replace(market_key, '_alternate', ''), line, side)
         game_date, player, replace(market_key, '_alternate', '') AS base_market, line, side, leg_result, stat_actual
  FROM nba_market.board_outcomes   -- NO bookmaker filter: the column is NULL; outcomes are graded once per
                                   -- player/market/line/side, independent of the app (verified 2026-09-21)
  ORDER BY game_date, player, replace(market_key, '_alternate', ''), line, side, snapshot_label DESC
)
SELECT s.*, p.kind, p.anchor_type, p.implied_p AS pp_p, p.factor, p.price_source, p.price_reason,
       o.leg_result, o.stat_actual,
       CASE WHEN o.leg_result = 'over_win'  THEN s.side = 'Over'
            WHEN o.leg_result = 'under_win' THEN s.side = 'Under' END AS hit   -- NULL for push / dnp / ungraded
FROM s
LEFT JOIN p USING (game_date, player, base_market, line, side)
LEFT JOIN o USING (game_date, player, base_market, line, side);

CREATE INDEX pp_model_vs_price_idx ON nba_market.pp_model_vs_price (season, prop, kind);

-- Q0: COVERAGE - every scored leg should join a price; most should carry a result
SELECT season, count(*) AS model_scored_pp_legs, count(factor) AS priced, count(hit) AS graded,
       count(*) FILTER (WHERE hit IS NOT NULL AND factor IS NOT NULL) AS usable,
       count(*) FILTER (WHERE price_reason = 'extrapolated_beyond_mined_range') AS extrapolated,
       count(*) FILTER (WHERE leg_result IN ('push','dnp')) AS push_or_dnp
FROM nba_market.pp_model_vs_price GROUP BY season ORDER BY season;

-- Q1: WHO PREDICTS HITS BETTER - the model or PrizePicks' own pricing? (lower Brier = better)
SELECT season, kind, count(*) AS legs,
       round(avg(final_hp)::numeric, 4) AS model_p, round(avg(pp_p)::numeric, 4) AS pp_p,
       round(avg(hit::int)::numeric, 4) AS actual,
       round(avg(power(final_hp - hit::int, 2))::numeric, 5) AS brier_model,
       round(avg(power(pp_p - hit::int, 2))::numeric, 5) AS brier_pp
FROM nba_market.pp_model_vs_price
WHERE hit IS NOT NULL AND factor IS NOT NULL AND price_reason IS DISTINCT FROM 'extrapolated_beyond_mined_range'
GROUP BY season, kind ORDER BY season, kind;

-- Q2a: DOES CALIBRATION HELP? Scores are point-in-time, so this is out of sample (improvement > 0 = helps)
SELECT season, prop, count(*) AS legs,
       round(avg(power(baseline_hp - hit::int, 2))::numeric, 5) AS brier_raw,
       round(avg(power(final_hp - hit::int, 2))::numeric, 5) AS brier_calibrated,
       round((avg(power(baseline_hp - hit::int, 2)) - avg(power(final_hp - hit::int, 2)))::numeric, 5) AS improvement,
       round(avg(abs(cal_shift))::numeric, 4) AS avg_abs_shift,
       round(avg(baseline_hp)::numeric, 4) AS raw_p, round(avg(final_hp)::numeric, 4) AS calibrated_p,
       round(avg(hit::int)::numeric, 4) AS actual
FROM nba_market.pp_model_vs_price
WHERE hit IS NOT NULL
GROUP BY season, prop ORDER BY season, prop;

-- Q2b: THE GUARD QUESTION - do the LARGE shifts help or hurt? (the ladder recipe discards Platt shifts > 0.15)
SELECT CASE WHEN cal_shift = 0 THEN '0 no shift' WHEN abs(cal_shift) <= 0.15 THEN '1 up to 0.15'
            WHEN abs(cal_shift) <= 0.30 THEN '2 0.15 to 0.30' ELSE '3 above 0.30' END AS shift_size,
       count(*) AS legs,
       round(avg(power(baseline_hp - hit::int, 2))::numeric, 5) AS brier_raw,
       round(avg(power(final_hp - hit::int, 2))::numeric, 5) AS brier_calibrated,
       round((avg(power(baseline_hp - hit::int, 2)) - avg(power(final_hp - hit::int, 2)))::numeric, 5) AS improvement
FROM nba_market.pp_model_vs_price
WHERE hit IS NOT NULL
GROUP BY 1 ORDER BY 1;

-- Q3: IS THE MODEL'S CLAIMED EDGE REAL? Bucket by what the model says a leg is worth; compare to what it paid
WITH v AS (
  SELECT kind, 2 * factor * final_hp AS model_value, 2 * factor * hit::int AS realized_value
  FROM nba_market.pp_model_vs_price
  WHERE hit IS NOT NULL AND factor IS NOT NULL AND price_reason IS DISTINCT FROM 'extrapolated_beyond_mined_range'
)
SELECT CASE WHEN model_value < 0.90 THEN 'a below 0.90' WHEN model_value < 1.00 THEN 'b 0.90-1.00'
            WHEN model_value < 1.10 THEN 'c 1.00-1.10' WHEN model_value < 1.1547 THEN 'd 1.10-1.155'
            WHEN model_value < 1.25 THEN 'e 1.155-1.25' WHEN model_value < 1.50 THEN 'f 1.25-1.50'
            ELSE 'g 1.50 and up' END AS model_says,
       count(*) AS legs,
       round(avg(model_value)::numeric, 4) AS model_value,
       round(avg(realized_value)::numeric, 4) AS realized_value,
       round((stddev_samp(realized_value) / sqrt(count(*)))::numeric, 4) AS realized_se
FROM v GROUP BY 1 ORDER BY 1;

-- Q4: THE SELECTION BACKTEST - bet only what the model rates at or above a threshold; one leg per
-- player-prop-day (its best rung) so ladder rungs sharing one outcome are not counted as independent evidence
WITH v AS (
  SELECT game_date, season, player, prop, kind,
         2 * factor * final_hp AS model_value, 2 * factor * hit::int AS realized_value
  FROM nba_market.pp_model_vs_price
  WHERE hit IS NOT NULL AND factor IS NOT NULL AND price_reason IS DISTINCT FROM 'extrapolated_beyond_mined_range'
), best AS (
  SELECT DISTINCT ON (game_date, player, prop) *
  FROM v ORDER BY game_date, player, prop, model_value DESC
), t(threshold) AS (VALUES (1.1006), (1.1547), (1.25), (1.40))
SELECT t.threshold, b.season, count(*) AS legs_selected,
       round(avg(b.model_value)::numeric, 4) AS model_claimed,
       round(avg(b.realized_value)::numeric, 4) AS realized_value,
       round((stddev_samp(b.realized_value) / sqrt(count(*)))::numeric, 4) AS se,
       count(*) FILTER (WHERE b.kind = 'standard') AS standards,
       count(*) FILTER (WHERE b.kind = 'goblin') AS goblins,
       count(*) FILTER (WHERE b.kind = 'demon') AS demons
FROM t JOIN best b ON b.model_value >= t.threshold
GROUP BY t.threshold, b.season ORDER BY t.threshold, b.season;
