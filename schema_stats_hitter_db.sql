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
-- alphadog-v2-base-hitter-game-logs-v0.1.0-schema-source-lock-probe
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

INSERT OR REPLACE INTO hitter_schema_migrations VALUES ('base_hitter_game_logs_v0_1_0_lifecycle_probe', 'alphadog-v2-base-hitter-game-logs-v0.1.0-schema-source-lock-probe', CURRENT_TIMESTAMP, 'Additive lifecycle schema for Base Hitter Game Logs source-lock probe');
