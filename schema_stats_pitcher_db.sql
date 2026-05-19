CREATE TABLE IF NOT EXISTS pitcher_schema_migrations (migration_key TEXT PRIMARY KEY, package_version TEXT NOT NULL, applied_at TEXT DEFAULT CURRENT_TIMESTAMP, notes TEXT);

CREATE TABLE IF NOT EXISTS pitcher_game_logs (
  player_id INTEGER NOT NULL,
  game_pk INTEGER NOT NULL,
  season INTEGER NOT NULL,
  game_date TEXT,
  team_id TEXT,
  opponent_team_id TEXT,
  is_home INTEGER,
  role TEXT,
  innings_pitched REAL,
  outs_recorded INTEGER,
  batters_faced INTEGER,
  hits_allowed INTEGER,
  runs_allowed INTEGER,
  earned_runs INTEGER,
  walks_allowed INTEGER,
  strikeouts INTEGER,
  home_runs_allowed INTEGER,
  pitches INTEGER,
  raw_json TEXT,
  source_key TEXT,
  source_confidence TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (player_id, game_pk)
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
  last3_json TEXT, last5_json TEXT, last10_json TEXT, last20_json TEXT,
  source_key TEXT,
  source_confidence TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pitcher_logs_date ON pitcher_game_logs(game_date);
CREATE INDEX IF NOT EXISTS idx_pitcher_logs_team ON pitcher_game_logs(team_id, game_date);
CREATE INDEX IF NOT EXISTS idx_pitcher_metrics_last ON pitcher_metrics(last_game_date);

INSERT OR REPLACE INTO pitcher_schema_migrations VALUES ('schema_stats_pitcher_db_v0_1', 'alphadog-v2-schema-phase-pack-v0.1', CURRENT_TIMESTAMP, 'Initial STATS_PITCHER_DB schema');
