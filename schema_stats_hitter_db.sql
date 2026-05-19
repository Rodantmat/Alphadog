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
  raw_json TEXT,
  source_key TEXT,
  source_confidence TEXT,
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
