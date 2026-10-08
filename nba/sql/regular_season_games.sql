-- nba_calendar.regular_season_games -- source of record for the view (applied to the database 2026-10-08).
--
-- THE ONE SLATE PREDICATE (round 2, 2026-10-08). "Is this a slate day / is this game part of a slate" was answered by
-- three different tests across the pipelines: a label regex '(preseason|play-in|round|semifinal|final|all-star|rising
-- stars)' (scheduler, P2B, certify, live engine), `game_label <> 'Preseason'` (P3, P4, prune, small-slate rule) and
-- `game_id LIKE '002%'` (the delta worker, the live engine's season_block). The regex let the NBA Cup FINAL through
-- (label 'Emirates NBA Cup', game id prefix 006 - its stats do not count toward the regular season, stats.nba.com's
-- regular-season logs exclude it, and the certified history built NO slate for 2025-12-16), and the Preseason-only test
-- let play-in / playoff / All-Star days through. The league's own game-id prefix is unambiguous:
--   001 preseason, 002 regular season (incl. NBA Cup group and knockout games), 003 All-Star, 004 playoffs,
--   005 play-in, 006 NBA Cup Final.
-- Every pipeline, the certifier and both live engines read this view; nothing else decides what a slate is.
CREATE OR REPLACE VIEW nba_calendar.regular_season_games AS
SELECT * FROM nba_calendar.games WHERE game_id LIKE '002%';
