const WORKER_NAME = "alphadog-v2-base-hitter-metrics";
const VERSION = "alphadog-v2-base-hitter-metrics-v0.1.0-schema-formula-input-audit";
const JOB_KEY = "base-hitter-metrics";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_HITTER_DB"];
const REQUIRED_SECRETS = ["ALPHADOG_ADMIN_TOKEN", "ALPHADOG_INTERNAL_TOKEN"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_VERSION", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON", "MAX_TICK_MS", "MAX_ROWS_PER_TICK", "LOCK_STALE_MINUTES"];

const REQUIRED_HITTER_LOG_COLUMNS = [
  "player_id", "game_pk", "season", "game_date", "pa", "ab", "hits", "singles", "doubles", "triples", "home_runs", "runs", "rbi", "walks", "strikeouts", "stolen_bases", "total_bases", "certification_status", "certification_grade", "batch_id", "run_id", "promoted_at"
];

const REQUIRED_HITTER_SPLIT_COLUMNS = [
  "player_id", "season", "split_key", "split_code", "pa", "ab", "hits", "home_runs", "walks", "strikeouts", "avg", "obp", "slg", "ops", "source_snapshot_date", "certification_status", "certification_grade", "batch_id", "run_id", "promoted_at"
];

const METRIC_SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS hitter_metric_batches (
    batch_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    worker_name TEXT NOT NULL,
    worker_version TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    data_feed_key TEXT NOT NULL,
    source_key TEXT NOT NULL,
    source_season INTEGER,
    input_log_row_count INTEGER DEFAULT 0,
    input_split_row_count INTEGER DEFAULT 0,
    input_latest_game_date TEXT,
    input_latest_split_snapshot_date TEXT,
    expected_hitter_universe_count INTEGER DEFAULT 0,
    config_profile_id TEXT,
    formula_version TEXT,
    metric_catalog_json TEXT,
    formula_readiness_json TEXT,
    config_readiness_json TEXT,
    input_readiness_json TEXT,
    rows_staged INTEGER DEFAULT 0,
    rows_promoted INTEGER DEFAULT 0,
    duplicate_count INTEGER DEFAULT 0,
    certification_status TEXT DEFAULT 'audit_only_not_promoted',
    certification_grade TEXT,
    certification_json TEXT,
    locked_by TEXT,
    lock_acquired_at TEXT,
    lock_expires_at TEXT,
    stale_recovery_count INTEGER DEFAULT 0,
    started_at TEXT DEFAULT CURRENT_TIMESTAMP,
    finished_at TEXT,
    certified_at TEXT,
    promoted_at TEXT,
    cleaned_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS hitter_metric_stage (
    stage_id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    metric_key TEXT NOT NULL,
    player_id INTEGER NOT NULL,
    season INTEGER NOT NULL,
    metric_scope TEXT NOT NULL,
    metric_window TEXT NOT NULL,
    metric_family TEXT NOT NULL,
    source_start_date TEXT,
    source_end_date TEXT,
    source_snapshot_date TEXT,
    input_log_row_count INTEGER DEFAULT 0,
    input_split_row_count INTEGER DEFAULT 0,
    input_latest_game_date TEXT,
    metric_value REAL,
    metric_text_value TEXT,
    numerator REAL,
    denominator REAL,
    data_feed_key TEXT NOT NULL,
    source_key TEXT NOT NULL,
    ingestion_mode TEXT NOT NULL,
    certification_status TEXT DEFAULT 'audit_only_not_promoted',
    certification_grade TEXT,
    certified_at TEXT,
    promoted_at TEXT,
    formula_version TEXT,
    config_profile_id TEXT,
    raw_input_summary_json TEXT,
    metric_json TEXT,
    missing_data_reason TEXT,
    reliability_label TEXT,
    row_status TEXT DEFAULT 'audit_only_staged',
    row_error TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(batch_id, metric_key, player_id, season, metric_scope, metric_window)
  )`,
  `CREATE TABLE IF NOT EXISTS hitter_metric_outcomes (
    outcome_id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    player_id INTEGER,
    season INTEGER,
    metric_family TEXT,
    metric_window TEXT,
    terminal_category TEXT NOT NULL,
    category_reason TEXT,
    input_log_row_count INTEGER DEFAULT 0,
    input_split_row_count INTEGER DEFAULT 0,
    missing_data_reason TEXT,
    formula_version TEXT,
    config_profile_id TEXT,
    outcome_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS hitter_metric_cursor (
    cursor_key TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    source_season INTEGER,
    current_player_id INTEGER,
    current_player_offset INTEGER DEFAULT 0,
    players_total INTEGER DEFAULT 0,
    players_processed INTEGER DEFAULT 0,
    next_run_after TEXT,
    last_error TEXT,
    cursor_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS hitter_metric_certifications (
    certification_id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    certification_status TEXT NOT NULL,
    certification_grade TEXT,
    checks_json TEXT NOT NULL,
    rows_staged INTEGER DEFAULT 0,
    rows_promoted INTEGER DEFAULT 0,
    duplicate_count INTEGER DEFAULT 0,
    formula_error_count INTEGER DEFAULT 0,
    denominator_error_count INTEGER DEFAULT 0,
    config_profile_id TEXT,
    formula_version TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_hitter_metric_batches_status ON hitter_metric_batches(status, mode, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_hitter_metric_batches_lock ON hitter_metric_batches(locked_by, lock_expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_hitter_metric_stage_batch ON hitter_metric_stage(batch_id, row_status)`,
  `CREATE INDEX IF NOT EXISTS idx_hitter_metric_stage_player ON hitter_metric_stage(player_id, season, metric_key, metric_window)`,
  `CREATE INDEX IF NOT EXISTS idx_hitter_metric_stage_cert ON hitter_metric_stage(certification_status, batch_id)`,
  `CREATE INDEX IF NOT EXISTS idx_hitter_metric_outcomes_batch ON hitter_metric_outcomes(batch_id, terminal_category)`,
  `CREATE INDEX IF NOT EXISTS idx_hitter_metric_cursor_status ON hitter_metric_cursor(status, mode, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_hitter_metric_cert_batch ON hitter_metric_certifications(batch_id, certification_status)`
];

const LEGACY_HITTER_METRICS_ALTER_SQL = [
  "ALTER TABLE hitter_metrics ADD COLUMN metric_key TEXT",
  "ALTER TABLE hitter_metrics ADD COLUMN metric_scope TEXT",
  "ALTER TABLE hitter_metrics ADD COLUMN metric_window TEXT",
  "ALTER TABLE hitter_metrics ADD COLUMN metric_family TEXT",
  "ALTER TABLE hitter_metrics ADD COLUMN source_start_date TEXT",
  "ALTER TABLE hitter_metrics ADD COLUMN source_end_date TEXT",
  "ALTER TABLE hitter_metrics ADD COLUMN source_snapshot_date TEXT",
  "ALTER TABLE hitter_metrics ADD COLUMN input_log_row_count INTEGER DEFAULT 0",
  "ALTER TABLE hitter_metrics ADD COLUMN input_split_row_count INTEGER DEFAULT 0",
  "ALTER TABLE hitter_metrics ADD COLUMN input_latest_game_date TEXT",
  "ALTER TABLE hitter_metrics ADD COLUMN data_feed_key TEXT",
  "ALTER TABLE hitter_metrics ADD COLUMN ingestion_mode TEXT",
  "ALTER TABLE hitter_metrics ADD COLUMN batch_id TEXT",
  "ALTER TABLE hitter_metrics ADD COLUMN run_id TEXT",
  "ALTER TABLE hitter_metrics ADD COLUMN certification_status TEXT",
  "ALTER TABLE hitter_metrics ADD COLUMN certification_grade TEXT",
  "ALTER TABLE hitter_metrics ADD COLUMN certified_at TEXT",
  "ALTER TABLE hitter_metrics ADD COLUMN promoted_at TEXT",
  "ALTER TABLE hitter_metrics ADD COLUMN formula_version TEXT",
  "ALTER TABLE hitter_metrics ADD COLUMN config_profile_id TEXT",
  "ALTER TABLE hitter_metrics ADD COLUMN raw_input_summary_json TEXT",
  "ALTER TABLE hitter_metrics ADD COLUMN metric_json TEXT",
  "ALTER TABLE hitter_metrics ADD COLUMN missing_data_reason TEXT",
  "ALTER TABLE hitter_metrics ADD COLUMN reliability_label TEXT",
  "ALTER TABLE hitter_metrics ADD COLUMN created_at TEXT"
];

const CONFIG_SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS config_metric_calibration_profiles (
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
  )`,
  `CREATE TABLE IF NOT EXISTS config_metric_formula_versions (
    formula_version TEXT PRIMARY KEY,
    sport TEXT DEFAULT 'MLB',
    metric_domain TEXT DEFAULT 'hitter',
    active INTEGER DEFAULT 0,
    version_status TEXT DEFAULT 'draft',
    formula_catalog_json TEXT,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS config_metric_definitions (
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
  )`,
  `CREATE TABLE IF NOT EXISTS config_metric_windows (
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
  )`,
  `CREATE TABLE IF NOT EXISTS config_metric_thresholds (
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
  )`,
  `CREATE INDEX IF NOT EXISTS idx_config_metric_definitions_family ON config_metric_definitions(metric_family, enabled)`,
  `CREATE INDEX IF NOT EXISTS idx_config_metric_windows_domain ON config_metric_windows(metric_domain, metric_scope, enabled)`,
  `CREATE INDEX IF NOT EXISTS idx_config_metric_thresholds_profile ON config_metric_thresholds(config_profile_id, metric_domain, threshold_type, enabled)`
];

const CONFIG_SEED_SQL = [
  { sql: "INSERT OR IGNORE INTO config_metric_calibration_profiles (profile_id, display_name, sport, metric_domain, active, profile_status, profile_json, notes) VALUES (?, ?, 'MLB', 'hitter', 1, 'draft', ?, ?)", binds: ["hitter_metrics_neutral_v0_1_0", "Hitter Metrics Neutral v0.1.0 Draft", JSON.stringify({ no_scoring: true, promotion_locked: false, tuning_owner: "CONFIG_DB" }), "Neutral metric readiness/calibration profile. Draft only; no prop scoring weights."] },
  { sql: "INSERT OR IGNORE INTO config_metric_formula_versions (formula_version, sport, metric_domain, active, version_status, formula_catalog_json, notes) VALUES (?, 'MLB', 'hitter', 1, 'readiness_only', ?, ?)", binds: ["hitter_metrics_formula_v0_1_0_readiness", JSON.stringify({ direct_aggregates: true, rates_denominator_safe: true, split_readiness_only: true, production_promotion_locked: false }), "Formula catalog shell for v0.1.0 readiness only. Not production promotion locked."] },
  ...[3,5,10,20].map((n, i) => ({ sql: "INSERT OR IGNORE INTO config_metric_windows (window_key, metric_domain, metric_scope, window_type, window_size, enabled, sort_order, config_profile_id, notes) VALUES (?, 'hitter', ?, 'last_n_games', ?, 1, ?, 'hitter_metrics_neutral_v0_1_0', ?)", binds: [`last_${n}_games`, `last_${n}_games`, n, (i+1)*10, `Rolling last ${n} games window for neutral hitter metrics.`] })),
  { sql: "INSERT OR IGNORE INTO config_metric_windows (window_key, metric_domain, metric_scope, window_type, window_size, enabled, sort_order, config_profile_id, notes) VALUES ('season_to_date', 'hitter', 'season_to_date', 'season_to_date', NULL, 1, 90, 'hitter_metrics_neutral_v0_1_0', 'Season-to-date neutral hitter metric window.')", binds: [] },
  ...[
    ["min_games_sample_none", "sample_size", 0, "sample_none"],
    ["min_games_sample_tiny", "sample_size", 1, "sample_tiny"],
    ["min_games_sample_thin", "sample_size", 3, "sample_thin"],
    ["min_games_sample_usable", "sample_size", 5, "sample_usable"],
    ["min_games_sample_strong", "sample_size", 10, "sample_strong"],
    ["denominator_floor_pa", "denominator_floor", 1, "pa_floor"],
    ["denominator_floor_ab", "denominator_floor", 1, "ab_floor"],
    ["split_pa_sample_tiny", "split_sample_size", 10, "split_tiny"],
    ["split_pa_sample_usable", "split_sample_size", 25, "split_usable"],
    ["split_pa_sample_strong", "split_sample_size", 50, "split_strong"],
    ["stale_input_days_warn", "stale_input_rule", 2, "stale_warn"]
  ].map(([key,type,value,label]) => ({ sql: "INSERT OR IGNORE INTO config_metric_thresholds (threshold_key, config_profile_id, metric_domain, threshold_type, threshold_value, label, enabled, notes) VALUES (?, 'hitter_metrics_neutral_v0_1_0', 'hitter', ?, ?, ?, 1, 'Draft neutral metric threshold. DB-configurable; not a prop scoring penalty or bonus.')", binds: [key, type, value, label] })),
  ...[
    ["pa", "direct_aggregate", "hitter_game_logs", "Plate appearances"],
    ["ab", "direct_aggregate", "hitter_game_logs", "At bats"],
    ["hits", "direct_aggregate", "hitter_game_logs", "Hits"],
    ["singles", "direct_aggregate", "hitter_game_logs", "Singles"],
    ["doubles", "direct_aggregate", "hitter_game_logs", "Doubles"],
    ["triples", "direct_aggregate", "hitter_game_logs", "Triples"],
    ["home_runs", "direct_aggregate", "hitter_game_logs", "Home runs"],
    ["total_bases", "direct_aggregate", "hitter_game_logs", "Total bases"],
    ["runs", "direct_aggregate", "hitter_game_logs", "Runs"],
    ["rbi", "direct_aggregate", "hitter_game_logs", "Runs batted in"],
    ["walks", "direct_aggregate", "hitter_game_logs", "Walks"],
    ["strikeouts", "direct_aggregate", "hitter_game_logs", "Strikeouts"],
    ["stolen_bases", "direct_aggregate", "hitter_game_logs", "Stolen bases"],
    ["pa_per_game", "rate", "hitter_game_logs", "Plate appearances per game"],
    ["hits_per_game", "rate", "hitter_game_logs", "Hits per game"],
    ["total_bases_per_game", "rate", "hitter_game_logs", "Total bases per game"],
    ["k_rate", "rate", "hitter_game_logs", "Strikeout rate using PA denominator"],
    ["bb_rate", "rate", "hitter_game_logs", "Walk rate using PA denominator"],
    ["hr_rate", "rate", "hitter_game_logs", "Home run rate using PA denominator"],
    ["tb_per_pa", "rate", "hitter_game_logs", "Total bases per plate appearance"],
    ["h_per_ab", "rate", "hitter_game_logs", "Hits per at bat"],
    ["vs_left_ops", "split_context", "hitter_splits", "OPS versus left-handed pitching"],
    ["vs_right_ops", "split_context", "hitter_splits", "OPS versus right-handed pitching"]
  ].map(([key,fam,source,display]) => ({ sql: "INSERT OR IGNORE INTO config_metric_definitions (metric_key, metric_family, metric_scope, display_name, description, source_table, formula_version, enabled, neutral_metric_only, future_scoring_bridge_flag, config_json) VALUES (?, ?, 'readiness_catalog', ?, ?, ?, 'hitter_metrics_formula_v0_1_0_readiness', 1, 1, 1, ?)", binds: [key, fam, display, display + ". Readiness only in v0.1.0.", source, JSON.stringify({ readiness_only: true, no_promotion_v0_1_0: true })] }))
];

function nowUtc() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

function bindingPresence(env, names) {
  const out = {};
  for (const name of names) out[name] = Boolean(env && env[name]);
  return out;
}

function varPresence(env, names) {
  const out = {};
  for (const name of names) out[name] = env && env[name] !== undefined && env[name] !== null && String(env[name]).length > 0;
  return out;
}

function allTrue(obj) { return Object.values(obj).every(Boolean); }

function baseIdentity(env) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const vars = varPresence(env, EXPECTED_VARS);
  const secrets = varPresence(env, REQUIRED_SECRETS);
  return {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    status: "SCHEMA_FORMULA_INPUT_AUDIT_READY",
    timestamp_utc: nowUtc(),
    phase: "incremental_base_derived_metrics_readiness",
    hard_blocks: {
      no_live_metric_promotion: true,
      no_source_table_mutation: true,
      no_external_mlb_calls: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true
    },
    binding_summary: {
      required_db_bindings_present: allTrue(db),
      expected_vars_present: allTrue(vars),
      required_secrets_present: allTrue(secrets)
    }
  };
}

async function readJsonSafe(request) { try { return await request.json(); } catch { return {}; } }
async function execSql(db, sql, binds = []) { return binds.length ? await db.prepare(sql).bind(...binds).run() : await db.prepare(sql).run(); }
async function queryAll(db, sql, binds = []) { const res = binds.length ? await db.prepare(sql).bind(...binds).all() : await db.prepare(sql).all(); return res.results || []; }
async function queryFirst(db, sql, binds = []) { const res = await queryAll(db, sql, binds); return res[0] || null; }

async function safeQueryAll(db, sql, binds = []) {
  try { return { ok: true, rows: await queryAll(db, sql, binds) }; }
  catch (err) { return { ok: false, error: String(err && err.message ? err.message : err), rows: [] }; }
}

async function ensureSchema(env) {
  const results = [];
  for (const sql of METRIC_SCHEMA_SQL) {
    try { await execSql(env.STATS_HITTER_DB, sql); results.push({ target: "STATS_HITTER_DB", ok: true, sql_preview: sql.slice(0, 90) }); }
    catch (err) { results.push({ target: "STATS_HITTER_DB", ok: false, sql_preview: sql.slice(0, 90), error: String(err && err.message ? err.message : err) }); }
  }
  for (const sql of LEGACY_HITTER_METRICS_ALTER_SQL) {
    try { await execSql(env.STATS_HITTER_DB, sql); results.push({ target: "STATS_HITTER_DB", ok: true, action: "legacy_hitter_metrics_additive_column", sql_preview: sql }); }
    catch (err) {
      const msg = String(err && err.message ? err.message : err);
      results.push({ target: "STATS_HITTER_DB", ok: msg.toLowerCase().includes("duplicate column") || msg.toLowerCase().includes("already exists"), action: "legacy_hitter_metrics_additive_column", sql_preview: sql, ignored_duplicate_or_existing: msg.toLowerCase().includes("duplicate column") || msg.toLowerCase().includes("already exists"), error: msg });
    }
  }
  for (const sql of CONFIG_SCHEMA_SQL) {
    try { await execSql(env.CONFIG_DB, sql); results.push({ target: "CONFIG_DB", ok: true, sql_preview: sql.slice(0, 90) }); }
    catch (err) { results.push({ target: "CONFIG_DB", ok: false, sql_preview: sql.slice(0, 90), error: String(err && err.message ? err.message : err) }); }
  }
  let seedOk = 0;
  let seedFailed = 0;
  for (const item of CONFIG_SEED_SQL) {
    try { await execSql(env.CONFIG_DB, item.sql, item.binds || []); seedOk++; }
    catch (err) { seedFailed++; results.push({ target: "CONFIG_DB", ok: false, action: "config_metric_seed", sql_preview: item.sql.slice(0, 90), error: String(err && err.message ? err.message : err) }); }
  }
  try { await execSql(env.STATS_HITTER_DB, "INSERT OR REPLACE INTO hitter_schema_migrations (migration_key, package_version, notes) VALUES ('base_hitter_metrics_v0_1_0_schema_formula_input_audit', ?, 'Additive schema/config/formula/input readiness only; no metric promotion')", [VERSION]); } catch (err) { results.push({ target: "STATS_HITTER_DB", ok: false, action: "schema_migration_marker", error: String(err && err.message ? err.message : err) }); }
  try { await execSql(env.CONFIG_DB, "INSERT OR REPLACE INTO config_schema_migrations (migration_key, package_version, notes) VALUES ('base_hitter_metrics_config_v0_1_0_neutral_metric_calibration', ?, 'Additive neutral metric calibration config tables and draft seeds')", [VERSION]); } catch (err) { results.push({ target: "CONFIG_DB", ok: false, action: "config_migration_marker", error: String(err && err.message ? err.message : err) }); }
  return { ok: results.every(r => r.ok !== false), statements: results.length, seed_ok: seedOk, seed_failed: seedFailed, details: results.filter(r => r.ok === false).slice(0, 20) };
}

async function tableInfo(db, tableName) {
  const q = await safeQueryAll(db, `PRAGMA table_info(${tableName})`);
  const cols = q.rows.map(r => r.name);
  return { ok: q.ok, table: tableName, columns: cols, column_count: cols.length, error: q.error || null };
}

function hasCols(cols, required) {
  return required.map(name => ({ column: name, present: cols.includes(name) }));
}

async function auditHitterLogs(env, columns) {
  const has = new Set(columns);
  const out = { table: "hitter_game_logs", required_columns: hasCols(columns, REQUIRED_HITTER_LOG_COLUMNS) };
  out.required_columns_present = out.required_columns.every(x => x.present);
  out.row_count = await safeQueryAll(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_game_logs");
  if (has.has("game_date")) out.date_range = await safeQueryAll(env.STATS_HITTER_DB, "SELECT MIN(game_date) AS min_game_date, MAX(game_date) AS max_game_date, COUNT(DISTINCT game_date) AS distinct_game_dates FROM hitter_game_logs");
  if (has.has("player_id")) out.player_count = await safeQueryAll(env.STATS_HITTER_DB, "SELECT COUNT(DISTINCT player_id) AS distinct_players FROM hitter_game_logs");
  if (has.has("player_id") && has.has("game_pk")) out.duplicates = await safeQueryAll(env.STATS_HITTER_DB, "SELECT COUNT(*) AS duplicate_keys FROM (SELECT player_id, game_pk, COUNT(*) AS c FROM hitter_game_logs GROUP BY player_id, game_pk HAVING COUNT(*) > 1)");
  if (has.has("certification_status")) out.certification_statuses = await safeQueryAll(env.STATS_HITTER_DB, "SELECT certification_status, certification_grade, COUNT(*) AS c FROM hitter_game_logs GROUP BY certification_status, certification_grade ORDER BY c DESC LIMIT 20");
  return out;
}

async function auditHitterSplits(env, columns) {
  const has = new Set(columns);
  const out = { table: "hitter_splits", required_columns: hasCols(columns, REQUIRED_HITTER_SPLIT_COLUMNS) };
  out.required_columns_present = out.required_columns.every(x => x.present);
  out.row_count = await safeQueryAll(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_splits");
  if (has.has("source_snapshot_date")) out.snapshot_dates = await safeQueryAll(env.STATS_HITTER_DB, "SELECT MIN(source_snapshot_date) AS min_snapshot_date, MAX(source_snapshot_date) AS max_snapshot_date, COUNT(DISTINCT source_snapshot_date) AS distinct_snapshot_dates FROM hitter_splits");
  if (has.has("split_key") || has.has("split_code")) out.split_distribution = await safeQueryAll(env.STATS_HITTER_DB, "SELECT split_key, split_code, COUNT(*) AS c FROM hitter_splits GROUP BY split_key, split_code ORDER BY c DESC LIMIT 20");
  if (has.has("player_id")) out.player_count = await safeQueryAll(env.STATS_HITTER_DB, "SELECT COUNT(DISTINCT player_id) AS distinct_players FROM hitter_splits");
  if (has.has("player_id") && has.has("season") && has.has("split_key")) out.duplicates = await safeQueryAll(env.STATS_HITTER_DB, "SELECT COUNT(*) AS duplicate_keys FROM (SELECT player_id, season, split_key, COUNT(*) AS c FROM hitter_splits GROUP BY player_id, season, split_key HAVING COUNT(*) > 1)");
  if (has.has("certification_status")) out.certification_statuses = await safeQueryAll(env.STATS_HITTER_DB, "SELECT certification_status, certification_grade, COUNT(*) AS c FROM hitter_splits GROUP BY certification_status, certification_grade ORDER BY c DESC LIMIT 20");
  return out;
}

async function auditConfig(env) {
  const tables = ["config_metric_definitions", "config_metric_windows", "config_metric_thresholds", "config_metric_formula_versions", "config_metric_calibration_profiles"];
  const out = [];
  for (const t of tables) {
    const info = await tableInfo(env.CONFIG_DB, t);
    const count = await safeQueryAll(env.CONFIG_DB, `SELECT COUNT(*) AS c FROM ${t}`);
    out.push({ ...info, row_count: count });
  }
  const activeProfile = await safeQueryAll(env.CONFIG_DB, "SELECT profile_id, display_name, active, profile_status FROM config_metric_calibration_profiles WHERE metric_domain='hitter' ORDER BY active DESC, updated_at DESC LIMIT 5");
  const activeFormula = await safeQueryAll(env.CONFIG_DB, "SELECT formula_version, active, version_status FROM config_metric_formula_versions WHERE metric_domain='hitter' ORDER BY active DESC, updated_at DESC LIMIT 5");
  return { tables: out, active_profile: activeProfile, active_formula: activeFormula };
}

function metricReadiness(logCols, splitCols) {
  const log = new Set(logCols);
  const split = new Set(splitCols);
  const requiredAgg = ["pa", "ab", "hits", "singles", "doubles", "triples", "home_runs", "total_bases", "runs", "rbi", "walks", "strikeouts", "stolen_bases"];
  const aggregate = requiredAgg.map(k => ({ metric_key: k, family: "direct_aggregate", source_table: "hitter_game_logs", safely_derivable: log.has(k), missing_columns: log.has(k) ? [] : [k] }));
  const rates = [
    { metric_key: "pa_per_game", numerator: "pa", denominator: "games_count", needed: ["pa", "player_id", "game_pk"] },
    { metric_key: "hits_per_game", numerator: "hits", denominator: "games_count", needed: ["hits", "player_id", "game_pk"] },
    { metric_key: "total_bases_per_game", numerator: "total_bases", denominator: "games_count", needed: ["total_bases", "player_id", "game_pk"] },
    { metric_key: "k_rate", numerator: "strikeouts", denominator: "pa", needed: ["strikeouts", "pa"] },
    { metric_key: "bb_rate", numerator: "walks", denominator: "pa", needed: ["walks", "pa"] },
    { metric_key: "hr_rate", numerator: "home_runs", denominator: "pa", needed: ["home_runs", "pa"] },
    { metric_key: "tb_per_pa", numerator: "total_bases", denominator: "pa", needed: ["total_bases", "pa"] },
    { metric_key: "h_per_ab", numerator: "hits", denominator: "ab", needed: ["hits", "ab"] }
  ].map(r => ({ ...r, family: "rate", source_table: "hitter_game_logs", denominator_safe_required: true, safely_derivable: r.needed.every(c => log.has(c)), missing_columns: r.needed.filter(c => !log.has(c)) }));
  const splitMetrics = ["avg", "obp", "slg", "ops", "pa", "ab", "hits", "home_runs", "walks", "strikeouts"].map(k => ({ metric_key: `vs_left_vs_right_${k}`, family: "split_context", source_table: "hitter_splits", safely_derivable: split.has(k) && (split.has("split_key") || split.has("split_code")), missing_columns: [k, "split_key_or_split_code"].filter(c => c === "split_key_or_split_code" ? !(split.has("split_key") || split.has("split_code")) : !split.has(c)) }));
  const deferred = [
    "projections", "opponent_context", "lineup_context", "weather_park_adjustments", "market_edge_metrics", "final_scoring_weights", "confidence_ranking", "prop_recommendation_logic"
  ].map(metric_key => ({ metric_key, status: "deferred", reason: "Requires future scoring/context/market layers or formula lock outside v0.1.0 readiness audit." }));
  return { aggregate, rates, split_metrics: splitMetrics, deferred };
}

async function runAudit(env, input) {
  const runId = input.run_id || rid("run_hitter_metrics_audit");
  const batchId = input.batch_id || rid("hitter_metrics_audit_batch");
  const schema = await ensureSchema(env);
  const logInfo = await tableInfo(env.STATS_HITTER_DB, "hitter_game_logs");
  const splitInfo = await tableInfo(env.STATS_HITTER_DB, "hitter_splits");
  const metricsLegacyInfo = await tableInfo(env.STATS_HITTER_DB, "hitter_metrics");
  const stageInfo = await tableInfo(env.STATS_HITTER_DB, "hitter_metric_stage");
  const logAudit = logInfo.ok ? await auditHitterLogs(env, logInfo.columns) : { table: "hitter_game_logs", ok: false, error: logInfo.error };
  const splitAudit = splitInfo.ok ? await auditHitterSplits(env, splitInfo.columns) : { table: "hitter_splits", ok: false, error: splitInfo.error };
  const configAudit = await auditConfig(env);
  const readiness = metricReadiness(logInfo.columns || [], splitInfo.columns || []);
  const blockerCodes = [];
  if (!logInfo.ok || !logAudit.required_columns_present) blockerCodes.push("UPSTREAM_SCHEMA_UNSAFE_HITTER_GAME_LOGS");
  if (!splitInfo.ok || !splitAudit.required_columns_present) blockerCodes.push("UPSTREAM_SCHEMA_UNSAFE_HITTER_SPLITS");
  const logDup = Number((((logAudit.duplicates || {}).rows || [])[0] || {}).duplicate_keys || 0);
  const splitDup = Number((((splitAudit.duplicates || {}).rows || [])[0] || {}).duplicate_keys || 0);
  if (logDup > 0) blockerCodes.push("UPSTREAM_DUPLICATES_FOUND_HITTER_GAME_LOGS");
  if (splitDup > 0) blockerCodes.push("UPSTREAM_DUPLICATES_FOUND_HITTER_SPLITS");
  const logRows = Number((((logAudit.row_count || {}).rows || [])[0] || {}).c || 0);
  const splitRows = Number((((splitAudit.row_count || {}).rows || [])[0] || {}).c || 0);
  if (logRows <= 0) blockerCodes.push("UPSTREAM_INPUT_NOT_CERTIFIED_HITTER_GAME_LOGS_EMPTY");
  if (splitRows <= 0) blockerCodes.push("UPSTREAM_INPUT_NOT_CERTIFIED_HITTER_SPLITS_EMPTY");

  const formulasReadyForV01 = blockerCodes.filter(c => c.includes("SCHEMA") || c.includes("EMPTY")).length === 0;
  const v02Safe = blockerCodes.length === 0 ? "PENDING_FORMULA_AND_CALIBRATION_LOCK_AFTER_MANUAL_SAMPLE_REVIEW" : "NO_BLOCKERS_PRESENT_IN_AUDIT_OUTPUT_MUST_BE_RESOLVED";
  const output = {
    ok: true,
    data_ok: blockerCodes.length === 0,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    request_id: input.request_id || null,
    chain_id: input.chain_id || null,
    run_id: runId,
    batch_id: batchId,
    status: "COMPLETED_SCHEMA_FORMULA_INPUT_CONFIG_AUDIT_NO_PROMOTION",
    certification: blockerCodes.length === 0 ? "BASE_HITTER_METRICS_V0_1_0_AUDIT_COMPLETED_INPUTS_LOOK_READY_NOT_FORMULA_LOCKED" : "BASE_HITTER_METRICS_V0_1_0_AUDIT_COMPLETED_WITH_BLOCKERS",
    mode: input.mode || "schema_formula_input_audit",
    rows_read: logRows + splitRows,
    rows_written: schema.seed_ok + 2,
    external_calls_performed: 0,
    writes_performed: {
      schema_and_config_only: true,
      metric_live_promotion_rows: 0,
      source_table_mutations: 0,
      board_scoring_final_rows: 0
    },
    hard_blocks_enforced: {
      no_live_metric_promotion: true,
      no_hitter_game_log_mutation: true,
      no_hitter_split_mutation: true,
      no_pitcher_team_starter_bullpen_mutation: true,
      no_market_board_mutation: true,
      no_scoring_ranking_final_board: true,
      no_external_mlb_calls: true
    },
    schema_creation: schema,
    live_schema: {
      hitter_game_logs: logInfo,
      hitter_splits: splitInfo,
      legacy_hitter_metrics: metricsLegacyInfo,
      hitter_metric_stage: stageInfo
    },
    input_readiness: {
      hitter_game_logs: logAudit,
      hitter_splits: splitAudit,
      blockers: blockerCodes
    },
    config_readiness: configAudit,
    formula_readiness: {
      formulas_locked_for_production_promotion: false,
      ready_for_v0_1_0_readiness_only: formulasReadyForV01,
      metric_windows_from_config_required: true,
      thresholds_from_config_required: true,
      aggregate_metrics: readiness.aggregate,
      rate_metrics: readiness.rates,
      split_metrics: readiness.split_metrics,
      deferred_metrics: readiness.deferred
    },
    v0_2_0_base_rebuild_safety: v02Safe,
    gemini_calibration_research_needed_before_formula_lock: true,
    next_action: blockerCodes.length ? "RESOLVE_BLOCKERS_BEFORE_FORMULA_LOCK_OR_BASE_REBUILD" : "RUN_MANUAL_SAMPLE_CALIBRATION_AND_GEMINI_THRESHOLD_RESEARCH_BEFORE_V0_2_0_FORMULA_LOCK",
    timestamp_utc: nowUtc()
  };

  try {
    await execSql(env.STATS_HITTER_DB,
      "INSERT OR REPLACE INTO hitter_metric_batches (batch_id, run_id, worker_name, worker_version, mode, status, data_feed_key, source_key, source_season, input_log_row_count, input_split_row_count, input_latest_game_date, input_latest_split_snapshot_date, expected_hitter_universe_count, config_profile_id, formula_version, metric_catalog_json, formula_readiness_json, config_readiness_json, input_readiness_json, rows_staged, rows_promoted, duplicate_count, certification_status, certification_grade, certification_json, finished_at, updated_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)",
      [batchId, runId, WORKER_NAME, VERSION, input.mode || "schema_formula_input_audit", output.status, "d1_derived_hitter_metrics_readiness_v0_1_0", "d1_hitter_game_logs_hitter_splits", Number(input.source_season || 2026), logRows, splitRows, (((logAudit.date_range || {}).rows || [])[0] || {}).max_game_date || null, (((splitAudit.snapshot_dates || {}).rows || [])[0] || {}).max_snapshot_date || null, Number((((logAudit.player_count || {}).rows || [])[0] || {}).distinct_players || 0), "hitter_metrics_neutral_v0_1_0", "hitter_metrics_formula_v0_1_0_readiness", JSON.stringify(readiness), JSON.stringify(output.formula_readiness), JSON.stringify(configAudit), JSON.stringify(output.input_readiness), logDup + splitDup, output.certification, blockerCodes.length ? "BLOCKED" : "AUDIT_PASS_NOT_FORMULA_LOCKED", JSON.stringify({ blockerCodes, no_promotion: true }), "v0.1.0 audit row only. No metric promotion performed."]
    );
    await execSql(env.STATS_HITTER_DB,
      "INSERT OR REPLACE INTO hitter_metric_certifications (certification_id, batch_id, run_id, mode, certification_status, certification_grade, checks_json, rows_staged, rows_promoted, duplicate_count, formula_error_count, denominator_error_count, config_profile_id, formula_version) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 0, 0, ?, ?)",
      [rid("hitter_metrics_cert"), batchId, runId, input.mode || "schema_formula_input_audit", output.certification, blockerCodes.length ? "BLOCKED" : "AUDIT_PASS_NOT_FORMULA_LOCKED", JSON.stringify({ blockerCodes, input_readiness: output.input_readiness, formula_readiness: output.formula_readiness, no_promotion: true }), logDup + splitDup, "hitter_metrics_neutral_v0_1_0", "hitter_metrics_formula_v0_1_0_readiness"]
    );
  } catch (err) {
    output.audit_persistence_warning = String(err && err.message ? err.message : err);
  }
  return output;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();

    if (method === "GET" && path === "/") return jsonResponse(baseIdentity(env));
    if (method === "GET" && path === "/health") return jsonResponse({ ...baseIdentity(env), route: "/health", checks: { db_bindings: bindingPresence(env, REQUIRED_DB_BINDINGS), vars: varPresence(env, EXPECTED_VARS), secrets_present_only: varPresence(env, REQUIRED_SECRETS) }, safe_secret_note: "Secret values are intentionally never printed." });
    if (method === "POST" && path === "/diagnostic") {
      const input = await readJsonSafe(request);
      return jsonResponse({ ...baseIdentity(env), route: "/diagnostic", input_echo_safe: { request_id: input.request_id || null, chain_id: input.chain_id || null, job_key: input.job_key || null, mode: input.mode || null }, diagnostics: { db_bindings: bindingPresence(env, REQUIRED_DB_BINDINGS), vars: varPresence(env, EXPECTED_VARS), secrets_present_only: varPresence(env, REQUIRED_SECRETS) }, writes_performed: 0, external_calls_performed: 0 });
    }
    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      const output = await runAudit(env, input || {});
      return jsonResponse(output);
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
