const WORKER_NAME = "alphadog-v2-base-hitter-metrics";
const VERSION = "alphadog-v2-base-hitter-metrics-v0.3.3-snapshot-schema-runtime-fix";
const JOB_KEY = "base-hitter-metrics";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_HITTER_DB"];
const REQUIRED_SECRETS = ["ALPHADOG_ADMIN_TOKEN", "ALPHADOG_INTERNAL_TOKEN"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_VERSION", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON", "MAX_TICK_MS", "MAX_ROWS_PER_TICK", "LOCK_STALE_MINUTES"];

const V03_PROFILE_ID = "hitter_metrics_neutral_v0_3_0_stage_only";
const V03_FORMULA_VERSION = "hitter_metrics_formula_v0_3_0_stage_only";
const V03_DATA_FEED_KEY = "derived_hitter_metrics_v0_3_1_base_stage_performance_tune";
const V032_SNAPSHOT_DATA_FEED_KEY = "derived_hitter_metric_snapshot_prep_v0_3_3";
const V03_CHUNK_SIZE = 50;
const V03_STAGE_BATCH_WRITE_SIZE = 250;
const V032_SNAPSHOT_BATCH_WRITE_SIZE = 250;

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
  `CREATE TABLE IF NOT EXISTS hitter_metric_snapshot_batches (
    snapshot_batch_id TEXT PRIMARY KEY,
    source_metric_batch_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    worker_name TEXT NOT NULL,
    worker_version TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    data_feed_key TEXT NOT NULL,
    source_season INTEGER,
    source_stage_rows INTEGER DEFAULT 0,
    source_stage_players INTEGER DEFAULT 0,
    snapshot_rows INTEGER DEFAULT 0,
    rows_promoted INTEGER DEFAULT 0,
    duplicate_count INTEGER DEFAULT 0,
    config_profile_id TEXT,
    formula_version TEXT,
    certification_status TEXT,
    certification_grade TEXT,
    certification_json TEXT,
    started_at TEXT DEFAULT CURRENT_TIMESTAMP,
    finished_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS hitter_metric_snapshot_stage (
    snapshot_id TEXT PRIMARY KEY,
    snapshot_batch_id TEXT NOT NULL,
    source_metric_batch_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    player_id INTEGER NOT NULL,
    season INTEGER NOT NULL,
    metric_window TEXT NOT NULL,
    config_profile_id TEXT NOT NULL,
    formula_version TEXT NOT NULL,
    games_count REAL,
    pa_sum REAL,
    ab_sum REAL,
    hits_sum REAL,
    singles_sum REAL,
    doubles_sum REAL,
    triples_sum REAL,
    home_runs_sum REAL,
    walks_sum REAL,
    strikeouts_sum REAL,
    runs_sum REAL,
    rbi_sum REAL,
    stolen_bases_sum REAL,
    total_bases_derived_sum REAL,
    batting_average REAL,
    slugging_percentage REAL,
    strikeout_rate REAL,
    walk_rate REAL,
    hr_rate REAL,
    tb_per_pa REAL,
    h_per_ab REAL,
    sample_size_label TEXT,
    vs_left_json TEXT,
    vs_right_json TEXT,
    metrics_json TEXT,
    audit_json TEXT,
    metadata_json TEXT,
    review_flags_json TEXT,
    lineage_json TEXT,
    row_status TEXT DEFAULT 'snapshot_stage_staged',
    certification_status TEXT DEFAULT 'snapshot_stage_not_promoted',
    certification_grade TEXT DEFAULT 'SNAPSHOT_STAGE',
    promoted_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(snapshot_batch_id, player_id, season, metric_window, config_profile_id, formula_version)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_hitter_metric_snapshot_batches_status ON hitter_metric_snapshot_batches(status, mode, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_hitter_metric_snapshot_stage_batch ON hitter_metric_snapshot_stage(snapshot_batch_id, row_status)`,
  `CREATE INDEX IF NOT EXISTS idx_hitter_metric_snapshot_stage_lookup ON hitter_metric_snapshot_stage(player_id, season, metric_window, config_profile_id, formula_version)`,
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
  { sql: "INSERT OR IGNORE INTO config_metric_calibration_profiles (profile_id, display_name, sport, metric_domain, active, profile_status, profile_json, notes) VALUES (?, ?, 'MLB', 'hitter', 1, 'draft', ?, ?)", binds: ["hitter_metrics_neutral_v0_3_0_stage_only", "Hitter Metrics Neutral v0.1.0 Draft", JSON.stringify({ no_scoring: true, promotion_locked: false, tuning_owner: "CONFIG_DB" }), "Neutral metric readiness/calibration profile. Draft only; no prop scoring weights."] },
  { sql: "INSERT OR IGNORE INTO config_metric_formula_versions (formula_version, sport, metric_domain, active, version_status, formula_catalog_json, notes) VALUES (?, 'MLB', 'hitter', 1, 'readiness_only', ?, ?)", binds: ["hitter_metrics_formula_v0_3_0_stage_only", JSON.stringify({ direct_aggregates: true, rates_denominator_safe: true, split_readiness_only: true, production_promotion_locked: false }), "Formula catalog shell for v0.1.0 readiness only. Not production promotion locked."] },
  ...[3,5,10,20].map((n, i) => ({ sql: "INSERT OR IGNORE INTO config_metric_windows (window_key, metric_domain, metric_scope, window_type, window_size, enabled, sort_order, config_profile_id, notes) VALUES (?, 'hitter', ?, 'last_n_games', ?, 1, ?, 'hitter_metrics_neutral_v0_3_0_stage_only', ?)", binds: [`last_${n}_games`, `last_${n}_games`, n, (i+1)*10, `Rolling last ${n} games window for neutral hitter metrics.`] })),
  { sql: "INSERT OR IGNORE INTO config_metric_windows (window_key, metric_domain, metric_scope, window_type, window_size, enabled, sort_order, config_profile_id, notes) VALUES ('season_to_date', 'hitter', 'season_to_date', 'season_to_date', NULL, 1, 90, 'hitter_metrics_neutral_v0_3_0_stage_only', 'Season-to-date neutral hitter metric window.')", binds: [] },
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
  ].map(([key,type,value,label]) => ({ sql: "INSERT OR IGNORE INTO config_metric_thresholds (threshold_key, config_profile_id, metric_domain, threshold_type, threshold_value, label, enabled, notes) VALUES (?, 'hitter_metrics_neutral_v0_3_0_stage_only', 'hitter', ?, ?, ?, 1, 'Draft neutral metric threshold. DB-configurable; not a prop scoring penalty or bonus.')", binds: [key, type, value, label] })),
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
  ].map(([key,fam,source,display]) => ({ sql: "INSERT OR IGNORE INTO config_metric_definitions (metric_key, metric_family, metric_scope, display_name, description, source_table, formula_version, enabled, neutral_metric_only, future_scoring_bridge_flag, config_json) VALUES (?, ?, 'readiness_catalog', ?, ?, ?, 'hitter_metrics_formula_v0_3_0_stage_only', 1, 1, 1, ?)", binds: [key, fam, display, display + ". Readiness only in v0.1.0.", source, JSON.stringify({ readiness_only: true, no_promotion_v0_1_0: true })] }))
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
    status: "SNAPSHOT_PREP_READY",
    timestamp_utc: nowUtc(),
    phase: "incremental_base_derived_metrics_snapshot_prep_stage_only",
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
    if (typeof sql !== "string" || !sql.trim()) { results.push({ target: "STATS_HITTER_DB", ok: false, action: "schema_statement_invalid", sql_type: typeof sql }); continue; }
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


