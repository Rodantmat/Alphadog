const WORKER_NAME = "alphadog-v2-score-audit";
const LOGICAL_WORKER_NAME = "alphadog-v2-scoring-engine";
const VERSION = "alphadog-v2-scoring-engine-v0.2.2-simulation-shadow-chunked-d1-memory-fix";
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

function profileConstants(profileKey) {
  if (profileKey === "HYBRID_CONTROL") {
    return {
      profileKey,
      version: "0.2.0-control",
      capMarketMissing: 60,
      capWarning9: 68,
      capMarketNotFound: 68,
      capWarning68: 70,
      capPacketPartial: 72,
      capPartialEnrichment: 72,
      capWarning35: 76,
      capSingleSource: 76,
      capNoTrueMarket: 70,
      capReadyWarnings: 78,
      capHighVolUnvalidated: 78,
      penMarketMissing: 18,
      penWarning9: 12,
      penMarketNotFound: 10,
      penPacketPartial: 6,
      penPartialEnrichment: 6,
      penWarning68: 4,
      penSleeperNullOdds: 3,
      penHighVolNoMarket: 3,
      cleanBonus: 3,
      cappedBonus: 3
    };
  }
  return {
    profileKey: "STRICT_B",
    version: "0.2.0-strict-b",
    capMarketMissing: 55,
    capWarning9: 55,
    capMarketNotFound: 60,
    capWarning68: 65,
    capPacketPartial: 65,
    capPartialEnrichment: 65,
    capWarning35: 74,
    capSingleSource: 70,
    capNoTrueMarket: 70,
    capReadyWarnings: 78,
    capHighVolUnvalidated: 78,
    penMarketMissing: 25,
    penWarning9: 20,
    penMarketNotFound: 15,
    penPacketPartial: 10,
    penPartialEnrichment: 10,
    penWarning68: 5,
    penSleeperNullOdds: 5,
    penHighVolNoMarket: 5,
    cleanBonus: 3,
    cappedBonus: 0
  };
}

