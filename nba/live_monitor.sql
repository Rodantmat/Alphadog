-- NBA LIVE MONITOR (strategy doc §29s). Run weekly in the first 21 days (and any time something looks off).
-- Every check is CUMULATIVE: a single day is one clustered observation and its win rate is noise (§29n).
-- Thresholds trigger a MANUAL REVIEW, never an automatic stop - the hurdle machine (H1-H7) owns stops.
-- Replace :d0 with the season's first slate date.

-- 1. KEY COVERAGE - is the low-foul key operating live? (it was a silent no-op until pass 80)
--    Backtest: ~13% of Regular 5-Flex slips carry 3+ low-foul legs; ~35% of defensive top-3 legs are low-foul.
--    REVIEW if the share of staked 5-Flex slips with 3+ low-foul legs is under 5% after 7 slate days,
--    or if pf20 is missing on more than 5% of staked legs.
WITH legs AS (
  SELECT s.game_date, s.strategy, s.k, s.size, s.structure, (j->>'pf20')::float pf20
  FROM nba_score.live_slips s, jsonb_array_elements(s.legs_json) j
  WHERE s.game_date >= :d0 AND s.status IN ('graded','graded_void'))
SELECT count(DISTINCT (game_date, strategy, k)) staked_slips,
       round(100.0 * avg(CASE WHEN pf20 IS NULL THEN 1 ELSE 0 END), 1) pct_legs_missing_pf20,
       round(100.0 * avg(CASE WHEN pf20 < 1.8 THEN 1 ELSE 0 END), 1) pct_legs_low_foul
FROM legs;

-- 2. LOW-FOUL EDGE - do low-foul legs out-hit the rest, live?
--    Backtest: defensive Unders 65% vs 57%, Overs 72% vs 58% (both seasons).
--    REVIEW at day 14 if low-foul legs hit BELOW the other legs (sign reversal), on 100+ legs each.
SELECT CASE WHEN (j->>'pf20')::float < 1.8 THEN 'low-foul' ELSE 'other' END foul, j->>'side' side,
       count(*) legs, round(100.0 * avg((j->>'hit')::int)) hit
FROM nba_score.live_slips s, jsonb_array_elements(s.legs_json) j
WHERE s.game_date >= :d0 AND s.status IN ('graded','graded_void') AND (j->>'hit') IS NOT NULL
  AND j->>'prop' IN ('steals','turnovers','blocks','stocks')
GROUP BY 1, 2 ORDER BY 2, 1;

-- 3. WEEK 1 OVER TILT - do defensive Overs beat Unders in the opening week?
--    Backtest: week-1 top-3 defensive Overs 74% vs Unders 55%.
--    REVIEW at day 7 if Overs <= Unders (the tilt's premise failed this year; week 2's spike signal will say the same).
SELECT j->>'side' side, count(*) legs, round(100.0 * avg((j->>'hit')::int)) hit
FROM nba_score.live_slips s, jsonb_array_elements(s.legs_json) j
WHERE s.game_date BETWEEN :d0 AND :d0 + 6 AND (j->>'hit') IS NOT NULL
  AND j->>'prop' IN ('steals','turnovers','blocks','stocks') AND j->>'tier' = 'R'
GROUP BY 1;

-- 4. WEEK 2 - the spike value (logged by pick on day 7) and the play's staked legs.
--    Backtest spike: +6.1% / +8.5% (fires at +3%). Backtest play: +137% / +138% on ~17 slips.
--    The kill switch stops the play after 3 graded days below 50% leg hit; REVIEW at day 14 regardless.
SELECT s.status, count(*) slips, round(avg(s.profit)::numeric * 100) roi, sum(s.hits) hits, sum(s.size) legs
FROM nba_score.live_slips s
WHERE s.game_date BETWEEN :d0 + 7 AND :d0 + 13
GROUP BY 1 ORDER BY 1;

-- 5. ROTATION - how often is the drought rotation on, and on which cell?
--    Backtest: ~10% of days are false-rotation days; the three long droughts were caught on days 4-6.
--    REVIEW if the rotation is on for more than 30% of the first 21 slate days (a miscalibrated EWMA start).
SELECT state, hurdles, updated_at FROM nba_score.live_strategy_state WHERE strategy = '_ROTATION';

-- 6. LATE PICK (record-only) - volume and hit vs the window board.
--    Backtest: ~11 defensive props/day added after the window; their top-3 hit 66% Over / 59% Under.
--    REVIEW at day 21: if late slips are ~0/day the close pull is too late for the tips (owner scheduling item).
SELECT s.game_date, count(*) late_slips, round(avg(s.profit)::numeric * 100) roi
FROM nba_score.live_slips s WHERE s.game_date >= :d0 AND s.status IN ('placed_late','graded_late')
GROUP BY 1 ORDER BY 1;

-- 7. STAKING SANITY - per strategy, staked vs recorded, and the daily ceiling.
--    REVIEW any day with placed_capped slips (the 36-unit ceiling bound: a raise or a bug is stacking stakes).
SELECT s.strategy, s.status, count(*) slips, round(sum(coalesce(s.profit, 0))::numeric, 1) net
FROM nba_score.live_slips s WHERE s.game_date >= :d0
GROUP BY 1, 2 ORDER BY 1, 2;