async function ensureV03ConfigLineage(env) {
  const notes = [];
  // Preserve v0.1.0 rows as historical lineage; deactivate only active flags so v0.3.0 is the selected stage-only lineage.
  try { await execSql(env.CONFIG_DB, "UPDATE config_metric_calibration_profiles SET active=0, updated_at=CURRENT_TIMESTAMP WHERE metric_domain='hitter' AND profile_id<>?", [V03_PROFILE_ID]); notes.push({ action: "deactivate_old_profiles", ok: true }); } catch (err) { notes.push({ action: "deactivate_old_profiles", ok: false, error: String(err && err.message ? err.message : err) }); }
  try { await execSql(env.CONFIG_DB, "UPDATE config_metric_formula_versions SET active=0, updated_at=CURRENT_TIMESTAMP WHERE metric_domain='hitter' AND formula_version<>?", [V03_FORMULA_VERSION]); notes.push({ action: "deactivate_old_formulas", ok: true }); } catch (err) { notes.push({ action: "deactivate_old_formulas", ok: false, error: String(err && err.message ? err.message : err) }); }
  try {
    await execSql(env.CONFIG_DB,
      "INSERT OR REPLACE INTO config_metric_calibration_profiles (profile_id, display_name, sport, metric_domain, active, profile_status, profile_json, notes, updated_at) VALUES (?, ?, 'MLB', 'hitter', 1, 'base_rebuild_stage_locked', ?, ?, CURRENT_TIMESTAMP)",
      [V03_PROFILE_ID, "Hitter Metrics Neutral v0.3.0 Stage Only", JSON.stringify({ no_scoring: true, promotion_locked: true, stage_only: true, tuning_owner: "CONFIG_DB", source_profile_id: "hitter_metrics_neutral_v0_1_0" }), "v0.3.3 snapshot-prep uses locked v0.3.0 stage-only neutral profile. Historical v0.1.0 profile preserved, not deleted."]
    );
    notes.push({ action: "upsert_v03_profile", ok: true });
  } catch (err) { notes.push({ action: "upsert_v03_profile", ok: false, error: String(err && err.message ? err.message : err) }); }
  try {
    await execSql(env.CONFIG_DB,
      "INSERT OR REPLACE INTO config_metric_formula_versions (formula_version, sport, metric_domain, active, version_status, formula_catalog_json, notes, updated_at) VALUES (?, 'MLB', 'hitter', 1, 'base_rebuild_stage_locked', ?, ?, CURRENT_TIMESTAMP)",
      [V03_FORMULA_VERSION, JSON.stringify({ direct_aggregates: true, rates_denominator_safe: true, split_source_pass_through: true, raw_ob_rate_removed: true, h_bb_per_pa_proxy_enabled: true, total_bases_derived_sum_enabled: true, production_promotion_locked: true }), "v0.3.3 snapshot-prep uses locked v0.3.0 stage-only formula version. No live promotion, scoring, ranking, or final board."]
    );
    notes.push({ action: "upsert_v03_formula", ok: true });
  } catch (err) { notes.push({ action: "upsert_v03_formula", ok: false, error: String(err && err.message ? err.message : err) }); }
  const thresholdRows = [
    ["v0_3_0_min_games_sample_none", "sample_size", 0, "sample_none"],
    ["v0_3_0_min_games_sample_tiny", "sample_size", 1, "sample_tiny"],
    ["v0_3_0_min_games_sample_thin", "sample_size", 3, "sample_thin"],
    ["v0_3_0_min_games_sample_usable", "sample_size", 5, "sample_usable"],
    ["v0_3_0_min_games_sample_strong", "sample_size", 10, "sample_strong"],
    ["v0_3_0_denominator_floor_pa", "denominator_floor", 1, "pa_floor"],
    ["v0_3_0_denominator_floor_ab", "denominator_floor", 1, "ab_floor"],
    ["v0_3_0_split_pa_sample_tiny", "split_sample_size", 10, "split_tiny"],
    ["v0_3_0_split_pa_sample_usable", "split_sample_size", 25, "split_usable"],
    ["v0_3_0_split_pa_sample_strong", "split_sample_size", 50, "split_strong"],
    ["v0_3_0_stale_input_days_warn", "stale_input_rule", 2, "stale_warn"]
  ];
  let thresholdOk = 0;
  for (const [key, type, value, label] of thresholdRows) {
    try {
      await execSql(env.CONFIG_DB,
        "INSERT OR REPLACE INTO config_metric_thresholds (threshold_key, config_profile_id, metric_domain, threshold_type, threshold_value, label, enabled, notes, updated_at) VALUES (?, ?, 'hitter', ?, ?, ?, 1, 'v0.3.0 stage-only copy of approved v0.1.0 threshold. DB-configurable; not scoring.', CURRENT_TIMESTAMP)",
        [key, V03_PROFILE_ID, type, value, label]
      );
      thresholdOk++;
    } catch (err) { notes.push({ action: "upsert_v03_threshold", key, ok: false, error: String(err && err.message ? err.message : err) }); }
  }
  notes.push({ action: "upsert_v03_thresholds", ok: thresholdOk === thresholdRows.length, count: thresholdOk });
  return { ok: notes.every(n => n.ok !== false), notes };
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


function thresholdNumber(thresholds, key, fallback = null) {
  const rows = thresholds || [];
  const row = rows.find(t => String(t.threshold_key || "") === key) || rows.find(t => String(t.threshold_key || "").endsWith("_" + key));
  if (!row || row.threshold_value === null || row.threshold_value === undefined) return fallback;
  const n = Number(row.threshold_value);
  return Number.isFinite(n) ? n : fallback;
}

function sampleLabelFromGames(gamesCount, thresholds) {
  const strong = thresholdNumber(thresholds, "min_games_sample_strong", null);
  const usable = thresholdNumber(thresholds, "min_games_sample_usable", null);
  const thin = thresholdNumber(thresholds, "min_games_sample_thin", null);
  const tiny = thresholdNumber(thresholds, "min_games_sample_tiny", null);
  if (strong !== null && gamesCount >= strong) return "sample_strong";
  if (usable !== null && gamesCount >= usable) return "sample_usable";
  if (thin !== null && gamesCount >= thin) return "sample_thin";
  if (tiny !== null && gamesCount >= tiny) return "sample_tiny";
  return "sample_none";
}

function splitLabelFromPa(pa, thresholds) {
  const strong = thresholdNumber(thresholds, "split_pa_sample_strong", null);
  const usable = thresholdNumber(thresholds, "split_pa_sample_usable", null);
  const tiny = thresholdNumber(thresholds, "split_pa_sample_tiny", null);
  if (strong !== null && pa >= strong) return "split_strong";
  if (usable !== null && pa >= usable) return "split_usable";
  if (tiny !== null && pa >= tiny) return "split_tiny";
  return "split_none";
}

function num(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

function safeDivide(numerator, denominator) {
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return null;
  const out = n / d;
  return Number.isFinite(out) ? out : null;
}

function windowRowsFor(logRows, window) {
  if (!window || String(window.window_type) === "season_to_date" || String(window.window_key) === "season_to_date") return logRows.slice();
  const size = Number(window.window_size || 0);
  if (!Number.isFinite(size) || size <= 0) return logRows.slice();
  return logRows.slice(Math.max(0, logRows.length - size));
}

function sumWindow(rows) {
  const sums = {
    games_count: new Set(), pa_sum: 0, ab_sum: 0, hits_sum: 0, singles_sum: 0, doubles_sum: 0,
    triples_sum: 0, home_runs_sum: 0, walks_sum: 0, strikeouts_sum: 0, runs_sum: 0, rbi_sum: 0,
    stolen_bases_sum: 0, total_bases_source_sum: 0, total_bases_derived_sum: 0
  };
  for (const r of rows) {
    if (r.game_pk !== null && r.game_pk !== undefined) sums.games_count.add(String(r.game_pk));
    sums.pa_sum += num(r.pa); sums.ab_sum += num(r.ab); sums.hits_sum += num(r.hits);
    sums.singles_sum += num(r.singles); sums.doubles_sum += num(r.doubles); sums.triples_sum += num(r.triples);
    sums.home_runs_sum += num(r.home_runs); sums.walks_sum += num(r.walks); sums.strikeouts_sum += num(r.strikeouts);
    sums.runs_sum += num(r.runs); sums.rbi_sum += num(r.rbi); sums.stolen_bases_sum += num(r.stolen_bases);
    sums.total_bases_source_sum += num(r.total_bases);
    sums.total_bases_derived_sum += num(r.singles) + (2 * num(r.doubles)) + (3 * num(r.triples)) + (4 * num(r.home_runs));
  }
  sums.games_count = sums.games_count.size;
  return sums;
}

function metricRowsForWindow(playerId, season, windowKey, rows, logTotalRows, splitRows, latestGameDate, formulaVersion, configProfileId, batchId, runId, sourceStartDate, sourceEndDate, thresholds) {
  const s = sumWindow(rows);
  const rel = sampleLabelFromGames(s.games_count, thresholds);
  const tbMismatch = Math.abs(s.total_bases_source_sum - s.total_bases_derived_sum) > 0.000001;
  const baseMeta = {
    batch_id: batchId, run_id: runId, player_id: playerId, season, metric_scope: "base_stage", metric_window: windowKey,
    source_start_date: sourceStartDate, source_end_date: sourceEndDate, source_snapshot_date: null,
    input_log_row_count: rows.length, input_split_row_count: splitRows.length, input_latest_game_date: latestGameDate,
    data_feed_key: "derived_hitter_metrics_v0_3_1_base_stage_performance_tune", source_key: "d1_hitter_game_logs", ingestion_mode: "base_rebuild_stage_only",
    certification_status: "base_stage_not_promoted", certification_grade: "BASE_STAGE", certified_at: null, promoted_at: null,
    formula_version: formulaVersion, config_profile_id: configProfileId, reliability_label: rel
  };
  const rawSummary = { games_count: s.games_count, available_log_rows: rows.length, window_key: windowKey, tb_source_sum: s.total_bases_source_sum, tb_derived_sum: s.total_bases_derived_sum, tb_mismatch: tbMismatch };
  const out = [];
  function add(metric_key, family, value, numerator = null, denominator = null, extra = {}) {
    const missing = extra.missing_data_reason || (rows.length === 0 ? "NO_LOG_ROWS_IN_WINDOW" : (tbMismatch && metric_key.includes("total_bases") ? "TOTAL_BASES_SOURCE_DERIVED_MISMATCH" : null));
    out.push({ ...baseMeta, metric_key, metric_family: family, metric_value: value, metric_text_value: extra.metric_text_value || null, numerator, denominator, raw_input_summary_json: JSON.stringify(rawSummary), metric_json: JSON.stringify({ ...extra, base_rebuild_stage_only: true, no_promotion: true }), missing_data_reason: missing, row_status: extra.row_status || (missing ? "review_flag" : "base_stage_staged"), row_error: null });
  }
  add("games_count", "sample_size", s.games_count, s.games_count, null);
  for (const key of ["pa_sum","ab_sum","hits_sum","singles_sum","doubles_sum","triples_sum","home_runs_sum","walks_sum","strikeouts_sum","runs_sum","rbi_sum","stolen_bases_sum","total_bases_source_sum","total_bases_derived_sum"]) add(key, "direct_aggregate", s[key], s[key], null);
  add("batting_average", "rate", safeDivide(s.hits_sum, s.ab_sum), s.hits_sum, s.ab_sum, s.ab_sum <= 0 ? { missing_data_reason: "DENOMINATOR_ZERO_AB", row_status: "review_flag" } : {});
  add("slugging_percentage", "rate", safeDivide(s.total_bases_derived_sum, s.ab_sum), s.total_bases_derived_sum, s.ab_sum, s.ab_sum <= 0 ? { missing_data_reason: "DENOMINATOR_ZERO_AB", row_status: "review_flag" } : {});
  add("strikeout_rate", "rate", safeDivide(s.strikeouts_sum, s.pa_sum), s.strikeouts_sum, s.pa_sum, s.pa_sum <= 0 ? { missing_data_reason: "DENOMINATOR_ZERO_PA", row_status: "review_flag" } : {});
  add("walk_rate", "rate", safeDivide(s.walks_sum, s.pa_sum), s.walks_sum, s.pa_sum, s.pa_sum <= 0 ? { missing_data_reason: "DENOMINATOR_ZERO_PA", row_status: "review_flag" } : {});
  add("hr_rate", "rate", safeDivide(s.home_runs_sum, s.pa_sum), s.home_runs_sum, s.pa_sum, s.pa_sum <= 0 ? { missing_data_reason: "DENOMINATOR_ZERO_PA", row_status: "review_flag" } : {});
  add("tb_per_pa", "rate", safeDivide(s.total_bases_derived_sum, s.pa_sum), s.total_bases_derived_sum, s.pa_sum, s.pa_sum <= 0 ? { missing_data_reason: "DENOMINATOR_ZERO_PA", row_status: "review_flag" } : {});
  add("h_per_ab", "rate", safeDivide(s.hits_sum, s.ab_sum), s.hits_sum, s.ab_sum, s.ab_sum <= 0 ? { missing_data_reason: "DENOMINATOR_ZERO_AB", row_status: "review_flag" } : {});
  add("h_bb_per_pa_proxy", "rate_proxy", safeDivide(s.hits_sum + s.walks_sum, s.pa_sum), s.hits_sum + s.walks_sum, s.pa_sum, { proxy_only: true, not_true_obp: true, missing_data_reason: s.pa_sum <= 0 ? "DENOMINATOR_ZERO_PA" : "H_BB_PER_PA_PROXY_NOT_TRUE_OBP", row_status: "review_flag" });
  add("sample_size_label", "sample_label", null, s.games_count, null, { metric_text_value: rel, row_status: "base_stage_staged" });
  return out;
}

function splitMetricRows(playerId, season, splitRows, logRows, latestGameDate, formulaVersion, configProfileId, batchId, runId, thresholds) {
  const out = [];
  const have = new Set(splitRows.map(r => String(r.split_code || r.split_key || "")));
  const missingSides = ["vs_left", "vs_right"].filter(s => !have.has(s));
  for (const split of splitRows.filter(r => ["vs_left", "vs_right"].includes(String(r.split_code || r.split_key)))) {
    const splitKey = String(split.split_code || split.split_key);
    const label = splitLabelFromPa(num(split.pa), thresholds);
    const baseMeta = {
      batch_id: batchId, run_id: runId, player_id: playerId, season, metric_scope: "base_stage", metric_window: splitKey,
      source_start_date: null, source_end_date: null, source_snapshot_date: split.source_snapshot_date || null,
      input_log_row_count: logRows.length, input_split_row_count: splitRows.length, input_latest_game_date: latestGameDate,
      data_feed_key: "derived_hitter_metrics_v0_3_1_base_stage_performance_tune", source_key: "d1_hitter_splits_source_provided", ingestion_mode: "base_rebuild_stage_only",
      certification_status: "base_stage_not_promoted", certification_grade: "BASE_STAGE", certified_at: null, promoted_at: null,
      formula_version: formulaVersion, config_profile_id: configProfileId, reliability_label: label
    };
    function add(metric_key, family, value, numerator = null, denominator = null, text = null) {
      out.push({ ...baseMeta, metric_key: `${splitKey}_${metric_key}`, metric_family: family, metric_value: value, metric_text_value: text, numerator, denominator, raw_input_summary_json: JSON.stringify({ split_key: splitKey, split_pa: num(split.pa), missing_sides: missingSides }), metric_json: JSON.stringify({ source_pass_through: true, base_rebuild_stage_only: true, no_promotion: true }), missing_data_reason: missingSides.length ? `MISSING_SPLIT_SIDE_${missingSides.join("_")}` : null, row_status: missingSides.length ? "review_flag" : "base_stage_staged", row_error: null });
    }
    add("split_pa", "split_context", num(split.pa), num(split.pa), null);
    add("split_ab", "split_context", num(split.ab), num(split.ab), null);
    add("split_hits", "split_context", num(split.hits), num(split.hits), null);
    add("split_home_runs", "split_context", num(split.home_runs), num(split.home_runs), null);
    add("split_walks", "split_context", num(split.walks), num(split.walks), null);
    add("split_strikeouts", "split_context", num(split.strikeouts), num(split.strikeouts), null);
    add("split_avg", "split_context_source_rate", split.avg === null || split.avg === undefined ? null : Number(split.avg), null, null);
    add("split_obp", "split_context_source_rate", split.obp === null || split.obp === undefined ? null : Number(split.obp), null, null);
    add("split_slg", "split_context_source_rate", split.slg === null || split.slg === undefined ? null : Number(split.slg), null, null);
    add("split_ops", "split_context_source_rate", split.ops === null || split.ops === undefined ? null : Number(split.ops), null, null);
    add("split_babip", "split_context_source_rate", split.babip === null || split.babip === undefined ? null : Number(split.babip), null, null);
    add("split_sample_label", "sample_label", null, num(split.pa), null, label);
  }
  if (!splitRows.length) {
    out.push({ batch_id: batchId, run_id: runId, metric_key: "missing_split_rows", player_id: playerId, season, metric_scope: "base_stage", metric_window: "split_context", metric_family: "missing_data_review", source_start_date: null, source_end_date: null, source_snapshot_date: null, input_log_row_count: logRows.length, input_split_row_count: 0, input_latest_game_date: latestGameDate, metric_value: null, metric_text_value: "missing_splits", numerator: null, denominator: null, data_feed_key: "derived_hitter_metrics_v0_3_1_base_stage_performance_tune", source_key: "d1_hitter_splits_source_provided", ingestion_mode: "base_rebuild_stage_only", certification_status: "base_stage_not_promoted", certification_grade: "BASE_STAGE", certified_at: null, promoted_at: null, formula_version: formulaVersion, config_profile_id: configProfileId, raw_input_summary_json: JSON.stringify({ missing_splits: true }), metric_json: JSON.stringify({ review_flag: true, no_promotion: true }), missing_data_reason: "PLAYER_HAS_LOGS_NO_SPLIT_ROWS", reliability_label: "split_none", row_status: "review_flag", row_error: null, created_at: null, updated_at: null });
  }
  return out;
}

async function loadMetricConfig(env, desiredProfileId = null, desiredFormulaVersion = null) {
  const profile = desiredProfileId
    ? await queryFirst(env.CONFIG_DB, "SELECT profile_id, profile_status, profile_json FROM config_metric_calibration_profiles WHERE metric_domain='hitter' AND profile_id=? LIMIT 1", [desiredProfileId])
    : await queryFirst(env.CONFIG_DB, "SELECT profile_id, profile_status, profile_json FROM config_metric_calibration_profiles WHERE metric_domain='hitter' AND active=1 LIMIT 1");
  const formula = desiredFormulaVersion
    ? await queryFirst(env.CONFIG_DB, "SELECT formula_version, version_status, formula_catalog_json FROM config_metric_formula_versions WHERE metric_domain='hitter' AND formula_version=? LIMIT 1", [desiredFormulaVersion])
    : await queryFirst(env.CONFIG_DB, "SELECT formula_version, version_status, formula_catalog_json FROM config_metric_formula_versions WHERE metric_domain='hitter' AND active=1 LIMIT 1");
  const windows = await queryAll(env.CONFIG_DB, "SELECT window_key, metric_scope, window_type, window_size, sort_order FROM config_metric_windows WHERE metric_domain='hitter' AND enabled=1 ORDER BY sort_order ASC");
  const definitions = await queryAll(env.CONFIG_DB, "SELECT metric_key, metric_family, metric_scope, source_table, numerator_field, denominator_field, enabled, neutral_metric_only FROM config_metric_definitions WHERE enabled=1 AND neutral_metric_only=1");
  const thresholds = profile ? await queryAll(env.CONFIG_DB, "SELECT threshold_key, config_profile_id, metric_family, metric_key, threshold_type, threshold_value, threshold_json, label, enabled FROM config_metric_thresholds WHERE enabled=1 AND config_profile_id=?", [profile.profile_id]) : [];
  const blockers = [];
  if (!profile) blockers.push("CONFIG_PROFILE_UNAVAILABLE");
  if (!formula) blockers.push("FORMULA_VERSION_UNAVAILABLE");
  if (!windows.length) blockers.push("METRIC_WINDOWS_UNAVAILABLE");
  if (!thresholds.length) blockers.push("THRESHOLDS_UNAVAILABLE");
  return { profile, formula, windows, definitions, thresholds, blockers };
}

async function selectSamplePlayers(env, limit = 30) {
  const queries = [
    ["high_volume", "SELECT player_id FROM hitter_game_logs GROUP BY player_id ORDER BY SUM(COALESCE(pa,0)) DESC, player_id ASC LIMIT 5"],
    ["low_volume", "SELECT player_id FROM hitter_game_logs GROUP BY player_id HAVING SUM(COALESCE(pa,0)) > 0 ORDER BY SUM(COALESCE(pa,0)) ASC, player_id ASC LIMIT 5"],
    ["few_games", "SELECT player_id FROM hitter_game_logs GROUP BY player_id HAVING COUNT(DISTINCT game_pk) < 20 ORDER BY COUNT(DISTINCT game_pk) ASC, SUM(COALESCE(pa,0)) ASC, player_id ASC LIMIT 5"],
    ["split_complete", "SELECT l.player_id FROM hitter_game_logs l JOIN hitter_splits s ON s.player_id=l.player_id GROUP BY l.player_id HAVING COUNT(DISTINCT CASE WHEN s.split_code IN ('vs_left','vs_right') THEN s.split_code END)=2 ORDER BY l.player_id ASC LIMIT 5"],
    ["split_missing", "SELECT l.player_id FROM hitter_game_logs l LEFT JOIN hitter_splits s ON s.player_id=l.player_id AND s.split_code IN ('vs_left','vs_right') GROUP BY l.player_id HAVING COUNT(DISTINCT s.split_code)<2 ORDER BY SUM(COALESCE(l.pa,0)) DESC, l.player_id ASC LIMIT 5"],
    ["power", "SELECT player_id FROM hitter_game_logs GROUP BY player_id ORDER BY SUM(COALESCE(home_runs,0)) DESC, SUM(COALESCE(total_bases,0)) DESC, player_id ASC LIMIT 5"],
    ["contact", "SELECT player_id FROM hitter_game_logs GROUP BY player_id HAVING SUM(COALESCE(ab,0)) > 0 ORDER BY (1.0*SUM(COALESCE(hits,0))/SUM(COALESCE(ab,0))) DESC, SUM(COALESCE(ab,0)) DESC, player_id ASC LIMIT 5"],
    ["high_k", "SELECT player_id FROM hitter_game_logs GROUP BY player_id HAVING SUM(COALESCE(pa,0)) > 0 ORDER BY (1.0*SUM(COALESCE(strikeouts,0))/SUM(COALESCE(pa,0))) DESC, SUM(COALESCE(pa,0)) DESC, player_id ASC LIMIT 5"],
    ["speed", "SELECT player_id FROM hitter_game_logs GROUP BY player_id ORDER BY SUM(COALESCE(stolen_bases,0)) DESC, player_id ASC LIMIT 5"]
  ];
  const seen = new Set();
  const players = [];
  const groups = [];
  for (const [group, sql] of queries) {
    const rows = await queryAll(env.STATS_HITTER_DB, sql);
    for (const r of rows) {
      const id = Number(r.player_id);
      if (!seen.has(id) && players.length < limit) { seen.add(id); players.push(id); }
      groups.push({ group, player_id: id });
    }
  }
  return { players, groups };
}


async function selectAllEligiblePlayers(env, season) {
  const rows = await queryAll(env.STATS_HITTER_DB,
    "SELECT player_id, season, COUNT(*) AS log_rows, MIN(game_date) AS first_game_date, MAX(game_date) AS latest_game_date FROM hitter_game_logs WHERE season=? GROUP BY player_id, season HAVING COUNT(*) > 0 ORDER BY player_id ASC",
    [season]
  );
  return rows.map(r => Number(r.player_id)).filter(n => Number.isFinite(n));
}

const STAGE_INSERT_SQL = "INSERT OR REPLACE INTO hitter_metric_stage (stage_id, batch_id, run_id, metric_key, player_id, season, metric_scope, metric_window, metric_family, source_start_date, source_end_date, source_snapshot_date, input_log_row_count, input_split_row_count, input_latest_game_date, metric_value, metric_text_value, numerator, denominator, data_feed_key, source_key, ingestion_mode, certification_status, certification_grade, certified_at, promoted_at, formula_version, config_profile_id, raw_input_summary_json, metric_json, missing_data_reason, reliability_label, row_status, row_error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)";

function stageRowBinds(row) {
  return [rid("hitter_metric_stage"), row.batch_id, row.run_id, row.metric_key, row.player_id, row.season, row.metric_scope, row.metric_window, row.metric_family, row.source_start_date, row.source_end_date, row.source_snapshot_date, row.input_log_row_count, row.input_split_row_count, row.input_latest_game_date, row.metric_value, row.metric_text_value, row.numerator, row.denominator, row.data_feed_key, row.source_key, row.ingestion_mode, row.certification_status, row.certification_grade, row.certified_at, row.promoted_at, row.formula_version, row.config_profile_id, row.raw_input_summary_json, row.metric_json, row.missing_data_reason, row.reliability_label, row.row_status, row.row_error];
}

async function insertStageRow(env, row) {
  await execSql(env.STATS_HITTER_DB, STAGE_INSERT_SQL, stageRowBinds(row));
}

async function insertStageRowsBatch(env, rows, rowErrors) {
  if (!rows.length) return 0;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += V03_STAGE_BATCH_WRITE_SIZE) {
    const slice = rows.slice(i, i + V03_STAGE_BATCH_WRITE_SIZE);
    try {
      const statements = slice.map(row => env.STATS_HITTER_DB.prepare(STAGE_INSERT_SQL).bind(...stageRowBinds(row)));
      await env.STATS_HITTER_DB.batch(statements);
      inserted += slice.length;
    } catch (batchErr) {
      for (const row of slice) {
        try {
          await insertStageRow(env, row);
          inserted++;
        } catch (err) {
          rowErrors.push({ player_id: row.player_id, metric_key: row.metric_key, error: String((err && err.message) || err).slice(0, 300), batch_error: String((batchErr && batchErr.message) || batchErr).slice(0, 300) });
        }
      }
    }
  }
  return inserted;
}

function groupRowsByPlayer(rows) {
  const out = new Map();
  for (const row of rows || []) {
    const key = Number(row.player_id);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(row);
  }
  return out;
}

async function loadChunkSourceRows(env, playerIds, season) {
  if (!playerIds.length) return { logsByPlayer: new Map(), splitsByPlayer: new Map() };
  const marks = playerIds.map(() => "?").join(",");
  const logRows = await queryAll(env.STATS_HITTER_DB, `SELECT * FROM hitter_game_logs WHERE season=? AND player_id IN (${marks}) ORDER BY player_id ASC, date(game_date) ASC, game_pk ASC`, [season, ...playerIds]);
  const splitRows = await queryAll(env.STATS_HITTER_DB, `SELECT * FROM hitter_splits WHERE season=? AND split_code IN ('vs_left','vs_right') AND player_id IN (${marks}) ORDER BY player_id ASC, split_code ASC`, [season, ...playerIds]);
  return { logsByPlayer: groupRowsByPlayer(logRows), splitsByPlayer: groupRowsByPlayer(splitRows) };
}

async function runBaseRebuildStageOnly(env, input) {
  const runId = input.run_id || rid("run_hitter_metrics_base_stage");
  const requestId = input.request_id || input.chain_id || runId;
  const cursorKey = `base_hitter_metrics_v0_3_0_${requestId}`;
  const schema = await ensureSchema(env);
  const v03ConfigLineage = await ensureV03ConfigLineage(env);
  const logInfo = await tableInfo(env.STATS_HITTER_DB, "hitter_game_logs");
  const splitInfo = await tableInfo(env.STATS_HITTER_DB, "hitter_splits");
  const logAudit = logInfo.ok ? await auditHitterLogs(env, logInfo.columns) : { table: "hitter_game_logs", ok: false, error: logInfo.error };
  const splitAudit = splitInfo.ok ? await auditHitterSplits(env, splitInfo.columns) : { table: "hitter_splits", ok: false, error: splitInfo.error };
  const config = await loadMetricConfig(env, V03_PROFILE_ID, V03_FORMULA_VERSION);
  const blockerCodes = [...config.blockers];
  if (!v03ConfigLineage.ok) blockerCodes.push("V03_CONFIG_LINEAGE_UPSERT_FAILED");
  if (!logInfo.ok || !logAudit.required_columns_present) blockerCodes.push("UPSTREAM_SCHEMA_UNSAFE_HITTER_GAME_LOGS");
  if (!splitInfo.ok || !splitAudit.required_columns_present) blockerCodes.push("UPSTREAM_SCHEMA_UNSAFE_HITTER_SPLITS");
  const logDup = Number((((logAudit.duplicates || {}).rows || [])[0] || {}).duplicate_keys || 0);
  const splitDup = Number((((splitAudit.duplicates || {}).rows || [])[0] || {}).duplicate_keys || 0);
  if (logDup > 0) blockerCodes.push("UPSTREAM_DUPLICATES_FOUND_HITTER_GAME_LOGS");
  if (splitDup > 0) blockerCodes.push("UPSTREAM_DUPLICATES_FOUND_HITTER_SPLITS");
  const logRows = Number((((logAudit.row_count || {}).rows || [])[0] || {}).c || 0);
  const splitRowsCount = Number((((splitAudit.row_count || {}).rows || [])[0] || {}).c || 0);
  if (logRows <= 0) blockerCodes.push("UPSTREAM_INPUT_NOT_CERTIFIED_HITTER_GAME_LOGS_EMPTY");

  const season = Number(input.source_season || 2026);
  const cursor = await queryFirst(env.STATS_HITTER_DB, "SELECT * FROM hitter_metric_cursor WHERE cursor_key=?", [cursorKey]);
  const batchId = input.batch_id || (cursor && cursor.batch_id) || rid("hitter_metrics_base_stage_batch");
  const offset = cursor ? Number(cursor.current_player_offset || 0) : 0;
  const chunkSize = Math.max(1, Math.min(100, Number(input.chunk_size || V03_CHUNK_SIZE || 50)));
  const eligiblePlayers = blockerCodes.length ? [] : await selectAllEligiblePlayers(env, season);
  if (!blockerCodes.length && eligiblePlayers.length === 0) blockerCodes.push("ELIGIBLE_HITTER_UNIVERSE_EMPTY");
  const chunkPlayers = blockerCodes.length ? [] : eligiblePlayers.slice(offset, offset + chunkSize);

  const latestGameDate = (((logAudit.date_range || {}).rows || [])[0] || {}).max_game_date || null;
  const latestSplitSnapshot = (((splitAudit.snapshot_dates || {}).rows || [])[0] || {}).max_snapshot_date || null;
  const formulaVersion = V03_FORMULA_VERSION;
  const configProfileId = V03_PROFILE_ID;
  const rowErrors = [];
  let stagedRowsThisTick = 0;

  if (!blockerCodes.length && !cursor) {
    await execSql(env.STATS_HITTER_DB,
      "INSERT OR REPLACE INTO hitter_metric_cursor (cursor_key, batch_id, run_id, mode, status, source_season, current_player_offset, players_total, players_processed, cursor_json, updated_at) VALUES (?, ?, ?, 'base_rebuild_stage_only', 'RUNNING', ?, 0, ?, 0, ?, CURRENT_TIMESTAMP)",
      [cursorKey, batchId, runId, season, eligiblePlayers.length, JSON.stringify({ request_id: requestId, chunk_size: chunkSize, all_eligible_hitters: true })]
    );
  }

  if (!blockerCodes.length) {
    const { logsByPlayer, splitsByPlayer } = await loadChunkSourceRows(env, chunkPlayers, season);
    const stageRows = [];
    for (const playerId of chunkPlayers) {
      const logs = logsByPlayer.get(Number(playerId)) || [];
      const splits = splitsByPlayer.get(Number(playerId)) || [];
      const firstDate = logs.length ? logs[0].game_date : null;
      const lastDate = logs.length ? logs[logs.length - 1].game_date : null;
      for (const w of config.windows) {
        const wRows = windowRowsFor(logs, w);
        const startDate = wRows.length ? wRows[0].game_date : firstDate;
        const endDate = wRows.length ? wRows[wRows.length - 1].game_date : lastDate;
        stageRows.push(...metricRowsForWindow(playerId, season, String(w.window_key), wRows, logs.length, splits, latestGameDate, formulaVersion, configProfileId, batchId, runId, startDate, endDate, config.thresholds));
      }
      stageRows.push(...splitMetricRows(playerId, season, splits, logs, latestGameDate, formulaVersion, configProfileId, batchId, runId, config.thresholds));
    }
    stagedRowsThisTick = await insertStageRowsBatch(env, stageRows, rowErrors);
  }

  if (rowErrors.length) blockerCodes.push("STAGE_ROW_INSERT_ERRORS");
  const newOffset = Math.min(offset + chunkPlayers.length, eligiblePlayers.length);
  const stagedRowsTotal = Number((await queryFirst(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_metric_stage WHERE batch_id=?", [batchId]) || {}).c || 0);
  const partialContinue = blockerCodes.length === 0 && newOffset < eligiblePlayers.length;

  let dupRows = [];
  let promotedStageRows = 0;
  if (!blockerCodes.length && !partialContinue) {
    dupRows = await queryAll(env.STATS_HITTER_DB, "SELECT player_id, season, metric_scope, metric_window, metric_key, COUNT(*) AS c FROM hitter_metric_stage WHERE batch_id=? GROUP BY player_id, season, metric_scope, metric_window, metric_key HAVING COUNT(*) > 1 LIMIT 20", [batchId]);
    if (dupRows.length) blockerCodes.push("DUPLICATE_STAGED_METRIC_KEYS");
    promotedStageRows = Number((await queryFirst(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_metric_stage WHERE batch_id=? AND promoted_at IS NOT NULL", [batchId]) || {}).c || 0);
    if (promotedStageRows > 0) blockerCodes.push("PROMOTED_STAGE_ROWS_FOUND");
    const forbiddenMetricRows = await queryAll(env.STATS_HITTER_DB, "SELECT metric_key, COUNT(*) AS c FROM hitter_metric_stage WHERE batch_id=? AND metric_key IN ('raw_ob_rate','total_bases_calc_sum') GROUP BY metric_key", [batchId]);
    if (forbiddenMetricRows.length) blockerCodes.push("FORBIDDEN_OLD_METRIC_KEYS_FOUND");
    const lineageRows = await queryAll(env.STATS_HITTER_DB, "SELECT config_profile_id, formula_version, COUNT(*) AS c FROM hitter_metric_stage WHERE batch_id=? GROUP BY config_profile_id, formula_version", [batchId]);
    if (lineageRows.length !== 1 || lineageRows[0].config_profile_id !== V03_PROFILE_ID || lineageRows[0].formula_version !== V03_FORMULA_VERSION) blockerCodes.push("V03_LINEAGE_MISMATCH_IN_STAGE_ROWS");
    if (stagedRowsTotal <= 0) blockerCodes.push("STAGED_ROWS_ZERO");
  }

  const finalOk = blockerCodes.length === 0;
  const status = blockerCodes.length ? "BLOCKED_BASE_REBUILD_STAGE_ONLY_NO_PROMOTION" : (partialContinue ? "PARTIAL_CONTINUE_BASE_HITTER_METRICS" : "COMPLETED_BASE_REBUILD_STAGE_ONLY_NO_PROMOTION");
  const certification = blockerCodes.length ? "BASE_HITTER_METRICS_V0_3_0_BASE_REBUILD_STAGE_ONLY_BLOCKED_NO_PROMOTION" : (partialContinue ? "BASE_HITTER_METRICS_V0_3_0_BASE_REBUILD_STAGE_ONLY_PARTIAL_CONTINUE" : "BASE_HITTER_METRICS_V0_3_0_BASE_REBUILD_STAGE_ONLY_COMPLETED_NO_PROMOTION");
  const grade = blockerCodes.length ? "BLOCKED" : (partialContinue ? "PARTIAL_CONTINUE" : "BASE_STAGE_PASS_NO_PROMOTION");

  await execSql(env.STATS_HITTER_DB,
    "INSERT OR REPLACE INTO hitter_metric_batches (batch_id, run_id, worker_name, worker_version, mode, status, data_feed_key, source_key, source_season, input_log_row_count, input_split_row_count, input_latest_game_date, input_latest_split_snapshot_date, expected_hitter_universe_count, config_profile_id, formula_version, metric_catalog_json, formula_readiness_json, config_readiness_json, input_readiness_json, rows_staged, rows_promoted, duplicate_count, certification_status, certification_grade, certification_json, finished_at, updated_at, notes) VALUES (?, ?, ?, ?, 'base_rebuild_stage_only', ?, ?, 'd1_hitter_game_logs_hitter_splits', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)",
    [batchId, runId, WORKER_NAME, VERSION, status, V03_DATA_FEED_KEY, season, logRows, splitRowsCount, latestGameDate, latestSplitSnapshot, eligiblePlayers.length, configProfileId, formulaVersion, JSON.stringify({ required_metrics: ["games_count","pa_sum","ab_sum","hits_sum","total_bases_derived_sum","total_bases_source_sum","batting_average","slugging_percentage","strikeout_rate","walk_rate","hr_rate","tb_per_pa","h_per_ab","h_bb_per_pa_proxy","split_source_pass_through"], removed_metrics: ["raw_ob_rate", "total_bases_calc_sum"], deferred: ["true_obp","true_ops","log_babip","statcast","stdev","scoring"] }), JSON.stringify({ formulas_locked_for_production_promotion: false, base_rebuild_stage_only: true, promotion_locked: true }), JSON.stringify({ config_profile: config.profile, formula: config.formula, windows: config.windows, threshold_count: config.thresholds.length, v03_config_lineage: v03ConfigLineage }), JSON.stringify({ hitter_game_logs: logAudit, hitter_splits: splitAudit, blockers: blockerCodes }), stagedRowsTotal, dupRows.length, certification, grade, JSON.stringify({ blockerCodes, no_promotion: true, row_errors: rowErrors.slice(0, 20), offset_before: offset, offset_after: newOffset, players_total: eligiblePlayers.length }), partialContinue ? null : nowUtc(), "v0.3.1 performance-tuned base-rebuild stage-only. No live promotion performed."]
  );

  await execSql(env.STATS_HITTER_DB,
    "INSERT OR REPLACE INTO hitter_metric_cursor (cursor_key, batch_id, run_id, mode, status, source_season, current_player_offset, players_total, players_processed, next_run_after, last_error, cursor_json, updated_at) VALUES (?, ?, ?, 'base_rebuild_stage_only', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, CURRENT_TIMESTAMP)",
    [cursorKey, batchId, runId, blockerCodes.length ? "BLOCKED" : (partialContinue ? "PARTIAL_CONTINUE" : "COMPLETED"), season, newOffset, eligiblePlayers.length, newOffset, blockerCodes.length ? blockerCodes.join(",") : null, JSON.stringify({ request_id: requestId, chunk_size: chunkSize, offset_before: offset, offset_after: newOffset, chunk_players: chunkPlayers })]
  );

  if (!partialContinue || blockerCodes.length) {
    await execSql(env.STATS_HITTER_DB,
      "INSERT OR REPLACE INTO hitter_metric_certifications (certification_id, batch_id, run_id, mode, certification_status, certification_grade, checks_json, rows_staged, rows_promoted, duplicate_count, formula_error_count, denominator_error_count, config_profile_id, formula_version) VALUES (?, ?, ?, 'base_rebuild_stage_only', ?, ?, ?, ?, 0, ?, ?, 0, ?, ?)",
      [rid("hitter_metrics_cert"), batchId, runId, certification, grade, JSON.stringify({ blockerCodes, rows_staged: stagedRowsTotal, eligible_hitter_count: eligiblePlayers.length, no_promotion: true, no_external_calls: true, no_scoring: true, forbidden_old_metric_keys_blocked: true }), stagedRowsTotal, dupRows.length, rowErrors.length, configProfileId, formulaVersion]
    );
  }

  return {
    ok: finalOk,
    data_ok: finalOk,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    request_id: input.request_id || null,
    chain_id: input.chain_id || null,
    run_id: runId,
    batch_id: batchId,
    status,
    certification,
    certification_grade: grade,
    mode: "base_rebuild_stage_only",
    base_rebuild_stage_only: true,
    continuation_required: partialContinue,
    orchestrator_should_self_continue: partialContinue,
    cursor_key: cursorKey,
    chunk_size: chunkSize,
    offset_before: offset,
    offset_after: newOffset,
    players_processed_this_tick: chunkPlayers.length,
    eligible_hitter_count: eligiblePlayers.length,
    rows_read: logRows + splitRowsCount,
    rows_written: stagedRowsThisTick + 2,
    rows_staged_this_tick: stagedRowsThisTick,
    rows_staged: stagedRowsTotal,
    rows_promoted: 0,
    duplicate_count: dupRows.length,
    external_calls_performed: 0,
    writes_performed: { metric_stage_rows_this_tick: stagedRowsThisTick, batched_stage_writes: true, stage_batch_write_size: V03_STAGE_BATCH_WRITE_SIZE, metric_live_promotion_rows: 0, source_table_mutations: 0, board_scoring_final_rows: 0 },
    hard_blocks_enforced: { no_live_metric_promotion: true, no_hitter_game_log_mutation: true, no_hitter_split_mutation: true, no_pitcher_team_starter_bullpen_mutation: true, no_market_board_mutation: true, no_scoring_ranking_final_board: true, no_external_mlb_calls: true },
    config_used: { config_profile_id: configProfileId, formula_version: formulaVersion, profile_status: config.profile && config.profile.profile_status, formula_status: config.formula && config.formula.version_status, window_count: config.windows.length, threshold_count: config.thresholds.length, definition_count: config.definitions.length, v03_config_lineage: v03ConfigLineage },
    input_readiness: { hitter_game_logs: logAudit, hitter_splits: splitAudit, blockers: blockerCodes },
    row_errors: rowErrors.slice(0, 20),
    validation_notes: ["v0.3.1 performance-only patch: batched stage writes and chunk source reads; formulas unchanged.", "Stage rows only; no live hitter_metrics promotion.", "h_bb_per_pa_proxy replaces raw_ob_rate and is not OBP.", "total_bases_derived_sum replaces total_bases_calc_sum and is used for slugging_percentage/tb_per_pa.", "total_bases_source_sum remains audit-only.", "split_obp/split_ops/split_babip are source-provided split pass-through metrics only."],
    next_action: blockerCodes.length ? "FIX_BLOCKERS_BEFORE_BASE_STAGE_RETRY" : (partialContinue ? "BACKEND_ORCHESTRATOR_CONTINUE_UNTIL_COMPLETE" : "RUN_POST_DEPLOY_SQL_AND_FULL_STAGE_REVIEW_BEFORE_PROMOTION_PLANNING"),
    timestamp_utc: nowUtc()
  };
}


const SNAPSHOT_CORE_WINDOWS = ["last_3_games", "last_5_games", "last_10_games", "last_20_games", "season_to_date"];
const SNAPSHOT_CORE_KEYS = [
  "games_count", "pa_sum", "ab_sum", "hits_sum", "singles_sum", "doubles_sum", "triples_sum", "home_runs_sum", "walks_sum", "strikeouts_sum", "runs_sum", "rbi_sum", "stolen_bases_sum", "total_bases_derived_sum",
  "batting_average", "slugging_percentage", "strikeout_rate", "walk_rate", "hr_rate", "tb_per_pa", "h_per_ab", "sample_size_label"
];
const SNAPSHOT_AUDIT_KEYS = ["h_bb_per_pa_proxy", "total_bases_source_sum"];
const SNAPSHOT_SPLIT_KEYS = ["split_pa", "split_ab", "split_hits", "split_home_runs", "split_walks", "split_strikeouts", "split_avg", "split_obp", "split_slg", "split_ops", "split_babip", "split_sample_label"];

const SNAPSHOT_INSERT_SQL = "INSERT OR REPLACE INTO hitter_metric_snapshot_stage (snapshot_id, snapshot_batch_id, source_metric_batch_id, run_id, player_id, season, metric_window, config_profile_id, formula_version, games_count, pa_sum, ab_sum, hits_sum, singles_sum, doubles_sum, triples_sum, home_runs_sum, walks_sum, strikeouts_sum, runs_sum, rbi_sum, stolen_bases_sum, total_bases_derived_sum, batting_average, slugging_percentage, strikeout_rate, walk_rate, hr_rate, tb_per_pa, h_per_ab, sample_size_label, vs_left_json, vs_right_json, metrics_json, audit_json, metadata_json, review_flags_json, lineage_json, row_status, certification_status, certification_grade, promoted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)";

function snapshotRowBinds(row) {
  return [
    rid("hitter_metric_snapshot"), row.snapshot_batch_id, row.source_metric_batch_id, row.run_id, row.player_id, row.season, row.metric_window, row.config_profile_id, row.formula_version,
    row.games_count, row.pa_sum, row.ab_sum, row.hits_sum, row.singles_sum, row.doubles_sum, row.triples_sum, row.home_runs_sum, row.walks_sum, row.strikeouts_sum, row.runs_sum, row.rbi_sum, row.stolen_bases_sum, row.total_bases_derived_sum,
    row.batting_average, row.slugging_percentage, row.strikeout_rate, row.walk_rate, row.hr_rate, row.tb_per_pa, row.h_per_ab, row.sample_size_label,
    row.vs_left_json, row.vs_right_json, row.metrics_json, row.audit_json, row.metadata_json, row.review_flags_json, row.lineage_json,
    row.row_status, row.certification_status, row.certification_grade
  ];
}

async function insertSnapshotRowsBatch(env, rows, rowErrors) {
  if (!rows.length) return 0;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += V032_SNAPSHOT_BATCH_WRITE_SIZE) {
    const slice = rows.slice(i, i + V032_SNAPSHOT_BATCH_WRITE_SIZE);
    try {
      const statements = slice.map(row => env.STATS_HITTER_DB.prepare(SNAPSHOT_INSERT_SQL).bind(...snapshotRowBinds(row)));
      await env.STATS_HITTER_DB.batch(statements);
      inserted += slice.length;
    } catch (batchErr) {
      for (const row of slice) {
        try {
          await execSql(env.STATS_HITTER_DB, SNAPSHOT_INSERT_SQL, snapshotRowBinds(row));
          inserted++;
        } catch (err) {
          rowErrors.push({ player_id: row.player_id, metric_window: row.metric_window, error: String((err && err.message) || err).slice(0, 300), batch_error: String((batchErr && batchErr.message) || batchErr).slice(0, 300) });
        }
      }
    }
  }
  return inserted;
}

function metricMapKey(row) { return `${Number(row.player_id)}|${Number(row.season)}|${String(row.metric_window)}`; }

function ensureMap(map, key, init) {
  if (!map.has(key)) map.set(key, init());
  return map.get(key);
}

function splitSideFromWindow(window) {
  const w = String(window || "");
  return w === "vs_left" || w === "vs_right" ? w : null;
}

function jsonOrNull(obj) {
  if (!obj || (Array.isArray(obj) && obj.length === 0)) return null;
  if (!Array.isArray(obj) && Object.keys(obj).length === 0) return null;
  return JSON.stringify(obj);
}

async function latestCompletedBaseMetricBatch(env, requestedBatchId = null) {
  if (requestedBatchId) {
    return await queryFirst(env.STATS_HITTER_DB, "SELECT * FROM hitter_metric_batches WHERE batch_id=? LIMIT 1", [requestedBatchId]);
  }
  return await queryFirst(env.STATS_HITTER_DB, "SELECT * FROM hitter_metric_batches WHERE mode='base_rebuild_stage_only' AND status='COMPLETED_BASE_REBUILD_STAGE_ONLY_NO_PROMOTION' AND rows_promoted=0 AND duplicate_count=0 AND config_profile_id=? AND formula_version=? ORDER BY datetime(COALESCE(finished_at, updated_at, created_at)) DESC LIMIT 1", [V03_PROFILE_ID, V03_FORMULA_VERSION]);
}

async function runSnapshotPrep(env, input) {
  const runId = input.run_id || rid("run_hitter_metrics_snapshot_prep");
  const snapshotBatchId = input.snapshot_batch_id || rid("hitter_metrics_snapshot_prep_batch");
  const schema = await ensureSchema(env);
  const sourceBatch = await latestCompletedBaseMetricBatch(env, input.source_metric_batch_id || null);
  const blockerCodes = [];
  const rowErrors = [];
  if (!sourceBatch) blockerCodes.push("SOURCE_BASE_STAGE_BATCH_NOT_FOUND");
  if (sourceBatch && String(sourceBatch.status) !== "COMPLETED_BASE_REBUILD_STAGE_ONLY_NO_PROMOTION") blockerCodes.push("SOURCE_BASE_STAGE_BATCH_NOT_COMPLETED");
  if (sourceBatch && Number(sourceBatch.rows_promoted || 0) !== 0) blockerCodes.push("SOURCE_BASE_STAGE_PROMOTION_FOUND");
  if (sourceBatch && Number(sourceBatch.duplicate_count || 0) !== 0) blockerCodes.push("SOURCE_BASE_STAGE_DUPLICATES_FOUND");
  if (sourceBatch && String(sourceBatch.config_profile_id) !== V03_PROFILE_ID) blockerCodes.push("SOURCE_BASE_STAGE_PROFILE_MISMATCH");
  if (sourceBatch && String(sourceBatch.formula_version) !== V03_FORMULA_VERSION) blockerCodes.push("SOURCE_BASE_STAGE_FORMULA_MISMATCH");

  let sourceStageRows = 0;
  let sourceStagePlayers = 0;
  let snapshotRows = [];
  let stageRows = [];
  const sourceMetricBatchId = sourceBatch ? sourceBatch.batch_id : null;

  if (!blockerCodes.length) {
    sourceStageRows = Number((await queryFirst(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_metric_stage WHERE batch_id=?", [sourceMetricBatchId]) || {}).c || 0);
    sourceStagePlayers = Number((await queryFirst(env.STATS_HITTER_DB, "SELECT COUNT(DISTINCT player_id) AS c FROM hitter_metric_stage WHERE batch_id=?", [sourceMetricBatchId]) || {}).c || 0);
    const rowErrorCount = Number((await queryFirst(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_metric_stage WHERE batch_id=? AND row_error IS NOT NULL", [sourceMetricBatchId]) || {}).c || 0);
    const forbiddenRows = await queryAll(env.STATS_HITTER_DB, "SELECT metric_key, COUNT(*) AS c FROM hitter_metric_stage WHERE batch_id=? AND metric_key IN ('raw_ob_rate','total_bases_calc_sum') GROUP BY metric_key", [sourceMetricBatchId]);
    const promotedRows = Number((await queryFirst(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_metric_stage WHERE batch_id=? AND promoted_at IS NOT NULL", [sourceMetricBatchId]) || {}).c || 0);
    const duplicateRows = await queryAll(env.STATS_HITTER_DB, "SELECT player_id, season, metric_scope, metric_window, metric_key, config_profile_id, formula_version, COUNT(*) AS c FROM hitter_metric_stage WHERE batch_id=? GROUP BY player_id, season, metric_scope, metric_window, metric_key, config_profile_id, formula_version HAVING COUNT(*) > 1 LIMIT 20", [sourceMetricBatchId]);
    const nullWithoutReason = Number((await queryFirst(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_metric_stage WHERE batch_id=? AND metric_family IN ('rate','rate_proxy') AND metric_value IS NULL AND missing_data_reason IS NULL", [sourceMetricBatchId]) || {}).c || 0);
    const tbMismatch = Number((await queryFirst(env.STATS_HITTER_DB, "WITH d AS (SELECT player_id, metric_window, metric_value AS derived_tb FROM hitter_metric_stage WHERE batch_id=? AND metric_key='total_bases_derived_sum'), s AS (SELECT player_id, metric_window, metric_value AS source_tb FROM hitter_metric_stage WHERE batch_id=? AND metric_key='total_bases_source_sum') SELECT COUNT(*) AS c FROM d JOIN s ON s.player_id=d.player_id AND s.metric_window=d.metric_window WHERE COALESCE(d.derived_tb, -999999) <> COALESCE(s.source_tb, -999999)", [sourceMetricBatchId, sourceMetricBatchId]) || {}).c || 0);
    if (sourceStageRows <= 0) blockerCodes.push("SOURCE_BASE_STAGE_ROWS_ZERO");
    if (rowErrorCount > 0) blockerCodes.push("SOURCE_BASE_STAGE_ROW_ERRORS_FOUND");
    if (forbiddenRows.length) blockerCodes.push("SOURCE_BASE_STAGE_FORBIDDEN_OLD_KEYS_FOUND");
    if (promotedRows > 0) blockerCodes.push("SOURCE_BASE_STAGE_PROMOTED_ROWS_FOUND");
    if (duplicateRows.length) blockerCodes.push("SOURCE_BASE_STAGE_DUPLICATE_KEYS_FOUND");
    if (nullWithoutReason > 0) blockerCodes.push("SOURCE_BASE_STAGE_NULL_RATE_WITHOUT_REASON");
    if (tbMismatch > 0) blockerCodes.push("SOURCE_BASE_STAGE_TOTAL_BASES_MISMATCH");
  }

  if (!blockerCodes.length) {
    stageRows = await queryAll(env.STATS_HITTER_DB, "SELECT player_id, season, metric_window, metric_key, metric_family, metric_value, metric_text_value, numerator, denominator, source_start_date, source_end_date, source_snapshot_date, input_log_row_count, input_split_row_count, input_latest_game_date, missing_data_reason, reliability_label, row_status, certification_status, certification_grade, config_profile_id, formula_version, raw_input_summary_json, metric_json FROM hitter_metric_stage WHERE batch_id=? ORDER BY player_id ASC, season ASC, metric_window ASC, metric_key ASC", [sourceMetricBatchId]);
    const baseByKey = new Map();
    const splitByPlayer = new Map();
    const flagsByPlayer = new Map();

    for (const r of stageRows) {
      const playerId = Number(r.player_id);
      const season = Number(r.season);
      const side = splitSideFromWindow(r.metric_window);
      if (side) {
        const playerSplit = ensureMap(splitByPlayer, `${playerId}|${season}`, () => ({ vs_left: {}, vs_right: {}, flags: [] }));
        const strippedKey = String(r.metric_key || "").replace(/^vs_left_/, "").replace(/^vs_right_/, "");
        if (SNAPSHOT_SPLIT_KEYS.includes(strippedKey)) {
          playerSplit[side][strippedKey] = r.metric_text_value !== null && r.metric_text_value !== undefined ? r.metric_text_value : r.metric_value;
        }
        if (r.row_status === "review_flag" || r.missing_data_reason) playerSplit.flags.push({ metric_window: r.metric_window, metric_key: r.metric_key, missing_data_reason: r.missing_data_reason, reliability_label: r.reliability_label });
        continue;
      }
      if (String(r.metric_window) === "split_context") {
        const list = ensureMap(flagsByPlayer, `${playerId}|${season}`, () => []);
        list.push({ metric_window: r.metric_window, metric_key: r.metric_key, missing_data_reason: r.missing_data_reason, reliability_label: r.reliability_label });
        continue;
      }
      if (!SNAPSHOT_CORE_WINDOWS.includes(String(r.metric_window))) continue;
      const bucket = ensureMap(baseByKey, metricMapKey(r), () => ({ player_id: playerId, season, metric_window: String(r.metric_window), metrics: {}, audit: {}, flags: [], metadata: { input_latest_game_date: r.input_latest_game_date || null, source_start_date: r.source_start_date || null, source_end_date: r.source_end_date || null, input_log_row_count: r.input_log_row_count || 0, input_split_row_count: r.input_split_row_count || 0 } }));
      if (SNAPSHOT_CORE_KEYS.includes(String(r.metric_key))) bucket.metrics[r.metric_key] = r.metric_text_value !== null && r.metric_text_value !== undefined ? r.metric_text_value : r.metric_value;
      if (SNAPSHOT_AUDIT_KEYS.includes(String(r.metric_key))) bucket.audit[r.metric_key] = { value: r.metric_value, numerator: r.numerator, denominator: r.denominator, missing_data_reason: r.missing_data_reason, row_status: r.row_status };
      if (r.row_status === "review_flag" || r.missing_data_reason) bucket.flags.push({ metric_key: r.metric_key, missing_data_reason: r.missing_data_reason, reliability_label: r.reliability_label });
    }

    for (const bucket of baseByKey.values()) {
      const split = splitByPlayer.get(`${bucket.player_id}|${bucket.season}`) || { vs_left: {}, vs_right: {}, flags: [] };
      const extraFlags = flagsByPlayer.get(`${bucket.player_id}|${bucket.season}`) || [];
      const flags = [...bucket.flags, ...(split.flags || []), ...extraFlags];
      const metrics = bucket.metrics;
      snapshotRows.push({
        snapshot_batch_id: snapshotBatchId,
        source_metric_batch_id: sourceMetricBatchId,
        run_id: runId,
        player_id: bucket.player_id,
        season: bucket.season,
        metric_window: bucket.metric_window,
        config_profile_id: V03_PROFILE_ID,
        formula_version: V03_FORMULA_VERSION,
        games_count: metrics.games_count ?? null,
        pa_sum: metrics.pa_sum ?? null,
        ab_sum: metrics.ab_sum ?? null,
        hits_sum: metrics.hits_sum ?? null,
        singles_sum: metrics.singles_sum ?? null,
        doubles_sum: metrics.doubles_sum ?? null,
        triples_sum: metrics.triples_sum ?? null,
        home_runs_sum: metrics.home_runs_sum ?? null,
        walks_sum: metrics.walks_sum ?? null,
        strikeouts_sum: metrics.strikeouts_sum ?? null,
        runs_sum: metrics.runs_sum ?? null,
        rbi_sum: metrics.rbi_sum ?? null,
        stolen_bases_sum: metrics.stolen_bases_sum ?? null,
        total_bases_derived_sum: metrics.total_bases_derived_sum ?? null,
        batting_average: metrics.batting_average ?? null,
        slugging_percentage: metrics.slugging_percentage ?? null,
        strikeout_rate: metrics.strikeout_rate ?? null,
        walk_rate: metrics.walk_rate ?? null,
        hr_rate: metrics.hr_rate ?? null,
        tb_per_pa: metrics.tb_per_pa ?? null,
        h_per_ab: metrics.h_per_ab ?? null,
        sample_size_label: metrics.sample_size_label || null,
        vs_left_json: jsonOrNull(split.vs_left),
        vs_right_json: jsonOrNull(split.vs_right),
        metrics_json: JSON.stringify(metrics),
        audit_json: JSON.stringify({ ...bucket.audit, audit_only_keys: SNAPSHOT_AUDIT_KEYS, excluded_from_typed_scoring_columns: true }),
        metadata_json: JSON.stringify(bucket.metadata),
        review_flags_json: jsonOrNull(flags),
        lineage_json: JSON.stringify({ source_metric_batch_id: sourceMetricBatchId, snapshot_batch_id: snapshotBatchId, data_feed_key: V032_SNAPSHOT_DATA_FEED_KEY, worker_version: VERSION, no_live_promotion: true, no_scoring: true, no_source_mutation: true }),
        row_status: flags.length ? "snapshot_stage_review" : "snapshot_stage_staged",
        certification_status: "snapshot_stage_not_promoted",
        certification_grade: "SNAPSHOT_STAGE"
      });
    }
    await insertSnapshotRowsBatch(env, snapshotRows, rowErrors);
    if (rowErrors.length) blockerCodes.push("SNAPSHOT_STAGE_INSERT_ERRORS");
    const dupRows = await queryAll(env.STATS_HITTER_DB, "SELECT player_id, season, metric_window, config_profile_id, formula_version, COUNT(*) AS c FROM hitter_metric_snapshot_stage WHERE snapshot_batch_id=? GROUP BY player_id, season, metric_window, config_profile_id, formula_version HAVING COUNT(*) > 1 LIMIT 20", [snapshotBatchId]);
    if (dupRows.length) blockerCodes.push("SNAPSHOT_STAGE_DUPLICATE_KEYS_FOUND");
  }

  const snapshotRowsWritten = Number((await queryFirst(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_metric_snapshot_stage WHERE snapshot_batch_id=?", [snapshotBatchId]) || {}).c || 0);
  const snapshotPlayers = Number((await queryFirst(env.STATS_HITTER_DB, "SELECT COUNT(DISTINCT player_id) AS c FROM hitter_metric_snapshot_stage WHERE snapshot_batch_id=?", [snapshotBatchId]) || {}).c || 0);
  const snapshotWindows = Number((await queryFirst(env.STATS_HITTER_DB, "SELECT COUNT(DISTINCT metric_window) AS c FROM hitter_metric_snapshot_stage WHERE snapshot_batch_id=?", [snapshotBatchId]) || {}).c || 0);
  const dupFinal = Number((await queryFirst(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM (SELECT player_id, season, metric_window, config_profile_id, formula_version, COUNT(*) AS d FROM hitter_metric_snapshot_stage WHERE snapshot_batch_id=? GROUP BY player_id, season, metric_window, config_profile_id, formula_version HAVING COUNT(*) > 1)", [snapshotBatchId]) || {}).c || 0);
  if (dupFinal > 0 && !blockerCodes.includes("SNAPSHOT_STAGE_DUPLICATE_KEYS_FOUND")) blockerCodes.push("SNAPSHOT_STAGE_DUPLICATE_KEYS_FOUND");

  const ok = blockerCodes.length === 0;
  const status = ok ? "COMPLETED_SNAPSHOT_PREP_STAGE_ONLY_NO_PROMOTION" : "BLOCKED_SNAPSHOT_PREP_STAGE_ONLY_NO_PROMOTION";
  const certification = ok ? "BASE_HITTER_METRICS_V0_3_3_SNAPSHOT_PREP_COMPLETED_NO_PROMOTION" : "BASE_HITTER_METRICS_V0_3_3_SNAPSHOT_PREP_BLOCKED_NO_PROMOTION";
  const grade = ok ? "SNAPSHOT_PREP_PASS_NO_PROMOTION" : "BLOCKED";

  await execSql(env.STATS_HITTER_DB,
    "INSERT OR REPLACE INTO hitter_metric_snapshot_batches (snapshot_batch_id, source_metric_batch_id, run_id, worker_name, worker_version, mode, status, data_feed_key, source_season, source_stage_rows, source_stage_players, snapshot_rows, rows_promoted, duplicate_count, config_profile_id, formula_version, certification_status, certification_grade, certification_json, finished_at, updated_at, notes) VALUES (?, ?, ?, ?, ?, 'snapshot_prep_stage_only', ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)",
    [snapshotBatchId, sourceMetricBatchId || "missing_source_batch", runId, WORKER_NAME, VERSION, status, V032_SNAPSHOT_DATA_FEED_KEY, Number(input.source_season || (sourceBatch && sourceBatch.source_season) || 2026), sourceStageRows, sourceStagePlayers, snapshotRowsWritten, dupFinal, V03_PROFILE_ID, V03_FORMULA_VERSION, certification, grade, JSON.stringify({ blockerCodes, source_metric_batch_id: sourceMetricBatchId, no_live_promotion: true, no_scoring: true, no_source_mutation: true, snapshot_players: snapshotPlayers, snapshot_windows: snapshotWindows, audit_only_excluded_keys: SNAPSHOT_AUDIT_KEYS, row_errors: rowErrors.slice(0, 20) }), nowUtc(), "v0.3.3 snapshot-prep stage-only. Compact rows for review/snapshot design only; no scoring or live promotion."]
  );

  return {
    ok,
    data_ok: ok,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    request_id: input.request_id || null,
    chain_id: input.chain_id || null,
    run_id: runId,
    snapshot_batch_id: snapshotBatchId,
    source_metric_batch_id: sourceMetricBatchId,
    status,
    certification,
    certification_grade: grade,
    mode: "snapshot_prep_stage_only",
    snapshot_prep_stage_only: true,
    rows_read: sourceStageRows,
    rows_written: snapshotRowsWritten + 1,
    source_stage_rows: sourceStageRows,
    source_stage_players: sourceStagePlayers,
    snapshot_rows: snapshotRowsWritten,
    snapshot_players: snapshotPlayers,
    snapshot_windows: snapshotWindows,
    rows_promoted: 0,
    duplicate_count: dupFinal,
    external_calls_performed: 0,
    writes_performed: { snapshot_stage_rows: snapshotRowsWritten, snapshot_batches: 1, metric_live_promotion_rows: 0, source_table_mutations: 0, board_scoring_final_rows: 0 },
    hard_blocks_enforced: { no_live_metric_promotion: true, no_hitter_game_log_mutation: true, no_hitter_split_mutation: true, no_market_board_mutation: true, no_scoring_ranking_final_board: true, no_external_mlb_calls: true },
    compact_snapshot_shape: { natural_key: ["player_id", "season", "metric_window", "config_profile_id", "formula_version"], typed_core_metrics: SNAPSHOT_CORE_KEYS.filter(k => k !== "sample_size_label"), text_core_metrics: ["sample_size_label"], json_columns: ["vs_left_json", "vs_right_json", "metrics_json", "audit_json", "metadata_json", "review_flags_json", "lineage_json"], audit_only_excluded_from_typed_columns: SNAPSHOT_AUDIT_KEYS },
    validation_notes: ["Snapshot-prep stage only; no live hitter_metrics promotion.", "One compact row per player/season/window/profile/formula.", "h_bb_per_pa_proxy and total_bases_source_sum remain audit JSON only, not typed scoring-facing columns.", "Split source pass-throughs are carried in vs_left_json/vs_right_json."],
    blockers: blockerCodes,
    row_errors: rowErrors.slice(0, 20),
    next_action: ok ? "RUN_SNAPSHOT_PREP_VALIDATION_SQL_AND_REVIEW_SHAPE_BEFORE_PROMOTION_OR_SCORING_DESIGN" : "FIX_BLOCKERS_BEFORE_SNAPSHOT_PREP_RETRY",
    timestamp_utc: nowUtc()
  };
}

async function runAudit(env, input) {
  const runId = input.run_id || rid("run_hitter_metrics_audit");
  const batchId = input.batch_id || rid("hitter_metrics_audit_batch");
  const schema = await ensureSchema(env);
  const v03ConfigLineage = await ensureV03ConfigLineage(env);
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
    next_action: blockerCodes.length ? "RESOLVE_BLOCKERS_BEFORE_FORMULA_LOCK_OR_BASE_REBUILD" : "RUN_MANUAL_SAMPLE_CALIBRATION_AND_GEMINI_THRESHOLD_RESEARCH_BEFORE_V0_3_0_FORMULA_LOCK",
    timestamp_utc: nowUtc()
  };

  try {
    await execSql(env.STATS_HITTER_DB,
      "INSERT OR REPLACE INTO hitter_metric_batches (batch_id, run_id, worker_name, worker_version, mode, status, data_feed_key, source_key, source_season, input_log_row_count, input_split_row_count, input_latest_game_date, input_latest_split_snapshot_date, expected_hitter_universe_count, config_profile_id, formula_version, metric_catalog_json, formula_readiness_json, config_readiness_json, input_readiness_json, rows_staged, rows_promoted, duplicate_count, certification_status, certification_grade, certification_json, finished_at, updated_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)",
      [batchId, runId, WORKER_NAME, VERSION, input.mode || "schema_formula_input_audit", output.status, "d1_derived_hitter_metrics_readiness_v0_1_0", "d1_hitter_game_logs_hitter_splits", Number(input.source_season || 2026), logRows, splitRows, (((logAudit.date_range || {}).rows || [])[0] || {}).max_game_date || null, (((splitAudit.snapshot_dates || {}).rows || [])[0] || {}).max_snapshot_date || null, Number((((logAudit.player_count || {}).rows || [])[0] || {}).distinct_players || 0), "hitter_metrics_neutral_v0_3_0_stage_only", "hitter_metrics_formula_v0_3_0_stage_only", JSON.stringify(readiness), JSON.stringify(output.formula_readiness), JSON.stringify(configAudit), JSON.stringify(output.input_readiness), logDup + splitDup, output.certification, blockerCodes.length ? "BLOCKED" : "AUDIT_PASS_NOT_FORMULA_LOCKED", JSON.stringify({ blockerCodes, no_promotion: true }), "v0.1.0 audit row only. No metric promotion performed."]
    );
    await execSql(env.STATS_HITTER_DB,
      "INSERT OR REPLACE INTO hitter_metric_certifications (certification_id, batch_id, run_id, mode, certification_status, certification_grade, checks_json, rows_staged, rows_promoted, duplicate_count, formula_error_count, denominator_error_count, config_profile_id, formula_version) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 0, 0, ?, ?)",
      [rid("hitter_metrics_cert"), batchId, runId, input.mode || "schema_formula_input_audit", output.certification, blockerCodes.length ? "BLOCKED" : "AUDIT_PASS_NOT_FORMULA_LOCKED", JSON.stringify({ blockerCodes, input_readiness: output.input_readiness, formula_readiness: output.formula_readiness, no_promotion: true }), logDup + splitDup, "hitter_metrics_neutral_v0_3_0_stage_only", "hitter_metrics_formula_v0_3_0_stage_only"]
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
      const mode = String((input && input.mode) || "schema_formula_input_audit");
      const output = mode === "snapshot_prep_stage_only" ? await runSnapshotPrep(env, input || {}) : (mode === "base_rebuild_stage_only" ? await runBaseRebuildStageOnly(env, input || {}) : await runAudit(env, input || {}));
      return jsonResponse(output);
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
