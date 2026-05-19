CREATE TABLE IF NOT EXISTS context_schema_migrations (migration_key TEXT PRIMARY KEY, package_version TEXT NOT NULL, applied_at TEXT DEFAULT CURRENT_TIMESTAMP, notes TEXT);

CREATE TABLE IF NOT EXISTS context_packets (
  context_id TEXT PRIMARY KEY,
  slate_date TEXT,
  phase_key TEXT,
  job_key TEXT,
  prop_key TEXT,
  player_id INTEGER,
  game_key TEXT,
  status TEXT,
  data_ok INTEGER DEFAULT 0,
  context_json TEXT,
  source_keys TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS context_factor_scores (
  factor_id TEXT PRIMARY KEY,
  context_id TEXT,
  slate_date TEXT,
  prop_key TEXT,
  player_id INTEGER,
  factor_key TEXT,
  score_0_100 REAL,
  signal TEXT,
  confidence TEXT,
  missing_data INTEGER DEFAULT 0,
  factor_json TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS context_certification (
  cert_id TEXT PRIMARY KEY,
  slate_date TEXT,
  phase_key TEXT,
  job_key TEXT,
  status TEXT,
  data_ok INTEGER DEFAULT 0,
  cert_json TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_context_packets_lookup ON context_packets(slate_date, prop_key, player_id);
CREATE INDEX IF NOT EXISTS idx_context_factors_context ON context_factor_scores(context_id, factor_key);

INSERT OR REPLACE INTO context_schema_migrations VALUES ('schema_context_db_v0_1', 'alphadog-v2-schema-phase-pack-v0.1', CURRENT_TIMESTAMP, 'Initial CONTEXT_DB schema');
