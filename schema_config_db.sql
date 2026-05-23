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

-- ============================================================================
-- alphadog-v2-base-hitter-metrics-v0.1.0-schema-formula-input-audit
-- Additive neutral metric config/calibration schema.
-- This is not scoring. It stores tunable metric windows, thresholds, formula
-- versions, and calibration profiles outside JS.
-- ============================================================================

CREATE TABLE IF NOT EXISTS config_metric_calibration_profiles (
  profile_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  sport TEXT DEFAULT 'MLB',
  metric_domain TEXT DEFAULT 'hitter',
  active INTEGER DEFAULT 0,
  profile_status TEXT DEFAULT 'draft',
  profile_json TEXT,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS config_metric_formula_versions (
  formula_version TEXT PRIMARY KEY,
  sport TEXT DEFAULT 'MLB',
  metric_domain TEXT DEFAULT 'hitter',
  active INTEGER DEFAULT 0,
  version_status TEXT DEFAULT 'draft',
  formula_catalog_json TEXT,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS config_metric_definitions (
  metric_key TEXT PRIMARY KEY,
  metric_family TEXT NOT NULL,
  metric_scope TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  numerator_field TEXT,
  denominator_field TEXT,
  source_table TEXT NOT NULL,
  formula_version TEXT,
  enabled INTEGER DEFAULT 1,
  neutral_metric_only INTEGER DEFAULT 1,
  future_scoring_bridge_flag INTEGER DEFAULT 0,
  defer_reason TEXT,
  config_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS config_metric_windows (
  window_key TEXT PRIMARY KEY,
  metric_domain TEXT DEFAULT 'hitter',
  metric_scope TEXT NOT NULL,
  window_type TEXT NOT NULL,
  window_size INTEGER,
  enabled INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 100,
  config_profile_id TEXT,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS config_metric_thresholds (
  threshold_key TEXT PRIMARY KEY,
  config_profile_id TEXT NOT NULL,
  metric_domain TEXT DEFAULT 'hitter',
  metric_family TEXT,
  metric_key TEXT,
  threshold_type TEXT NOT NULL,
  threshold_value REAL,
  threshold_json TEXT,
  label TEXT,
  enabled INTEGER DEFAULT 1,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_config_metric_definitions_family ON config_metric_definitions(metric_family, enabled);
CREATE INDEX IF NOT EXISTS idx_config_metric_windows_domain ON config_metric_windows(metric_domain, metric_scope, enabled);
CREATE INDEX IF NOT EXISTS idx_config_metric_thresholds_profile ON config_metric_thresholds(config_profile_id, metric_domain, threshold_type, enabled);

INSERT OR REPLACE INTO config_schema_migrations (migration_key, package_version, notes)
VALUES ('base_hitter_metrics_config_v0_1_0_neutral_metric_calibration', 'alphadog-v2-base-hitter-metrics-v0.1.0-schema-formula-input-audit', 'Additive neutral metric calibration config tables; not scoring');

INSERT OR IGNORE INTO config_metric_calibration_profiles (profile_id, display_name, sport, metric_domain, active, profile_status, profile_json, notes)
VALUES ('hitter_metrics_neutral_v0_1_0', 'Hitter Metrics Neutral v0.1.0 Draft', 'MLB', 'hitter', 1, 'draft', '{"no_scoring":true,"promotion_locked":false,"tuning_owner":"CONFIG_DB"}', 'Neutral metric readiness/calibration profile. Draft only; no prop scoring weights.');

INSERT OR IGNORE INTO config_metric_formula_versions (formula_version, sport, metric_domain, active, version_status, formula_catalog_json, notes)
VALUES ('hitter_metrics_formula_v0_1_0_readiness', 'MLB', 'hitter', 1, 'readiness_only', '{"direct_aggregates":true,"rates_denominator_safe":true,"split_readiness_only":true,"production_promotion_locked":false}', 'Formula catalog shell for v0.1.0 readiness only. Not production promotion locked.');

INSERT OR IGNORE INTO config_metric_windows (window_key, metric_domain, metric_scope, window_type, window_size, enabled, sort_order, config_profile_id, notes) VALUES
('last_3_games', 'hitter', 'last_3_games', 'last_n_games', 3, 1, 10, 'hitter_metrics_neutral_v0_1_0', 'Rolling last 3 games window for neutral hitter metrics.'),
('last_5_games', 'hitter', 'last_5_games', 'last_n_games', 5, 1, 20, 'hitter_metrics_neutral_v0_1_0', 'Rolling last 5 games window for neutral hitter metrics.'),
('last_10_games', 'hitter', 'last_10_games', 'last_n_games', 10, 1, 30, 'hitter_metrics_neutral_v0_1_0', 'Rolling last 10 games window for neutral hitter metrics.'),
('last_20_games', 'hitter', 'last_20_games', 'last_n_games', 20, 1, 40, 'hitter_metrics_neutral_v0_1_0', 'Rolling last 20 games window for neutral hitter metrics.'),
('season_to_date', 'hitter', 'season_to_date', 'season_to_date', NULL, 1, 90, 'hitter_metrics_neutral_v0_1_0', 'Season-to-date neutral hitter metric window.');

INSERT OR IGNORE INTO config_metric_thresholds (threshold_key, config_profile_id, metric_domain, threshold_type, threshold_value, label, enabled, notes) VALUES
('min_games_sample_none', 'hitter_metrics_neutral_v0_1_0', 'hitter', 'sample_size', 0, 'sample_none', 1, 'Draft neutral metric threshold. DB-configurable; not a prop scoring penalty or bonus.'),
('min_games_sample_tiny', 'hitter_metrics_neutral_v0_1_0', 'hitter', 'sample_size', 1, 'sample_tiny', 1, 'Draft neutral metric threshold. DB-configurable; not a prop scoring penalty or bonus.'),
('min_games_sample_thin', 'hitter_metrics_neutral_v0_1_0', 'hitter', 'sample_size', 3, 'sample_thin', 1, 'Draft neutral metric threshold. DB-configurable; not a prop scoring penalty or bonus.'),
('min_games_sample_usable', 'hitter_metrics_neutral_v0_1_0', 'hitter', 'sample_size', 5, 'sample_usable', 1, 'Draft neutral metric threshold. DB-configurable; not a prop scoring penalty or bonus.'),
('min_games_sample_strong', 'hitter_metrics_neutral_v0_1_0', 'hitter', 'sample_size', 10, 'sample_strong', 1, 'Draft neutral metric threshold. DB-configurable; not a prop scoring penalty or bonus.'),
('denominator_floor_pa', 'hitter_metrics_neutral_v0_1_0', 'hitter', 'denominator_floor', 1, 'pa_floor', 1, 'Draft neutral metric denominator floor. DB-configurable.'),
('denominator_floor_ab', 'hitter_metrics_neutral_v0_1_0', 'hitter', 'denominator_floor', 1, 'ab_floor', 1, 'Draft neutral metric denominator floor. DB-configurable.'),
('split_pa_sample_tiny', 'hitter_metrics_neutral_v0_1_0', 'hitter', 'split_sample_size', 10, 'split_tiny', 1, 'Draft neutral split reliability threshold. DB-configurable.'),
('split_pa_sample_usable', 'hitter_metrics_neutral_v0_1_0', 'hitter', 'split_sample_size', 25, 'split_usable', 1, 'Draft neutral split reliability threshold. DB-configurable.'),
('split_pa_sample_strong', 'hitter_metrics_neutral_v0_1_0', 'hitter', 'split_sample_size', 50, 'split_strong', 1, 'Draft neutral split reliability threshold. DB-configurable.'),
('stale_input_days_warn', 'hitter_metrics_neutral_v0_1_0', 'hitter', 'stale_input_rule', 2, 'stale_warn', 1, 'Draft stale-input warning threshold. DB-configurable.');
