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
