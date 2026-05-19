CREATE TABLE IF NOT EXISTS archive_schema_migrations (migration_key TEXT PRIMARY KEY, package_version TEXT NOT NULL, applied_at TEXT DEFAULT CURRENT_TIMESTAMP, notes TEXT);

CREATE TABLE IF NOT EXISTS archive_slate_snapshots (
  archive_id TEXT PRIMARY KEY,
  slate_date TEXT,
  archive_type TEXT,
  source_key TEXT,
  snapshot_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS archive_run_summaries (
  run_archive_id TEXT PRIMARY KEY,
  chain_id TEXT,
  request_id TEXT,
  job_key TEXT,
  status TEXT,
  summary_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS archive_market_snapshots (
  market_archive_id TEXT PRIMARY KEY,
  slate_date TEXT,
  source_key TEXT,
  snapshot_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS archive_score_snapshots (
  score_archive_id TEXT PRIMARY KEY,
  slate_date TEXT,
  snapshot_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_archive_slate ON archive_slate_snapshots(slate_date, archive_type);
CREATE INDEX IF NOT EXISTS idx_archive_runs_job ON archive_run_summaries(job_key, status);

INSERT OR REPLACE INTO archive_schema_migrations VALUES ('schema_archive_db_v0_1', 'alphadog-v2-schema-phase-pack-v0.1', CURRENT_TIMESTAMP, 'Initial ARCHIVE_DB schema');
