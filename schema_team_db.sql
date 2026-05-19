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
  raw_json TEXT,
  source_key TEXT,
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
