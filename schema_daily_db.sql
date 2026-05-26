CREATE TABLE IF NOT EXISTS daily_schema_migrations (migration_key TEXT PRIMARY KEY, package_version TEXT NOT NULL, applied_at TEXT DEFAULT CURRENT_TIMESTAMP, notes TEXT);

CREATE TABLE IF NOT EXISTS daily_slate_games (
  game_key TEXT PRIMARY KEY,
  slate_date TEXT,
  game_pk INTEGER,
  away_team_id TEXT,
  home_team_id TEXT,
  game_time_utc TEXT,
  game_time_local TEXT,
  status TEXT,
  pickable_flag INTEGER DEFAULT 1,
  raw_json TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_probable_pitchers (
  game_key TEXT PRIMARY KEY,
  slate_date TEXT,
  away_pitcher_id INTEGER,
  home_pitcher_id INTEGER,
  source_key TEXT,
  confidence TEXT,
  raw_json TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_lineups (
  lineup_key TEXT PRIMARY KEY,
  slate_date TEXT,
  game_key TEXT,
  team_id TEXT,
  confirmed INTEGER DEFAULT 0,
  batting_order_json TEXT,
  source_key TEXT,
  confidence TEXT,
  raw_json TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_weather (
  weather_key TEXT PRIMARY KEY,
  slate_date TEXT,
  game_key TEXT,
  provider TEXT,
  temperature_f REAL,
  wind_mph REAL,
  wind_direction TEXT,
  precipitation_chance REAL,
  weather_json TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_roof_status (
  roof_key TEXT PRIMARY KEY,
  slate_date TEXT,
  game_key TEXT,
  roof_type TEXT,
  roof_status TEXT,
  confidence TEXT,
  source_key TEXT,
  roof_json TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_player_availability (
  availability_key TEXT PRIMARY KEY,
  slate_date TEXT,
  player_id INTEGER,
  team_id TEXT,
  status TEXT,
  reason TEXT,
  source_key TEXT,
  raw_json TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_usage_pulse (
  pulse_key TEXT PRIMARY KEY,
  slate_date TEXT,
  player_id INTEGER,
  prop_role TEXT,
  usage_json TEXT,
  source_key TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_daily_games_slate ON daily_slate_games(slate_date, status);
CREATE INDEX IF NOT EXISTS idx_daily_lineups_game ON daily_lineups(game_key, team_id);
CREATE INDEX IF NOT EXISTS idx_daily_availability_player ON daily_player_availability(slate_date, player_id);

INSERT OR REPLACE INTO daily_schema_migrations VALUES ('schema_daily_db_v0_1', 'alphadog-v2-schema-phase-pack-v0.1', CURRENT_TIMESTAMP, 'Initial DAILY_DB schema');

-- Additive board-focused Daily Game Status lifecycle schema.
-- Worker: alphadog-v2-daily-games-status-v0.1.0-board-focused-source-shape-and-current-status
-- Scope: Daily Schedule + Game Status only. No board mutation, no scoring, no ranking, no final board.
CREATE TABLE IF NOT EXISTS daily_game_status_batches (
  batch_id TEXT PRIMARY KEY,
  job_key TEXT,
  source_key TEXT,
  mode TEXT,
  board_rows_read INTEGER DEFAULT 0,
  board_relevant_dates INTEGER DEFAULT 0,
  board_relevant_games INTEGER DEFAULT 0,
  mlb_schedule_dates_fetched INTEGER DEFAULT 0,
  mlb_schedule_games_seen INTEGER DEFAULT 0,
  staged_rows INTEGER DEFAULT 0,
  promoted_rows INTEGER DEFAULT 0,
  unsafe_rows INTEGER DEFAULT 0,
  warning_rows INTEGER DEFAULT 0,
  certification_status TEXT,
  certification_grade TEXT,
  certification_reason TEXT,
  certification_json TEXT,
  started_at TEXT,
  certified_at TEXT,
  promoted_at TEXT,
  cleaned_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_game_status_stage (
  stage_id TEXT PRIMARY KEY,
  batch_id TEXT,
  source_key TEXT,
  board_source_key TEXT,
  board_batch_id TEXT,
  board_row_id TEXT,
  source_line_id TEXT,
  source_event_id TEXT,
  source_player_id TEXT,
  player_name TEXT,
  canonical_prop_key TEXT,
  board_team TEXT,
  board_opponent TEXT,
  board_start_time TEXT,
  board_slate_date TEXT,
  board_pickable_flag INTEGER,
  resolved_game_key TEXT,
  game_pk INTEGER,
  official_date TEXT,
  official_start_time_utc TEXT,
  away_mlb_team_id INTEGER,
  away_team_name TEXT,
  home_mlb_team_id INTEGER,
  home_team_name TEXT,
  venue_id INTEGER,
  venue_name TEXT,
  double_header TEXT,
  game_number INTEGER,
  abstract_game_state TEXT,
  coded_game_state TEXT,
  detailed_state TEXT,
  status_code TEXT,
  game_status_class TEXT,
  safety_status TEXT,
  pickable_safe INTEGER DEFAULT 0,
  has_started INTEGER DEFAULT 0,
  is_final INTEGER DEFAULT 0,
  is_postponed INTEGER DEFAULT 0,
  is_suspended INTEGER DEFAULT 0,
  is_delayed INTEGER DEFAULT 0,
  is_in_progress INTEGER DEFAULT 0,
  warning_flags TEXT,
  block_reason TEXT,
  match_method TEXT,
  source_confidence TEXT,
  board_mlb_start_time_delta_minutes REAL,
  source_endpoint TEXT,
  source_fetched_at TEXT,
  raw_board_json TEXT,
  raw_mlb_game_json TEXT,
  staged_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_game_status_current (
  current_key TEXT PRIMARY KEY,
  batch_id TEXT,
  source_key TEXT,
  board_source_key TEXT,
  board_batch_id TEXT,
  board_row_id TEXT,
  source_line_id TEXT,
  source_event_id TEXT,
  source_player_id TEXT,
  player_name TEXT,
  canonical_prop_key TEXT,
  board_team TEXT,
  board_opponent TEXT,
  board_start_time TEXT,
  board_slate_date TEXT,
  board_pickable_flag INTEGER,
  resolved_game_key TEXT,
  game_pk INTEGER,
  official_date TEXT,
  official_start_time_utc TEXT,
  away_mlb_team_id INTEGER,
  away_team_name TEXT,
  home_mlb_team_id INTEGER,
  home_team_name TEXT,
  venue_id INTEGER,
  venue_name TEXT,
  double_header TEXT,
  game_number INTEGER,
  abstract_game_state TEXT,
  coded_game_state TEXT,
  detailed_state TEXT,
  status_code TEXT,
  game_status_class TEXT,
  safety_status TEXT,
  pickable_safe INTEGER DEFAULT 0,
  has_started INTEGER DEFAULT 0,
  is_final INTEGER DEFAULT 0,
  is_postponed INTEGER DEFAULT 0,
  is_suspended INTEGER DEFAULT 0,
  is_delayed INTEGER DEFAULT 0,
  is_in_progress INTEGER DEFAULT 0,
  warning_flags TEXT,
  block_reason TEXT,
  match_method TEXT,
  source_confidence TEXT,
  board_mlb_start_time_delta_minutes REAL,
  source_endpoint TEXT,
  source_fetched_at TEXT,
  raw_board_json TEXT,
  raw_mlb_game_json TEXT,
  promoted_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_game_status_outcomes (
  outcome_id TEXT PRIMARY KEY,
  batch_id TEXT,
  outcome_key TEXT,
  outcome_status TEXT,
  outcome_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_game_status_certifications (
  certification_id TEXT PRIMARY KEY,
  batch_id TEXT,
  certification_status TEXT,
  certification_grade TEXT,
  certification_reason TEXT,
  certification_json TEXT,
  certified_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_daily_game_status_current_game ON daily_game_status_current(game_pk, official_date);
CREATE INDEX IF NOT EXISTS idx_daily_game_status_current_safety ON daily_game_status_current(safety_status, pickable_safe);
CREATE INDEX IF NOT EXISTS idx_daily_game_status_current_board ON daily_game_status_current(board_source_key, board_slate_date, board_batch_id);
CREATE INDEX IF NOT EXISTS idx_daily_game_status_stage_batch ON daily_game_status_stage(batch_id);

INSERT OR REPLACE INTO daily_schema_migrations VALUES ('schema_daily_game_status_v0_1_0', 'alphadog-v2-daily-games-status-v0.1.0-board-focused-source-shape-and-current-status', CURRENT_TIMESTAMP, 'Additive board-focused Daily Game Status lifecycle tables');
