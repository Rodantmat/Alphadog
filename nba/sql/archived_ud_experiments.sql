-- ARCHIVED UNDERDOG SLIP-ENGINE EXPERIMENTS (2026-10-13; owner: "if it is useless it can go, but you need to be sure").
--
-- 13 finished §30 experiment builds (slips + legs = 26 tables, ~4.1 GB) left the database after being PROVEN restorable:
--   archive  : GitHub Release db-archive-2026-10-14, assets nba_score.<table>.<season>.csv.gz (seasons 2024-25, 2025-26),
--              written by nba-db-history-archive.yml run 38521966027 (nba/dump_db_history.py)
--   proof    : nba-archive-verify.yml run 38522754675 (nba/verify_archive_restore.py) - every table restored into a temp copy
--              with IDENTICAL row count and whole-content fingerprint ("ALL 26 TABLES PROVEN RESTORABLE")
--   readers  : none in code, workflows, views or functions (grep + pg_views / pg_proc, 2026-10-13); their results are written up
--              in NBA_SLIP_BUILDING_STRATEGY.md §30 (all rejected or superseded). The Underdog tables production and research
--              still read STAY in the database: _dlt_orig2 / _dlt_orig2_mf (live reference, P5, edge monitor, parity, price
--              shop), _dlt_recert2 (bankroll sim, drought analysis), _center (validator default).
--   also dropped: ud_slip_engine_slips_dlt_recert_nv48 / ud_slip_engine_legs_dlt_recert_nv48 - empty (0 rows), never filled.
--
-- Suffixes: '' (base build), _center_hot, _curr_center, _curr_center_hc0, _curr_center_orig, _dlt_orig, _dlt_orig_fresh,
--           _dlt_orig_nv48, _dlt_recert, _dlt_under3, _hotform, _minfall, _minrise
--
-- RESTORE ONE BUILD (replace <sfx>; then load both season files of each table):
CREATE TABLE nba_score.ud_slip_engine_slips<sfx> (game_date date, season text, phase text, composition text, size integer,
  structure text, k integer, legs_json jsonb, hits integer, payout double precision, stake double precision, profit double precision,
  built_at timestamp with time zone DEFAULT now());
CREATE TABLE nba_score.ud_slip_engine_legs<sfx> (game_date date, composition text, size integer, structure text, k integer,
  cell text, player text, prop text, tier text, side text, line numeric, factor double precision, hit integer,
  built_at timestamp with time zone DEFAULT now());
--   gh release download db-archive-2026-10-14 -p 'nba_score.ud_slip_engine_slips<sfx>.*.csv.gz'
--   gunzip -c nba_score.ud_slip_engine_slips<sfx>.2024-25.csv.gz | psql "$DATABASE_URL" -c "\copy nba_score.ud_slip_engine_slips<sfx> FROM STDIN WITH (FORMAT csv, HEADER)"
--   (same for 2025-26 and for the _legs table)
