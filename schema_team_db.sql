CREATE TABLE IF NOT EXISTS team_schema_migrations (migration_key TEXT PRIMARY KEY, package_version TEXT NOT NULL, applied_at TEXT DEFAULT CURRENT_TIMESTAMP, notes TEXT);

CREATE TABLE IF NOT EXISTS team_game_logs (
  team_game_key TEXT PRIMARY KEY,
  game_pk INTEGER,
  season INTEGER,
  game_date TEXT,
  team_id TEXT,
  opponent_team_id TEXT,
  is_home INTEGER,
  runs INTEGER,
  hits INTEGER,
  errors INTEGER,
  plate_appearances INTEGER,
  at_bats INTEGER,
  walks INTEGER,
  strikeouts INTEGER,
  home_runs INTEGER,
  doubles INTEGER,
  triples INTEGER,
  stolen_bases INTEGER,
  left_on_base INTEGER,
  total_bases INTEGER,
  rbi INTEGER,
  runs_allowed INTEGER,
  hits_allowed INTEGER,
  earned_runs_allowed INTEGER,
  walks_allowed INTEGER,
  strikeouts_pitched INTEGER,
  home_runs_allowed INTEGER,
  innings_pitched TEXT,
  outs_recorded INTEGER,
  game_status TEXT,
  venue_id INTEGER,
  data_feed_key TEXT,
  raw_json TEXT,
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
  source_snapshot_date TEXT,
  certified_at TEXT,
  promoted_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS team_metrics (
  team_id TEXT PRIMARY KEY,
  season INTEGER,
  games_logged INTEGER,
  first_game_date TEXT,
  last_game_date TEXT,
  offense_json TEXT,
  pitching_json TEXT,
  bullpen_json TEXT,
  starter_json TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bullpen_history (
  bullpen_key TEXT PRIMARY KEY,
  team_id TEXT,
  game_date TEXT,
  game_pk INTEGER,
  usage_json TEXT,
  availability_json TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS starter_history (
  starter_key TEXT PRIMARY KEY,
  player_id INTEGER,
  team_id TEXT,
  game_date TEXT,
  game_pk INTEGER,
  starter_json TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_team_logs_date ON team_game_logs(game_date, team_id);
CREATE INDEX IF NOT EXISTS idx_bullpen_team_date ON bullpen_history(team_id, game_date);
CREATE INDEX IF NOT EXISTS idx_starter_player_date ON starter_history(player_id, game_date);

INSERT OR REPLACE INTO team_schema_migrations VALUES ('schema_team_db_v0_1', 'alphadog-v2-schema-phase-pack-v0.1', CURRENT_TIMESTAMP, 'Initial TEAM_DB schema');


-- v0.1.0 Base Team Game Logs lifecycle schema. Probe-only; no live promotion by schema.
CREATE TABLE IF NOT EXISTS team_game_log_batches (
  batch_id TEXT PRIMARY KEY,
  run_id TEXT,
  request_id TEXT,
  chain_id TEXT,
  job_key TEXT,
  worker_name TEXT,
  version TEXT,
  ingestion_mode TEXT,
  probe_only INTEGER DEFAULT 1,
  source_key TEXT,
  source_confidence TEXT,
  source_season INTEGER,
  source_game_type TEXT,
  base_backfill_cutoff_date TEXT,
  delta_reserved_start_date TEXT,
  sample_start_date TEXT,
  sample_end_date TEXT,
  expected_game_count INTEGER DEFAULT 0,
  expected_team_game_rows INTEGER DEFAULT 0,
  staged_team_game_rows INTEGER DEFAULT 0,
  rows_promoted INTEGER DEFAULT 0,
  duplicate_stage_keys INTEGER DEFAULT 0,
  non_final_games INTEGER DEFAULT 0,
  source_error_count INTEGER DEFAULT 0,
  repair_required_count INTEGER DEFAULT 0,
  unclear_count INTEGER DEFAULT 0,
  status TEXT,
  certification_status TEXT,
  certification_grade TEXT,
  output_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  certified_at TEXT,
  promoted_at TEXT,
  cleaned_at TEXT
);

CREATE TABLE IF NOT EXISTS team_game_log_stage (
  stage_id TEXT PRIMARY KEY,
  team_game_key TEXT,
  game_pk INTEGER,
  game_date TEXT,
  season INTEGER,
  team_id TEXT,
  team_name TEXT,
  opponent_team_id TEXT,
  opponent_team_name TEXT,
  is_home INTEGER,
  game_type TEXT,
  game_status TEXT,
  venue_id INTEGER,
  runs INTEGER,
  hits INTEGER,
  errors INTEGER,
  at_bats INTEGER,
  plate_appearances INTEGER,
  doubles INTEGER,
  triples INTEGER,
  home_runs INTEGER,
  walks INTEGER,
  strikeouts INTEGER,
  stolen_bases INTEGER,
  left_on_base INTEGER,
  total_bases INTEGER,
  rbi INTEGER,
  runs_allowed INTEGER,
  hits_allowed INTEGER,
  earned_runs_allowed INTEGER,
  walks_allowed INTEGER,
  strikeouts_pitched INTEGER,
  home_runs_allowed INTEGER,
  innings_pitched TEXT,
  outs_recorded INTEGER,
  batting_source_path TEXT,
  pitching_source_path TEXT,
  data_feed_key TEXT,
  source_key TEXT,
  source_endpoint TEXT,
  source_season INTEGER,
  source_game_type TEXT,
  ingestion_mode TEXT,
  batch_id TEXT,
  run_id TEXT,
  request_id TEXT,
  certification_status TEXT,
  certification_grade TEXT,
  source_confidence TEXT,
  source_snapshot_date TEXT,
  raw_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  certified_at TEXT,
  promoted_at TEXT
);

CREATE TABLE IF NOT EXISTS team_game_log_outcomes (
  outcome_id TEXT PRIMARY KEY,
  batch_id TEXT,
  run_id TEXT,
  request_id TEXT,
  game_pk INTEGER,
  game_date TEXT,
  season INTEGER,
  team_id TEXT,
  opponent_team_id TEXT,
  outcome_level TEXT,
  outcome_category TEXT,
  status TEXT,
  reason TEXT,
  source_endpoint TEXT,
  source_key TEXT,
  source_confidence TEXT,
  source_snapshot_date TEXT,
  details_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS team_game_log_cursor (
  cursor_key TEXT PRIMARY KEY,
  ingestion_mode TEXT,
  source_key TEXT,
  source_season INTEGER,
  source_game_type TEXT,
  base_backfill_cutoff_date TEXT,
  delta_reserved_start_date TEXT,
  last_sample_date TEXT,
  last_game_pk INTEGER,
  last_batch_id TEXT,
  last_request_id TEXT,
  status TEXT,
  cursor_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS team_game_log_certifications (
  certification_id TEXT PRIMARY KEY,
  batch_id TEXT,
  run_id TEXT,
  request_id TEXT,
  certification_status TEXT,
  certification_grade TEXT,
  expected_game_count INTEGER,
  expected_team_game_rows INTEGER,
  staged_team_game_rows INTEGER,
  rows_promoted INTEGER DEFAULT 0,
  duplicate_stage_keys INTEGER DEFAULT 0,
  non_final_games INTEGER DEFAULT 0,
  source_error_count INTEGER DEFAULT 0,
  repair_required_count INTEGER DEFAULT 0,
  unclear_count INTEGER DEFAULT 0,
  missing_game_pk INTEGER DEFAULT 0,
  missing_game_date INTEGER DEFAULT 0,
  missing_team_id INTEGER DEFAULT 0,
  missing_opponent_team_id INTEGER DEFAULT 0,
  bad_home_away_pair_count INTEGER DEFAULT 0,
  raw_json_missing INTEGER DEFAULT 0,
  lineage_missing_count INTEGER DEFAULT 0,
  source_field_map_json TEXT,
  details_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_team_game_logs_game_team ON team_game_logs(game_pk, team_id);
CREATE INDEX IF NOT EXISTS idx_team_game_logs_season_date_status ON team_game_logs(season, game_date, game_status);
CREATE INDEX IF NOT EXISTS idx_team_game_logs_batch ON team_game_logs(batch_id);
CREATE INDEX IF NOT EXISTS idx_team_game_log_stage_batch ON team_game_log_stage(batch_id, game_pk, team_id);
CREATE INDEX IF NOT EXISTS idx_team_game_log_stage_game_team ON team_game_log_stage(game_pk, team_id);
CREATE INDEX IF NOT EXISTS idx_team_game_log_stage_season_date ON team_game_log_stage(season, game_date, game_status);
CREATE INDEX IF NOT EXISTS idx_team_game_log_outcomes_batch ON team_game_log_outcomes(batch_id, game_pk, team_id);
CREATE INDEX IF NOT EXISTS idx_team_game_log_batches_status ON team_game_log_batches(status, created_at);

INSERT OR REPLACE INTO team_schema_migrations VALUES ('team_game_logs_v0_1_0_schema_source_lock_probe', 'alphadog-v2-base-team-game-logs-v0.1.0-schema-source-lock-probe', CURRENT_TIMESTAMP, 'Additive lifecycle schema for Base Team Game Logs source-lock probe');