async function insertSimulationProfileChunk(env, batchId, profileKey, cursorMatrixId, chunkSize) {
  const p = profileConstants(profileKey);
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
          WHEN COALESCE(m.blocking_for_scoring,0) = 1 OR m.matrix_status = 'matrix_deferred' OR m.factor_status = 'blocked' THEN 1
          ELSE 0
        END AS hard_blocked,
        CASE
          WHEN m.canonical_prop_key IN ('total_bases','hits_runs_rbis','home_runs','stolen_bases') THEN 1
          ELSE 0
        END AS high_vol_prop,
        CASE
          WHEN m.factor_status = 'packet_ready' THEN 82 ELSE 76 END
          + CASE WHEN m.market_prop_context_status = 'market_prop_context_present' THEN 4 WHEN m.market_prop_context_status = 'market_prop_context_not_found' THEN -4 WHEN m.market_prop_context_status = 'market_prop_context_missing' THEN -6 ELSE -2 END
          + CASE WHEN m.daily_readiness_status = 'partial_enrichment' THEN -5 WHEN m.daily_readiness_status = 'ready_with_warnings' THEN 0 ELSE 1 END
          + CASE WHEN m.source_key = 'sleeper' THEN -1 ELSE 0 END
          + CASE
              WHEN m.canonical_prop_key = 'pitcher_strikeouts' THEN 3
              WHEN m.canonical_prop_key = 'hits' THEN 2
              WHEN m.canonical_prop_key IN ('total_bases','hits_runs_rbis') THEN -2
              WHEN m.canonical_prop_key IN ('home_runs','stolen_bases') THEN -4
              WHEN m.canonical_prop_key IN ('earned_runs_allowed','hits_allowed') THEN -3
              WHEN m.canonical_prop_key IN ('pitcher_outs','pitching_outs') THEN -1
              ELSE 0
            END
          + CASE WHEN json_extract(m.matrix_payload_json, '$.prepared.odds_type') IN ('goblin','demon') THEN -4 ELSE 0 END AS raw_more_pre,
        MIN(
          100,
          CASE WHEN COALESCE(m.blocking_for_scoring,0) = 1 OR m.matrix_status = 'matrix_deferred' OR m.factor_status = 'blocked' THEN 0 ELSE 100 END,
          CASE WHEN m.market_prop_context_status = 'market_prop_context_missing' THEN ${p.capMarketMissing} ELSE 100 END,
          CASE WHEN COALESCE(m.warning_count,0) >= 9 THEN ${p.capWarning9} ELSE 100 END,
          CASE WHEN m.market_prop_context_status = 'market_prop_context_not_found' THEN ${p.capMarketNotFound} ELSE 100 END,
          CASE WHEN COALESCE(m.warning_count,0) BETWEEN 6 AND 8 THEN ${p.capWarning68} ELSE 100 END,
          CASE WHEN m.factor_status = 'packet_partial' THEN ${p.capPacketPartial} ELSE 100 END,
          CASE WHEN m.daily_readiness_status = 'partial_enrichment' THEN ${p.capPartialEnrichment} ELSE 100 END,
          CASE WHEN COALESCE(m.warning_count,0) BETWEEN 3 AND 5 THEN ${p.capWarning35} ELSE 100 END,
          CASE WHEN m.daily_readiness_status = 'ready_with_warnings' THEN ${p.capReadyWarnings} ELSE 100 END,
          CASE WHEN m.canonical_prop_key IN ('total_bases','hits_runs_rbis','home_runs','stolen_bases') AND m.market_prop_context_status <> 'market_prop_context_present' THEN ${p.capHighVolUnvalidated} ELSE 100 END
        ) AS structural_cap_calc,
        (
          CASE WHEN m.market_prop_context_status = 'market_prop_context_missing' THEN ${p.penMarketMissing} ELSE 0 END +
          CASE WHEN COALESCE(m.warning_count,0) >= 9 THEN ${p.penWarning9} ELSE 0 END +
          CASE WHEN m.market_prop_context_status = 'market_prop_context_not_found' THEN ${p.penMarketNotFound} ELSE 0 END +
          CASE WHEN m.factor_status = 'packet_partial' THEN ${p.penPacketPartial} ELSE 0 END +
          CASE WHEN m.daily_readiness_status = 'partial_enrichment' THEN ${p.penPartialEnrichment} ELSE 0 END +
          CASE WHEN COALESCE(m.warning_count,0) BETWEEN 6 AND 8 THEN ${p.penWarning68} ELSE 0 END +
          CASE WHEN m.source_key = 'sleeper' AND json_extract(m.matrix_payload_json, '$.prepared.odds_type') IS NULL THEN ${p.penSleeperNullOdds} ELSE 0 END +
          CASE WHEN m.canonical_prop_key IN ('total_bases','hits_runs_rbis','home_runs','stolen_bases') AND m.market_prop_context_status <> 'market_prop_context_present' THEN ${p.penHighVolNoMarket} ELSE 0 END
        ) AS penalty_total_calc
      FROM prop_matrix_current m
      WHERE (? IS NULL OR m.matrix_id > ?)
      ORDER BY m.matrix_id
      LIMIT ?
    ), scored AS (
      SELECT
        base.*,
        MAX(0, MIN(100, raw_more_pre)) AS raw_more_score_calc,
        CASE WHEN v_side_mode = 'two_sided' THEN MAX(0, MIN(100, raw_more_pre - 1)) ELSE NULL END AS raw_less_score_calc,
        CASE
          WHEN hard_blocked = 1 THEN 0
          WHEN structural_cap_calc < 100 OR penalty_total_calc > 0 THEN ${p.cappedBonus}
          WHEN market_prop_context_status = 'market_prop_context_present' AND COALESCE(warning_count,0) = 0 AND factor_status = 'packet_ready' AND daily_readiness_status <> 'partial_enrichment' THEN ${p.cleanBonus}
          ELSE 0
        END AS bonus_calc
      FROM base
    ), final AS (
      SELECT
        scored.*,
        CASE WHEN hard_blocked = 1 THEN NULL ELSE MIN(structural_cap_calc, MAX(0, MIN(100, raw_more_score_calc - penalty_total_calc)) + bonus_calc) END AS more_final,
        CASE WHEN hard_blocked = 1 OR v_side_mode <> 'two_sided' THEN NULL ELSE MIN(structural_cap_calc, MAX(0, MIN(100, raw_less_score_calc - penalty_total_calc)) + bonus_calc) END AS less_final
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
      CASE
        WHEN hard_blocked = 1 THEN NULL
        WHEN v_side_mode = 'more_only' THEN more_final
        WHEN v_side_mode = 'two_sided' AND more_final IS NOT NULL AND less_final IS NOT NULL AND more_final <> less_final THEN CASE WHEN more_final > less_final THEN more_final ELSE less_final END
        ELSE NULL
      END AS score_0_100,
      CASE
        WHEN hard_blocked = 1 THEN NULL
        WHEN v_side_mode = 'more_only' AND more_final IS NOT NULL THEN 'more'
        WHEN v_side_mode = 'two_sided' AND more_final IS NOT NULL AND less_final IS NOT NULL AND more_final > less_final THEN 'more'
        WHEN v_side_mode = 'two_sided' AND more_final IS NOT NULL AND less_final IS NOT NULL AND less_final > more_final THEN 'less'
        ELSE NULL
      END AS selected_side,
      CASE
        WHEN hard_blocked = 1 THEN 'simulation_blocked_by_matrix'
        WHEN v_side_mode = 'more_only' AND more_final IS NOT NULL THEN 'simulated_profile_locked'
        WHEN v_side_mode = 'two_sided' AND more_final IS NOT NULL AND less_final IS NOT NULL AND more_final <> less_final THEN 'simulated_profile_locked'
        ELSE 'simulation_side_unresolved'
      END AS score_status,
      CASE
        WHEN hard_blocked = 1 THEN 'BIN_0_BLOCKED'
        WHEN (CASE WHEN v_side_mode = 'more_only' THEN more_final WHEN more_final IS NOT NULL AND less_final IS NOT NULL AND more_final <> less_final THEN CASE WHEN more_final > less_final THEN more_final ELSE less_final END ELSE NULL END) >= 88 THEN 'BIN_ELITE'
        WHEN (CASE WHEN v_side_mode = 'more_only' THEN more_final WHEN more_final IS NOT NULL AND less_final IS NOT NULL AND more_final <> less_final THEN CASE WHEN more_final > less_final THEN more_final ELSE less_final END ELSE NULL END) >= 82 THEN 'BIN_STRONG'
        WHEN (CASE WHEN v_side_mode = 'more_only' THEN more_final WHEN more_final IS NOT NULL AND less_final IS NOT NULL AND more_final <> less_final THEN CASE WHEN more_final > less_final THEN more_final ELSE less_final END ELSE NULL END) >= 76 THEN 'BIN_QUALIFIED'
        WHEN (CASE WHEN v_side_mode = 'more_only' THEN more_final WHEN more_final IS NOT NULL AND less_final IS NOT NULL AND more_final <> less_final THEN CASE WHEN more_final > less_final THEN more_final ELSE less_final END ELSE NULL END) >= 70 THEN 'BIN_ARCHIVE'
        WHEN (CASE WHEN v_side_mode = 'more_only' THEN more_final WHEN more_final IS NOT NULL AND less_final IS NOT NULL AND more_final <> less_final THEN CASE WHEN more_final > less_final THEN more_final ELSE less_final END ELSE NULL END) IS NULL THEN 'BIN_0_NULL'
        ELSE 'BIN_REJECT'
      END AS score_grade,
      CASE
        WHEN hard_blocked = 0
          AND (CASE WHEN v_side_mode = 'more_only' THEN more_final WHEN more_final IS NOT NULL AND less_final IS NOT NULL AND more_final <> less_final THEN CASE WHEN more_final > less_final THEN more_final ELSE less_final END ELSE NULL END) >= 70
          AND (CASE WHEN v_side_mode = 'more_only' AND more_final IS NOT NULL THEN 'simulated_profile_locked' WHEN v_side_mode = 'two_sided' AND more_final IS NOT NULL AND less_final IS NOT NULL AND more_final <> less_final THEN 'simulated_profile_locked' ELSE 'simulation_side_unresolved' END) = 'simulated_profile_locked'
        THEN 1 ELSE 0 END AS archive_eligible,
      0 AS invariant_violation_count,
      json_object(
        'worker_version', ?,
        'simulation_only', 1,
        'profile_key', ?,
        'profile_version', ?,
        'formula_order', 'hard_block_gate -> side_validation -> raw_score -> penalties -> structural_cap -> bonus -> structural_cap -> selected_side -> archive_flag',
        'strict_archive_threshold', 70,
        'final_thresholds_locked', 0,
        'scoring_enabled', 0,
        'true_probability_enabled', 0,
        'no_true_hit_probability_claims', 1,
        'bonus_rule', 'zero_bonus_for_any_capped_or_penalized_row; clean_rows_only_may_receive_configured_bonus',
        'goblin_demon_less_score_policy', 'NULL_NOT_ZERO',
        'dedupe_deferred_to_ranking_final_board', 1
      ) AS calculation_json,
      matrix_payload_json,
      details_json,
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
      SUM(CASE WHEN score_status = 'simulation_blocked_by_matrix' THEN 1 ELSE 0 END) AS blocked_rows,
      SUM(CASE WHEN score_grade = 'BIN_REJECT' THEN 1 ELSE 0 END) AS reject_rows,
      SUM(CASE WHEN score_grade = 'BIN_ARCHIVE' THEN 1 ELSE 0 END) AS archive_rows,
      SUM(CASE WHEN score_grade = 'BIN_QUALIFIED' THEN 1 ELSE 0 END) AS qualified_rows,
      SUM(CASE WHEN score_grade = 'BIN_STRONG' THEN 1 ELSE 0 END) AS strong_rows,
      SUM(CASE WHEN score_grade = 'BIN_ELITE' THEN 1 ELSE 0 END) AS elite_rows,
      SUM(CASE WHEN score_0_100 >= 76 THEN 1 ELSE 0 END) AS rows_76_plus,
      SUM(CASE WHEN score_0_100 >= 82 THEN 1 ELSE 0 END) AS rows_82_plus,
      SUM(CASE WHEN score_0_100 >= 88 THEN 1 ELSE 0 END) AS rows_88_plus,
      SUM(CASE WHEN selected_side IS NOT NULL AND score_0_100 IS NULL THEN 1 ELSE 0 END) AS selected_side_without_score,
      SUM(CASE WHEN side_mode = 'more_only' AND less_score_0_100 IS NOT NULL THEN 1 ELSE 0 END) AS more_only_less_score_not_null,
      SUM(CASE WHEN source_key = 'prizepicks' AND odds_type IN ('goblin','demon') AND selected_side = 'less' THEN 1 ELSE 0 END) AS goblin_demon_less_selected,
      SUM(CASE WHEN score_status = 'simulation_blocked_by_matrix' AND (score_0_100 IS NOT NULL OR archive_eligible = 1 OR selected_side IS NOT NULL) THEN 1 ELSE 0 END) AS blocked_row_score_leak,
      SUM(CASE WHEN market_prop_context_status = 'market_prop_context_missing' AND score_0_100 >= 70 THEN 1 ELSE 0 END) AS market_missing_70_plus,
      SUM(CASE WHEN market_prop_context_status = 'market_prop_context_not_found' AND score_0_100 >= 76 THEN 1 ELSE 0 END) AS market_not_found_76_plus,
      SUM(CASE WHEN warning_count >= 9 AND score_0_100 >= 70 THEN 1 ELSE 0 END) AS warning9_70_plus,
      SUM(CASE WHEN factor_status = 'packet_partial' AND score_0_100 >= 82 THEN 1 ELSE 0 END) AS packet_partial_82_plus,
      SUM(CASE WHEN daily_readiness_status = 'partial_enrichment' AND score_0_100 >= 82 THEN 1 ELSE 0 END) AS partial_enrichment_82_plus,
      SUM(CASE WHEN archive_eligible = 1 AND score_status <> 'simulated_profile_locked' THEN 1 ELSE 0 END) AS archive_without_locked_status
    FROM scoring_engine_simulation_shadow
    WHERE simulation_batch_id=? AND profile_key=?
  `, batchId, profileKey);
  const out = {};
  for (const [k, v] of Object.entries(row || {})) out[k] = Number(v || 0);
  return out;
}

async function recordSimulationInvariants(env, batchId, profileKey, summary) {
  const checks = [
    ["BLOCKED_ROW_SCORE_LEAK", summary.blocked_row_score_leak, "BLOCKER", "Blocked matrix rows must not receive score, selected_side, or archive_eligible."],
    ["SELECTED_SIDE_WITHOUT_SCORE", summary.selected_side_without_score, "BLOCKER", "No selected_side may exist without score_0_100."],
    ["MORE_ONLY_LESS_SCORE_NOT_NULL", summary.more_only_less_score_not_null, "BLOCKER", "More-only Goblin/Demon rows must keep less_score_0_100 NULL."],
    ["GOBLIN_DEMON_LESS_SELECTED", summary.goblin_demon_less_selected, "BLOCKER", "Goblin/Demon cannot select Less/Under."],
    ["MARKET_MISSING_70_PLUS", summary.market_missing_70_plus, "BLOCKER", "market_prop_context_missing rows cannot reach archive threshold."],
    ["MARKET_NOT_FOUND_76_PLUS", summary.market_not_found_76_plus, "BLOCKER", "market_prop_context_not_found rows cannot reach playable threshold."],
    ["WARNING9_70_PLUS", summary.warning9_70_plus, "BLOCKER", "warning_count >= 9 rows cannot reach archive threshold under Strict-B."],
    ["PACKET_PARTIAL_82_PLUS", summary.packet_partial_82_plus, "BLOCKER", "packet_partial rows cannot reach 82+."],
    ["PARTIAL_ENRICHMENT_82_PLUS", summary.partial_enrichment_82_plus, "BLOCKER", "partial_enrichment rows cannot reach 82+."],
    ["ARCHIVE_WITHOUT_LOCKED_STATUS", summary.archive_without_locked_status, "BLOCKER", "archive_eligible requires simulated_profile_locked."],
    ["ELITE_ROWS_UNDER_PARTIAL_DATA", summary.rows_88_plus, "BLOCKER", "Current partial data state should produce zero 88+ rows."],
    ["ROWS_76_PLUS_ABOVE_CEILING", summary.rows_76_plus > 300 ? summary.rows_76_plus : 0, "BLOCKER", "76+ rows above 300 indicates score inflation."],
    ["ROWS_76_PLUS_BELOW_FLOOR", summary.rows_76_plus < 50 ? summary.rows_76_plus : 0, "WARNING", "76+ rows below 50 indicates possible board-emptying over-strictness."],
    ["ROWS_82_PLUS_ABOVE_CEILING", summary.rows_82_plus > 75 ? summary.rows_82_plus : 0, "BLOCKER", "82+ rows above 75 indicates score inflation."],
    ["BLOCKED_ROW_COUNT_NOT_26", summary.blocked_rows !== 26 ? summary.blocked_rows : 0, "BLOCKER", "Expected exactly 26 hard blocked rows from current matrix snapshot."]
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
  const requestId = input.request_id || `scoring_simulation_${Date.now().toString(36)}`;
  const chainId = input.chain_id || null;
  const batchId = `scoring_simulation_batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const started = Date.now();
  const matrixCountRow = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM prop_matrix_current`);
  const matrixRows = Number(matrixCountRow && matrixCountRow.rows ? matrixCountRow.rows : 0);

  await run(env.SCORE_DB, `
    INSERT INTO scoring_engine_simulation_batches (
      simulation_batch_id, worker_version, job_key, status, certification, certification_grade,
      matrix_rows_read, simulation_rows_written, thresholds_locked, scoring_enabled, true_probability_enabled, started_at
    ) VALUES (?, ?, 'scoring-engine-simulation', 'running', 'SCORING_SIMULATION_STARTED', 'RUNNING', ?, 0, 0, 0, 0, CURRENT_TIMESTAMP)
  `, batchId, VERSION, matrixRows);

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
    ? "SCORING_SIMULATION_STRICT_B_BLOCKED_BY_INVARIANTS"
    : (strictWarnings > 0 ? "SCORING_SIMULATION_STRICT_B_PASS_WITH_REVIEW_WARNINGS" : "SCORING_SIMULATION_STRICT_B_CERTIFIED_FOR_PROFILE_REVIEW");
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
    selected_side_policy: "NULL until score exists; Goblin/Demon selected_side more only after valid score; Less remains NULL for more_only rows.",
    notes: [
      "Simulation writes only to SCORE_DB.scoring_engine_simulation_shadow and related simulation audit tables.",
      "v0.2.1 chunks shadow inserts to avoid D1 SQLITE_NOMEM on full-board INSERT SELECT.",
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
