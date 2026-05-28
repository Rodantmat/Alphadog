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

-- Daily Context Phase 4: Weather / Roof / Park Conditions v0.1.0
-- Worker: alphadog-v2-daily-weather-v0.1.0-source-probe-and-schema
-- Scope: game-level weather, roof, venue, and park-condition context anchored to TEAM_DB.mlb_game_calendar.game_pk.
-- Lifecycle: current/snapshots/issues are volatile today/tomorrow context only; batch rows may persist for audit.
-- Guardrails: no scoring, no ranking, no final board, no board mutation, no calendar rebuild.
CREATE TABLE IF NOT EXISTS daily_game_weather_batches (
  batch_id TEXT PRIMARY KEY,
  request_id TEXT,
  run_id TEXT,
  worker_name TEXT,
  worker_version TEXT,
  job_key TEXT,
  mode TEXT,
  status TEXT,
  window_start TEXT,
  window_end TEXT,
  calendar_games_checked INTEGER DEFAULT 0,
  prepared_games_checked INTEGER DEFAULT 0,
  prepared_rows_read INTEGER DEFAULT 0,
  weather_rows_written INTEGER DEFAULT 0,
  snapshot_rows_written INTEGER DEFAULT 0,
  indoor_games INTEGER DEFAULT 0,
  outdoor_games INTEGER DEFAULT 0,
  retractable_roof_games INTEGER DEFAULT 0,
  weather_source_failures INTEGER DEFAULT 0,
  roof_unknown_count INTEGER DEFAULT 0,
  weather_unknown_count INTEGER DEFAULT 0,
  blocker_count INTEGER DEFAULT 0,
  warning_count INTEGER DEFAULT 0,
  external_calls INTEGER DEFAULT 0,
  certification_status TEXT,
  certification_grade TEXT,
  certification_reason TEXT,
  output_json TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_game_weather_current (
  weather_key TEXT PRIMARY KEY,
  batch_id TEXT,
  game_pk INTEGER,
  official_date TEXT,
  game_time_utc TEXT,
  venue_id INTEGER,
  venue_name TEXT,
  home_team_id INTEGER,
  away_team_id INTEGER,
  prepared_board_relevant INTEGER DEFAULT 0,
  prepared_board_pickable_rows INTEGER DEFAULT 0,
  weather_status TEXT,
  weather_confidence TEXT,
  source_key TEXT,
  source_endpoint TEXT,
  source_snapshot_at TEXT,
  forecast_time_utc TEXT,
  forecast_offset_minutes INTEGER,
  temperature_f REAL,
  feels_like_f REAL,
  humidity_pct REAL,
  pressure_mb REAL,
  wind_speed_mph REAL,
  wind_gust_mph REAL,
  wind_direction_degrees REAL,
  wind_direction_cardinal TEXT,
  wind_context TEXT,
  precipitation_probability_pct REAL,
  precipitation_type TEXT,
  rain_risk_flag INTEGER DEFAULT 0,
  delay_risk_flag INTEGER DEFAULT 0,
  roof_type TEXT,
  roof_status TEXT,
  roof_confidence TEXT,
  indoor_flag INTEGER DEFAULT 0,
  retractable_roof_flag INTEGER DEFAULT 0,
  weather_applicable_flag INTEGER DEFAULT 1,
  park_weather_notes TEXT,
  first_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
  changed_at TEXT,
  raw_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_game_weather_current_game ON daily_game_weather_current(game_pk);
CREATE INDEX IF NOT EXISTS idx_daily_game_weather_current_date ON daily_game_weather_current(official_date);
CREATE INDEX IF NOT EXISTS idx_daily_game_weather_current_status ON daily_game_weather_current(weather_status, roof_status);

CREATE TABLE IF NOT EXISTS daily_game_weather_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  batch_id TEXT,
  game_pk INTEGER,
  official_date TEXT,
  venue_id INTEGER,
  source_key TEXT,
  source_snapshot_at TEXT,
  forecast_time_utc TEXT,
  temperature_f REAL,
  wind_speed_mph REAL,
  wind_direction_degrees REAL,
  precipitation_probability_pct REAL,
  roof_status TEXT,
  weather_status TEXT,
  raw_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_daily_game_weather_snap_batch ON daily_game_weather_snapshots(batch_id);
CREATE INDEX IF NOT EXISTS idx_daily_game_weather_snap_date ON daily_game_weather_snapshots(official_date);

CREATE TABLE IF NOT EXISTS daily_game_weather_issues (
  issue_id TEXT PRIMARY KEY,
  batch_id TEXT,
  game_pk INTEGER,
  official_date TEXT,
  venue_id INTEGER,
  issue_status TEXT,
  issue_type TEXT,
  severity TEXT,
  reason TEXT,
  details_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_daily_game_weather_issues_batch ON daily_game_weather_issues(batch_id);
CREATE INDEX IF NOT EXISTS idx_daily_game_weather_issues_date ON daily_game_weather_issues(official_date);

INSERT OR IGNORE INTO daily_schema_migrations (migration_key, package_version, applied_at, notes)
VALUES ('daily_game_weather_v0_1_0', 'alphadog-v2-daily-weather-v0.1.0-source-probe-and-schema', CURRENT_TIMESTAMP, 'Daily Context Phase 4 weather/roof/park-condition v2 tables');

-- Daily Bullpen Availability / Daily Context Phase 5.
-- Worker: alphadog-v2-daily-bullpen-availability-v0.1.0-internal-bullpen-history-context
-- Scope: DAILY_DB sidecar context only. Reads TEAM_DB.bullpen_history, TEAM_DB.mlb_game_calendar, SCORE_DB.score_board_prepared_current.
-- No board mutation, no scoring, no ranking, no final board, no external source truth.
CREATE TABLE IF NOT EXISTS daily_bullpen_availability_batches (
  batch_id TEXT PRIMARY KEY,
  request_id TEXT,
  run_id TEXT,
  worker_name TEXT,
  worker_version TEXT,
  job_key TEXT,
  mode TEXT,
  status TEXT,
  window_start TEXT,
  window_end TEXT,
  calendar_games_checked INTEGER DEFAULT 0,
  prepared_games_checked INTEGER DEFAULT 0,
  prepared_rows_read INTEGER DEFAULT 0,
  teams_checked INTEGER DEFAULT 0,
  team_rows_written INTEGER DEFAULT 0,
  pitcher_rows_written INTEGER DEFAULT 0,
  snapshot_rows_written INTEGER DEFAULT 0,
  source_failures INTEGER DEFAULT 0,
  blocker_count INTEGER DEFAULT 0,
  warning_count INTEGER DEFAULT 0,
  high_risk_team_count INTEGER DEFAULT 0,
  unknown_team_count INTEGER DEFAULT 0,
  certification_status TEXT,
  certification_grade TEXT,
  certification_reason TEXT,
  output_json TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_bullpen_availability_current (
  bullpen_availability_key TEXT PRIMARY KEY,
  batch_id TEXT,
  official_date TEXT,
  game_pk INTEGER,
  game_time_utc TEXT,
  team_id INTEGER,
  team_name TEXT,
  opponent_team_id INTEGER,
  opponent_team_name TEXT,
  is_home INTEGER,
  prepared_board_relevant INTEGER DEFAULT 0,
  prepared_board_pickable_rows INTEGER DEFAULT 0,
  bullpen_status TEXT,
  bullpen_confidence TEXT,
  availability_grade TEXT,
  recent_games_window_start TEXT,
  recent_games_window_end TEXT,
  games_checked INTEGER DEFAULT 0,
  games_played_last_1_day INTEGER DEFAULT 0,
  games_played_last_2_days INTEGER DEFAULT 0,
  games_played_last_3_days INTEGER DEFAULT 0,
  bullpen_pitchers_used_last_1_day INTEGER DEFAULT 0,
  bullpen_pitchers_used_last_2_days INTEGER DEFAULT 0,
  bullpen_pitchers_used_last_3_days INTEGER DEFAULT 0,
  bullpen_pitches_last_1_day INTEGER DEFAULT 0,
  bullpen_pitches_last_2_days INTEGER DEFAULT 0,
  bullpen_pitches_last_3_days INTEGER DEFAULT 0,
  bullpen_outs_last_1_day INTEGER DEFAULT 0,
  bullpen_outs_last_2_days INTEGER DEFAULT 0,
  bullpen_outs_last_3_days INTEGER DEFAULT 0,
  high_usage_reliever_count INTEGER DEFAULT 0,
  back_to_back_reliever_count INTEGER DEFAULT 0,
  likely_unavailable_reliever_count INTEGER DEFAULT 0,
  rested_reliever_count INTEGER DEFAULT 0,
  unknown_reliever_count INTEGER DEFAULT 0,
  closer_recent_usage_flag INTEGER DEFAULT 0,
  setup_recent_usage_flag INTEGER DEFAULT 0,
  doubleheader_recent_flag INTEGER DEFAULT 0,
  extra_innings_recent_flag INTEGER DEFAULT 0,
  bullpen_fatigue_score INTEGER DEFAULT 0,
  bullpen_risk_level TEXT,
  source_key TEXT,
  source_endpoint TEXT,
  source_snapshot_at TEXT,
  first_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
  changed_at TEXT,
  details_json TEXT,
  raw_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_bullpen_current_game_team ON daily_bullpen_availability_current(official_date, game_pk, team_id);
CREATE INDEX IF NOT EXISTS idx_daily_bullpen_current_status ON daily_bullpen_availability_current(bullpen_status, bullpen_risk_level);
CREATE INDEX IF NOT EXISTS idx_daily_bullpen_current_date ON daily_bullpen_availability_current(official_date);

CREATE TABLE IF NOT EXISTS daily_bullpen_pitcher_availability_current (
  pitcher_availability_key TEXT PRIMARY KEY,
  batch_id TEXT,
  official_date TEXT,
  team_id INTEGER,
  pitcher_id INTEGER,
  pitcher_name TEXT,
  pitcher_hand TEXT,
  role_hint TEXT,
  active_roster_flag INTEGER,
  availability_status TEXT,
  availability_confidence TEXT,
  pitches_last_1_day INTEGER DEFAULT 0,
  pitches_last_2_days INTEGER DEFAULT 0,
  pitches_last_3_days INTEGER DEFAULT 0,
  outs_last_1_day INTEGER DEFAULT 0,
  outs_last_2_days INTEGER DEFAULT 0,
  outs_last_3_days INTEGER DEFAULT 0,
  appearances_last_1_day INTEGER DEFAULT 0,
  appearances_last_2_days INTEGER DEFAULT 0,
  appearances_last_3_days INTEGER DEFAULT 0,
  back_to_back_flag INTEGER DEFAULT 0,
  high_pitch_recent_flag INTEGER DEFAULT 0,
  likely_unavailable_flag INTEGER DEFAULT 0,
  notes TEXT,
  source_snapshot_at TEXT,
  details_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_bullpen_pitcher_current_team_pitcher ON daily_bullpen_pitcher_availability_current(official_date, team_id, pitcher_id);
CREATE INDEX IF NOT EXISTS idx_daily_bullpen_pitcher_current_status ON daily_bullpen_pitcher_availability_current(availability_status);

CREATE TABLE IF NOT EXISTS daily_bullpen_availability_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  batch_id TEXT,
  official_date TEXT,
  game_pk INTEGER,
  team_id INTEGER,
  bullpen_status TEXT,
  availability_grade TEXT,
  bullpen_fatigue_score INTEGER,
  bullpen_risk_level TEXT,
  source_snapshot_at TEXT,
  details_json TEXT,
  raw_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_daily_bullpen_snap_batch ON daily_bullpen_availability_snapshots(batch_id);
CREATE INDEX IF NOT EXISTS idx_daily_bullpen_snap_date ON daily_bullpen_availability_snapshots(official_date);

CREATE TABLE IF NOT EXISTS daily_bullpen_availability_issues (
  issue_id TEXT PRIMARY KEY,
  batch_id TEXT,
  official_date TEXT,
  game_pk INTEGER,
  team_id INTEGER,
  pitcher_id INTEGER,
  issue_status TEXT,
  issue_type TEXT,
  severity TEXT,
  reason TEXT,
  details_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_daily_bullpen_issues_batch ON daily_bullpen_availability_issues(batch_id);
CREATE INDEX IF NOT EXISTS idx_daily_bullpen_issues_date ON daily_bullpen_availability_issues(official_date);

INSERT OR IGNORE INTO daily_schema_migrations (migration_key, package_version, applied_at, notes)
VALUES ('daily_bullpen_availability_v0_1_0', 'alphadog-v2-daily-bullpen-availability-v0.1.0-internal-bullpen-history-context', CURRENT_TIMESTAMP, 'Daily Context Phase 5 bullpen availability internal-source tables');

