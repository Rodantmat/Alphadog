const WORKER_NAME = "alphadog-v2-base-pitcher-metrics";
const VERSION = "alphadog-v2-base-pitcher-metrics-v0.1.0-schema-formula-input-audit";
const JOB_KEY = "base-pitcher-metrics";

const PROFILE_ID = "pitcher_metrics_neutral_v0_1_0_audit";
const FORMULA_VERSION = "pitcher_metrics_formula_v0_1_0_readiness";
const DATA_FEED_KEY = "derived_pitcher_metrics_v0_1_0_schema_formula_input_audit";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "STATS_PITCHER_DB"];
const REQUIRED_SECRETS = ["ALPHADOG_ADMIN_TOKEN", "ALPHADOG_INTERNAL_TOKEN"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_VERSION", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON", "MAX_TICK_MS", "MAX_ROWS_PER_TICK", "LOCK_STALE_MINUTES"];

const REQUIRED_PITCHER_LOG_COLUMNS = [
  "player_id", "game_pk", "season", "game_date", "team_id", "opponent_team_id", "role", "innings_pitched", "innings_pitched_decimal", "outs_recorded", "batters_faced", "hits_allowed", "runs_allowed", "earned_runs", "walks_allowed", "strikeouts", "home_runs_allowed", "pitches", "strikes", "wins", "losses", "saves", "holds", "blown_saves", "certification_status", "certification_grade", "batch_id", "run_id", "promoted_at"
];

const REQUIRED_PITCHER_SPLIT_COLUMNS = [
  "player_id", "season", "split_key", "split_code", "split_description", "innings_pitched", "innings_pitched_decimal", "outs_recorded", "batters_faced", "hits_allowed", "earned_runs", "walks_allowed", "strikeouts", "home_runs_allowed", "pitches", "strikes", "avg_against", "obp_against", "slg_against", "ops_against", "whip", "era", "source_snapshot_date", "certification_status", "certification_grade", "batch_id", "run_id", "promoted_at"
];

