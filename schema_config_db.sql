CREATE TABLE IF NOT EXISTS config_schema_migrations (
  migration_key TEXT PRIMARY KEY,
  package_version TEXT NOT NULL,
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS config_system_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT,
  value_type TEXT DEFAULT 'text',
  category TEXT,
  description TEXT,
  editable INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS config_feature_flags (
  flag_key TEXT PRIMARY KEY,
  enabled INTEGER DEFAULT 0,
  category TEXT,
  description TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS config_worker_definitions (
  worker_name TEXT PRIMARY KEY,
  job_key TEXT NOT NULL,
  worker_group TEXT,
  phase_key TEXT,
  display_name TEXT,
  enabled INTEGER DEFAULT 1,
  owns_db_binding TEXT,
  schedule_profile_key TEXT,
  max_tick_ms INTEGER DEFAULT 20000,
  max_api_calls_per_tick INTEGER DEFAULT 20,
  max_rows_per_tick INTEGER DEFAULT 250,
  retry_limit INTEGER DEFAULT 3,
  stale_minutes INTEGER DEFAULT 15,
  downstream_policy TEXT DEFAULT 'certifier_release',
  notes TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS config_worker_schedules (
  schedule_key TEXT PRIMARY KEY,
  job_key TEXT NOT NULL,
  worker_name TEXT,
  phase_key TEXT,
  enabled INTEGER DEFAULT 0,
  cron_expression TEXT,
  local_time_hint TEXT,
  timezone TEXT DEFAULT 'America/Los_Angeles',
  cadence_notes TEXT,
  priority INTEGER DEFAULT 100,
  cascade INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS config_prop_taxonomy (
  prop_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  player_side TEXT,
  stat_family TEXT,
  primary_role TEXT,
  supported_market_sources TEXT,
  default_line_policy TEXT,
  over_under_policy TEXT DEFAULT 'both',
  california_pickable INTEGER DEFAULT 1,
  scoring_enabled INTEGER DEFAULT 0,
  notes TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS config_market_sources (
  source_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  source_type TEXT,
  provider TEXT,
  enabled INTEGER DEFAULT 1,
  primary_use TEXT,
  priority INTEGER DEFAULT 100,
  requires_api_key INTEGER DEFAULT 0,
  refresh_policy TEXT,
  trust_grade TEXT DEFAULT 'UNTESTED',
  notes TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS config_line_shape_policy (
  policy_key TEXT PRIMARY KEY,
  source_key TEXT,
  prop_key TEXT,
  line_type TEXT,
  allowed_sides TEXT,
  normalize_policy TEXT,
  reject_policy TEXT,
  notes TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS config_certification_rules (
  rule_key TEXT PRIMARY KEY,
  phase_key TEXT,
  job_key TEXT,
  required INTEGER DEFAULT 1,
  min_rows INTEGER DEFAULT 0,
  max_stale_minutes INTEGER,
  zero_rows_policy TEXT DEFAULT 'suspicious',
  missing_data_policy TEXT DEFAULT 'block_downstream',
  degraded_policy TEXT DEFAULT 'allow_if_explicit',
  rule_json TEXT,
  notes TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS config_scoring_profiles (
  profile_key TEXT PRIMARY KEY,
  display_name TEXT,
  sport TEXT DEFAULT 'MLB',
  active INTEGER DEFAULT 0,
  profile_json TEXT,
  notes TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS config_scoring_rules (
  rule_key TEXT PRIMARY KEY,
  profile_key TEXT,
  prop_key TEXT,
  factor_key TEXT,
  weight REAL DEFAULT 0,
  min_value REAL,
  max_value REAL,
  bonus REAL DEFAULT 0,
  penalty REAL DEFAULT 0,
  enabled INTEGER DEFAULT 1,
  rule_json TEXT,
  notes TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS config_source_priority (
  priority_key TEXT PRIMARY KEY,
  source_key TEXT,
  data_family TEXT,
  priority INTEGER DEFAULT 100,
  fallback_order INTEGER DEFAULT 1,
  enabled INTEGER DEFAULT 1,
  notes TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS config_refresh_windows (
  window_key TEXT PRIMARY KEY,
  phase_key TEXT,
  source_key TEXT,
  local_start_time TEXT,
  local_end_time TEXT,
  timezone TEXT DEFAULT 'America/Los_Angeles',
  enabled INTEGER DEFAULT 1,
  notes TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_config_worker_defs_job ON config_worker_definitions(job_key);
CREATE INDEX IF NOT EXISTS idx_config_worker_schedules_job ON config_worker_schedules(job_key, enabled);
CREATE INDEX IF NOT EXISTS idx_config_prop_role ON config_prop_taxonomy(primary_role, scoring_enabled);
CREATE INDEX IF NOT EXISTS idx_config_cert_phase ON config_certification_rules(phase_key, job_key);

INSERT OR REPLACE INTO config_schema_migrations (migration_key, package_version, notes)
VALUES ('schema_config_db_v0_1', 'alphadog-v2-schema-phase-pack-v0.1', 'Initial AlphaDog v2 CONFIG_DB schema');
