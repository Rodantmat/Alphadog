CREATE TABLE IF NOT EXISTS hitter_schema_migrations (migration_key TEXT PRIMARY KEY, package_version TEXT NOT NULL, applied_at TEXT DEFAULT CURRENT_TIMESTAMP, notes TEXT);

CREATE TABLE IF NOT EXISTS hitter_game_logs (
  player_id INTEGER NOT NULL,
  game_pk INTEGER NOT NULL,
  season INTEGER NOT NULL,
  game_date TEXT,
  team_id TEXT,
  opponent_team_id TEXT,
  is_home INTEGER,
  batting_order INTEGER,
  pa INTEGER, ab INTEGER, hits INTEGER, singles INTEGER, doubles INTEGER, triples INTEGER, home_runs INTEGER,
  runs INTEGER, rbi INTEGER, walks INTEGER, strikeouts INTEGER, stolen_bases INTEGER,
  total_bases INTEGER,
  group_type TEXT DEFAULT 'hitting',
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
  raw_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (player_id, game_pk)
);

CREATE TABLE IF NOT EXISTS hitter_splits (
  player_id INTEGER NOT NULL,
  season INTEGER NOT NULL,
  split_key TEXT NOT NULL,
  split_description TEXT,
  pa INTEGER, ab INTEGER, hits INTEGER, singles INTEGER, doubles INTEGER, triples INTEGER, home_runs INTEGER,
  runs INTEGER, rbi INTEGER, walks INTEGER, strikeouts INTEGER, stolen_bases INTEGER,
  avg TEXT, obp TEXT, slg TEXT, ops TEXT,
  raw_json TEXT,
  source_key TEXT,
  source_confidence TEXT,
  group_type TEXT DEFAULT 'hitting',
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
  babip TEXT,
  stat_shape_json TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (player_id, season, split_key)
);

