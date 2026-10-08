-- nba_calendar.slate_games -- source of record for the view (applied to the database 2026-10-08, strategy §31w P-6).
--
-- THE SLATE PREDICATE. "Is there a slate tonight" = a regular-season (002), play-in (005) or playoff (004) game on the date.
-- Preseason (001), All-Star (003) and the NBA Cup Final (006) are not slates (their stats do not count toward the season logs
-- the model is built on; see nba/sql/regular_season_games.sql for the prefix table).
-- Read by: the scheduler (first tip -> P2A / P2B / P3 / close timing), P2B (slate gate, referee poll), P3 (slate gate), P4
-- (slate gate), prune_baseline_to_board.py (off day vs missing archive), certify_pipeline.py (slate checks), the live engine
-- (post-tip guard, board team fallback, slate size).
-- nba_calendar.regular_season_games (002 only) stays wherever the question is "where is the REGULAR SEASON": the live
-- engine's season block (week 1/2, All-Star, late March, final 7), the Underdog stand-down calendar, check_factor_freshness
-- and certify_pipeline's "played recently" (products built from regular-season logs).
-- A postseason slate takes its own path where it differs: live_slip_engine.pick_postseason, the Underdog stand-down
-- 'postseason', phase 5_postseason in final_hp / as-of calibration / score_board_legs.
CREATE OR REPLACE VIEW nba_calendar.slate_games AS
SELECT * FROM nba_calendar.games WHERE game_id LIKE '002%' OR game_id LIKE '004%' OR game_id LIKE '005%';
