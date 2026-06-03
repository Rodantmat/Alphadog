const WORKER_NAME = "alphadog-v2-score-audit";
const LOGICAL_WORKER_NAME = "alphadog-v2-scoring-engine";
const VERSION = "alphadog-v2-scoring-engine-v0.2.3-db-config-score-confidence-precap-side";
const JOB_KEY = "scoring-engine";
const PROFILE_KEY = "SCORING_FRAMEWORK_V0_1_PROFILE_GATE";
const PROFILE_VERSION = "0.2.1";
const ARCHIVE_SCORE_THRESHOLD = 70;

function nowUtc() {
  return new Date().toISOString();
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

async function readJsonSafe(request) {
  try {
    return await request.json();
  } catch (_) {
    return {};
  }
}

async function run(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  return binds.length ? stmt.bind(...binds).run() : stmt.run();
}

async function first(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  return binds.length ? stmt.bind(...binds).first() : stmt.first();
}

async function all(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  const res = binds.length ? await stmt.bind(...binds).all() : await stmt.all();
  return res && res.results ? res.results : [];
}

async function tableColumns(db, tableName) {
  const rows = await db.prepare(`PRAGMA table_info(${tableName})`).all();
  return new Set((rows && rows.results ? rows.results : []).map(r => String(r.name)));
}

async function addColumnIfMissing(db, tableName, columnName, columnSql) {
  const cols = await tableColumns(db, tableName);
  if (!cols.has(columnName)) {
    await run(db, `ALTER TABLE ${tableName} ADD COLUMN ${columnSql}`);
    return true;
  }
  return false;
}

function baseIdentity(extra = {}) {
  return {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    logical_worker_name: LOGICAL_WORKER_NAME,
    job_key: JOB_KEY,
    status: "READY",
    timestamp_utc: nowUtc(),
    framework_only: true,
    thresholds_locked: false,
    archive_score_threshold_locked: ARCHIVE_SCORE_THRESHOLD,
    final_qualification_threshold_locked: false,
    no_true_hit_probability_claims: true,
    no_ranking: true,
    no_final_board: true,
    no_candidate_board_write: true,
    ...extra
  };
}

function requireBindings(env) {
  const missing = [];
  for (const key of ["SCORE_DB", "ARCHIVE_DB"]) {
    if (!env || !env[key]) missing.push(key);
  }
  return missing;
}

async function ensureScoreSchema(env) {
  await run(env.SCORE_DB, `
    CREATE TABLE IF NOT EXISTS scoring_engine_batches (
      batch_id TEXT PRIMARY KEY,
      profile_key TEXT,
      profile_version TEXT,
      worker_version TEXT,
      job_key TEXT,
      status TEXT,
      certification TEXT,
      certification_grade TEXT,
      matrix_rows_read INTEGER DEFAULT 0,
      score_rows_written INTEGER DEFAULT 0,
      archive_rows_written INTEGER DEFAULT 0,
      thresholds_locked INTEGER DEFAULT 0,
      archive_score_threshold REAL DEFAULT 70,
      final_qualification_threshold REAL,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      finished_at TEXT,
      output_json TEXT
    )
  `);

  await run(env.SCORE_DB, `
    CREATE TABLE IF NOT EXISTS scoring_engine_profiles_current (
      profile_key TEXT PRIMARY KEY,
      profile_version TEXT NOT NULL,
      profile_status TEXT NOT NULL,
      profile_mode TEXT NOT NULL,
      thresholds_locked INTEGER DEFAULT 0,
      scoring_enabled INTEGER DEFAULT 0,
      archive_score_threshold REAL DEFAULT 70,
      final_qualification_threshold REAL,
      true_probability_enabled INTEGER DEFAULT 0,
      formula_metadata_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(env.SCORE_DB, `
    CREATE TABLE IF NOT EXISTS scoring_engine_current (
      score_row_id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      matrix_id TEXT,
      prepared_row_id TEXT,
      source_line_id TEXT,
      source_key TEXT,
      game_pk INTEGER,
      official_date TEXT,
      official_game_time_utc TEXT,
      mlb_player_id INTEGER,
      player_name TEXT,
      canonical_prop_key TEXT,
      line_value REAL,
      variation_key TEXT,
      source_line_type TEXT,
      odds_type TEXT,
      payout_variant TEXT,
      side_mode TEXT,
      available_sides_json TEXT,
      selected_side TEXT,
      more_score_0_100 REAL,
      less_score_0_100 REAL,
      score_0_100 REAL,
      score_status TEXT,
      score_grade TEXT,
      side_eligibility_status TEXT,
      side_eligibility_reason TEXT,
      side_availability_status TEXT,
      goblin_demon_under_blocker TEXT,
      profile_key TEXT,
      profile_version TEXT,
      thresholds_locked INTEGER DEFAULT 0,
      archive_score_threshold REAL DEFAULT 70,
      archive_eligible INTEGER DEFAULT 0,
      archive_written INTEGER DEFAULT 0,
      calculation_json TEXT,
      matrix_payload_json_snapshot TEXT,
      details_json_snapshot TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);


  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_current', 'variation_key', 'variation_key TEXT');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_current', 'selected_side', 'selected_side TEXT');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_current', 'more_score_0_100', 'more_score_0_100 REAL');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_current', 'less_score_0_100', 'less_score_0_100 REAL');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_current', 'score_0_100', 'score_0_100 REAL');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_current', 'side_mode', 'side_mode TEXT');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_current', 'available_sides_json', 'available_sides_json TEXT');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_current', 'side_eligibility_status', 'side_eligibility_status TEXT');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_current', 'side_eligibility_reason', 'side_eligibility_reason TEXT');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_current', 'goblin_demon_under_blocker', 'goblin_demon_under_blocker TEXT');
  await run(env.SCORE_DB, `CREATE INDEX IF NOT EXISTS idx_scoring_engine_current_prepared ON scoring_engine_current(prepared_row_id)`);
  await run(env.SCORE_DB, `CREATE INDEX IF NOT EXISTS idx_scoring_engine_current_variation ON scoring_engine_current(variation_key)`);
  await run(env.SCORE_DB, `CREATE INDEX IF NOT EXISTS idx_scoring_engine_current_source_prop ON scoring_engine_current(source_key, canonical_prop_key)`);
  await run(env.SCORE_DB, `CREATE INDEX IF NOT EXISTS idx_scoring_engine_current_score_status ON scoring_engine_current(score_status)`);

  await run(env.SCORE_DB, `
    CREATE TABLE IF NOT EXISTS scoring_engine_issues (
      issue_id TEXT PRIMARY KEY,
      batch_id TEXT,
      issue_key TEXT,
      severity TEXT,
      issue_count INTEGER DEFAULT 0,
      issue_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(env.ARCHIVE_DB, `
    CREATE TABLE IF NOT EXISTS scoring_engine_archive_snapshots (
      archive_id TEXT PRIMARY KEY,
      score_row_id TEXT,
      batch_id TEXT,
      prepared_row_id TEXT,
      source_line_id TEXT,
      source_key TEXT,
      game_pk INTEGER,
      official_date TEXT,
      mlb_player_id INTEGER,
      canonical_prop_key TEXT,
      line_value REAL,
      variation_key TEXT,
      selected_side TEXT,
      score_0_100 REAL,
      source_line_type TEXT,
      odds_type TEXT,
      payout_variant TEXT,
      side_mode TEXT,
      side_eligibility_status TEXT,
      side_eligibility_reason TEXT,
      profile_key TEXT,
      profile_version TEXT,
      archive_score_threshold REAL,
      calculation_json TEXT,
      volatile_context_snapshot_json TEXT,
      archived_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(env.ARCHIVE_DB, `CREATE INDEX IF NOT EXISTS idx_scoring_engine_archive_prepared ON scoring_engine_archive_snapshots(prepared_row_id)`);
  await run(env.ARCHIVE_DB, `CREATE INDEX IF NOT EXISTS idx_scoring_engine_archive_variation ON scoring_engine_archive_snapshots(variation_key)`);
}

async function seedFrameworkProfile(env) {
  await run(env.SCORE_DB, `
    INSERT OR REPLACE INTO scoring_engine_profiles_current (
      profile_key,
      profile_version,
      profile_status,
      profile_mode,
      thresholds_locked,
      scoring_enabled,
      archive_score_threshold,
      final_qualification_threshold,
      true_probability_enabled,
      formula_metadata_json,
      updated_at
    ) VALUES (?, ?, 'active_framework_gate', 'framework_schema_and_identity_only', 0, 0, ?, NULL, 0, ?, CURRENT_TIMESTAMP)
  `,
    PROFILE_KEY,
    PROFILE_VERSION,
    ARCHIVE_SCORE_THRESHOLD,
    JSON.stringify({
      worker_version: VERSION,
      scoring_formula_locked: false,
      thresholds_locked: false,
      archive_score_threshold_locked: true,
      archive_score_threshold: ARCHIVE_SCORE_THRESHOLD,
      final_qualification_threshold_locked: false,
      no_true_hit_probability_claims: true,
      selected_side_locked: false,
      reason: "Framework-only profile gate. Mobile parity v0.1.1 preserves one row per matrix-eligible variation and required side fields before real scoring profile/thresholds are locked."
    })
  );
}

function issueId(batchId, key) {
  return `issue|${batchId}|${key}`;
}

async function writeIssue(env, batchId, key, severity, count, payload) {
  await run(env.SCORE_DB, `
    INSERT OR REPLACE INTO scoring_engine_issues (issue_id, batch_id, issue_key, severity, issue_count, issue_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `, issueId(batchId, key), batchId, key, severity, Number(count || 0), JSON.stringify(payload || {}));
}


function requireSimulationBindings(env) {
  const missing = [];
  if (!env || !env.SCORE_DB) missing.push("SCORE_DB");
  return missing;
}

async function ensureSimulationSchema(env) {
  await run(env.SCORE_DB, `
    CREATE TABLE IF NOT EXISTS scoring_engine_simulation_batches (
      simulation_batch_id TEXT PRIMARY KEY,
      worker_version TEXT,
      job_key TEXT,
      status TEXT,
      certification TEXT,
      certification_grade TEXT,
      matrix_rows_read INTEGER DEFAULT 0,
      simulation_rows_written INTEGER DEFAULT 0,
      strict_b_rows_written INTEGER DEFAULT 0,
      hybrid_control_rows_written INTEGER DEFAULT 0,
      thresholds_locked INTEGER DEFAULT 0,
      scoring_enabled INTEGER DEFAULT 0,
      true_probability_enabled INTEGER DEFAULT 0,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      finished_at TEXT,
      output_json TEXT
    )
  `);

  await run(env.SCORE_DB, `
    CREATE TABLE IF NOT EXISTS scoring_engine_simulation_shadow (
      simulation_row_id TEXT PRIMARY KEY,
      simulation_batch_id TEXT NOT NULL,
      profile_key TEXT NOT NULL,
      profile_version TEXT,
      matrix_id TEXT,
      prepared_row_id TEXT,
      source_line_id TEXT,
      source_key TEXT,
      game_pk INTEGER,
      official_date TEXT,
      official_game_time_utc TEXT,
      mlb_player_id INTEGER,
      player_name TEXT,
      canonical_prop_key TEXT,
      line_value REAL,
      variation_key TEXT,
      source_line_type TEXT,
      odds_type TEXT,
      payout_variant TEXT,
      side_mode TEXT,
      available_sides_json TEXT,
      matrix_status TEXT,
      matrix_grade TEXT,
      factor_status TEXT,
      market_game_context_status TEXT,
      market_prop_context_status TEXT,
      daily_readiness_status TEXT,
      blocking_for_scoring INTEGER DEFAULT 0,
      warning_count INTEGER DEFAULT 0,
      blocker_count INTEGER DEFAULT 0,
      missing_component_count INTEGER DEFAULT 0,
      structural_cap REAL,
      penalty_total REAL,
      bonus_total REAL DEFAULT 0,
      raw_more_score REAL,
      raw_less_score REAL,
      more_score_0_100 REAL,
      less_score_0_100 REAL,
      score_0_100 REAL,
      selected_side TEXT,
      score_status TEXT,
      score_grade TEXT,
      archive_eligible INTEGER DEFAULT 0,
      invariant_violation_count INTEGER DEFAULT 0,
      calculation_json TEXT,
      matrix_payload_json_snapshot TEXT,
      details_json_snapshot TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_simulation_batches', 'formula_metadata_json', 'formula_metadata_json TEXT');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_simulation_batches', 'profile_config_snapshot_json', 'profile_config_snapshot_json TEXT');

  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_simulation_shadow', 'confidence_0_100', 'confidence_0_100 REAL');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_simulation_shadow', 'confidence_status', 'confidence_status TEXT');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_simulation_shadow', 'live_playable', 'live_playable INTEGER DEFAULT 0');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_simulation_shadow', 'model_deferred', 'model_deferred INTEGER DEFAULT 0');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_simulation_shadow', 'model_deferred_reason', 'model_deferred_reason TEXT');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_simulation_shadow', 'score_sort_0_100', 'score_sort_0_100 REAL');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_simulation_shadow', 'score_integer_0_100', 'score_integer_0_100 REAL');

  await run(env.SCORE_DB, `
    CREATE TABLE IF NOT EXISTS scoring_engine_simulation_profile_configs (
      profile_key TEXT PRIMARY KEY,
      profile_version TEXT NOT NULL,
      profile_status TEXT NOT NULL,
      config_json TEXT NOT NULL,
      formula_metadata_json TEXT NOT NULL,
      thresholds_locked INTEGER DEFAULT 0,
      scoring_enabled INTEGER DEFAULT 0,
      true_probability_enabled INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(env.SCORE_DB, `
    CREATE TABLE IF NOT EXISTS scoring_engine_simulation_issues (
      issue_id TEXT PRIMARY KEY,
      simulation_batch_id TEXT,
      profile_key TEXT,
      issue_key TEXT,
      severity TEXT,
      issue_count INTEGER DEFAULT 0,
      issue_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(env.SCORE_DB, `CREATE INDEX IF NOT EXISTS idx_scoring_sim_shadow_batch_profile ON scoring_engine_simulation_shadow(simulation_batch_id, profile_key)`);
  await run(env.SCORE_DB, `CREATE INDEX IF NOT EXISTS idx_scoring_sim_shadow_bins ON scoring_engine_simulation_shadow(profile_key, score_grade)`);
  await run(env.SCORE_DB, `CREATE INDEX IF NOT EXISTS idx_scoring_sim_shadow_variation ON scoring_engine_simulation_shadow(variation_key)`);
  await run(env.SCORE_DB, `CREATE INDEX IF NOT EXISTS idx_scoring_sim_issue_batch_profile ON scoring_engine_simulation_issues(simulation_batch_id, profile_key)`);
}

function simIssueId(batchId, profileKey, key) {
  return `sim_issue|${batchId}|${profileKey}|${key}`;
}

async function writeSimIssue(env, batchId, profileKey, key, severity, count, payload) {
  await run(env.SCORE_DB, `
    INSERT OR REPLACE INTO scoring_engine_simulation_issues (issue_id, simulation_batch_id, profile_key, issue_key, severity, issue_count, issue_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `, simIssueId(batchId, profileKey, key), batchId, profileKey, key, severity, Number(count || 0), JSON.stringify(payload || {}));
}

function sqlStringLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function finiteNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sqlCaseFromMap(expression, map, fallback) {
  const entries = Object.entries(map || {}).filter(([k]) => k !== "default");
  const elseValue = finiteNumber((map || {}).default, fallback);
  const parts = [`CASE COALESCE(${expression}, '__null__')`];
  for (const [key, value] of entries) {
    parts.push(`WHEN ${sqlStringLiteral(key)} THEN ${finiteNumber(value, elseValue)}`);
  }
  parts.push(`ELSE ${elseValue} END`);
  return parts.join(" ");
}

function simulationFormulaMetadata() {
  return {
    formula_key: "SCORING_SIMULATION_V0_2_3_DB_CONFIG_SCORE_CONFIDENCE_PRECAP_SIDE",
    worker_version: VERSION,
    simulation_only: true,
    active_values_source: "SCORE_DB.scoring_engine_simulation_profile_configs.config_json",
    all_calibration_variables_db_stored: true,
    thresholds_locked: false,
    scoring_enabled: false,
    true_probability_enabled: false,
    no_true_hit_probability_claims: true,
    no_final_board: true,
    no_ranking: true,
    execution_order: [
      "inventory_defer_gate",
      "raw_more_raw_less_generation_from_db_config",
      "goblin_demon_more_only_sanitization",
      "pre_cap_side_selection_raw_delta",
      "selected_side_score_penalties_from_db_config",
      "score_cap_and_score_integer",
      "confidence_penalties_and_caps_from_db_config",
      "score_sort_micro_adjustment_for_sort_only",
      "archive_and_live_playable_gates",
      "zero_fail_invariants"
    ]
  };
}

const DEFAULT_SIM_CONFIGS = {
  HYBRID_CONTROL: {
    profile_version: "0.2.3-control-db-config",
    config: {
      min_live_score: 70,
      min_live_confidence: 55,
      archive_score_threshold: 70,
      grade_archive_min: 70,
      grade_qualified_min: 76,
      grade_strong_min: 82,
      grade_elite_min: 88,
      raw_side_delta_threshold: 0.50,
      base_raw_packet_ready: 82,
      base_raw_packet_partial: 76,
      raw_less_delta_from_more: 1,
      max_score_cap: 100,
      base_confidence: 100,
      score_sort_micro_scale: 0.0001,
      clean_bonus_score: 0,
      market_raw_adjustments: { market_prop_context_present: 4, market_prop_context_not_found: -4, market_prop_context_missing: -6, default: -2 },
      daily_raw_adjustments: { ready_with_warnings: 0, partial_enrichment: -5, default: 1 },
      source_raw_adjustments: { sleeper: -1, default: 0 },
      odds_raw_adjustments: { goblin: -4, demon: -4, default: 0 },
      prop_raw_adjustments: { pitcher_strikeouts: 3, hits: 2, total_bases: -2, hits_runs_rbis: -2, home_runs: -4, stolen_bases: -4, earned_runs_allowed: -3, hits_allowed: -3, pitcher_outs: -1, pitching_outs: -1, default: 0 },
      score_penalty_market_not_found: 4,
      score_penalty_market_missing: 6,
      score_penalty_complete_market_blindness: 10,
      score_penalty_packet_partial: 3,
      score_penalty_partial_enrichment: 4,
      confidence_cap_market_not_found: 65,
      confidence_cap_market_missing: 54,
      confidence_cap_complete_market_blindness: 45,
      confidence_cap_warning_9_plus: 50,
      confidence_penalty_packet_partial: 10,
      confidence_penalty_partial_enrichment: 15,
      confidence_penalty_sleeper_null_odds: 5,
      confidence_penalty_warning_6_8: 8,
      confidence_penalty_warning_3_5: 4,
      confidence_penalty_warning_9_plus: 20,
      model_deferred_rules: { sleeper_rfi_nrfi: "model_deferred_rfi_nrfi", prizepicks_triples: "model_deferred_low_event_prop" }
    }
  },
  STRICT_B: {
    profile_version: "0.2.3-strict-b-db-config",
    config: {
      min_live_score: 70,
      min_live_confidence: 55,
      archive_score_threshold: 70,
      grade_archive_min: 70,
      grade_qualified_min: 76,
      grade_strong_min: 82,
      grade_elite_min: 88,
      raw_side_delta_threshold: 0.50,
      base_raw_packet_ready: 82,
      base_raw_packet_partial: 76,
      raw_less_delta_from_more: 1,
      max_score_cap: 100,
      base_confidence: 100,
      score_sort_micro_scale: 0.0001,
      clean_bonus_score: 0,
      market_raw_adjustments: { market_prop_context_present: 4, market_prop_context_not_found: -4, market_prop_context_missing: -6, default: -2 },
      daily_raw_adjustments: { ready_with_warnings: 0, partial_enrichment: -5, default: 1 },
      source_raw_adjustments: { sleeper: -1, default: 0 },
      odds_raw_adjustments: { goblin: -4, demon: -4, default: 0 },
      prop_raw_adjustments: { pitcher_strikeouts: 3, hits: 2, total_bases: -2, hits_runs_rbis: -2, home_runs: -4, stolen_bases: -4, earned_runs_allowed: -3, hits_allowed: -3, pitcher_outs: -1, pitching_outs: -1, default: 0 },
      score_penalty_market_not_found: 8,
      score_penalty_market_missing: 10,
      score_penalty_complete_market_blindness: 14,
      score_penalty_packet_partial: 6,
      score_penalty_partial_enrichment: 8,
      confidence_cap_market_not_found: 60,
      confidence_cap_market_missing: 50,
      confidence_cap_complete_market_blindness: 40,
      confidence_cap_warning_9_plus: 45,
      confidence_penalty_packet_partial: 15,
      confidence_penalty_partial_enrichment: 20,
      confidence_penalty_sleeper_null_odds: 5,
      confidence_penalty_warning_6_8: 10,
      confidence_penalty_warning_3_5: 5,
      confidence_penalty_warning_9_plus: 25,
      model_deferred_rules: { sleeper_rfi_nrfi: "model_deferred_rfi_nrfi", prizepicks_triples: "model_deferred_low_event_prop" }
    }
  }
};

async function ensureSimulationProfileConfigs(env) {
  const metadata = simulationFormulaMetadata();
  for (const [profileKey, spec] of Object.entries(DEFAULT_SIM_CONFIGS)) {
    await run(env.SCORE_DB, `
      INSERT OR IGNORE INTO scoring_engine_simulation_profile_configs (
        profile_key, profile_version, profile_status, config_json, formula_metadata_json,
        thresholds_locked, scoring_enabled, true_probability_enabled, created_at, updated_at
      ) VALUES (?, ?, 'active_simulation_only', ?, ?, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, profileKey, spec.profile_version, JSON.stringify(spec.config), JSON.stringify(metadata));
  }
}

async function profileConstants(env, profileKey) {
  await ensureSimulationProfileConfigs(env);
  const row = await first(env.SCORE_DB, `
    SELECT profile_key, profile_version, config_json, formula_metadata_json, thresholds_locked, scoring_enabled, true_probability_enabled
    FROM scoring_engine_simulation_profile_configs
    WHERE profile_key=? AND profile_status='active_simulation_only'
    LIMIT 1
  `, profileKey);
  if (!row) throw new Error(`missing_active_simulation_profile_config:${profileKey}`);
  const cfg = JSON.parse(row.config_json || "{}");
  const metadata = JSON.parse(row.formula_metadata_json || "{}");
  return {
    profileKey,
    version: String(row.profile_version || cfg.profile_version || "0.2.3-db-config"),
    config: cfg,
    formulaMetadata: metadata,
    thresholds_locked: Number(row.thresholds_locked || 0),
    scoring_enabled: Number(row.scoring_enabled || 0),
    true_probability_enabled: Number(row.true_probability_enabled || 0),
    rawSideDeltaThreshold: finiteNumber(cfg.raw_side_delta_threshold, 0.5),
    rawLessDeltaFromMore: finiteNumber(cfg.raw_less_delta_from_more, 1),
    baseRawPacketReady: finiteNumber(cfg.base_raw_packet_ready, 82),
    baseRawPacketPartial: finiteNumber(cfg.base_raw_packet_partial, 76),
    maxScoreCap: finiteNumber(cfg.max_score_cap, 100),
    baseConfidence: finiteNumber(cfg.base_confidence, 100),
    archiveScoreThreshold: finiteNumber(cfg.archive_score_threshold, 70),
    minLiveScore: finiteNumber(cfg.min_live_score, 70),
    minLiveConfidence: finiteNumber(cfg.min_live_confidence, 55),
    gradeArchiveMin: finiteNumber(cfg.grade_archive_min, 70),
    gradeQualifiedMin: finiteNumber(cfg.grade_qualified_min, 76),
    gradeStrongMin: finiteNumber(cfg.grade_strong_min, 82),
    gradeEliteMin: finiteNumber(cfg.grade_elite_min, 88),
    microScale: finiteNumber(cfg.score_sort_micro_scale, 0.0001),
    cleanBonusScore: finiteNumber(cfg.clean_bonus_score, 0),
    marketRawCase: sqlCaseFromMap("m.market_prop_context_status", cfg.market_raw_adjustments, -2),
    dailyRawCase: sqlCaseFromMap("m.daily_readiness_status", cfg.daily_raw_adjustments, 0),
    sourceRawCase: sqlCaseFromMap("m.source_key", cfg.source_raw_adjustments, 0),
    oddsRawCase: sqlCaseFromMap("json_extract(m.matrix_payload_json, '$.prepared.odds_type')", cfg.odds_raw_adjustments, 0),
    propRawCase: sqlCaseFromMap("m.canonical_prop_key", cfg.prop_raw_adjustments, 0),
    scorePenaltyMarketNotFound: finiteNumber(cfg.score_penalty_market_not_found, 4),
    scorePenaltyMarketMissing: finiteNumber(cfg.score_penalty_market_missing, 6),
    scorePenaltyCompleteMarketBlindness: finiteNumber(cfg.score_penalty_complete_market_blindness, 10),
    scorePenaltyPacketPartial: finiteNumber(cfg.score_penalty_packet_partial, 3),
    scorePenaltyPartialEnrichment: finiteNumber(cfg.score_penalty_partial_enrichment, 4),
    confidenceCapMarketNotFound: finiteNumber(cfg.confidence_cap_market_not_found, 65),
    confidenceCapMarketMissing: finiteNumber(cfg.confidence_cap_market_missing, 54),
    confidenceCapCompleteMarketBlindness: finiteNumber(cfg.confidence_cap_complete_market_blindness, 45),
    confidenceCapWarning9Plus: finiteNumber(cfg.confidence_cap_warning_9_plus, 50),
    confidencePenaltyPacketPartial: finiteNumber(cfg.confidence_penalty_packet_partial, 10),
    confidencePenaltyPartialEnrichment: finiteNumber(cfg.confidence_penalty_partial_enrichment, 15),
    confidencePenaltySleeperNullOdds: finiteNumber(cfg.confidence_penalty_sleeper_null_odds, 5),
    confidencePenaltyWarning68: finiteNumber(cfg.confidence_penalty_warning_6_8, 8),
    confidencePenaltyWarning35: finiteNumber(cfg.confidence_penalty_warning_3_5, 4),
    confidencePenaltyWarning9Plus: finiteNumber(cfg.confidence_penalty_warning_9_plus, 20)
  };
}

async function insertSimulationProfileChunk(env, batchId, profileKey, cursorMatrixId, chunkSize) {
  const p = await profileConstants(env, profileKey);
  await run(env.SCORE_DB, `
    INSERT INTO scoring_engine_simulation_shadow (
      simulation_row_id, simulation_batch_id, profile_key, profile_version,
      matrix_id, prepared_row_id, source_line_id, source_key, game_pk, official_date, official_game_time_utc,
      mlb_player_id, player_name, canonical_prop_key, line_value, variation_key, source_line_type, odds_type, payout_variant,
      side_mode, available_sides_json, matrix_status, matrix_grade, factor_status, market_game_context_status,
      market_prop_context_status, daily_readiness_status, blocking_for_scoring, warning_count, blocker_count,
      missing_component_count, structural_cap, penalty_total, bonus_total, raw_more_score, raw_less_score,
      more_score_0_100, less_score_0_100, score_0_100, selected_side, score_status, score_grade,
      archive_eligible, invariant_violation_count, calculation_json, matrix_payload_json_snapshot, details_json_snapshot,
      confidence_0_100, confidence_status, live_playable, model_deferred, model_deferred_reason,
      score_sort_0_100, score_integer_0_100,
      created_at, updated_at
    )
    WITH base AS (
      SELECT
        m.*,
        json_extract(m.matrix_payload_json, '$.variation_context.variation_key') AS v_variation_key,
        json_extract(m.matrix_payload_json, '$.prepared.source_line_type') AS v_source_line_type,
        json_extract(m.matrix_payload_json, '$.prepared.odds_type') AS v_odds_type,
        json_extract(m.matrix_payload_json, '$.prepared.payout_variant') AS v_payout_variant,
        json_extract(m.matrix_payload_json, '$.side_context.side_mode') AS v_side_mode,
        json_extract(m.matrix_payload_json, '$.side_context.available_sides') AS v_available_sides_json,
        CASE
          WHEN m.source_key = 'sleeper' AND m.canonical_prop_key = 'rfi_nrfi' THEN 1
          WHEN m.source_key = 'prizepicks' AND m.canonical_prop_key = 'triples' THEN 1
          ELSE 0
        END AS model_deferred_calc,
        CASE
          WHEN m.source_key = 'sleeper' AND m.canonical_prop_key = 'rfi_nrfi' THEN 'model_deferred_rfi_nrfi'
          WHEN m.source_key = 'prizepicks' AND m.canonical_prop_key = 'triples' THEN 'model_deferred_low_event_prop'
          ELSE NULL
        END AS model_deferred_reason_calc,
        CASE
          WHEN NOT (m.source_key = 'sleeper' AND m.canonical_prop_key = 'rfi_nrfi')
           AND NOT (m.source_key = 'prizepicks' AND m.canonical_prop_key = 'triples')
           AND (COALESCE(m.blocking_for_scoring,0) = 1 OR m.matrix_status = 'matrix_deferred' OR m.factor_status = 'blocked') THEN 1
          ELSE 0
        END AS hard_blocked,
        CASE
          WHEN m.market_prop_context_status IN ('market_prop_context_missing','market_prop_context_not_found')
           AND COALESCE(m.market_game_context_status,'') IN ('','market_game_context_missing','market_game_context_not_found','market_game_context_absent') THEN 1
          ELSE 0
        END AS complete_market_blind_calc,
        CASE WHEN m.factor_status = 'packet_ready' THEN ${p.baseRawPacketReady} ELSE ${p.baseRawPacketPartial} END
          + ${p.marketRawCase}
          + ${p.dailyRawCase}
          + ${p.sourceRawCase}
          + ${p.propRawCase}
          + ${p.oddsRawCase} AS raw_more_pre
      FROM prop_matrix_current m
      WHERE (? IS NULL OR m.matrix_id > ?)
      ORDER BY m.matrix_id
      LIMIT ?
    ), rawed AS (
      SELECT
        base.*,
        MAX(0, MIN(100, raw_more_pre)) AS raw_more_score_calc,
        CASE WHEN v_side_mode = 'two_sided' THEN MAX(0, MIN(100, raw_more_pre - ${p.rawLessDeltaFromMore})) ELSE NULL END AS raw_less_score_calc
      FROM base
    ), side_selected AS (
      SELECT
        rawed.*,
        CASE
          WHEN hard_blocked = 1 OR model_deferred_calc = 1 THEN NULL
          WHEN v_side_mode = 'more_only' THEN 'more'
          WHEN v_side_mode = 'two_sided' AND raw_more_score_calc IS NOT NULL AND raw_less_score_calc IS NOT NULL AND (raw_more_score_calc - raw_less_score_calc) >= ${p.rawSideDeltaThreshold} THEN 'more'
          WHEN v_side_mode = 'two_sided' AND raw_more_score_calc IS NOT NULL AND raw_less_score_calc IS NOT NULL AND (raw_less_score_calc - raw_more_score_calc) >= ${p.rawSideDeltaThreshold} THEN 'less'
          WHEN v_side_mode = 'two_sided' AND raw_more_score_calc IS NOT NULL AND raw_less_score_calc IS NOT NULL AND ABS(raw_more_score_calc - raw_less_score_calc) < ${p.rawSideDeltaThreshold} AND raw_more_score_calc > raw_less_score_calc THEN 'more'
          WHEN v_side_mode = 'two_sided' AND raw_more_score_calc IS NOT NULL AND raw_less_score_calc IS NOT NULL AND ABS(raw_more_score_calc - raw_less_score_calc) < ${p.rawSideDeltaThreshold} AND raw_less_score_calc > raw_more_score_calc THEN 'less'
          ELSE NULL
        END AS selected_side_calc
      FROM rawed
    ), penalties AS (
      SELECT
        side_selected.*,
        (
          CASE WHEN complete_market_blind_calc = 1 THEN ${p.scorePenaltyCompleteMarketBlindness} ELSE 0 END +
          CASE WHEN complete_market_blind_calc = 0 AND market_prop_context_status = 'market_prop_context_missing' THEN ${p.scorePenaltyMarketMissing} ELSE 0 END +
          CASE WHEN complete_market_blind_calc = 0 AND market_prop_context_status = 'market_prop_context_not_found' THEN ${p.scorePenaltyMarketNotFound} ELSE 0 END +
          CASE WHEN factor_status = 'packet_partial' THEN ${p.scorePenaltyPacketPartial} ELSE 0 END +
          CASE WHEN daily_readiness_status = 'partial_enrichment' THEN ${p.scorePenaltyPartialEnrichment} ELSE 0 END
        ) AS penalty_total_calc,
        CASE
          WHEN hard_blocked = 1 OR model_deferred_calc = 1 THEN 0
          WHEN market_prop_context_status = 'market_prop_context_present' AND COALESCE(warning_count,0) = 0 AND factor_status = 'packet_ready' AND daily_readiness_status <> 'partial_enrichment' THEN ${p.cleanBonusScore}
          ELSE 0
        END AS bonus_calc,
        (
          CASE WHEN factor_status = 'packet_partial' THEN ${p.confidencePenaltyPacketPartial} ELSE 0 END +
          CASE WHEN daily_readiness_status = 'partial_enrichment' THEN ${p.confidencePenaltyPartialEnrichment} ELSE 0 END +
          CASE WHEN source_key = 'sleeper' AND v_odds_type IS NULL THEN ${p.confidencePenaltySleeperNullOdds} ELSE 0 END +
          CASE WHEN COALESCE(warning_count,0) >= 9 THEN ${p.confidencePenaltyWarning9Plus} ELSE 0 END +
          CASE WHEN COALESCE(warning_count,0) BETWEEN 6 AND 8 THEN ${p.confidencePenaltyWarning68} ELSE 0 END +
          CASE WHEN COALESCE(warning_count,0) BETWEEN 3 AND 5 THEN ${p.confidencePenaltyWarning35} ELSE 0 END
        ) AS confidence_penalty_total_calc,
        MIN(
          100,
          CASE WHEN complete_market_blind_calc = 1 THEN ${p.confidenceCapCompleteMarketBlindness} ELSE 100 END,
          CASE WHEN complete_market_blind_calc = 0 AND market_prop_context_status = 'market_prop_context_missing' THEN ${p.confidenceCapMarketMissing} ELSE 100 END,
          CASE WHEN complete_market_blind_calc = 0 AND market_prop_context_status = 'market_prop_context_not_found' THEN ${p.confidenceCapMarketNotFound} ELSE 100 END,
          CASE WHEN COALESCE(warning_count,0) >= 9 THEN ${p.confidenceCapWarning9Plus} ELSE 100 END
        ) AS confidence_cap_calc
      FROM side_selected
    ), scored AS (
      SELECT
        penalties.*,
        ${p.maxScoreCap} AS structural_cap_calc,
        CASE
          WHEN hard_blocked = 1 OR model_deferred_calc = 1 OR selected_side_calc IS NULL THEN NULL
          WHEN selected_side_calc = 'more' THEN MIN(${p.maxScoreCap}, MAX(0, MIN(100, raw_more_score_calc - penalty_total_calc + bonus_calc)))
          WHEN selected_side_calc = 'less' THEN MIN(${p.maxScoreCap}, MAX(0, MIN(100, raw_less_score_calc - penalty_total_calc + bonus_calc)))
          ELSE NULL
        END AS score_integer_calc,
        CASE
          WHEN hard_blocked = 1 OR model_deferred_calc = 1 OR selected_side_calc IS NULL THEN NULL
          ELSE MIN(confidence_cap_calc, MAX(0, MIN(100, ${p.baseConfidence} - confidence_penalty_total_calc)))
        END AS confidence_calc,
        (((COALESCE(mlb_player_id,0) * 31 + COALESCE(game_pk,0) * 17 + CAST(COALESCE(board_line_value,0) * 100 AS INTEGER) * 13) % 999) - 499) * ${p.microScale} / 999.0 AS sort_micro_adjustment_calc
      FROM penalties
    ), final AS (
      SELECT
        scored.*,
        CASE WHEN selected_side_calc = 'more' THEN score_integer_calc ELSE NULL END AS more_final,
        CASE WHEN v_side_mode = 'more_only' THEN NULL WHEN selected_side_calc = 'less' THEN score_integer_calc WHEN selected_side_calc = 'more' THEN MIN(${p.maxScoreCap}, MAX(0, MIN(100, raw_less_score_calc - penalty_total_calc + bonus_calc))) ELSE NULL END AS less_final,
        CASE WHEN score_integer_calc IS NULL THEN NULL ELSE score_integer_calc + sort_micro_adjustment_calc END AS score_sort_calc,
        CASE
          WHEN model_deferred_calc = 1 THEN 'model_deferred'
          WHEN hard_blocked = 1 THEN 'simulation_hard_blocked'
          WHEN selected_side_calc IS NULL THEN 'simulation_side_tie_unresolved'
          ELSE 'simulated_profile_locked'
        END AS score_status_calc,
        CASE
          WHEN model_deferred_calc = 1 THEN 'BIN_MODEL_DEFERRED'
          WHEN hard_blocked = 1 THEN 'BIN_HARD_BLOCK'
          WHEN score_integer_calc IS NULL THEN 'BIN_0_NULL'
          WHEN score_integer_calc >= ${p.gradeEliteMin} THEN 'BIN_ELITE'
          WHEN score_integer_calc >= ${p.gradeStrongMin} THEN 'BIN_STRONG'
          WHEN score_integer_calc >= ${p.gradeQualifiedMin} THEN 'BIN_QUALIFIED'
          WHEN score_integer_calc >= ${p.gradeArchiveMin} THEN 'BIN_ARCHIVE'
          ELSE 'BIN_REJECT'
        END AS score_grade_calc,
        CASE
          WHEN confidence_calc IS NULL THEN NULL
          WHEN confidence_calc >= ${p.minLiveConfidence} THEN 'confidence_live_eligible'
          ELSE 'confidence_archive_only'
        END AS confidence_status_calc,
        CASE
          WHEN model_deferred_calc = 0 AND hard_blocked = 0 AND selected_side_calc IS NOT NULL
           AND score_integer_calc >= ${p.minLiveScore}
           AND confidence_calc >= ${p.minLiveConfidence}
          THEN 1 ELSE 0
        END AS live_playable_calc,
        CASE
          WHEN model_deferred_calc = 0 AND hard_blocked = 0 AND selected_side_calc IS NOT NULL AND score_integer_calc >= ${p.archiveScoreThreshold}
          THEN 1 ELSE 0
        END AS archive_eligible_calc
      FROM scored
    )
    SELECT
      ? || '|sim|' || COALESCE(matrix_id, prepared_row_id, source_line_id, player_name || '|' || canonical_prop_key) AS simulation_row_id,
      ? AS simulation_batch_id,
      ? AS profile_key,
      ? AS profile_version,
      matrix_id, prepared_row_id, source_line_id, source_key, game_pk, official_date, official_game_time_utc,
      mlb_player_id, player_name, canonical_prop_key, board_line_value AS line_value,
      v_variation_key AS variation_key, v_source_line_type AS source_line_type, v_odds_type AS odds_type, v_payout_variant AS payout_variant,
      v_side_mode AS side_mode, v_available_sides_json AS available_sides_json,
      matrix_status, matrix_grade, factor_status, market_game_context_status, market_prop_context_status, daily_readiness_status,
      COALESCE(blocking_for_scoring,0), COALESCE(warning_count,0), COALESCE(blocker_count,0), COALESCE(missing_component_count,0),
      structural_cap_calc, penalty_total_calc, bonus_calc, raw_more_score_calc, raw_less_score_calc,
      more_final,
      CASE WHEN v_side_mode = 'more_only' THEN NULL ELSE less_final END,
      score_integer_calc AS score_0_100,
      selected_side_calc AS selected_side,
      score_status_calc,
      score_grade_calc,
      archive_eligible_calc,
      0 AS invariant_violation_count,
      json_object(
        'worker_version', ?,
        'simulation_only', 1,
        'profile_key', ?,
        'profile_version', ?,
        'active_values_source', 'SCORE_DB.scoring_engine_simulation_profile_configs.config_json',
        'all_calibration_variables_db_stored', 1,
        'formula_order', 'inventory_defer_gate -> db_config_raw_side_scores -> pre_cap_side_selection -> score_penalties -> score_cap -> confidence_caps_penalties -> score_sort_micro_adjustment -> archive_live_gates',
        'raw_side_delta_threshold', ${p.rawSideDeltaThreshold},
        'min_live_score', ${p.minLiveScore},
        'min_live_confidence', ${p.minLiveConfidence},
        'archive_score_threshold', ${p.archiveScoreThreshold},
        'thresholds_locked', 0,
        'scoring_enabled', 0,
        'true_probability_enabled', 0,
        'no_true_hit_probability_claims', 1,
        'score_sort_policy', 'score_sort_0_100_only; never used for archive/live/bins',
        'goblin_demon_less_score_policy', 'NULL_NOT_ZERO',
        'dedupe_deferred_to_ranking_final_board', 1
      ) AS calculation_json,
      matrix_payload_json,
      details_json,
      confidence_calc,
      confidence_status_calc,
      live_playable_calc,
      model_deferred_calc,
      model_deferred_reason_calc,
      score_sort_calc,
      score_integer_calc,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    FROM final
  `, cursorMatrixId, cursorMatrixId, chunkSize, profileKey, batchId, profileKey, p.version, VERSION, profileKey, p.version);
}

async function insertSimulationProfile(env, batchId, profileKey) {
  const chunkSize = 200;
  let cursorMatrixId = null;
  let insertedRows = 0;
  let processedChunks = 0;
  while (true) {
    const chunkRows = await all(
      env.SCORE_DB,
      `SELECT matrix_id FROM prop_matrix_current WHERE (? IS NULL OR matrix_id > ?) ORDER BY matrix_id LIMIT ?`,
      cursorMatrixId,
      cursorMatrixId,
      chunkSize
    );
    if (!chunkRows.length) break;
    await insertSimulationProfileChunk(env, batchId, profileKey, cursorMatrixId, chunkSize);
    insertedRows += chunkRows.length;
    processedChunks += 1;
    cursorMatrixId = chunkRows[chunkRows.length - 1].matrix_id;
    if (processedChunks > 1000) throw new Error('scoring_simulation_chunk_guard_exceeded');
  }
  const countRow = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM scoring_engine_simulation_shadow WHERE simulation_batch_id=? AND profile_key=?`, batchId, profileKey);
  return Number(countRow && countRow.rows ? countRow.rows : insertedRows);
}

async function summarizeSimulationProfile(env, batchId, profileKey) {
  const row = await first(env.SCORE_DB, `
    SELECT
      COUNT(*) AS simulation_rows,
      SUM(CASE WHEN score_status = 'simulation_hard_blocked' THEN 1 ELSE 0 END) AS hard_blocked_rows,
      SUM(CASE WHEN score_status = 'model_deferred' THEN 1 ELSE 0 END) AS model_deferred_rows,
      SUM(CASE WHEN score_status = 'simulation_side_tie_unresolved' THEN 1 ELSE 0 END) AS side_unresolved_rows,
      SUM(CASE WHEN score_grade = 'BIN_REJECT' THEN 1 ELSE 0 END) AS reject_rows,
      SUM(CASE WHEN score_grade = 'BIN_ARCHIVE' THEN 1 ELSE 0 END) AS archive_rows,
      SUM(CASE WHEN score_grade = 'BIN_QUALIFIED' THEN 1 ELSE 0 END) AS qualified_rows,
      SUM(CASE WHEN score_grade = 'BIN_STRONG' THEN 1 ELSE 0 END) AS strong_rows,
      SUM(CASE WHEN score_grade = 'BIN_ELITE' THEN 1 ELSE 0 END) AS elite_rows,
      SUM(CASE WHEN score_0_100 >= 70 THEN 1 ELSE 0 END) AS rows_70_plus,
      SUM(CASE WHEN score_0_100 >= 76 THEN 1 ELSE 0 END) AS rows_76_plus,
      SUM(CASE WHEN score_0_100 >= 82 THEN 1 ELSE 0 END) AS rows_82_plus,
      SUM(CASE WHEN score_0_100 >= 88 THEN 1 ELSE 0 END) AS rows_88_plus,
      SUM(CASE WHEN selected_side IS NOT NULL AND score_0_100 IS NULL THEN 1 ELSE 0 END) AS selected_side_without_score,
      SUM(CASE WHEN side_mode = 'more_only' AND less_score_0_100 IS NOT NULL THEN 1 ELSE 0 END) AS more_only_less_score_not_null,
      SUM(CASE WHEN source_key = 'prizepicks' AND odds_type IN ('goblin','demon') AND selected_side = 'less' THEN 1 ELSE 0 END) AS goblin_demon_less_selected,
      SUM(CASE WHEN score_status IN ('simulation_hard_blocked','model_deferred') AND (score_0_100 IS NOT NULL OR archive_eligible = 1 OR live_playable = 1 OR selected_side IS NOT NULL) THEN 1 ELSE 0 END) AS blocked_or_deferred_score_leak,
      SUM(CASE WHEN live_playable = 1 AND confidence_0_100 < 55 THEN 1 ELSE 0 END) AS live_playable_confidence_under_55,
      SUM(CASE WHEN live_playable = 1 AND score_0_100 < 70 THEN 1 ELSE 0 END) AS live_playable_score_under_70,
      SUM(CASE WHEN live_playable = 1 AND selected_side IS NULL THEN 1 ELSE 0 END) AS live_playable_null_side,
      SUM(CASE WHEN side_mode = 'two_sided' AND raw_more_score IS NOT NULL AND raw_less_score IS NOT NULL AND ABS(raw_more_score - raw_less_score) >= 0.50 AND selected_side IS NULL AND model_deferred = 0 THEN 1 ELSE 0 END) AS raw_delta_selectable_but_null_side,
      SUM(CASE WHEN side_mode = 'two_sided' AND raw_more_score IS NOT NULL AND raw_less_score IS NOT NULL AND ABS(raw_more_score - raw_less_score) < 0.50 AND selected_side IS NULL AND model_deferred = 0 THEN 1 ELSE 0 END) AS true_micro_tie_null_side,
      SUM(CASE WHEN source_key = 'sleeper' AND canonical_prop_key = 'rfi_nrfi' AND score_status <> 'model_deferred' THEN 1 ELSE 0 END) AS sleeper_rfi_not_deferred,
      SUM(CASE WHEN source_key = 'prizepicks' AND canonical_prop_key = 'triples' AND score_status <> 'model_deferred' THEN 1 ELSE 0 END) AS prizepicks_triples_not_deferred,
      SUM(CASE WHEN score_sort_0_100 IS NOT NULL AND ABS(score_sort_0_100 - score_integer_0_100) >= 0.0001 THEN 1 ELSE 0 END) AS score_sort_micro_out_of_bounds,
      SUM(CASE WHEN score_sort_0_100 IS NOT NULL AND CAST(score_sort_0_100 AS INTEGER) <> CAST(score_integer_0_100 AS INTEGER) THEN 1 ELSE 0 END) AS score_sort_integer_boundary_cross
    FROM scoring_engine_simulation_shadow
    WHERE simulation_batch_id=? AND profile_key=?
  `, batchId, profileKey);
  const out = {};
  for (const [k, v] of Object.entries(row || {})) out[k] = Number(v || 0);
  return out;
}

async function recordSimulationInvariants(env, batchId, profileKey, summary) {
  const checks = [
    ["BLOCKED_OR_DEFERRED_SCORE_LEAK", summary.blocked_or_deferred_score_leak, "BLOCKER", "Hard-blocked or model-deferred rows must not receive score, selected_side, archive_eligible, or live_playable."],
    ["SELECTED_SIDE_WITHOUT_SCORE", summary.selected_side_without_score, "BLOCKER", "No selected_side may exist without score_0_100."],
    ["MORE_ONLY_LESS_SCORE_NOT_NULL", summary.more_only_less_score_not_null, "BLOCKER", "More-only Goblin/Demon rows must keep less_score_0_100 NULL."],
    ["GOBLIN_DEMON_LESS_SELECTED", summary.goblin_demon_less_selected, "BLOCKER", "Goblin/Demon cannot select Less/Under."],
    ["LIVE_PLAYABLE_CONFIDENCE_UNDER_55", summary.live_playable_confidence_under_55, "BLOCKER", "No live_playable row can have confidence_0_100 below 55."],
    ["LIVE_PLAYABLE_SCORE_UNDER_70", summary.live_playable_score_under_70, "BLOCKER", "No live_playable row can have score_0_100 below 70."],
    ["LIVE_PLAYABLE_NULL_SIDE", summary.live_playable_null_side, "BLOCKER", "No live_playable row can have selected_side NULL."],
    ["RAW_DELTA_SELECTABLE_BUT_NULL_SIDE", summary.raw_delta_selectable_but_null_side, "BLOCKER", "Two-sided rows with raw side delta >= 0.50 must select a side before cap/compression."],
    ["SLEEPER_RFI_NOT_DEFERRED", summary.sleeper_rfi_not_deferred, "BLOCKER", "Sleeper rfi_nrfi inventory must route to model_deferred."],
    ["PRIZEPICKS_TRIPLES_NOT_DEFERRED", summary.prizepicks_triples_not_deferred, "BLOCKER", "PrizePicks triples inventory must route to model_deferred_low_event_prop."],
    ["SCORE_SORT_MICRO_OUT_OF_BOUNDS", summary.score_sort_micro_out_of_bounds, "BLOCKER", "score_sort_0_100 micro adjustment must stay below 0.0001 from score_integer_0_100."],
    ["SCORE_SORT_INTEGER_BOUNDARY_CROSS", summary.score_sort_integer_boundary_cross, "BLOCKER", "score_sort_0_100 must never cross an integer boundary."],
    ["MODEL_DEFERRED_COUNT_NOT_26", summary.model_deferred_rows !== 26 ? summary.model_deferred_rows : 0, "BLOCKER", "Expected exactly 26 model_deferred rows per profile from current matrix snapshot."],
    ["TRUE_MICRO_TIE_REVIEW", summary.true_micro_tie_null_side, "WARNING", "True raw side ties should be very rare and require deterministic tie-breaker review if present."]
  ];
  for (const [key, count, severity, note] of checks) {
    await writeSimIssue(env, batchId, profileKey, key, Number(count || 0) > 0 ? severity : "INFO", Number(count || 0), { note });
  }
}

async function runScoringSimulation(env, input) {
  const missingBindings = requireSimulationBindings(env);
  if (missingBindings.length) {
    return baseIdentity({
      ok: false,
      data_ok: false,
      status: "blocked_missing_bindings",
      certification: "SCORING_SIMULATION_BINDINGS_MISSING",
      certification_grade: "BLOCKED",
      missing_bindings: missingBindings
    });
  }

  await ensureSimulationSchema(env);
  await ensureSimulationProfileConfigs(env);
  const requestId = input.request_id || `scoring_simulation_${Date.now().toString(36)}`;
  const chainId = input.chain_id || null;
  const batchId = `scoring_simulation_batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const started = Date.now();
  const matrixCountRow = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM prop_matrix_current`);
  const matrixRows = Number(matrixCountRow && matrixCountRow.rows ? matrixCountRow.rows : 0);

  await run(env.SCORE_DB, `
    INSERT INTO scoring_engine_simulation_batches (
      simulation_batch_id, worker_version, job_key, status, certification, certification_grade,
      matrix_rows_read, simulation_rows_written, thresholds_locked, scoring_enabled, true_probability_enabled,
      formula_metadata_json, profile_config_snapshot_json, started_at
    ) VALUES (?, ?, 'scoring-engine-simulation', 'running', 'SCORING_SIMULATION_STARTED', 'RUNNING', ?, 0, 0, 0, 0, ?, ?, CURRENT_TIMESTAMP)
  `, batchId, VERSION, matrixRows, JSON.stringify(simulationFormulaMetadata()), JSON.stringify(DEFAULT_SIM_CONFIGS));

  await run(env.SCORE_DB, `DELETE FROM scoring_engine_simulation_shadow`);
  await run(env.SCORE_DB, `DELETE FROM scoring_engine_simulation_issues`);

  if (matrixRows <= 0) {
    const output = baseIdentity({
      request_id: requestId,
      chain_id: chainId,
      simulation_batch_id: batchId,
      status: "blocked_no_matrix_rows",
      certification: "SCORING_SIMULATION_BLOCKED_NO_MATRIX_ROWS",
      certification_grade: "BLOCKED",
      matrix_rows_read: 0,
      simulation_rows_written: 0,
      thresholds_locked: false,
      scoring_enabled: false
    });
    await run(env.SCORE_DB, `UPDATE scoring_engine_simulation_batches SET status='blocked', certification=?, certification_grade='BLOCKED', finished_at=CURRENT_TIMESTAMP, output_json=? WHERE simulation_batch_id=?`, output.certification, JSON.stringify(output), batchId);
    return output;
  }

  const strictRows = await insertSimulationProfile(env, batchId, "STRICT_B");
  const hybridRows = await insertSimulationProfile(env, batchId, "HYBRID_CONTROL");
  const strictSummary = await summarizeSimulationProfile(env, batchId, "STRICT_B");
  const hybridSummary = await summarizeSimulationProfile(env, batchId, "HYBRID_CONTROL");
  await recordSimulationInvariants(env, batchId, "STRICT_B", strictSummary);
  await recordSimulationInvariants(env, batchId, "HYBRID_CONTROL", hybridSummary);

  const strictBlockersRow = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM scoring_engine_simulation_issues WHERE simulation_batch_id=? AND profile_key='STRICT_B' AND severity='BLOCKER' AND issue_count > 0`, batchId);
  const strictWarningsRow = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM scoring_engine_simulation_issues WHERE simulation_batch_id=? AND profile_key='STRICT_B' AND severity='WARNING' AND issue_count > 0`, batchId);
  const hybridBlockersRow = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM scoring_engine_simulation_issues WHERE simulation_batch_id=? AND profile_key='HYBRID_CONTROL' AND severity='BLOCKER' AND issue_count > 0`, batchId);
  const strictBlockers = Number(strictBlockersRow && strictBlockersRow.rows ? strictBlockersRow.rows : 0);
  const strictWarnings = Number(strictWarningsRow && strictWarningsRow.rows ? strictWarningsRow.rows : 0);
  const hybridBlockers = Number(hybridBlockersRow && hybridBlockersRow.rows ? hybridBlockersRow.rows : 0);
  const simulationRowsWritten = strictRows + hybridRows;

  const certification = strictBlockers > 0
    ? "SCORING_SIMULATION_V0_2_3_DB_CONFIG_BLOCKED_BY_INVARIANTS"
    : (strictWarnings > 0 ? "SCORING_SIMULATION_V0_2_3_DB_CONFIG_PASS_WITH_REVIEW_WARNINGS" : "SCORING_SIMULATION_V0_2_3_DB_CONFIG_CERTIFIED_FOR_PROFILE_REVIEW");
  const certificationGrade = strictBlockers > 0 ? "BLOCKED" : (strictWarnings > 0 ? "PASS_WITH_REVIEW_WARNINGS" : "PASS_SIMULATION_REVIEW_READY");
  const status = strictBlockers > 0 ? "completed_simulation_with_strict_b_blockers" : "completed_simulation_shadow_only";

  const output = baseIdentity({
    request_id: requestId,
    chain_id: chainId,
    simulation_batch_id: batchId,
    status,
    certification,
    certification_grade: certificationGrade,
    simulation_only: true,
    profile_under_review: "STRICT_B",
    comparison_profile: "HYBRID_CONTROL",
    chunked_d1_memory_mode: true,
    simulation_chunk_size: 200,
    matrix_rows_read: matrixRows,
    simulation_rows_written: simulationRowsWritten,
    strict_b_rows_written: strictRows,
    hybrid_control_rows_written: hybridRows,
    strict_b_blocker_issue_count: strictBlockers,
    strict_b_warning_issue_count: strictWarnings,
    hybrid_control_blocker_issue_count: hybridBlockers,
    strict_b_summary: strictSummary,
    hybrid_control_summary: hybridSummary,
    shadow_table: "SCORE_DB.scoring_engine_simulation_shadow",
    issue_table: "SCORE_DB.scoring_engine_simulation_issues",
    batch_table: "SCORE_DB.scoring_engine_simulation_batches",
    scoring_engine_current_mutated: false,
    archive_db_mutated: false,
    thresholds_locked: false,
    scoring_enabled: false,
    true_probability_enabled: false,
    selected_side_policy: "Two-sided selected_side is chosen from raw pre-cap side scores using DB-configured raw_side_delta_threshold; Goblin/Demon are more_only and Less remains NULL.",
    notes: [
      "Simulation writes only to SCORE_DB.scoring_engine_simulation_shadow and related simulation audit tables.",
      "v0.2.3 keeps chunked D1 inserts and moves tunable scoring variables into SCORE_DB.scoring_engine_simulation_profile_configs.",
      "score_0_100 and confidence_0_100 are separated; live_playable requires score/confidence gates and never uses score_sort_0_100.",
      "score_sort_0_100 is deterministic sort-only micro-adjustment and never controls archive/live/bin thresholds.",
      "Strict-B is the primary safety profile; Hybrid-Control is comparison only and is not production-approved.",
      "No true hit probability, ranking, final board, candidate board, or archive snapshot is produced."
    ],
    elapsed_ms: Date.now() - started
  });

  await run(env.SCORE_DB, `
    UPDATE scoring_engine_simulation_batches
    SET status=?, certification=?, certification_grade=?, simulation_rows_written=?, strict_b_rows_written=?, hybrid_control_rows_written=?, finished_at=CURRENT_TIMESTAMP, output_json=?
    WHERE simulation_batch_id=?
  `, status, certification, certificationGrade, simulationRowsWritten, strictRows, hybridRows, JSON.stringify(output), batchId);

  return output;
}

async function runScoringEngine(env, input) {
  const missingBindings = requireBindings(env);
  if (missingBindings.length) {
    return baseIdentity({
      ok: false,
      data_ok: false,
      status: "blocked_missing_bindings",
      certification: "SCORING_ENGINE_BINDINGS_MISSING",
      certification_grade: "BLOCKED",
      missing_bindings: missingBindings
    });
  }

  await ensureScoreSchema(env);
  await seedFrameworkProfile(env);

  const requestId = input.request_id || `scoring_engine_${Date.now().toString(36)}`;
  const chainId = input.chain_id || null;
  const batchId = `scoring_engine_batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const started = Date.now();

  const matrixCountRow = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM prop_matrix_current`);
  const matrixRows = Number(matrixCountRow && matrixCountRow.rows ? matrixCountRow.rows : 0);

  await run(env.SCORE_DB, `
    INSERT INTO scoring_engine_batches (
      batch_id, profile_key, profile_version, worker_version, job_key, status, certification, certification_grade,
      matrix_rows_read, score_rows_written, archive_rows_written, thresholds_locked, archive_score_threshold, final_qualification_threshold, started_at
    ) VALUES (?, ?, ?, ?, ?, 'running', 'SCORING_ENGINE_FRAMEWORK_STARTED', 'RUNNING', ?, 0, 0, 0, ?, NULL, CURRENT_TIMESTAMP)
  `, batchId, PROFILE_KEY, PROFILE_VERSION, VERSION, JOB_KEY, matrixRows, ARCHIVE_SCORE_THRESHOLD);

  if (matrixRows <= 0) {
    await writeIssue(env, batchId, "NO_MATRIX_ROWS", "BLOCKER", 1, { reason: "prop_matrix_current has zero rows" });
    const output = baseIdentity({
      request_id: requestId,
      chain_id: chainId,
      batch_id: batchId,
      status: "blocked_no_matrix_rows",
      certification: "SCORING_ENGINE_BLOCKED_NO_MATRIX_ROWS",
      certification_grade: "BLOCKED",
      matrix_rows_read: 0,
      score_rows_written: 0,
      archive_rows_written: 0
    });
    await run(env.SCORE_DB, `UPDATE scoring_engine_batches SET status='blocked', certification=?, certification_grade='BLOCKED', finished_at=CURRENT_TIMESTAMP, output_json=? WHERE batch_id=?`, output.certification, JSON.stringify(output), batchId);
    return output;
  }

  await run(env.SCORE_DB, `DELETE FROM scoring_engine_current`);
  await run(env.SCORE_DB, `DELETE FROM scoring_engine_issues`);

  await run(env.SCORE_DB, `
    INSERT INTO scoring_engine_current (
      score_row_id,
      batch_id,
      matrix_id,
      prepared_row_id,
      source_line_id,
      source_key,
      game_pk,
      official_date,
      official_game_time_utc,
      mlb_player_id,
      player_name,
      canonical_prop_key,
      line_value,
      variation_key,
      source_line_type,
      odds_type,
      payout_variant,
      side_mode,
      available_sides_json,
      selected_side,
      more_score_0_100,
      less_score_0_100,
      score_0_100,
      score_status,
      score_grade,
      side_eligibility_status,
      side_eligibility_reason,
      side_availability_status,
      goblin_demon_under_blocker,
      profile_key,
      profile_version,
      thresholds_locked,
      archive_score_threshold,
      archive_eligible,
      archive_written,
      calculation_json,
      matrix_payload_json_snapshot,
      details_json_snapshot,
      created_at,
      updated_at
    )
    SELECT
      'score|' || COALESCE(m.matrix_id, m.prepared_row_id, CAST(rowid AS TEXT)) AS score_row_id,
      ? AS batch_id,
      m.matrix_id,
      m.prepared_row_id,
      m.source_line_id,
      m.source_key,
      m.game_pk,
      m.official_date,
      m.official_game_time_utc,
      m.mlb_player_id,
      m.player_name,
      m.canonical_prop_key,
      m.board_line_value AS line_value,
      json_extract(m.matrix_payload_json, '$.variation_context.variation_key') AS variation_key,
      json_extract(m.matrix_payload_json, '$.prepared.source_line_type') AS source_line_type,
      json_extract(m.matrix_payload_json, '$.prepared.odds_type') AS odds_type,
      json_extract(m.matrix_payload_json, '$.prepared.payout_variant') AS payout_variant,
      json_extract(m.matrix_payload_json, '$.side_context.side_mode') AS side_mode,
      json_extract(m.matrix_payload_json, '$.side_context.available_sides') AS available_sides_json,
      NULL AS selected_side,
      NULL AS more_score_0_100,
      NULL AS less_score_0_100,
      NULL AS score_0_100,
      CASE
        WHEN COALESCE(m.blocking_for_scoring, 0) = 1 THEN 'blocked_by_matrix'
        WHEN json_extract(m.matrix_payload_json, '$.side_context.side_mode') IS NULL THEN 'blocked_missing_side_context'
        WHEN json_extract(m.matrix_payload_json, '$.variation_context.variation_key') IS NULL THEN 'blocked_missing_variation_key'
        ELSE 'framework_profile_pending_no_score'
      END AS score_status,
      CASE
        WHEN COALESCE(m.blocking_for_scoring, 0) = 1 THEN 'BLOCKED'
        WHEN json_extract(m.matrix_payload_json, '$.side_context.side_mode') IS NULL THEN 'BLOCKED'
        WHEN json_extract(m.matrix_payload_json, '$.variation_context.variation_key') IS NULL THEN 'BLOCKED'
        ELSE 'FRAMEWORK_READY_PROFILE_PENDING'
      END AS score_grade,
      json_extract(m.matrix_payload_json, '$.side_context.side_eligibility_status') AS side_eligibility_status,
      json_extract(m.matrix_payload_json, '$.side_context.side_eligibility_reason') AS side_eligibility_reason,
      json_extract(m.matrix_payload_json, '$.side_context.side_availability_status') AS side_availability_status,
      json_extract(m.matrix_payload_json, '$.side_context.goblin_demon_under_blocker') AS goblin_demon_under_blocker,
      ? AS profile_key,
      ? AS profile_version,
      0 AS thresholds_locked,
      ? AS archive_score_threshold,
      0 AS archive_eligible,
      0 AS archive_written,
      json_object(
        'worker_version', ?,
        'profile_key', ?,
        'profile_version', ?,
        'framework_only', 1,
        'score_calculated', 0,
        'score_not_calculated_reason', 'SCORING_PROFILE_AND_THRESHOLDS_NOT_LOCKED',
        'archive_score_threshold_locked', 1,
        'archive_score_threshold', ?,
        'final_qualification_threshold_locked', 0,
        'true_probability_enabled', 0,
        'no_true_hit_probability_claims', 1,
        'side_selection_pending_profile', 1,
        'deduplication_deferred_to_ranking_final_board', 1
      ) AS calculation_json,
      m.matrix_payload_json AS matrix_payload_json_snapshot,
      m.details_json AS details_json_snapshot,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    FROM prop_matrix_current m
  `, batchId, PROFILE_KEY, PROFILE_VERSION, ARCHIVE_SCORE_THRESHOLD, VERSION, PROFILE_KEY, PROFILE_VERSION, ARCHIVE_SCORE_THRESHOLD);

  const currentCount = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM scoring_engine_current WHERE batch_id = ?`, batchId);
  const scoreRowsWritten = Number(currentCount && currentCount.rows ? currentCount.rows : 0);

  const missingSide = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM scoring_engine_current WHERE batch_id = ? AND side_mode IS NULL`, batchId);
  const missingVariation = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM scoring_engine_current WHERE batch_id = ? AND variation_key IS NULL`, batchId);
  const blockedMatrix = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM scoring_engine_current WHERE batch_id = ? AND score_status = 'blocked_by_matrix'`, batchId);
  const goblinDemonBad = await first(env.SCORE_DB, `
    SELECT COUNT(*) AS rows
    FROM scoring_engine_current
    WHERE batch_id = ?
      AND source_key = 'prizepicks'
      AND odds_type IN ('goblin','demon')
      AND (side_mode <> 'more_only' OR available_sides_json <> '["more"]' OR goblin_demon_under_blocker <> 'GOBLIN_DEMON_UNDER_NOT_SELECTABLE')
  `, batchId);

  await writeIssue(env, batchId, "MATRIX_BLOCKED_ROWS_PRESERVED", "INFO", Number(blockedMatrix && blockedMatrix.rows ? blockedMatrix.rows : 0), { meaning: "Rows blocked by matrix are preserved in scoring_engine_current but not scored." });
  await writeIssue(env, batchId, "MISSING_SIDE_CONTEXT", Number(missingSide && missingSide.rows ? missingSide.rows : 0) > 0 ? "BLOCKER" : "INFO", Number(missingSide && missingSide.rows ? missingSide.rows : 0), { required_payload_path: "matrix_payload_json.side_context" });
  await writeIssue(env, batchId, "MISSING_VARIATION_KEY", Number(missingVariation && missingVariation.rows ? missingVariation.rows : 0) > 0 ? "BLOCKER" : "INFO", Number(missingVariation && missingVariation.rows ? missingVariation.rows : 0), { required_payload_path: "matrix_payload_json.variation_context.variation_key" });
  await writeIssue(env, batchId, "GOBLIN_DEMON_SIDE_RULE_VIOLATION", Number(goblinDemonBad && goblinDemonBad.rows ? goblinDemonBad.rows : 0) > 0 ? "BLOCKER" : "INFO", Number(goblinDemonBad && goblinDemonBad.rows ? goblinDemonBad.rows : 0), { required_rule: "PrizePicks goblin/demon rows must be more_only with available_sides [more] and blocker GOBLIN_DEMON_UNDER_NOT_SELECTABLE." });

  const hardIssueRow = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM scoring_engine_issues WHERE batch_id = ? AND severity = 'BLOCKER' AND issue_count > 0`, batchId);
  const hardIssues = Number(hardIssueRow && hardIssueRow.rows ? hardIssueRow.rows : 0);
  const archiveRowsWritten = 0;
  const certification = hardIssues > 0 ? "SCORING_ENGINE_FRAMEWORK_BLOCKED_BY_PAYLOAD_GAPS" : "SCORING_ENGINE_FRAMEWORK_CERTIFIED_PROFILE_GATE";
  const certificationGrade = hardIssues > 0 ? "BLOCKED" : "PASS_PROFILE_PENDING";
  const status = hardIssues > 0 ? "completed_with_framework_blockers" : "completed_framework_ready_profile_pending";
  const output = baseIdentity({
    request_id: requestId,
    chain_id: chainId,
    batch_id: batchId,
    status,
    certification,
    certification_grade: certificationGrade,
    profile_key: PROFILE_KEY,
    profile_version: PROFILE_VERSION,
    matrix_rows_read: matrixRows,
    score_rows_written: scoreRowsWritten,
    archive_rows_written: archiveRowsWritten,
    hard_issue_count: hardIssues,
    elapsed_ms: Date.now() - started,
    score_current_table: "SCORE_DB.scoring_engine_current",
    profile_table: "SCORE_DB.scoring_engine_profiles_current",
    archive_table: "ARCHIVE_DB.scoring_engine_archive_snapshots",
    selected_side_status: "pending_real_scoring_profile",
    score_status: "not_calculated_until_profile_thresholds_locked",
    no_candidate_board_write: true,
    no_old_prop_scores_write: true,
    notes: [
      "Framework-only scoring gate created one scoring-engine row per matrix row.",
      "No true score, hit probability, selected side, qualification, ranking, or final board output is produced yet.",
      "Archive threshold 70 is stored as the only locked threshold, but no archive rows are written until score_0_100 exists."
    ]
  });

  await run(env.SCORE_DB, `
    UPDATE scoring_engine_batches
    SET status=?, certification=?, certification_grade=?, score_rows_written=?, archive_rows_written=?, finished_at=CURRENT_TIMESTAMP, output_json=?
    WHERE batch_id=?
  `, status, certification, certificationGrade, scoreRowsWritten, archiveRowsWritten, JSON.stringify(output), batchId);

  return output;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();

    if (method === "GET" && (path === "/" || path === "/health")) {
      return jsonResponse(baseIdentity({ route: path }));
    }

    if (method === "POST" && path === "/diagnostic") {
      const input = await readJsonSafe(request);
      return jsonResponse(baseIdentity({
        route: "/diagnostic",
        input_echo_safe: {
          request_id: input.request_id || null,
          chain_id: input.chain_id || null,
          job_key: input.job_key || null,
          mode: input.mode || null
        },
        diagnostics: {
          required_bindings_missing: requireBindings(env),
          profile_key: PROFILE_KEY,
          profile_version: PROFILE_VERSION,
          archive_score_threshold: ARCHIVE_SCORE_THRESHOLD,
          framework_only: true
        },
        writes_performed: 0,
        external_calls_performed: 0
      }));
    }

    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      try {
        const isSimulation = input && (input.mode === "scoring_engine_simulation_shadow_strict_b" || input.job_key === "scoring-engine-simulation");
        const output = isSimulation ? await runScoringSimulation(env, input) : await runScoringEngine(env, input);
        return jsonResponse(output, output.ok ? 200 : 500);
      } catch (err) {
        return jsonResponse(baseIdentity({
          ok: false,
          data_ok: false,
          status: "scoring_engine_exception",
          certification: "SCORING_ENGINE_EXCEPTION",
          certification_grade: "FAILED",
          error: String(err && err.message ? err.message : err),
          external_calls_performed: 0,
          no_ranking: true,
          no_final_board: true
        }), 500);
      }
    }

    return jsonResponse({
      ok: false,
      data_ok: false,
      version: VERSION,
      worker_name: WORKER_NAME,
      logical_worker_name: LOGICAL_WORKER_NAME,
      status: "NOT_FOUND",
      allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], simulation_mode: "scoring_engine_simulation_shadow_strict_b",
      timestamp_utc: nowUtc()
    }, 404);
  }
};
