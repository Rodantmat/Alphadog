CREATE TABLE IF NOT EXISTS market_schema_migrations (migration_key TEXT PRIMARY KEY, package_version TEXT NOT NULL, applied_at TEXT DEFAULT CURRENT_TIMESTAMP, notes TEXT);

CREATE TABLE IF NOT EXISTS market_raw_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  source_key TEXT,
  slate_date TEXT,
  fetched_at TEXT DEFAULT CURRENT_TIMESTAMP,
  raw_json TEXT,
  row_count INTEGER,
  status TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS market_current_lines (
  line_id TEXT PRIMARY KEY,
  source_key TEXT,
  slate_date TEXT,
  event_id TEXT,
  game_key TEXT,
  player_id INTEGER,
  player_name TEXT,
  team_id TEXT,
  opponent_team_id TEXT,
  prop_key TEXT,
  market_name TEXT,
  side TEXT,
  line_value REAL,
  over_price REAL,
  under_price REAL,
  book_key TEXT,
  source_line_type TEXT,
  pickable_flag INTEGER DEFAULT 1,
  verified_at TEXT,
  last_update TEXT,
  raw_json TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS market_line_snapshots (
  snapshot_line_id TEXT PRIMARY KEY,
  line_id TEXT,
  source_key TEXT,
  slate_date TEXT,
  side TEXT,
  line_value REAL,
  over_price REAL,
  under_price REAL,
  captured_at TEXT DEFAULT CURRENT_TIMESTAMP,
  raw_json TEXT
);

CREATE TABLE IF NOT EXISTS market_source_health (
  source_key TEXT PRIMARY KEY,
  status TEXT,
  last_success_at TEXT,
  last_error_at TEXT,
  last_error TEXT,
  rows_last_fetch INTEGER DEFAULT 0,
  health_json TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS market_line_shape_classification (
  line_id TEXT PRIMARY KEY,
  line_shape TEXT,
  classification_json TEXT,
  warning_flags TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_market_current_slate_prop ON market_current_lines(slate_date, prop_key, source_key);
CREATE INDEX IF NOT EXISTS idx_market_current_player ON market_current_lines(player_id, prop_key);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_line ON market_line_snapshots(line_id, captured_at);

INSERT OR REPLACE INTO market_schema_migrations VALUES ('schema_market_db_v0_1', 'alphadog-v2-schema-phase-pack-v0.1', CURRENT_TIMESTAMP, 'Initial MARKET_DB schema');
