PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS control_schema_migrations (
  migration_key TEXT PRIMARY KEY,
  package_version TEXT NOT NULL,
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS control_system_state (
  state_key TEXT PRIMARY KEY,
  lock_flag INTEGER DEFAULT 0,
  running_job_key TEXT,
  running_request_id TEXT,
  running_chain_id TEXT,
  status TEXT DEFAULT 'IDLE',
  state_json TEXT,
  last_error TEXT,
  started_at TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS control_worker_registry (
  worker_name TEXT PRIMARY KEY,
  job_key TEXT NOT NULL,
  worker_group TEXT,
  phase_key TEXT,
  display_name TEXT,
  enabled INTEGER DEFAULT 1,
  owns_db_binding TEXT,
  endpoint_url TEXT,
  service_binding_name TEXT,
  safe_mode INTEGER DEFAULT 1,
  max_tick_ms INTEGER DEFAULT 20000,
  max_api_calls_per_tick INTEGER DEFAULT 20,
  max_rows_per_tick INTEGER DEFAULT 250,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS control_job_queue (
  request_id TEXT PRIMARY KEY,
  chain_id TEXT,
  parent_request_id TEXT,
  job_key TEXT NOT NULL,
  worker_name TEXT,
  worker_group TEXT,
  phase_key TEXT,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER DEFAULT 100,
  cascade INTEGER DEFAULT 0,
  requested_slate_date TEXT,
  slate_mode TEXT DEFAULT 'AUTO',
  input_json TEXT,
  output_json TEXT,
  error_code TEXT,
  error_message TEXT,
  tick_count INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  attempt_count INTEGER DEFAULT 0,
  run_after TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  finished_at TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS control_job_runs (
  run_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  chain_id TEXT,
  job_key TEXT NOT NULL,
  worker_name TEXT,
  status TEXT NOT NULL,
  data_ok INTEGER DEFAULT 0,
  certification_status TEXT,
  rows_read INTEGER DEFAULT 0,
  rows_written INTEGER DEFAULT 0,
  external_calls INTEGER DEFAULT 0,
  started_at TEXT DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT,
  elapsed_ms INTEGER,
  input_json TEXT,
  output_json TEXT,
  error_code TEXT,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS control_worker_run_log (
  log_id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT,
  run_id TEXT,
  worker_name TEXT,
  job_key TEXT,
  level TEXT DEFAULT 'INFO',
  event_key TEXT,
  message TEXT,
  data_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS control_certification_status (
  certification_key TEXT PRIMARY KEY,
  phase_key TEXT,
  job_key TEXT,
  slate_date TEXT,
  status TEXT NOT NULL,
  data_ok INTEGER DEFAULT 0,
  grade TEXT,
  required_rows INTEGER,
  actual_rows INTEGER,
  missing_count INTEGER DEFAULT 0,
  stale_count INTEGER DEFAULT 0,
  warning_count INTEGER DEFAULT 0,
  cert_json TEXT,
  certified_at TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS control_phase_state (
  phase_key TEXT PRIMARY KEY,
  display_name TEXT,
  status TEXT DEFAULT 'not_started',
  data_ok INTEGER DEFAULT 0,
  active_chain_id TEXT,
  last_request_id TEXT,
  current_step TEXT,
  phase_json TEXT,
  started_at TEXT,
  finished_at TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS control_locks (
  lock_key TEXT PRIMARY KEY,
  lock_flag INTEGER DEFAULT 0,
  owner_request_id TEXT,
  owner_worker_name TEXT,
  acquired_at TEXT,
  expires_at TEXT,
  lock_json TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS control_action_log (
  action_id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT DEFAULT 'manual',
  action_key TEXT NOT NULL,
  target_key TEXT,
  request_id TEXT,
  status TEXT DEFAULT 'logged',
  input_json TEXT,
  output_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS control_health_snapshots (
  snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_name TEXT,
  status TEXT,
  db_bindings_ok INTEGER,
  vars_ok INTEGER,
  secrets_ok INTEGER,
  health_json TEXT,
  checked_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_control_job_queue_status ON control_job_queue(status, run_after);
CREATE INDEX IF NOT EXISTS idx_control_job_queue_job_key ON control_job_queue(job_key, status);
CREATE INDEX IF NOT EXISTS idx_control_job_runs_request ON control_job_runs(request_id);
CREATE INDEX IF NOT EXISTS idx_control_worker_log_request ON control_worker_run_log(request_id);
CREATE INDEX IF NOT EXISTS idx_control_cert_phase ON control_certification_status(phase_key, status);

INSERT OR REPLACE INTO control_schema_migrations (migration_key, package_version, notes)
VALUES ('schema_control_db_v0_1', 'alphadog-v2-schema-phase-pack-v0.1', 'Initial AlphaDog v2 CONTROL_DB schema');
