CREATE TABLE IF NOT EXISTS pitcher_schema_migrations (
  migration_key TEXT PRIMARY KEY,
  package_version TEXT NOT NULL,
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS pitcher_game_logs (
  player_id INTEGER NOT NULL,
  game_pk INTEGER NOT NULL,
  season INTEGER NOT NULL,
  game_date TEXT,
  team_id TEXT,
  opponent_team_id TEXT,
  opponent_team TEXT,
  is_home INTEGER,
  group_type TEXT DEFAULT 'pitching',
  player_name TEXT,
  role TEXT,
  innings_pitched REAL,
  innings_pitched_decimal REAL,
  outs_recorded INTEGER,
  batters_faced INTEGER,
  hits_allowed INTEGER,
  runs_allowed INTEGER,
  earned_runs INTEGER,
  walks_allowed INTEGER,
  strikeouts INTEGER,
  home_runs_allowed INTEGER,
  pitches INTEGER,
  balls INTEGER,
  strikes INTEGER,
  wins INTEGER,
  losses INTEGER,
  saves INTEGER,
  holds INTEGER,
  blown_saves INTEGER,
  stat_shape_json TEXT,
  raw_json TEXT,
  data_feed_key TEXT,
  source_key TEXT,
  source_endpoint TEXT,
  source_season INTEGER,
  source_game_type TEXT,
  ingestion_mode TEXT,
  batch_id TEXT,
  run_id TEXT,
  certification_status TEXT,
  certification_grade TEXT,
  source_confidence TEXT,
  certified_at TEXT,
  promoted_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (player_id, game_pk)
);

CREATE TABLE IF NOT EXISTS pitcher_game_log_batches (
  batch_id TEXT PRIMARY KEY,
  run_id TEXT,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  certification_status TEXT,
  certification_grade TEXT,
  worker_version TEXT,
  data_feed_key TEXT,
  source_key TEXT,
  source_endpoint TEXT,
  source_season INTEGER,
  source_game_type TEXT,
  group_type TEXT,
  base_backfill_cutoff_date TEXT,
  delta_start_date TEXT,
  delta_end_date TEXT,
  expected_pitcher_universe_count INTEGER DEFAULT 0,
  outcome_rows INTEGER DEFAULT 0,
  duplicate_outcome_rows INTEGER DEFAULT 0,
  source_request_count INTEGER DEFAULT 0,
  source_success_count INTEGER DEFAULT 0,
  source_no_data_count INTEGER DEFAULT 0,
  source_error_count INTEGER DEFAULT 0,
  rows_staged INTEGER DEFAULT 0,
  rows_promoted INTEGER DEFAULT 0,
  rows_after_cutoff INTEGER DEFAULT 0,
  duplicate_stage_keys INTEGER DEFAULT 0,
  live_rows_before INTEGER DEFAULT 0,
  live_rows_after INTEGER DEFAULT 0,
  universe_audit_json TEXT,
  source_probe_json TEXT,
  no_data_probe_json TEXT,
  error_json TEXT,
  started_at TEXT DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT,
  certified_at TEXT,
  promoted_at TEXT,
  cleaned_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pitcher_game_log_stage (
  stage_id TEXT PRIMARY KEY,
  player_id INTEGER NOT NULL,
  player_name TEXT,
  game_pk INTEGER,
  season INTEGER NOT NULL,
  game_date TEXT,
  team_id TEXT,
  opponent_team_id TEXT,
  opponent_team TEXT,
  is_home INTEGER,
  group_type TEXT DEFAULT 'pitching',
  role TEXT,
  innings_pitched TEXT,
  innings_pitched_decimal REAL,
  outs_recorded INTEGER,
  batters_faced INTEGER,
  hits_allowed INTEGER,
  runs_allowed INTEGER,
  earned_runs INTEGER,
  walks_allowed INTEGER,
  strikeouts INTEGER,
  home_runs_allowed INTEGER,
  pitches INTEGER,
  balls INTEGER,
  strikes INTEGER,
  wins INTEGER,
  losses INTEGER,
  saves INTEGER,
  holds INTEGER,
  blown_saves INTEGER,
  stat_shape_json TEXT,
  raw_json TEXT,
  data_feed_key TEXT,
  source_key TEXT,
  source_endpoint TEXT,
  source_season INTEGER,
  source_game_type TEXT,
  ingestion_mode TEXT,
  batch_id TEXT NOT NULL,
  run_id TEXT,
  certification_status TEXT,
  certification_grade TEXT,
  source_confidence TEXT,
  certified_at TEXT,
  promoted_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(batch_id, player_id, game_pk, group_type)
);

CREATE TABLE IF NOT EXISTS pitcher_game_log_player_outcomes (
  outcome_key TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  run_id TEXT,
  mode TEXT NOT NULL,
  player_id INTEGER NOT NULL,
  player_name TEXT,
  team_id TEXT,
  role_source TEXT,
  outcome_category TEXT NOT NULL,
  row_count INTEGER DEFAULT 0,
  filtered_after_cutoff_count INTEGER DEFAULT 0,
  source_http_status INTEGER,
  source_season INTEGER,
  source_endpoint TEXT,
  source_error TEXT,
  source_response_preview TEXT,
  raw_outcome_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(batch_id, player_id)
);

CREATE TABLE IF NOT EXISTS pitcher_game_log_cursors (
  batch_id TEXT PRIMARY KEY,
  run_id TEXT,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  expected_pitcher_universe_count INTEGER DEFAULT 0,
  cursor_offset INTEGER DEFAULT 0,
  current_player_id INTEGER,
  max_api_calls_per_tick INTEGER DEFAULT 0,
  max_rows_per_tick INTEGER DEFAULT 0,
  continuation_required INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pitcher_game_log_certifications (
  certification_id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  run_id TEXT,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  certification_status TEXT,
  certification_grade TEXT,
  check_key TEXT,
  check_status TEXT,
  expected_value TEXT,
  actual_value TEXT,
  details_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pitcher_splits (
  player_id INTEGER NOT NULL,
  season INTEGER NOT NULL,
  split_key TEXT NOT NULL,
  split_description TEXT,
  innings_pitched REAL,
  outs_recorded INTEGER,
  batters_faced INTEGER,
  hits_allowed INTEGER,
  earned_runs INTEGER,
  walks_allowed INTEGER,
  strikeouts INTEGER,
  era TEXT,
  whip TEXT,
  group_type TEXT DEFAULT 'pitching',
  split_code TEXT,
  split_source_code TEXT,
  data_feed_key TEXT,
  source_endpoint TEXT,
  source_season INTEGER,
  source_game_type TEXT,
  ingestion_mode TEXT,
  batch_id TEXT,
  run_id TEXT,
  certification_status TEXT,
  certification_grade TEXT,
  certified_at TEXT,
  promoted_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  source_snapshot_date TEXT,
  stat_shape_json TEXT,
  innings_pitched_decimal REAL,
  runs_allowed INTEGER,
  home_runs_allowed INTEGER,
  pitches INTEGER,
  strikes INTEGER,
  balls INTEGER,
  avg_against TEXT,
  obp_against TEXT,
  slg_against TEXT,
  ops_against TEXT,
  raw_json TEXT,
  source_key TEXT,
  source_confidence TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (player_id, season, split_key)
);

CREATE TABLE IF NOT EXISTS pitcher_metrics (
  player_id INTEGER PRIMARY KEY,
  player_name TEXT,
  team_id TEXT,
  season INTEGER,
  games_logged INTEGER,
  starts_logged INTEGER,
  first_game_date TEXT,
  last_game_date TEXT,
  total_outs_recorded INTEGER,
  total_batters_faced INTEGER,
  total_hits_allowed INTEGER,
  total_runs_allowed INTEGER,
  total_earned_runs INTEGER,
  total_walks_allowed INTEGER,
  total_strikeouts INTEGER,
  last3_json TEXT,
  last5_json TEXT,
  last10_json TEXT,
  last20_json TEXT,
  source_key TEXT,
  source_confidence TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pitcher_logs_date ON pitcher_game_logs(game_date);
CREATE INDEX IF NOT EXISTS idx_pitcher_logs_team ON pitcher_game_logs(team_id, game_date);
CREATE INDEX IF NOT EXISTS idx_pitcher_logs_lineage ON pitcher_game_logs(data_feed_key, batch_id, ingestion_mode);
CREATE INDEX IF NOT EXISTS idx_pitcher_logs_group_key ON pitcher_game_logs(player_id, game_pk, group_type);
CREATE INDEX IF NOT EXISTS idx_pitcher_logs_batch_promoted ON pitcher_game_logs(batch_id, data_feed_key, game_date);
CREATE INDEX IF NOT EXISTS idx_pitcher_metrics_last ON pitcher_metrics(last_game_date);
CREATE INDEX IF NOT EXISTS idx_pitcher_game_log_batches_status ON pitcher_game_log_batches(status, mode);
CREATE INDEX IF NOT EXISTS idx_pitcher_game_log_stage_batch ON pitcher_game_log_stage(batch_id, player_id, game_date);
CREATE INDEX IF NOT EXISTS idx_pitcher_game_log_stage_key ON pitcher_game_log_stage(player_id, game_pk, group_type);
CREATE INDEX IF NOT EXISTS idx_pitcher_game_log_outcomes_batch ON pitcher_game_log_player_outcomes(batch_id, outcome_category);
CREATE INDEX IF NOT EXISTS idx_pitcher_game_log_cursors_status ON pitcher_game_log_cursors(status, mode);

INSERT OR REPLACE INTO pitcher_schema_migrations VALUES ('schema_stats_pitcher_db_v0_3_0_base_promotion', 'alphadog-v2-base-pitcher-game-logs-v0.3.0-base-promotion-microphase', CURRENT_TIMESTAMP, 'Pitcher game-log lifecycle schema with certified-stage promotion microphase support');

-- ============================================================================
-- alphadog-v2-base-pitcher-splits-v0.1.0-schema-source-lock-probe
-- Additive lifecycle schema for Base Pitcher Splits.
-- Source lock:
--   GET /people/{playerId}/stats?stats=statSplits&group=pitching&season={season}&sitCodes=vl%2Cvr
-- Design:
--   v0.1.0 is schema/source-shape probe only.
--   No live pitcher_splits promotion.
--   No full base split mining.
--   No delta_update execution.
--   Splits are treated as season/source snapshots unless source proves date-window support.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pitcher_split_stage (
  stage_id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  player_id INTEGER NOT NULL,
  player_name TEXT,
  season INTEGER NOT NULL,
  group_type TEXT NOT NULL DEFAULT 'pitching',
  split_code TEXT NOT NULL,
  split_source_code TEXT,
  split_description TEXT,
  innings_pitched TEXT,
  innings_pitched_decimal REAL,
  outs_recorded INTEGER,
  batters_faced INTEGER,
  hits_allowed INTEGER,
  runs_allowed INTEGER,
  earned_runs INTEGER,
  home_runs_allowed INTEGER,
  strikeouts INTEGER,
  walks_allowed INTEGER,
  pitches INTEGER,
  strikes INTEGER,
  balls INTEGER,
  avg_against TEXT,
  obp_against TEXT,
  slg_against TEXT,
  ops_against TEXT,
  whip TEXT,
  era TEXT,
  data_feed_key TEXT NOT NULL,
  source_key TEXT NOT NULL,
  source_endpoint TEXT NOT NULL,
  source_season INTEGER NOT NULL,
  source_game_type TEXT,
  ingestion_mode TEXT NOT NULL,
  certification_status TEXT DEFAULT 'source_shape_probe_unverified',
  certification_grade TEXT,
  source_confidence TEXT DEFAULT 'SOURCE_LOCKED_STATSAPI_STATSPLITS_PITCHING_SITCODES_VL_VR_PROBE_ONLY',
  certified_at TEXT,
  promoted_at TEXT,
  source_snapshot_date TEXT,
  raw_json TEXT NOT NULL,
  stat_shape_json TEXT,
  row_status TEXT DEFAULT 'source_shape_probe_stage_only',
  row_error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(batch_id, player_id, season, group_type, split_code)
);

CREATE TABLE IF NOT EXISTS pitcher_split_batches (
  batch_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  worker_version TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  data_feed_key TEXT NOT NULL,
  source_key TEXT NOT NULL,
  source_endpoint TEXT NOT NULL,
  source_season INTEGER NOT NULL,
  source_game_type TEXT,
  source_snapshot_date TEXT,
  expected_pitcher_universe_count INTEGER DEFAULT 0,
  sample_size INTEGER DEFAULT 0,
  source_request_count INTEGER DEFAULT 0,
  source_success_count INTEGER DEFAULT 0,
  source_no_data_count INTEGER DEFAULT 0,
  source_error_count INTEGER DEFAULT 0,
  rows_staged INTEGER DEFAULT 0,
  rows_promoted INTEGER DEFAULT 0,
  duplicate_stage_keys INTEGER DEFAULT 0,
  duplicate_outcome_rows INTEGER DEFAULT 0,
  split_identifier_summary_json TEXT,
  field_summary_json TEXT,
  true_no_data_assessment TEXT,
  source_snapshot_assessment TEXT,
  certification_status TEXT DEFAULT 'probe_only_not_promotion_certified',
  certification_grade TEXT,
  certification_json TEXT,
  source_confidence TEXT DEFAULT 'SOURCE_LOCKED_STATSAPI_STATSPLITS_PITCHING_SITCODES_VL_VR_PROBE_ONLY',
  locked_by TEXT,
  lock_acquired_at TEXT,
  lock_expires_at TEXT,
  stale_recovery_count INTEGER DEFAULT 0,
  started_at TEXT DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT,
  certified_at TEXT,
  promoted_at TEXT,
  cleaned_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS pitcher_split_outcomes (
  batch_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  player_id INTEGER NOT NULL,
  player_name TEXT,
  cursor_offset INTEGER,
  source_endpoint TEXT NOT NULL,
  source_http_status INTEGER,
  source_ok INTEGER DEFAULT 0,
  raw_payload_split_count INTEGER DEFAULT 0,
  rows_staged INTEGER DEFAULT 0,
  promoted_row_count INTEGER DEFAULT 0,
  terminal_category TEXT NOT NULL,
  category_reason TEXT,
  source_error TEXT,
  source_snapshot_date TEXT,
  split_identifier_json TEXT,
  field_names_json TEXT,
  certification_status TEXT DEFAULT 'player_outcome_probe_only',
  certification_grade TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (batch_id, player_id)
);

CREATE TABLE IF NOT EXISTS pitcher_split_cursor (
  cursor_key TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  source_season INTEGER,
  source_snapshot_date TEXT,
  current_player_id INTEGER,
  current_player_offset INTEGER DEFAULT 0,
  players_total INTEGER DEFAULT 0,
  players_processed INTEGER DEFAULT 0,
  requests_done INTEGER DEFAULT 0,
  next_run_after TEXT,
  last_error TEXT,
  cursor_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pitcher_split_certifications (
  certification_id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  certification_status TEXT NOT NULL,
  certification_grade TEXT,
  checks_json TEXT NOT NULL,
  rows_staged INTEGER DEFAULT 0,
  rows_promoted INTEGER DEFAULT 0,
  duplicate_count INTEGER DEFAULT 0,
  no_data_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  source_snapshot_date TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pitcher_split_stage_batch ON pitcher_split_stage(batch_id, row_status);
CREATE INDEX IF NOT EXISTS idx_pitcher_split_stage_player ON pitcher_split_stage(player_id, season, split_code);
CREATE INDEX IF NOT EXISTS idx_pitcher_split_stage_cert ON pitcher_split_stage(certification_status, batch_id);
CREATE INDEX IF NOT EXISTS idx_pitcher_split_batches_status ON pitcher_split_batches(status, mode, updated_at);
CREATE INDEX IF NOT EXISTS idx_pitcher_split_cursor_status ON pitcher_split_cursor(status, mode, updated_at);
CREATE INDEX IF NOT EXISTS idx_pitcher_split_outcomes_batch_category ON pitcher_split_outcomes(batch_id, terminal_category);
CREATE INDEX IF NOT EXISTS idx_pitcher_split_outcomes_player ON pitcher_split_outcomes(player_id, batch_id);
CREATE INDEX IF NOT EXISTS idx_pitcher_splits_lineage ON pitcher_splits(batch_id, certification_status);
CREATE INDEX IF NOT EXISTS idx_pitcher_splits_player_split_code ON pitcher_splits(player_id, season, split_code);

-- Live pitcher_splits lineage/stat additions are attempted safely by the worker and duplicate-column errors are ignored.
-- If applying schema manually, inspect first with: PRAGMA table_info(pitcher_splits);
-- Then add only missing columns. Do not run guessed ALTER statements blindly.

INSERT OR REPLACE INTO pitcher_schema_migrations VALUES ('base_pitcher_splits_v0_1_0_schema_source_lock_probe', 'alphadog-v2-base-pitcher-splits-v0.1.0-schema-source-lock-probe', CURRENT_TIMESTAMP, 'Additive pitcher split lifecycle schema and lineage-ready live columns; source-shape probe only; no live promotion/full mining/delta execution');