const METRIC_SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS pitcher_metric_schema_migrations (
    migration_key TEXT PRIMARY KEY,
    worker_version TEXT NOT NULL,
    applied_at TEXT DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS pitcher_metric_batches (
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
    expected_pitcher_universe_count INTEGER DEFAULT 0,
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
  `CREATE TABLE IF NOT EXISTS pitcher_metric_stage (
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
  `CREATE TABLE IF NOT EXISTS pitcher_metric_outcomes (
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
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS pitcher_metric_cursor (
    cursor_key TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    batch_id TEXT,
    run_id TEXT,
    source_season INTEGER,
    players_total INTEGER DEFAULT 0,
    players_processed INTEGER DEFAULT 0,
    last_player_id INTEGER,
    last_game_date TEXT,
    last_split_snapshot_date TEXT,
    requests_done INTEGER DEFAULT 0,
    no_external_calls INTEGER DEFAULT 1,
    cursor_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS pitcher_metric_certifications (
    certification_id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    certification_status TEXT NOT NULL,
    certification_grade TEXT,
    rows_staged INTEGER DEFAULT 0,
    rows_promoted INTEGER DEFAULT 0,
    duplicate_count INTEGER DEFAULT 0,
    input_log_row_count INTEGER DEFAULT 0,
    input_split_row_count INTEGER DEFAULT 0,
    validation_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS pitcher_metric_snapshot_batches (
    snapshot_batch_id TEXT PRIMARY KEY,
    source_batch_id TEXT,
    run_id TEXT NOT NULL,
    worker_name TEXT NOT NULL,
    worker_version TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    config_profile_id TEXT,
    formula_version TEXT,
    source_rows INTEGER DEFAULT 0,
    source_players INTEGER DEFAULT 0,
    snapshot_rows INTEGER DEFAULT 0,
    snapshot_players INTEGER DEFAULT 0,
    rows_promoted INTEGER DEFAULT 0,
    duplicate_count INTEGER DEFAULT 0,
    certification_status TEXT DEFAULT 'audit_only_not_promoted',
    certification_grade TEXT,
    certification_json TEXT,
    started_at TEXT DEFAULT CURRENT_TIMESTAMP,
    finished_at TEXT,
    promoted_at TEXT,
    cleaned_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS pitcher_metric_snapshot_stage (
    snapshot_stage_id TEXT PRIMARY KEY,
    snapshot_batch_id TEXT NOT NULL,
    source_batch_id TEXT,
    run_id TEXT NOT NULL,
    player_id INTEGER NOT NULL,
    season INTEGER NOT NULL,
    metric_window TEXT NOT NULL,
    config_profile_id TEXT NOT NULL,
    formula_version TEXT NOT NULL,
    metrics_json TEXT NOT NULL,
    input_summary_json TEXT,
    reliability_json TEXT,
    review_flags_json TEXT,
    certification_status TEXT DEFAULT 'audit_only_not_promoted',
    certification_grade TEXT,
    promoted_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(snapshot_batch_id, player_id, season, metric_window, config_profile_id, formula_version)
  )`,
  `CREATE TABLE IF NOT EXISTS pitcher_metric_snapshots (
    player_id INTEGER NOT NULL,
    season INTEGER NOT NULL,
    metric_window TEXT NOT NULL,
    config_profile_id TEXT NOT NULL,
    formula_version TEXT NOT NULL,
    snapshot_batch_id TEXT NOT NULL,
    source_batch_id TEXT,
    metrics_json TEXT NOT NULL,
    input_summary_json TEXT,
    reliability_json TEXT,
    review_flags_json TEXT,
    certification_status TEXT NOT NULL,
    certification_grade TEXT,
    promoted_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(player_id, season, metric_window, config_profile_id, formula_version)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_pitcher_metric_batches_status ON pitcher_metric_batches(status, mode)`,
  `CREATE INDEX IF NOT EXISTS idx_pitcher_metric_stage_batch ON pitcher_metric_stage(batch_id, player_id, metric_window)`,
  `CREATE INDEX IF NOT EXISTS idx_pitcher_metric_stage_key ON pitcher_metric_stage(metric_key, season, metric_scope, metric_window)`,
  `CREATE INDEX IF NOT EXISTS idx_pitcher_metric_outcomes_batch ON pitcher_metric_outcomes(batch_id, terminal_category)`,
  `CREATE INDEX IF NOT EXISTS idx_pitcher_metric_snapshot_stage_batch ON pitcher_metric_snapshot_stage(snapshot_batch_id, player_id, metric_window)`,
  `CREATE INDEX IF NOT EXISTS idx_pitcher_metric_snapshots_player ON pitcher_metric_snapshots(player_id, season, metric_window)`,
  `INSERT OR IGNORE INTO pitcher_metric_schema_migrations (migration_key, worker_version, notes) VALUES ('pitcher_metrics_v0_1_0_lifecycle_schema', '${VERSION}', 'Additive Pitcher Metrics audit-only lifecycle schema. No promotion, no source mutation, no external calls.')`
];

const CONFIG_SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS config_metric_calibration_profiles (
    profile_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    sport TEXT NOT NULL DEFAULT 'MLB',
    metric_domain TEXT NOT NULL,
    active INTEGER DEFAULT 0,
    profile_status TEXT DEFAULT 'draft',
    profile_json TEXT,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS config_metric_formula_versions (
    formula_version TEXT PRIMARY KEY,
    sport TEXT NOT NULL DEFAULT 'MLB',
    metric_domain TEXT NOT NULL,
    active INTEGER DEFAULT 0,
    version_status TEXT DEFAULT 'readiness_only',
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
    source_table TEXT,
    numerator_field TEXT,
    denominator_field TEXT,
    formula_version TEXT,
    enabled INTEGER DEFAULT 1,
    neutral_metric_only INTEGER DEFAULT 1,
    future_scoring_bridge_flag INTEGER DEFAULT 0,
    config_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS config_metric_windows (
    window_key TEXT PRIMARY KEY,
    metric_domain TEXT NOT NULL,
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
    metric_domain TEXT NOT NULL,
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

function configSeedItems() {
  const catalog = formulaCatalog();
  const items = [
    { sql: "INSERT OR IGNORE INTO config_metric_calibration_profiles (profile_id, display_name, sport, metric_domain, active, profile_status, profile_json, notes) VALUES (?, ?, 'MLB', 'pitcher', 1, 'audit_only', ?, ?)", binds: [PROFILE_ID, "Pitcher Metrics Neutral v0.1.0 Audit", JSON.stringify({ no_scoring: true, promotion_locked: true, tuning_owner: "CONFIG_DB", audit_only: true }), "Pitcher neutral metric audit profile. Promotion locked. Thresholds are DB-configurable and not scoring weights."] },
    { sql: "INSERT OR IGNORE INTO config_metric_formula_versions (formula_version, sport, metric_domain, active, version_status, formula_catalog_json, notes) VALUES (?, 'MLB', 'pitcher', 1, 'readiness_only', ?, ?)", binds: [FORMULA_VERSION, JSON.stringify(catalog), "Pitcher formula readiness shell for v0.1.0 audit only. No production promotion."] },
    { sql: "INSERT OR IGNORE INTO config_metric_windows (window_key, metric_domain, metric_scope, window_type, window_size, enabled, sort_order, config_profile_id, notes) VALUES ('pitcher_last_3_games', 'pitcher', 'last_3_games', 'last_n_games', 3, 1, 10, ?, 'Rolling last 3 games window for neutral pitcher metric readiness.')", binds: [PROFILE_ID] },
    { sql: "INSERT OR IGNORE INTO config_metric_windows (window_key, metric_domain, metric_scope, window_type, window_size, enabled, sort_order, config_profile_id, notes) VALUES ('pitcher_last_5_games', 'pitcher', 'last_5_games', 'last_n_games', 5, 1, 20, ?, 'Rolling last 5 games window for neutral pitcher metric readiness.')", binds: [PROFILE_ID] },
    { sql: "INSERT OR IGNORE INTO config_metric_windows (window_key, metric_domain, metric_scope, window_type, window_size, enabled, sort_order, config_profile_id, notes) VALUES ('pitcher_last_10_games', 'pitcher', 'last_10_games', 'last_n_games', 10, 1, 30, ?, 'Rolling last 10 games window for neutral pitcher metric readiness.')", binds: [PROFILE_ID] },
    { sql: "INSERT OR IGNORE INTO config_metric_windows (window_key, metric_domain, metric_scope, window_type, window_size, enabled, sort_order, config_profile_id, notes) VALUES ('pitcher_last_20_games', 'pitcher', 'last_20_games', 'last_n_games', 20, 1, 40, ?, 'Rolling last 20 games window for neutral pitcher metric readiness.')", binds: [PROFILE_ID] },
    { sql: "INSERT OR IGNORE INTO config_metric_windows (window_key, metric_domain, metric_scope, window_type, window_size, enabled, sort_order, config_profile_id, notes) VALUES ('pitcher_season_to_date', 'pitcher', 'season_to_date', 'season_to_date', NULL, 1, 90, ?, 'Season-to-date neutral pitcher metric readiness window.')", binds: [PROFILE_ID] },
    { sql: "INSERT OR IGNORE INTO config_metric_thresholds (threshold_key, config_profile_id, metric_domain, threshold_type, threshold_value, label, enabled, notes) VALUES ('pitcher_min_batters_faced_rate_audit_v0_1_0', ?, 'pitcher', 'minimum_batters_faced_for_rates', 25, 'audit minimum BF for denominator-rate review', 1, 'DB-configurable audit threshold only; not scoring.')", binds: [PROFILE_ID] },
    { sql: "INSERT OR IGNORE INTO config_metric_thresholds (threshold_key, config_profile_id, metric_domain, threshold_type, threshold_value, label, enabled, notes) VALUES ('pitcher_min_outs_recorded_era_whip_audit_v0_1_0', ?, 'pitcher', 'minimum_outs_recorded_for_ip_rates', 15, 'audit minimum outs for IP-rate review', 1, 'DB-configurable audit threshold only; not scoring.')", binds: [PROFILE_ID] },
    { sql: "INSERT OR IGNORE INTO config_metric_thresholds (threshold_key, config_profile_id, metric_domain, threshold_type, threshold_value, label, enabled, notes) VALUES ('pitcher_min_split_bf_pass_through_audit_v0_1_0', ?, 'pitcher', 'minimum_split_batters_faced_review', 10, 'audit minimum split BF for pass-through reliability label', 1, 'DB-configurable audit threshold only; not scoring.')", binds: [PROFILE_ID] }
  ];
  const defs = [
    ["pitcher_games_count", "direct_aggregate", "pitcher_game_logs", "games_count", null],
    ["pitcher_appearances_count", "direct_aggregate", "pitcher_game_logs", "appearances_count", null],
    ["pitcher_starts_count", "role_readiness", "pitcher_game_logs", "starts_count", null],
    ["pitcher_innings_pitched_sum", "direct_aggregate", "pitcher_game_logs", "innings_pitched_decimal", null],
    ["pitcher_outs_recorded_sum", "direct_aggregate", "pitcher_game_logs", "outs_recorded", null],
    ["pitcher_batters_faced_sum", "direct_aggregate", "pitcher_game_logs", "batters_faced", null],
    ["pitcher_pitches_sum", "direct_aggregate", "pitcher_game_logs", "pitches", null],
    ["pitcher_strikes_sum", "direct_aggregate", "pitcher_game_logs", "strikes", null],
    ["pitcher_hits_allowed_sum", "direct_aggregate", "pitcher_game_logs", "hits_allowed", null],
    ["pitcher_runs_allowed_sum", "direct_aggregate", "pitcher_game_logs", "runs_allowed", null],
    ["pitcher_earned_runs_sum", "direct_aggregate", "pitcher_game_logs", "earned_runs", null],
    ["pitcher_walks_allowed_sum", "direct_aggregate", "pitcher_game_logs", "walks_allowed", null],
    ["pitcher_strikeouts_sum", "direct_aggregate", "pitcher_game_logs", "strikeouts", null],
    ["pitcher_home_runs_allowed_sum", "direct_aggregate", "pitcher_game_logs", "home_runs_allowed", null],
    ["pitcher_era_candidate", "denominator_safe_rate", "pitcher_game_logs", "earned_runs", "outs_recorded"],
    ["pitcher_whip_candidate", "denominator_safe_rate", "pitcher_game_logs", "walks_allowed_plus_hits_allowed", "innings_pitched_decimal"],
    ["pitcher_k_rate_candidate", "denominator_safe_rate", "pitcher_game_logs", "strikeouts", "batters_faced"],
    ["pitcher_bb_rate_candidate", "denominator_safe_rate", "pitcher_game_logs", "walks_allowed", "batters_faced"],
    ["pitcher_hr_rate_candidate", "denominator_safe_rate", "pitcher_game_logs", "home_runs_allowed", "batters_faced"],
    ["pitcher_k_minus_bb_rate_candidate", "denominator_safe_rate", "pitcher_game_logs", "strikeouts_minus_walks", "batters_faced"],
    ["pitcher_pitches_per_out_candidate", "denominator_safe_rate", "pitcher_game_logs", "pitches", "outs_recorded"],
    ["pitcher_strikes_per_pitch_candidate", "denominator_safe_rate", "pitcher_game_logs", "strikes", "pitches"],
    ["pitcher_split_era_pass_through", "split_pass_through", "pitcher_splits", "era", null],
    ["pitcher_split_whip_pass_through", "split_pass_through", "pitcher_splits", "whip", null],
    ["pitcher_split_ops_against_pass_through", "split_pass_through", "pitcher_splits", "ops_against", null]
  ];
  for (const [key, fam, source, num, den] of defs) {
    items.push({
      sql: "INSERT OR IGNORE INTO config_metric_definitions (metric_key, metric_family, metric_scope, display_name, description, source_table, numerator_field, denominator_field, formula_version, enabled, neutral_metric_only, future_scoring_bridge_flag, config_json) VALUES (?, ?, 'readiness_catalog', ?, ?, ?, ?, ?, ?, 1, 1, 1, ?)",
      binds: [key, fam, key, `${key}. Readiness only in v0.1.0; no promotion.`, source, num, den, FORMULA_VERSION, JSON.stringify({ readiness_only: true, no_promotion_v0_1_0: true, pitcher_domain: true })]
    });
  }
  return items;
}

function nowUtc() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function jsonResponse(body, status = 200) { return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }); }
function bindingPresence(env, names) { const out = {}; for (const name of names) out[name] = Boolean(env && env[name]); return out; }
function varPresence(env, names) { const out = {}; for (const name of names) out[name] = env && env[name] !== undefined && env[name] !== null && String(env[name]).length > 0; return out; }
function allTrue(obj) { return Object.values(obj).every(Boolean); }
async function readJsonSafe(request) { try { return await request.json(); } catch { return {}; } }

async function queryAll(db, sql, binds = []) { const stmt = db.prepare(sql); const res = binds.length ? await stmt.bind(...binds).all() : await stmt.all(); return res.results || []; }
async function queryFirst(db, sql, binds = []) { const rows = await queryAll(db, sql, binds); return rows[0] || null; }
async function execSql(db, sql, binds = []) { const stmt = db.prepare(sql); return binds.length ? await stmt.bind(...binds).run() : await stmt.run(); }
async function safeQueryAll(db, sql, binds = []) { try { return { ok: true, rows: await queryAll(db, sql, binds) }; } catch (err) { return { ok: false, error: String(err && err.message ? err.message : err), rows: [] }; } }
async function safeQueryFirst(db, sql, binds = []) { const res = await safeQueryAll(db, sql, binds); return { ...res, row: res.rows[0] || null }; }

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
    status: "AUDIT_WORKER_READY",
    timestamp_utc: nowUtc(),
    phase: "pitcher_metrics_v0_1_0_schema_formula_input_audit",
    notes: [
      "Audit-only worker.",
      "No live promotion, no source table mutation, no MLB/API calls, no scoring/ranking/final board writes.",
      "Mirrors Hitter Metrics lifecycle path but stops at schema/formula/input/config readiness."
    ],
    binding_summary: {
      required_db_bindings_present: allTrue(db),
      expected_vars_present: allTrue(vars),
      required_secrets_present: allTrue(secrets)
    }
  };
}

function formulaCatalog() {
  return {
    version: FORMULA_VERSION,
    promotion_locked: true,
    audit_only: true,
    no_scoring: true,
    direct_aggregates_from_pitcher_game_logs: [
      "games_count", "appearances_count", "starts_count", "innings_pitched_sum", "outs_recorded_sum", "batters_faced_sum", "pitches_sum", "strikes_sum", "hits_allowed_sum", "runs_allowed_sum", "earned_runs_sum", "walks_allowed_sum", "strikeouts_sum", "home_runs_allowed_sum", "saves_sum_if_source_proven", "holds_sum_if_source_proven", "blown_saves_sum_if_source_proven"
    ],
    denominator_safe_rate_candidates: [
      "ERA = earned_runs_sum * 27 / outs_recorded_sum",
      "WHIP = (walks_allowed_sum + hits_allowed_sum) / innings_pitched_sum",
      "K_rate = strikeouts_sum / batters_faced_sum",
      "BB_rate = walks_allowed_sum / batters_faced_sum",
      "HR_rate = home_runs_allowed_sum / batters_faced_sum",
      "K_minus_BB_rate = K_rate - BB_rate",
      "pitches_per_out = pitches_sum / outs_recorded_sum",
      "strikes_per_pitch = strikes_sum / pitches_sum",
      "innings_per_appearance = innings_pitched_sum / appearances_count"
    ],
    split_pass_through_candidates_from_pitcher_splits: ["era", "whip", "avg_against", "obp_against", "slg_against", "ops_against", "batters_faced", "outs_recorded"],
    role_readiness_audit_only: ["role", "starts_count", "starter/reliever split requires later locked logic"],
    deferred: ["FIP", "xFIP", "SIERA", "Stuff+", "park/weather/opponent context", "market edge", "scoring/ranking", "starter-vs-reliever weighting", "true role-specific scoring logic"]
  };
}

async function ensureSchema(env) {
  const results = [];
  let statsOk = 0, statsFailed = 0, configOk = 0, configFailed = 0, seedOk = 0, seedFailed = 0;
  for (const sql of METRIC_SCHEMA_SQL) {
    try { await execSql(env.STATS_PITCHER_DB, sql); statsOk++; }
    catch (err) { statsFailed++; results.push({ target: "STATS_PITCHER_DB", ok: false, sql_preview: sql.slice(0, 90), error: String(err && err.message ? err.message : err) }); }
  }
  for (const sql of CONFIG_SCHEMA_SQL) {
    try { await execSql(env.CONFIG_DB, sql); configOk++; }
    catch (err) { configFailed++; results.push({ target: "CONFIG_DB", ok: false, sql_preview: sql.slice(0, 90), error: String(err && err.message ? err.message : err) }); }
  }
  for (const item of configSeedItems()) {
    try { await execSql(env.CONFIG_DB, item.sql, item.binds); seedOk++; }
    catch (err) { seedFailed++; results.push({ target: "CONFIG_DB", ok: false, action: "pitcher_metric_config_seed", sql_preview: item.sql.slice(0, 90), error: String(err && err.message ? err.message : err) }); }
  }
  return { ok: statsFailed === 0 && configFailed === 0 && seedFailed === 0, stats_schema_ok: statsOk, stats_schema_failed: statsFailed, config_schema_ok: configOk, config_schema_failed: configFailed, config_seed_ok: seedOk, config_seed_failed: seedFailed, failures: results };
}

async function pragmaColumns(db, table) {
  const res = await safeQueryAll(db, `PRAGMA table_info(${table})`);
  if (!res.ok) return { ok: false, table, error: res.error, columns: [], column_names: [] };
  const columns = res.rows || [];
  return { ok: true, table, columns, column_names: columns.map(r => r.name) };
}

function missingColumns(actual, required) {
  const set = new Set(actual || []);
  return required.filter(c => !set.has(c));
}

async function auditInputReadiness(env) {
  const logs = await pragmaColumns(env.STATS_PITCHER_DB, "pitcher_game_logs");
  const splits = await pragmaColumns(env.STATS_PITCHER_DB, "pitcher_splits");
  const logMissing = logs.ok ? missingColumns(logs.column_names, REQUIRED_PITCHER_LOG_COLUMNS) : REQUIRED_PITCHER_LOG_COLUMNS;
  const splitMissing = splits.ok ? missingColumns(splits.column_names, REQUIRED_PITCHER_SPLIT_COLUMNS) : REQUIRED_PITCHER_SPLIT_COLUMNS;

  const logCount = await safeQueryFirst(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS rows, COUNT(DISTINCT player_id) AS players, MIN(game_date) AS min_game_date, MAX(game_date) AS max_game_date FROM pitcher_game_logs");
  const splitCount = await safeQueryFirst(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS rows, COUNT(DISTINCT player_id) AS players, MIN(source_snapshot_date) AS min_snapshot_date, MAX(source_snapshot_date) AS max_snapshot_date FROM pitcher_splits");
  const roleCount = await safeQueryAll(env.STATS_PITCHER_DB, "SELECT COALESCE(role,'UNKNOWN') AS role, COUNT(*) AS rows FROM pitcher_game_logs GROUP BY COALESCE(role,'UNKNOWN') ORDER BY rows DESC LIMIT 20");
  const splitKeys = await safeQueryAll(env.STATS_PITCHER_DB, "SELECT COALESCE(split_key, split_code, 'UNKNOWN') AS split_key, COUNT(*) AS rows FROM pitcher_splits GROUP BY COALESCE(split_key, split_code, 'UNKNOWN') ORDER BY split_key LIMIT 20");

  return {
    ok: logs.ok && splits.ok && logMissing.length === 0 && splitMissing.length === 0 && !!(logCount.row && Number(logCount.row.rows) > 0) && !!(splitCount.row && Number(splitCount.row.rows) > 0),
    pitcher_game_logs: { schema_ok: logs.ok, column_count: logs.column_names.length, required_columns_missing: logMissing, counts: logCount.row, count_query_ok: logCount.ok, count_query_error: logCount.error || null, role_summary: roleCount.rows, role_query_ok: roleCount.ok, role_query_error: roleCount.error || null },
    pitcher_splits: { schema_ok: splits.ok, column_count: splits.column_names.length, required_columns_missing: splitMissing, counts: splitCount.row, count_query_ok: splitCount.ok, count_query_error: splitCount.error || null, split_key_summary: splitKeys.rows, split_key_query_ok: splitKeys.ok, split_key_query_error: splitKeys.error || null }
  };
}

async function auditConfigReadiness(env) {
  const tables = ["config_metric_definitions", "config_metric_windows", "config_metric_thresholds", "config_metric_formula_versions", "config_metric_calibration_profiles"];
  const tableChecks = {};
  for (const t of tables) {
    const cols = await pragmaColumns(env.CONFIG_DB, t);
    const count = await safeQueryFirst(env.CONFIG_DB, `SELECT COUNT(*) AS rows FROM ${t}`);
    tableChecks[t] = { schema_ok: cols.ok, column_count: cols.column_names.length, count_query_ok: count.ok, rows: count.row ? count.row.rows : null, error: cols.error || count.error || null };
  }
  const profile = await safeQueryFirst(env.CONFIG_DB, "SELECT profile_id, active, profile_status, profile_json FROM config_metric_calibration_profiles WHERE metric_domain='pitcher' AND profile_id=? LIMIT 1", [PROFILE_ID]);
  const formula = await safeQueryFirst(env.CONFIG_DB, "SELECT formula_version, active, version_status, formula_catalog_json FROM config_metric_formula_versions WHERE metric_domain='pitcher' AND formula_version=? LIMIT 1", [FORMULA_VERSION]);
  const windows = await safeQueryAll(env.CONFIG_DB, "SELECT window_key, metric_scope, window_type, window_size, enabled, sort_order FROM config_metric_windows WHERE metric_domain='pitcher' AND config_profile_id=? ORDER BY sort_order", [PROFILE_ID]);
  const thresholds = await safeQueryAll(env.CONFIG_DB, "SELECT threshold_key, threshold_type, threshold_value, label, enabled FROM config_metric_thresholds WHERE metric_domain='pitcher' AND config_profile_id=? ORDER BY threshold_key", [PROFILE_ID]);
  const definitions = await safeQueryAll(env.CONFIG_DB, "SELECT metric_key, metric_family, source_table, numerator_field, denominator_field, enabled FROM config_metric_definitions WHERE formula_version=? ORDER BY metric_family, metric_key", [FORMULA_VERSION]);
  return {
    ok: Object.values(tableChecks).every(v => v.schema_ok && v.count_query_ok) && !!profile.row && !!formula.row && windows.rows.length > 0 && thresholds.rows.length > 0 && definitions.rows.length > 0,
    profile_id: PROFILE_ID,
    formula_version: FORMULA_VERSION,
    table_checks: tableChecks,
    profile: profile.row,
    formula: formula.row ? { ...formula.row, formula_catalog_json: "present" } : null,
    windows: windows.rows,
    thresholds: thresholds.rows,
    metric_definitions_count: definitions.rows.length,
    metric_definitions_sample: definitions.rows.slice(0, 30),
    query_errors: [profile, formula, windows, thresholds, definitions].filter(x => !x.ok).map(x => x.error)
  };
}

function formulaReadiness(inputReadiness, configReadiness) {
  const logMissing = (inputReadiness.pitcher_game_logs && inputReadiness.pitcher_game_logs.required_columns_missing) || [];
  const splitMissing = (inputReadiness.pitcher_splits && inputReadiness.pitcher_splits.required_columns_missing) || [];
  const has = (name) => !logMissing.includes(name);
  const splitHas = (name) => !splitMissing.includes(name);
  return {
    ok_for_v0_1_0_audit: inputReadiness.ok && configReadiness.ok,
    production_formula_locked: false,
    promotion_locked: true,
    direct_aggregates: {
      ready: ["outs_recorded", "batters_faced", "pitches", "strikes", "hits_allowed", "runs_allowed", "earned_runs", "walks_allowed", "strikeouts", "home_runs_allowed"].filter(has),
      review_only_if_present: ["saves", "holds", "blown_saves", "wins", "losses"].filter(has),
      missing: ["outs_recorded", "batters_faced", "pitches", "strikes", "hits_allowed", "runs_allowed", "earned_runs", "walks_allowed", "strikeouts", "home_runs_allowed"].filter(c => !has(c))
    },
    denominator_safe_rate_candidates: {
      era: has("earned_runs") && has("outs_recorded") ? "ready_for_later_denominator_guarded_calculation" : "missing_inputs",
      whip: has("walks_allowed") && has("hits_allowed") && (has("innings_pitched_decimal") || has("outs_recorded")) ? "ready_for_later_denominator_guarded_calculation" : "missing_inputs",
      k_rate: has("strikeouts") && has("batters_faced") ? "ready_for_later_denominator_guarded_calculation" : "missing_inputs",
      bb_rate: has("walks_allowed") && has("batters_faced") ? "ready_for_later_denominator_guarded_calculation" : "missing_inputs",
      hr_rate: has("home_runs_allowed") && has("batters_faced") ? "ready_for_later_denominator_guarded_calculation" : "missing_inputs",
      strikes_per_pitch: has("strikes") && has("pitches") ? "ready_for_later_denominator_guarded_calculation" : "missing_inputs"
    },
    split_pass_through: {
      ready_fields: ["era", "whip", "avg_against", "obp_against", "slg_against", "ops_against", "batters_faced", "outs_recorded"].filter(splitHas),
      missing_fields: ["era", "whip", "avg_against", "obp_against", "slg_against", "ops_against", "batters_faced", "outs_recorded"].filter(c => !splitHas(c)),
      note: "v0.1.0 audits pass-through availability only; it does not recalculate split rates."
    },
    role_readiness_audit_only: {
      role_column_present: has("role"),
      starts_can_be_audited_from: has("role") ? "pitcher_game_logs.role plus starts fields if source-proven" : "missing_role_column",
      starter_reliever_weighting_deferred: true
    },
    deferred: formulaCatalog().deferred,
    review_flags: [
      ...(logMissing.length ? [`pitcher_game_logs_missing_required_columns:${logMissing.join(",")}`] : []),
      ...(splitMissing.length ? [`pitcher_splits_missing_required_columns:${splitMissing.join(",")}`] : []),
      "no_production_formula_lock_in_v0_1_0",
      "no_live_promotion_in_v0_1_0",
      "thresholds_are_config_db_driven"
    ]
  };
}

async function writeAuditBatch(env, input, schemaReadiness, inputReadiness, configReadiness, formulaReport) {
  const batchId = input.batch_id || rid("pitcher_metrics_audit_batch");
  const runId = input.run_id || rid("pitcher_metrics_audit_run");
  const logRows = Number(inputReadiness.pitcher_game_logs && inputReadiness.pitcher_game_logs.counts && inputReadiness.pitcher_game_logs.counts.rows || 0);
  const splitRows = Number(inputReadiness.pitcher_splits && inputReadiness.pitcher_splits.counts && inputReadiness.pitcher_splits.counts.rows || 0);
  const latestGame = inputReadiness.pitcher_game_logs && inputReadiness.pitcher_game_logs.counts ? inputReadiness.pitcher_game_logs.counts.max_game_date : null;
  const latestSplit = inputReadiness.pitcher_splits && inputReadiness.pitcher_splits.counts ? inputReadiness.pitcher_splits.counts.max_snapshot_date : null;
  const pitcherUniverse = Number(inputReadiness.pitcher_game_logs && inputReadiness.pitcher_game_logs.counts && inputReadiness.pitcher_game_logs.counts.players || 0);
  const certification = formulaReport.ok_for_v0_1_0_audit ? "PITCHER_METRICS_V0_1_0_SCHEMA_FORMULA_INPUT_AUDIT_PASS" : "PITCHER_METRICS_V0_1_0_SCHEMA_FORMULA_INPUT_AUDIT_REVIEW";
  const grade = formulaReport.ok_for_v0_1_0_audit ? "AUDIT_PASS_NO_PROMOTION" : "AUDIT_REVIEW_NO_PROMOTION";
  await execSql(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_metric_batches (
    batch_id, run_id, worker_name, worker_version, mode, status, data_feed_key, source_key, source_season,
    input_log_row_count, input_split_row_count, input_latest_game_date, input_latest_split_snapshot_date,
    expected_pitcher_universe_count, config_profile_id, formula_version, metric_catalog_json, formula_readiness_json,
    config_readiness_json, input_readiness_json, rows_staged, rows_promoted, duplicate_count, certification_status,
    certification_grade, certification_json, finished_at, notes, updated_at
  ) VALUES (?, ?, ?, ?, 'schema_formula_input_audit', 'COMPLETED_AUDIT_ONLY_NO_PROMOTION', ?, 'd1_internal_pitcher_game_logs_and_splits', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)`, [
    batchId, runId, WORKER_NAME, VERSION, DATA_FEED_KEY, Number(input.source_season || 2026), logRows, splitRows, latestGame, latestSplit, pitcherUniverse, PROFILE_ID, FORMULA_VERSION, JSON.stringify(formulaCatalog()), JSON.stringify(formulaReport), JSON.stringify(configReadiness), JSON.stringify(inputReadiness), certification, grade, JSON.stringify({ schema_readiness: schemaReadiness, no_promotion: true, no_source_mutation: true, no_external_calls: true }), "v0.1.0 audit-only batch. No metric stage rows, no snapshots, no live promotion."
  ]);
  await execSql(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_metric_certifications (certification_id, batch_id, run_id, certification_status, certification_grade, rows_staged, rows_promoted, duplicate_count, input_log_row_count, input_split_row_count, validation_json) VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?)`, [rid("pitcher_metrics_audit_cert"), batchId, runId, certification, grade, logRows, splitRows, JSON.stringify({ formula_report: formulaReport, config_readiness: configReadiness, input_readiness: inputReadiness })]);
  await execSql(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_metric_cursor (cursor_key, mode, status, batch_id, run_id, source_season, players_total, players_processed, last_game_date, last_split_snapshot_date, requests_done, no_external_calls, cursor_json, updated_at) VALUES ('pitcher_metrics_v0_1_0_audit_cursor', 'schema_formula_input_audit', 'COMPLETED_AUDIT_ONLY_NO_PROMOTION', ?, ?, ?, ?, 0, ?, ?, 0, 1, ?, CURRENT_TIMESTAMP)`, [batchId, runId, Number(input.source_season || 2026), pitcherUniverse, latestGame, latestSplit, JSON.stringify({ no_promotion: true, next_phase: "v0.2.0 sample-stage calibration only after review" })]);
  return { batch_id: batchId, run_id: runId, certification, certification_grade: grade, rows_written: 3 };
}

async function runAudit(input, env) {
  const schemaReadiness = await ensureSchema(env);
  const inputReadiness = await auditInputReadiness(env);
  const configReadiness = await auditConfigReadiness(env);
  const formulaReport = formulaReadiness(inputReadiness, configReadiness);
  const batch = await writeAuditBatch(env, input, schemaReadiness, inputReadiness, configReadiness, formulaReport);
  const ok = schemaReadiness.ok && inputReadiness.ok && configReadiness.ok;
  return {
    ok,
    data_ok: ok,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: input.job_key || JOB_KEY,
    request_id: input.request_id || null,
    chain_id: input.chain_id || null,
    run_id: batch.run_id,
    batch_id: batch.batch_id,
    mode: "schema_formula_input_audit",
    status: ok ? "COMPLETED_AUDIT_ONLY_NO_PROMOTION" : "COMPLETED_AUDIT_WITH_REVIEW_FLAGS_NO_PROMOTION",
    certification: batch.certification,
    certification_grade: batch.certification_grade,
    rows_read: Number(inputReadiness.pitcher_game_logs.counts && inputReadiness.pitcher_game_logs.counts.rows || 0) + Number(inputReadiness.pitcher_splits.counts && inputReadiness.pitcher_splits.counts.rows || 0),
    rows_written: batch.rows_written,
    external_calls_performed: 0,
    live_promotion_performed: false,
    source_table_mutation_performed: false,
    scoring_performed: false,
    ranking_performed: false,
    final_board_write_performed: false,
    allowed_next_phase: "v0.2.0 sample-stage calibration only after review",
    blocked_downstream_reason: "v0.1.0 is audit-only; full base stage, snapshot prep, live promotion, delta, and scoring are intentionally blocked.",
    schema_readiness: schemaReadiness,
    input_readiness: inputReadiness,
    config_readiness: configReadiness,
    formula_readiness: formulaReport,
    output_json: {
      profile_id: PROFILE_ID,
      formula_version: FORMULA_VERSION,
      data_feed_key: DATA_FEED_KEY,
      no_mlb_calls: true,
      no_source_mutation: true,
      no_promotion: true,
      mirrors_hitter_metrics_path: ["v0.1.0 audit only", "v0.2.0 sample-stage calibration only", "v0.3.x full base stage only", "snapshot prep", "live snapshot promotion after review", "retained-stage/live repair and no-op gate"]
    },
    timestamp_utc: nowUtc()
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();
    if (method === "GET" && path === "/") return jsonResponse(baseIdentity(env));
    if (method === "GET" && path === "/health") {
      const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
      const vars = varPresence(env, EXPECTED_VARS);
      const secrets = varPresence(env, REQUIRED_SECRETS);
      return jsonResponse({ ...baseIdentity(env), route: "/health", checks: { db_bindings: db, vars, secrets_present_only: secrets }, safe_secret_note: "Secret values are intentionally never printed." });
    }
    if (method === "POST" && path === "/diagnostic") {
      const input = await readJsonSafe(request);
      const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
      const vars = varPresence(env, EXPECTED_VARS);
      const secrets = varPresence(env, REQUIRED_SECRETS);
      return jsonResponse({ ...baseIdentity(env), route: "/diagnostic", input_echo_safe: { request_id: input.request_id || null, chain_id: input.chain_id || null, job_key: input.job_key || null, mode: input.mode || null }, diagnostics: { db_bindings: db, vars, secrets_present_only: secrets }, writes_performed: 0, external_calls_performed: 0 });
    }
    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      const missingDb = REQUIRED_DB_BINDINGS.filter(name => !env[name]);
      if (missingDb.length) return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "BLOCKED_MISSING_DB_BINDINGS", missing_db_bindings: missingDb, external_calls_performed: 0, rows_written: 0 }, 500);
      try { return jsonResponse(await runAudit(input, env)); }
      catch (err) { return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: input.job_key || JOB_KEY, request_id: input.request_id || null, status: "AUDIT_WORKER_EXCEPTION", certification: "PITCHER_METRICS_V0_1_0_AUDIT_EXCEPTION", error: String(err && err.message ? err.message : err), stack: String(err && err.stack ? err.stack : "").slice(0, 2000), rows_written: 0, external_calls_performed: 0, timestamp_utc: nowUtc() }, 500); }
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