CREATE TABLE IF NOT EXISTS hitter_metrics (
  player_id INTEGER PRIMARY KEY,
  player_name TEXT,
  team_id TEXT,
  season INTEGER,
  games_logged INTEGER,
  first_game_date TEXT,
  last_game_date TEXT,
  total_pa INTEGER, total_ab INTEGER, total_hits INTEGER, total_singles INTEGER, total_doubles INTEGER, total_home_runs INTEGER,
  total_runs INTEGER, total_rbi INTEGER, total_walks INTEGER, total_strikeouts INTEGER, total_stolen_bases INTEGER, total_bases INTEGER,
  last3_json TEXT, last5_json TEXT, last10_json TEXT, last20_json TEXT,
  source_key TEXT,
  source_confidence TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hitter_logs_date ON hitter_game_logs(game_date);
CREATE INDEX IF NOT EXISTS idx_hitter_logs_team ON hitter_game_logs(team_id, game_date);
CREATE INDEX IF NOT EXISTS idx_hitter_metrics_last ON hitter_metrics(last_game_date);

INSERT OR REPLACE INTO hitter_schema_migrations VALUES ('schema_stats_hitter_db_v0_1', 'alphadog-v2-schema-phase-pack-v0.1', CURRENT_TIMESTAMP, 'Initial STATS_HITTER_DB schema');

-- ============================================================================
-- alphadog-v2-base-hitter-game-logs-v0.2.0-base-backfill-stage-only
-- Additive lifecycle schema for Base Hitter Game Logs.
-- Source lock:
--   GET /people/{playerId}/stats?stats=gameLog&group=hitting&season={season}
-- Design:
--   base_backfill first through configurable base_backfill_cutoff_date.
--   Initial test cutoff: 2026-05-18.
--   delta_update remains structurally prepared but blocked until Base is certified.
--   No live-table promotion before batch certification.
-- ============================================================================

CREATE TABLE IF NOT EXISTS hitter_game_logs_stage (
  stage_id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  player_id INTEGER NOT NULL,
  player_name TEXT,
  game_pk INTEGER,
  season INTEGER NOT NULL,
  game_date TEXT,
  team_id TEXT,
  opponent_team_id TEXT,
  is_home INTEGER,
  batting_order INTEGER,
  pa INTEGER,
  ab INTEGER,
  hits INTEGER,
  singles INTEGER,
  doubles INTEGER,
  triples INTEGER,
  home_runs INTEGER,
  runs INTEGER,
  rbi INTEGER,
  walks INTEGER,
  strikeouts INTEGER,
  stolen_bases INTEGER,
  total_bases INTEGER,
  group_type TEXT NOT NULL DEFAULT 'hitting',
  data_feed_key TEXT NOT NULL,
  source_key TEXT NOT NULL,
  source_endpoint TEXT NOT NULL,
  source_season INTEGER NOT NULL,
  source_game_type TEXT,
  ingestion_mode TEXT NOT NULL,
  certification_status TEXT DEFAULT 'staged_unverified',
  certification_grade TEXT,
  source_confidence TEXT DEFAULT 'SOURCE_LOCKED_PROBE',
  certified_at TEXT,
  promoted_at TEXT,
  raw_json TEXT,
  row_status TEXT DEFAULT 'staged',
  row_error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(batch_id, player_id, game_pk, group_type)
);

CREATE TABLE IF NOT EXISTS hitter_game_log_repair_registry (
  registry_key TEXT PRIMARY KEY,
  target_batch_id TEXT NOT NULL,
  player_id INTEGER NOT NULL,
  game_pk INTEGER NOT NULL,
  season INTEGER NOT NULL,
  group_type TEXT NOT NULL DEFAULT 'hitting',
  game_date TEXT,
  source_endpoint TEXT,
  status TEXT,
  created_by_version TEXT,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hitter_game_log_repair_registry_target ON hitter_game_log_repair_registry(target_batch_id, player_id, game_pk, group_type);

CREATE TABLE IF NOT EXISTS hitter_game_log_batches (
  batch_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  worker_version TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  data_feed_key TEXT NOT NULL,
  source_key TEXT NOT NULL,
  source_endpoint TEXT NOT NULL,
  source_season INTEGER,
  source_game_type TEXT,
  base_backfill_cutoff_date TEXT,
  delta_start_date TEXT,
  cursor_player_id INTEGER,
  cursor_season INTEGER,
  cursor_offset INTEGER DEFAULT 0,
  cursor_state_json TEXT,
  chunk_size_players INTEGER DEFAULT 3,
  max_requests_per_tick INTEGER DEFAULT 3,
  max_rows_per_tick INTEGER DEFAULT 250,
  source_request_count INTEGER DEFAULT 0,
  source_success_count INTEGER DEFAULT 0,
  source_no_data_count INTEGER DEFAULT 0,
  source_error_count INTEGER DEFAULT 0,
  rows_staged INTEGER DEFAULT 0,
  rows_promoted INTEGER DEFAULT 0,
  duplicate_count INTEGER DEFAULT 0,
  certification_status TEXT DEFAULT 'not_certified',
  certification_grade TEXT,
  certification_json TEXT,
  source_confidence TEXT DEFAULT 'SOURCE_LOCKED_PROBE',
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

CREATE TABLE IF NOT EXISTS hitter_game_log_cursor (
  cursor_key TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  source_season INTEGER,
  base_backfill_cutoff_date TEXT,
  delta_start_date TEXT,
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

CREATE TABLE IF NOT EXISTS hitter_game_log_certifications (
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
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hitter_stage_batch ON hitter_game_logs_stage(batch_id, row_status);
CREATE INDEX IF NOT EXISTS idx_hitter_stage_player_season ON hitter_game_logs_stage(player_id, season, game_date);
CREATE INDEX IF NOT EXISTS idx_hitter_stage_cert ON hitter_game_logs_stage(certification_status, batch_id);
CREATE INDEX IF NOT EXISTS idx_hitter_batches_status ON hitter_game_log_batches(status, mode, updated_at);
CREATE INDEX IF NOT EXISTS idx_hitter_batches_lock ON hitter_game_log_batches(locked_by, lock_expires_at);
CREATE INDEX IF NOT EXISTS idx_hitter_cursor_status ON hitter_game_log_cursor(status, mode, updated_at);
CREATE INDEX IF NOT EXISTS idx_hitter_logs_identity ON hitter_game_logs(player_id, game_pk, group_type);
CREATE INDEX IF NOT EXISTS idx_hitter_logs_batch ON hitter_game_logs(batch_id, certification_status);
CREATE INDEX IF NOT EXISTS idx_hitter_logs_source ON hitter_game_logs(source_key, source_season, game_date);

-- Add these columns to hitter_game_logs manually only if they are missing in your live DB.
-- D1/SQLite does not support ALTER TABLE ADD COLUMN IF NOT EXISTS in all runtimes.
-- The worker diagnostic route also attempts these safely and ignores duplicate-column errors.
-- ALTER TABLE hitter_game_logs ADD COLUMN group_type TEXT DEFAULT 'hitting';
-- ALTER TABLE hitter_game_logs ADD COLUMN data_feed_key TEXT;
-- ALTER TABLE hitter_game_logs ADD COLUMN source_endpoint TEXT;
-- ALTER TABLE hitter_game_logs ADD COLUMN source_season INTEGER;
-- ALTER TABLE hitter_game_logs ADD COLUMN source_game_type TEXT;
-- ALTER TABLE hitter_game_logs ADD COLUMN ingestion_mode TEXT;
-- ALTER TABLE hitter_game_logs ADD COLUMN batch_id TEXT;
-- ALTER TABLE hitter_game_logs ADD COLUMN run_id TEXT;
-- ALTER TABLE hitter_game_logs ADD COLUMN certification_status TEXT;
-- ALTER TABLE hitter_game_logs ADD COLUMN certification_grade TEXT;
-- ALTER TABLE hitter_game_logs ADD COLUMN certified_at TEXT;
-- ALTER TABLE hitter_game_logs ADD COLUMN promoted_at TEXT;
-- ALTER TABLE hitter_game_logs ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP;

INSERT OR REPLACE INTO hitter_schema_migrations VALUES ('base_hitter_game_logs_v0_1_0_lifecycle_probe', 'alphadog-v2-base-hitter-game-logs-v0.2.0-base-backfill-stage-only', CURRENT_TIMESTAMP, 'Additive lifecycle schema for Base Hitter Game Logs source-lock probe');

-- ============================================================================
-- alphadog-v2-base-hitter-splits-v0.2.0-base-backfill-stage-only
-- Additive lifecycle schema for Base Hitter Splits.
-- Source lock:
--   GET /people/{playerId}/stats?stats=statSplits&group=hitting&season={season}&sitCodes=vl%2Cvr
-- Design:
--   v0.1.0 is schema/source-shape probe only.
--   No live hitter_splits promotion.
--   No full base split mining.
--   No delta_update execution.
--   Splits are treated as season/source snapshots unless source proves date-window support.
-- ============================================================================

CREATE TABLE IF NOT EXISTS hitter_split_stage (
  stage_id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  player_id INTEGER NOT NULL,
  player_name TEXT,
  season INTEGER NOT NULL,
  group_type TEXT NOT NULL DEFAULT 'hitting',
  split_code TEXT NOT NULL,
  split_source_code TEXT,
  split_description TEXT,
  pa INTEGER,
  ab INTEGER,
  hits INTEGER,
  singles INTEGER,
  doubles INTEGER,
  triples INTEGER,
  home_runs INTEGER,
  runs INTEGER,
  rbi INTEGER,
  walks INTEGER,
  strikeouts INTEGER,
  stolen_bases INTEGER,
  total_bases INTEGER,
  avg TEXT,
  obp TEXT,
  slg TEXT,
  ops TEXT,
  babip TEXT,
  data_feed_key TEXT NOT NULL,
  source_key TEXT NOT NULL,
  source_endpoint TEXT NOT NULL,
  source_season INTEGER NOT NULL,
  source_game_type TEXT,
  ingestion_mode TEXT NOT NULL,
  certification_status TEXT DEFAULT 'source_shape_probe_staged',
  certification_grade TEXT,
  source_confidence TEXT DEFAULT 'SOURCE_LOCKED_STATSAPI_STATSPLITS_SITCODES_VL_VR_PROBE',
  certified_at TEXT,
  promoted_at TEXT,
  source_snapshot_date TEXT,
  raw_json TEXT NOT NULL,
  stat_shape_json TEXT,
  row_status TEXT DEFAULT 'source_shape_probe_staged',
  row_error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(batch_id, player_id, season, group_type, split_code)
);

CREATE TABLE IF NOT EXISTS hitter_split_batches (
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
  cursor_player_id INTEGER,
  cursor_season INTEGER,
  cursor_offset INTEGER DEFAULT 0,
  cursor_state_json TEXT,
  expected_hitter_universe_count INTEGER DEFAULT 0,
  sample_size INTEGER DEFAULT 0,
  source_request_count INTEGER DEFAULT 0,
  source_success_count INTEGER DEFAULT 0,
  source_no_data_count INTEGER DEFAULT 0,
  source_error_count INTEGER DEFAULT 0,
  rows_staged INTEGER DEFAULT 0,
  rows_promoted INTEGER DEFAULT 0,
  duplicate_stage_keys INTEGER DEFAULT 0,
  split_identifier_summary_json TEXT,
  field_summary_json TEXT,
  source_snapshot_assessment TEXT,
  certification_status TEXT DEFAULT 'not_certified',
  certification_grade TEXT,
  certification_json TEXT,
  source_confidence TEXT DEFAULT 'SOURCE_LOCKED_STATSAPI_STATSPLITS_SITCODES_VL_VR_PROBE',
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

CREATE TABLE IF NOT EXISTS hitter_split_outcomes (
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
  certification_status TEXT DEFAULT 'player_outcome_unverified',
  certification_grade TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (batch_id, player_id)
);

CREATE TABLE IF NOT EXISTS hitter_split_cursor (
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

CREATE TABLE IF NOT EXISTS hitter_split_certifications (
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

CREATE INDEX IF NOT EXISTS idx_hitter_split_stage_batch ON hitter_split_stage(batch_id, row_status);
CREATE INDEX IF NOT EXISTS idx_hitter_split_stage_player ON hitter_split_stage(player_id, season, split_code);
CREATE INDEX IF NOT EXISTS idx_hitter_split_stage_cert ON hitter_split_stage(certification_status, batch_id);
CREATE INDEX IF NOT EXISTS idx_hitter_split_batches_status ON hitter_split_batches(status, mode, updated_at);
CREATE INDEX IF NOT EXISTS idx_hitter_split_batches_lock ON hitter_split_batches(locked_by, lock_expires_at);
CREATE INDEX IF NOT EXISTS idx_hitter_split_cursor_status ON hitter_split_cursor(status, mode, updated_at);
CREATE INDEX IF NOT EXISTS idx_hitter_split_outcomes_batch_category ON hitter_split_outcomes(batch_id, terminal_category);
CREATE INDEX IF NOT EXISTS idx_hitter_split_outcomes_player ON hitter_split_outcomes(player_id, batch_id);

INSERT OR REPLACE INTO hitter_schema_migrations VALUES ('base_hitter_splits_v0_1_0_schema_source_lock_probe', 'alphadog-v2-base-hitter-splits-v0.2.0-base-backfill-stage-only', CURRENT_TIMESTAMP, 'Additive hitter split lifecycle schema and lineage-ready live columns; base_backfill stage-only; no live promotion/delta execution');


-- v0.2.0 note: base-hitter-splits uses the same additive lifecycle schema created in v0.1.0.
-- v0.2.0 writes full hitter-universe stage/outcome/cursor/certification rows only.
-- v0.2.0 performs no live hitter_splits promotion and no delta_update execution.

-- ============================================================================
-- alphadog-v2-base-hitter-metrics-v0.1.0-schema-formula-input-audit
-- Additive lifecycle schema for Base Hitter Metrics.
-- Purpose: neutral D1-derived hitter metric schema/config/input/formula readiness only.
-- Hard blocks: no live metric promotion, no hitter_game_logs mutation, no hitter_splits
-- mutation, no external MLB calls, no scoring/ranking/final board writes.
-- ============================================================================

CREATE TABLE IF NOT EXISTS hitter_metric_batches (
  batch_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  worker_version TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  data_feed_key TEXT NOT NULL,
  source_key TEXT NOT NULL,
  source_season INTEGER,
  input_log_row_count INTEGER DEFAULT 0,
  input_split_row_count INTEGER DEFAULT 0,
  input_latest_game_date TEXT,
  input_latest_split_snapshot_date TEXT,
  expected_hitter_universe_count INTEGER DEFAULT 0,
  config_profile_id TEXT,
  formula_version TEXT,
  metric_catalog_json TEXT,
  formula_readiness_json TEXT,
  config_readiness_json TEXT,
  input_readiness_json TEXT,
  rows_staged INTEGER DEFAULT 0,
  rows_promoted INTEGER DEFAULT 0,
  duplicate_count INTEGER DEFAULT 0,
  certification_status TEXT DEFAULT 'audit_only_not_promoted',
  certification_grade TEXT,
  certification_json TEXT,
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

CREATE TABLE IF NOT EXISTS hitter_metric_stage (
  stage_id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  player_id INTEGER NOT NULL,
  season INTEGER NOT NULL,
  metric_scope TEXT NOT NULL,
  metric_window TEXT NOT NULL,
  metric_family TEXT NOT NULL,
  source_start_date TEXT,
  source_end_date TEXT,
  source_snapshot_date TEXT,
  input_log_row_count INTEGER DEFAULT 0,
  input_split_row_count INTEGER DEFAULT 0,
  input_latest_game_date TEXT,
  metric_value REAL,
  metric_text_value TEXT,
  numerator REAL,
  denominator REAL,
  data_feed_key TEXT NOT NULL,
  source_key TEXT NOT NULL,
  ingestion_mode TEXT NOT NULL,
  certification_status TEXT DEFAULT 'audit_only_not_promoted',
  certification_grade TEXT,
  certified_at TEXT,
  promoted_at TEXT,
  formula_version TEXT,
  config_profile_id TEXT,
  raw_input_summary_json TEXT,
  metric_json TEXT,
  missing_data_reason TEXT,
  reliability_label TEXT,
  row_status TEXT DEFAULT 'audit_only_staged',
  row_error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(batch_id, metric_key, player_id, season, metric_scope, metric_window)
);

CREATE TABLE IF NOT EXISTS hitter_metric_outcomes (
  outcome_id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  player_id INTEGER,
  season INTEGER,
  metric_family TEXT,
  metric_window TEXT,
  terminal_category TEXT NOT NULL,
  category_reason TEXT,
  input_log_row_count INTEGER DEFAULT 0,
  input_split_row_count INTEGER DEFAULT 0,
  missing_data_reason TEXT,
  formula_version TEXT,
  config_profile_id TEXT,
  outcome_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hitter_metric_cursor (
  cursor_key TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  source_season INTEGER,
  current_player_id INTEGER,
  current_player_offset INTEGER DEFAULT 0,
  players_total INTEGER DEFAULT 0,
  players_processed INTEGER DEFAULT 0,
  next_run_after TEXT,
  last_error TEXT,
  cursor_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hitter_metric_certifications (
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
  formula_error_count INTEGER DEFAULT 0,
  denominator_error_count INTEGER DEFAULT 0,
  config_profile_id TEXT,
  formula_version TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hitter_metric_batches_status ON hitter_metric_batches(status, mode, updated_at);
CREATE INDEX IF NOT EXISTS idx_hitter_metric_batches_lock ON hitter_metric_batches(locked_by, lock_expires_at);
CREATE INDEX IF NOT EXISTS idx_hitter_metric_stage_batch ON hitter_metric_stage(batch_id, row_status);
CREATE INDEX IF NOT EXISTS idx_hitter_metric_stage_player ON hitter_metric_stage(player_id, season, metric_key, metric_window);
CREATE INDEX IF NOT EXISTS idx_hitter_metric_stage_cert ON hitter_metric_stage(certification_status, batch_id);
CREATE INDEX IF NOT EXISTS idx_hitter_metric_outcomes_batch ON hitter_metric_outcomes(batch_id, terminal_category);
CREATE INDEX IF NOT EXISTS idx_hitter_metric_cursor_status ON hitter_metric_cursor(status, mode, updated_at);
CREATE INDEX IF NOT EXISTS idx_hitter_metric_cert_batch ON hitter_metric_certifications(batch_id, certification_status);

INSERT OR REPLACE INTO hitter_schema_migrations VALUES ('base_hitter_metrics_v0_1_0_schema_formula_input_audit', 'alphadog-v2-base-hitter-metrics-v0.1.0-schema-formula-input-audit', CURRENT_TIMESTAMP, 'Additive lifecycle schema for neutral Base Hitter Metrics readiness only; no live metric promotion');
