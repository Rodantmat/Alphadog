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

-- Additive Sleeper/Parlay board lifecycle schema.
-- Probe-readiness only. No PrizePicks table changes, no scoring, no ranking, no final board.
CREATE TABLE IF NOT EXISTS sleeper_board_stage (
  stage_id TEXT PRIMARY KEY,
  batch_id TEXT,
  source_key TEXT,
  slate_date TEXT,
  fetched_at TEXT,
  staged_at TEXT DEFAULT CURRENT_TIMESTAMP,
  source_event_id TEXT,
  source_line_id TEXT,
  source_player_id TEXT,
  player_name TEXT,
  team TEXT,
  opponent TEXT,
  league TEXT,
  sport TEXT,
  source_stat_name TEXT,
  canonical_prop_key TEXT,
  line_value REAL,
  side TEXT,
  price REAL,
  decimal_price REAL,
  is_pickable INTEGER DEFAULT 0,
  start_time TEXT,
  raw_line_json TEXT,
  parse_status TEXT,
  parse_error TEXT,
  certification_status TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sleeper_board_batches (
  batch_id TEXT PRIMARY KEY,
  source_key TEXT,
  slate_date TEXT,
  fetched_at TEXT,
  staged_at TEXT,
  certified_at TEXT,
  source_base_url TEXT,
  source_endpoint TEXT,
  source_http_status INTEGER,
  source_size_bytes INTEGER,
  top_level_shape TEXT,
  total_rows INTEGER DEFAULT 0,
  staged_rows INTEGER DEFAULT 0,
  valid_rows INTEGER DEFAULT 0,
  invalid_rows INTEGER DEFAULT 0,
  unmapped_stat_types INTEGER DEFAULT 0,
  certification_status TEXT,
  certification_reason TEXT,
  certification_json TEXT,
  promoted_at TEXT,
  cleaned_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sleeper_board_current (
  current_row_id TEXT PRIMARY KEY,
  batch_id TEXT,
  source_key TEXT,
  slate_date TEXT,
  source_event_id TEXT,
  source_line_id TEXT,
  source_player_id TEXT,
  player_name TEXT,
  team TEXT,
  opponent TEXT,
  league TEXT,
  sport TEXT,
  source_stat_name TEXT,
  canonical_prop_key TEXT,
  line_value REAL,
  side TEXT,
  price REAL,
  decimal_price REAL,
  is_pickable INTEGER DEFAULT 0,
  start_time TEXT,
  raw_line_json TEXT,
  row_payload_json TEXT,
  promoted_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sleeper_board_active_batches (
  source_key TEXT,
  slate_date TEXT,
  active_batch_id TEXT,
  certification_status TEXT,
  row_count INTEGER DEFAULT 0,
  valid_rows INTEGER DEFAULT 0,
  activated_at TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (source_key, slate_date)
);

CREATE INDEX IF NOT EXISTS idx_sleeper_board_stage_batch ON sleeper_board_stage(batch_id);
CREATE INDEX IF NOT EXISTS idx_sleeper_board_stage_source_slate ON sleeper_board_stage(source_key, slate_date);
CREATE INDEX IF NOT EXISTS idx_sleeper_board_stage_stat ON sleeper_board_stage(source_stat_name, canonical_prop_key);
CREATE INDEX IF NOT EXISTS idx_sleeper_board_batches_source_slate ON sleeper_board_batches(source_key, slate_date);
CREATE INDEX IF NOT EXISTS idx_sleeper_board_batches_cert ON sleeper_board_batches(certification_status);
CREATE INDEX IF NOT EXISTS idx_sleeper_board_current_source_slate_batch ON sleeper_board_current(source_key, slate_date, batch_id);
CREATE INDEX IF NOT EXISTS idx_sleeper_board_current_player_prop ON sleeper_board_current(player_name, canonical_prop_key);

INSERT OR REPLACE INTO market_schema_migrations VALUES ('schema_market_db_sleeper_board_v0_1_0', 'alphadog-v2-parlay-sleeper-board-v0.1.0-source-probe-readiness', CURRENT_TIMESTAMP, 'Additive Sleeper board lifecycle tables only. No PrizePicks table changes.');
