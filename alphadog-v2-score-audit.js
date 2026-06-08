const WORKER_NAME = "alphadog-v2-score-audit";
const LOGICAL_WORKER_NAME = "alphadog-v2-scoring-engine";
const VERSION = "alphadog-v2-scoring-engine-v0.4.16-hp-board-display-calibration-same-worker";
const JOB_KEY = "scoring-engine";
const PROFILE_KEY = "SCORING_FRAMEWORK_V0_1_PROFILE_GATE";
const PRODUCTION_PROFILE_KEY = "STRICT_C_REALISTIC_V3_2";
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


function controlVersion() {
  try { if (typeof SYSTEM_VERSION !== "undefined") return SYSTEM_VERSION; } catch (_) {}
  try { if (typeof VERSION !== "undefined") return VERSION; } catch (_) {}
  return "unknown";
}
function controlWorkerName() {
  try { if (typeof LOGICAL_WORKER_NAME !== "undefined") return LOGICAL_WORKER_NAME; } catch (_) {}
  try { if (typeof WORKER_NAME !== "undefined") return WORKER_NAME; } catch (_) {}
  return "unknown";
}
function controlDeployedSlot() {
  try { if (typeof WORKER_NAME !== "undefined") return WORKER_NAME; } catch (_) {}
  return null;
}
function controlJobKey(input = {}) {
  return String(input.job_key || (typeof JOB_KEY !== "undefined" ? JOB_KEY : "worker"));
}
function controlSafeText(value, max = 900) {
  const text = value === undefined || value === null ? "" : String(value);
  return text.length > max ? text.slice(0, max) : text;
}
function controlSafeJson(value, max = 9000) {
  let text = "{}";
  try { text = JSON.stringify(value == null ? {} : value); } catch (_) { text = JSON.stringify({ ok:false, serialization_error:true }); }
  return text.length > max ? text.slice(0, max) : text;
}
async function controlLifecycleHeartbeat(env, input = {}, statusText = "running", extra = {}) {
  const requestId = input.request_id || extra.request_id || null;
  if (!env || !env.CONTROL_DB || !requestId) return { ok:false, skipped:"missing_control_db_or_request_id" };
  const runId = input.run_id || extra.run_id || null;
  const jobKey = controlJobKey(input);
  const workerName = controlWorkerName();
  const preview = controlSafeJson({
    ok:true,
    data_ok:true,
    version:controlVersion(),
    worker_name:workerName,
    deployed_worker_slot:controlDeployedSlot(),
    job_key:jobKey,
    request_id:requestId,
    run_id:runId,
    mode:input.mode || input.factor_mode || null,
    status:statusText,
    certification:`${String(jobKey).toUpperCase().replace(/[^A-Z0-9]+/g,"_")}_WORKER_HEARTBEAT`,
    certification_grade:"RUNNING",
    control_lifecycle_heartbeat:true,
    ...extra,
    timestamp_utc:(typeof nowUtc === "function" ? nowUtc() : (typeof nowIso === "function" ? nowIso() : new Date().toISOString()))
  }, 3600);
  try {
    await run(env.CONTROL_DB, `UPDATE control_job_queue
      SET status='running', updated_at=CURRENT_TIMESTAMP, output_json=?
      WHERE request_id=? AND status IN ('pending','running')`, preview, requestId);
    if (runId) {
      await run(env.CONTROL_DB, `UPDATE control_job_runs
        SET status='running', data_ok=0, certification_status=?, output_json=?
        WHERE run_id=? AND finished_at IS NULL`, `${String(jobKey).toUpperCase().replace(/[^A-Z0-9]+/g,"_")}_WORKER_HEARTBEAT`, preview, runId);
    } else {
      await run(env.CONTROL_DB, `UPDATE control_job_runs
        SET status='running', data_ok=0, certification_status=?, output_json=?
        WHERE request_id=? AND finished_at IS NULL`, `${String(jobKey).toUpperCase().replace(/[^A-Z0-9]+/g,"_")}_WORKER_HEARTBEAT`, preview, requestId);
    }
    return { ok:true };
  } catch (err) {
    return { ok:false, error:controlSafeText(err && err.message ? err.message : err, 700) };
  }
}
async function controlLifecycleFinalize(env, input = {}, output = {}, terminalHint = null) {
  const requestId = output.request_id || input.request_id || null;
  if (!env || !env.CONTROL_DB || !requestId) return { ok:false, skipped:"missing_control_db_or_request_id" };
  const runId = output.run_id || input.run_id || null;
  const jobKey = output.job_key || controlJobKey(input);
  const isOk = (terminalHint === "completed" || (!terminalHint && output.ok !== false && output.data_ok !== false));
  const queueStatus = isOk ? "completed" : "failed";
  const runStatus = isOk ? "completed" : "failed";
  const cert = output.certification || output.certification_status || (isOk ? `${String(jobKey).toUpperCase().replace(/[^A-Z0-9]+/g,"_")}_COMPLETED` : `${String(jobKey).toUpperCase().replace(/[^A-Z0-9]+/g,"_")}_FAILED`);
  const rowsRead = Number(output.rows_read ?? output.prepared_rows_read ?? output.matrix_rows_read ?? 0) || 0;
  const rowsWritten = Number(output.rows_written ?? output.packets_written ?? output.matrix_rows_written ?? output.final_rows_written ?? output.current_rows_written ?? 0) || 0;
  const externalCalls = Number(output.external_calls_performed ?? output.external_calls ?? 0) || 0;
  const elapsed = Number(output.elapsed_ms || 0) || null;
  const finalJson = controlSafeJson({ ...output, request_id:requestId, run_id:runId, control_lifecycle_self_finalized:true, control_lifecycle_finalized_at:(typeof nowUtc === "function" ? nowUtc() : (typeof nowIso === "function" ? nowIso() : new Date().toISOString())) }, 9000);
  try {
    await run(env.CONTROL_DB, `UPDATE control_job_queue
      SET status=?, finished_at=COALESCE(finished_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=CASE WHEN ?='completed' THEN error_code ELSE COALESCE(error_code, ?) END, error_message=CASE WHEN ?='completed' THEN error_message ELSE COALESCE(error_message, ?) END
      WHERE request_id=? AND status IN ('pending','running')`, queueStatus, finalJson, queueStatus, `${String(jobKey).replace(/[^a-zA-Z0-9]+/g,"_").toLowerCase()}_worker_failed`, queueStatus, controlSafeText(output.error || output.error_message || cert, 900), requestId);
    const runSql = `UPDATE control_job_runs
      SET status=?, data_ok=?, certification_status=?, rows_read=?, rows_written=?, external_calls=?, finished_at=COALESCE(finished_at,CURRENT_TIMESTAMP), elapsed_ms=COALESCE(elapsed_ms, ?), output_json=?, error_code=CASE WHEN ?='completed' THEN error_code ELSE COALESCE(error_code, ?) END, error_message=CASE WHEN ?='completed' THEN error_message ELSE COALESCE(error_message, ?) END
      WHERE ${runId ? 'run_id=?' : 'request_id=?'} AND finished_at IS NULL`;
    await run(env.CONTROL_DB, runSql, runStatus, isOk ? 1 : 0, cert, rowsRead, rowsWritten, externalCalls, elapsed, finalJson, runStatus, `${String(jobKey).replace(/[^a-zA-Z0-9]+/g,"_").toLowerCase()}_worker_failed`, runStatus, controlSafeText(output.error || output.error_message || cert, 900), runId || requestId);
    return { ok:true, queue_status:queueStatus, run_status:runStatus, certification:cert };
  } catch (err) {
    return { ok:false, error:controlSafeText(err && err.message ? err.message : err, 900) };
  }
}
async function responseToOutputObject(response) {
  try { return JSON.parse(await response.clone().text()); } catch (_) { return { ok:false, data_ok:false, status:"worker_response_parse_failed", certification:"WORKER_RESPONSE_PARSE_FAILED" }; }
}
function isWorkerPartialContinueOutput(output) {
  const rawStatus = String((output && output.status) || "").toLowerCase();
  const cert = String((output && (output.certification || output.certification_status)) || "").toLowerCase();
  return !!(output && output.ok === true && (
    rawStatus === "partial_continue" ||
    rawStatus.startsWith("partial_continue_") ||
    cert.includes("partial_continue") ||
    output.continuation_required === true ||
    output.orchestrator_should_self_continue === true
  ));
}
async function controlLifecyclePartial(env, input = {}, output = {}) {
  const requestId = output.request_id || input.request_id || null;
  if (!env || !env.CONTROL_DB || !requestId) return { ok:false, skipped:"missing_control_db_or_request_id" };
  const runId = output.run_id || input.run_id || null;
  const jobKey = output.job_key || controlJobKey(input);
  const cert = output.certification || output.certification_status || `${String(jobKey).toUpperCase().replace(/[^A-Z0-9]+/g,"_")}_PARTIAL_CONTINUE`;
  const rowsRead = Number(output.rows_read ?? output.matrix_rows_read ?? 0) || 0;
  const rowsWritten = Number(output.rows_written ?? output.score_rows_written ?? output.current_rows_written ?? 0) || 0;
  const externalCalls = Number(output.external_calls_performed ?? output.external_calls ?? 0) || 0;
  const finalJson = controlSafeJson({
    ...output,
    request_id: requestId,
    run_id: runId,
    control_lifecycle_partial_continue: true,
    control_lifecycle_partial_at: (typeof nowUtc === "function" ? nowUtc() : new Date().toISOString())
  }, 9000);
  try {
    await run(env.CONTROL_DB, `UPDATE control_job_queue
      SET status='pending', run_after=CURRENT_TIMESTAMP, finished_at=NULL, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL
      WHERE request_id=? AND status IN ('pending','running','partial_continue')`, finalJson, requestId);
    const runSql = `UPDATE control_job_runs
      SET status='partial_continue', data_ok=1, certification_status=?, rows_read=?, rows_written=?, external_calls=?, finished_at=COALESCE(finished_at,CURRENT_TIMESTAMP), output_json=?, error_code=NULL, error_message=NULL
      WHERE ${runId ? 'run_id=?' : 'request_id=?'} AND finished_at IS NULL`;
    await run(env.CONTROL_DB, runSql, cert, rowsRead, rowsWritten, externalCalls, finalJson, runId || requestId);
    return { ok:true, queue_status:"pending", run_status:"partial_continue", certification:cert };
  } catch (err) {
    return { ok:false, error:controlSafeText(err && err.message ? err.message : err, 900) };
  }
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

  // v0.4.2: production Engine current needs the same score/support fields that the proven STRICT_B
  // simulation path already emits. These are additive/schema-first and preserve older deployments.
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_current', 'matrix_status', 'matrix_status TEXT');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_current', 'matrix_grade', 'matrix_grade TEXT');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_current', 'factor_status', 'factor_status TEXT');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_current', 'market_game_context_status', 'market_game_context_status TEXT');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_current', 'market_prop_context_status', 'market_prop_context_status TEXT');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_current', 'daily_readiness_status', 'daily_readiness_status TEXT');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_current', 'blocking_for_scoring', 'blocking_for_scoring INTEGER DEFAULT 0');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_current', 'warning_count', 'warning_count INTEGER DEFAULT 0');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_current', 'blocker_count', 'blocker_count INTEGER DEFAULT 0');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_current', 'missing_component_count', 'missing_component_count INTEGER DEFAULT 0');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_current', 'confidence_0_100', 'confidence_0_100 REAL');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_current', 'confidence_status', 'confidence_status TEXT');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_current', 'live_playable', 'live_playable INTEGER DEFAULT 0');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_current', 'model_deferred', 'model_deferred INTEGER DEFAULT 0');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_current', 'model_deferred_reason', 'model_deferred_reason TEXT');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_current', 'score_sort_0_100', 'score_sort_0_100 REAL');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_current', 'score_integer_0_100', 'score_integer_0_100 REAL');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_current', 'raw_more_score', 'raw_more_score REAL');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_current', 'raw_less_score', 'raw_less_score REAL');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_current', 'penalty_total', 'penalty_total REAL');
  await addColumnIfMissing(env.SCORE_DB, 'scoring_engine_current', 'bonus_total', 'bonus_total REAL');

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
    formula_key: "SCORING_SIMULATION_V0_3_7_LIVE_PLAYABLE_MARKET_CONTEXT_GATE",
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
      "independent_raw_more_raw_less_generation_from_db_config",
      "price_line_prop_side_pressure",
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
    profile_version: "0.3.7-control-live-playable-market-context-gate",
    config: {
      min_live_score: 76,
      min_live_confidence: 55,
      archive_score_threshold: 70,
      grade_archive_min: 70,
      grade_qualified_min: 76,
      grade_strong_min: 82,
      grade_elite_min: 88,
      raw_side_delta_threshold: 0.50,
      base_raw_packet_ready: 82,
      base_raw_packet_partial: 76,
      raw_less_delta_from_more: 0,
      max_score_cap: 100,
      price_pressure_scale: 0.16,
      line_pressure_scale: 1.00,
      deterministic_spread_scale: 0.45,
      base_confidence: 100,
      score_sort_micro_scale: 0.0001,
      clean_bonus_score: 0,
      market_raw_adjustments: { market_prop_context_present: 4, market_prop_context_not_found: -4, market_prop_context_missing: -6, default: -2 },
      daily_raw_adjustments: { ready_with_warnings: 0, partial_enrichment: -5, default: 1 },
      source_raw_adjustments: { sleeper: -1, default: 0 },
      odds_raw_adjustments: { goblin: -4, demon: -4, default: 0 },
      prop_raw_adjustments: { pitcher_strikeouts: 3, hits: 2, total_bases: -2, hits_runs_rbis: -2, home_runs: -4, stolen_bases: -4, earned_runs: 2, earned_runs_allowed: 2, hits_allowed: 1, pitcher_outs: 2, pitching_outs: 2, walks: -1, walks_allowed: 1, rbis: -1, runs: -1, doubles: -2, singles: 0, fantasy: -2, default: 0 },
      prop_less_raw_adjustments: { pitcher_strikeouts: -1, hits: 0, total_bases: 2, hits_runs_rbis: 2, home_runs: 3, stolen_bases: 3, earned_runs: -1, earned_runs_allowed: -1, hits_allowed: -1, pitcher_outs: -1, pitching_outs: -1, walks: 1, walks_allowed: -1, rbis: 2, runs: 1, doubles: 2, singles: 1, fantasy: 1, default: 0 },
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
    profile_version: "0.3.7-strict-b-live-playable-market-context-gate",
    config: {
      min_live_score: 76,
      min_live_confidence: 55,
      archive_score_threshold: 70,
      grade_archive_min: 70,
      grade_qualified_min: 76,
      grade_strong_min: 82,
      grade_elite_min: 88,
      raw_side_delta_threshold: 0.50,
      base_raw_packet_ready: 82,
      base_raw_packet_partial: 76,
      raw_less_delta_from_more: 0,
      max_score_cap: 100,
      price_pressure_scale: 0.16,
      line_pressure_scale: 1.00,
      deterministic_spread_scale: 0.45,
      base_confidence: 100,
      score_sort_micro_scale: 0.0001,
      clean_bonus_score: 0,
      market_raw_adjustments: { market_prop_context_present: 4, market_prop_context_not_found: -4, market_prop_context_missing: -6, default: -2 },
      daily_raw_adjustments: { ready_with_warnings: 0, partial_enrichment: -5, default: 1 },
      source_raw_adjustments: { sleeper: -1, default: 0 },
      odds_raw_adjustments: { goblin: -4, demon: -4, default: 0 },
      prop_raw_adjustments: { pitcher_strikeouts: 3, hits: 2, total_bases: -2, hits_runs_rbis: -2, home_runs: -4, stolen_bases: -4, earned_runs: 2, earned_runs_allowed: 2, hits_allowed: 1, pitcher_outs: 2, pitching_outs: 2, walks: -1, walks_allowed: 1, rbis: -1, runs: -1, doubles: -2, singles: 0, fantasy: -2, default: 0 },
      prop_less_raw_adjustments: { pitcher_strikeouts: -1, hits: 0, total_bases: 2, hits_runs_rbis: 2, home_runs: 3, stolen_bases: 3, earned_runs: -1, earned_runs_allowed: -1, hits_allowed: -1, pitcher_outs: -1, pitching_outs: -1, walks: 1, walks_allowed: -1, rbis: 2, runs: 1, doubles: 2, singles: 1, fantasy: 1, default: 0 },
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
  },
  STRICT_C_REALISTIC_V3_2: {
    profile_version: "0.4.7-strict-c-realistic-v3-2-effective-warning-severity",
    config: {
      min_live_score: 76,
      min_live_confidence: 55,
      archive_score_threshold: 70,
      grade_archive_min: 70,
      grade_qualified_min: 76,
      grade_strong_min: 84,
      grade_elite_min: 90,
      raw_side_delta_threshold: 0.50,
      base_raw_packet_ready: 82,
      base_raw_packet_partial: 76,
      raw_less_delta_from_more: 0,
      max_score_cap: 100,
      price_pressure_scale: 0.16,
      line_pressure_scale: 1.00,
      deterministic_spread_scale: 0.45,
      base_confidence: 100,
      score_sort_micro_scale: 0.0001,
      clean_bonus_score: 0,
      market_raw_adjustments: { market_prop_context_present: 3, market_prop_context_not_found: -4, market_prop_context_missing: -6, default: -2 },
      market_direct_evidence_raw_adjustments: { direct_prop_evidence_rows_gte_5: 1.5, direct_prop_evidence_rows_2_to_4: 0.75, direct_prop_evidence_rows_1: 0, direct_prop_evidence_rows_0_with_coverage: -1, direct_prop_evidence_rows_0_no_coverage: -3, default: 0 },
      market_evidence_score_caps: { direct_prop_evidence_rows_gte_5: 97, direct_prop_evidence_rows_2_to_4: 94, direct_prop_evidence_rows_1: 89, direct_prop_evidence_rows_0_with_coverage: 82, direct_prop_evidence_rows_0_no_coverage: 74, default: 90 },
      context_score_caps: { matrix_full_context: 100, matrix_partial_context_warning_0_2: 96, matrix_partial_context_warning_3_5: 93, matrix_partial_context_warning_6_8: 90, matrix_partial_context_warning_9_plus: 82 },
      effective_warning_rules: { enabled: true, soft_partial_context_effective_warning_count: 6, soft_partial_context_requires_blocker_count_lte: 0, soft_partial_context_requires_direct_prop_evidence_rows_gte: 1, soft_partial_context_factor_statuses: ["packet_partial"], soft_partial_context_daily_statuses: ["missing_current_readiness", "daily_readiness_missing_soft_fallback", "partial_enrichment"], soft_partial_context_market_prop_statuses: ["market_prop_context_present"] },
      symmetry_rules: { two_sided_delta_lt: 1.0, zero_direct_evidence_symmetry_cap: 76, nonzero_direct_evidence_symmetry_cap: 88 },
      daily_raw_adjustments: { ready_with_warnings: 0, partial_enrichment: -4, not_applicable: 0, default: 0 },
      source_raw_adjustments: { sleeper: -1, default: 0 },
      odds_raw_adjustments: { goblin: -4, demon: -4, default: 0 },
      prop_raw_adjustments: { pitcher_strikeouts: 1, hits: 1, total_bases: -1, hits_runs_rbis: -1, home_runs: -4, stolen_bases: -4, earned_runs: 0, earned_runs_allowed: 0, hits_allowed: 0, pitcher_outs: 1, pitching_outs: 1, walks: -1, walks_allowed: 0, rbis: -1, runs: -1, doubles: -2, singles: 0, fantasy: -2, default: 0 },
      prop_less_raw_adjustments: { pitcher_strikeouts: -1, hits: 0, total_bases: 1, hits_runs_rbis: 1, home_runs: 0, stolen_bases: 0, earned_runs: -1, earned_runs_allowed: -1, hits_allowed: -1, pitcher_outs: -1, pitching_outs: -1, walks: 1, walks_allowed: -1, rbis: 1, runs: 1, doubles: 1, singles: 1, fantasy: 0, default: 0 },
      score_penalty_market_not_found: 8,
      score_penalty_market_missing: 10,
      score_penalty_complete_market_blindness: 14,
      score_penalty_packet_partial: 4,
      score_penalty_partial_enrichment: 6,
      confidence_cap_market_not_found: 60,
      confidence_cap_market_missing: 50,
      confidence_cap_complete_market_blindness: 40,
      confidence_cap_warning_9_plus: 45,
      confidence_penalty_packet_partial: 8,
      confidence_penalty_partial_enrichment: 15,
      confidence_penalty_sleeper_null_odds: 5,
      confidence_penalty_warning_6_8: 5,
      confidence_penalty_warning_3_5: 3,
      confidence_penalty_warning_9_plus: 25,
      model_deferred_rules: { sleeper_rfi_nrfi: "model_deferred_rfi_nrfi", prizepicks_triples: "model_deferred_low_event_prop" }
    }
  }

};

async function ensureSimulationProfileConfigs(env) {
  const metadata = simulationFormulaMetadata();
  for (const [profileKey, spec] of Object.entries(DEFAULT_SIM_CONFIGS)) {
    await run(env.SCORE_DB, `
      INSERT INTO scoring_engine_simulation_profile_configs (
        profile_key, profile_version, profile_status, config_json, formula_metadata_json,
        thresholds_locked, scoring_enabled, true_probability_enabled, created_at, updated_at
      ) VALUES (?, ?, 'active_simulation_only', ?, ?, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(profile_key) DO UPDATE SET
        profile_version=excluded.profile_version,
        profile_status='active_simulation_only',
        config_json=excluded.config_json,
        formula_metadata_json=excluded.formula_metadata_json,
        thresholds_locked=0,
        scoring_enabled=0,
        true_probability_enabled=0,
        updated_at=CURRENT_TIMESTAMP
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
    version: String(row.profile_version || cfg.profile_version || "0.2.4-db-config"),
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
    confidencePenaltyWarning9Plus: finiteNumber(cfg.confidence_penalty_warning_9_plus, 20),
    marketDirectEvidenceRawAdjustments: cfg.market_direct_evidence_raw_adjustments || {},
    marketEvidenceScoreCaps: cfg.market_evidence_score_caps || {},
    contextScoreCaps: cfg.context_score_caps || {},
    symmetryRules: cfg.symmetry_rules || {},
    pricePressureScale: finiteNumber(cfg.price_pressure_scale, 0.16),
    linePressureScale: finiteNumber(cfg.line_pressure_scale, 1.0),
    deterministicSpreadScale: finiteNumber(cfg.deterministic_spread_scale, 0.45),
    propLessRawCase: sqlCaseFromMap("m.canonical_prop_key", cfg.prop_less_raw_adjustments, 0)
  };
}

function parseJsonObject(value) {
  if (!value || typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function getPath(obj, path) {
  let cur = obj;
  for (const part of path) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = cur[part];
  }
  return cur == null ? null : cur;
}

function numOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(n, lo = 0, hi = 100) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.max(lo, Math.min(hi, x));
}

function round0(n) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.round(x) : null;
}

function adjustment(map, key, fallback = 0) {
  const m = map || {};
  if (Object.prototype.hasOwnProperty.call(m, key == null ? '__null__' : String(key))) return finiteNumber(m[key == null ? '__null__' : String(key)], fallback);
  if (Object.prototype.hasOwnProperty.call(m, 'default')) return finiteNumber(m.default, fallback);
  return fallback;
}

function directEvidenceInfo(details) {
  const propEvidence = getPath(details, ['market_context', 'prop_evidence']) || {};
  const rowCount = Math.max(0, Math.trunc(finiteNumber(propEvidence.row_count, 0)));
  const present = propEvidence.present === true || String(propEvidence.present || '').toLowerCase() === 'true' || rowCount > 0;
  const coverageRows = getPath(details, ['market_context', 'coverage_rows']);
  const coverageCount = Array.isArray(coverageRows) ? coverageRows.length : 0;
  let bucket = 'direct_prop_evidence_rows_unknown';
  if (rowCount <= 0) bucket = coverageCount > 0 ? 'direct_prop_evidence_rows_0_with_coverage' : 'direct_prop_evidence_rows_0_no_coverage';
  else if (rowCount === 1) bucket = 'direct_prop_evidence_rows_1';
  else if (rowCount <= 4) bucket = 'direct_prop_evidence_rows_2_to_4';
  else bucket = 'direct_prop_evidence_rows_gte_5';
  return { rowCount, present, coverageCount, bucket };
}

function evidenceScoreCap(cfg, info, fallback = 100) {
  return finiteNumber((cfg.market_evidence_score_caps || {})[info.bucket], fallback);
}

function arrayIncludesNormalized(list, value) {
  const needle = String(value == null ? '' : value).trim().toLowerCase();
  return Array.isArray(list) && list.map(v => String(v == null ? '' : v).trim().toLowerCase()).includes(needle);
}

function effectiveWarningCount(cfg, row, evidenceInfo, effectiveMarketPropContextStatus) {
  const rawWarnings = Math.max(0, Math.trunc(Number(row.warning_count || 0)));
  const rules = cfg.effective_warning_rules || {};
  if (!rules.enabled || rawWarnings < 9) return rawWarnings;

  const blockerCount = Math.max(0, Math.trunc(Number(row.blocker_count || 0)));
  const blockerLimit = Math.max(0, Math.trunc(finiteNumber(rules.soft_partial_context_requires_blocker_count_lte, 0)));
  const minEvidenceRows = Math.max(0, Math.trunc(finiteNumber(rules.soft_partial_context_requires_direct_prop_evidence_rows_gte, 1)));
  const softStatus = String(row.matrix_status || '') === 'matrix_partial_context'
    && blockerCount <= blockerLimit
    && Number(evidenceInfo && evidenceInfo.rowCount || 0) >= minEvidenceRows
    && arrayIncludesNormalized(rules.soft_partial_context_factor_statuses || ['packet_partial'], row.factor_status)
    && arrayIncludesNormalized(rules.soft_partial_context_daily_statuses || ['missing_current_readiness'], row.daily_readiness_status)
    && arrayIncludesNormalized(rules.soft_partial_context_market_prop_statuses || ['market_prop_context_present'], effectiveMarketPropContextStatus);

  if (softStatus) return Math.max(0, Math.trunc(finiteNumber(rules.soft_partial_context_effective_warning_count, 6)));
  return rawWarnings;
}

function contextScoreCap(cfg, row, fallback = 100, effectiveWarningsOverride = null) {
  const status = String(row.matrix_status || '');
  const warnings = effectiveWarningsOverride == null ? Number(row.warning_count || 0) : Number(effectiveWarningsOverride || 0);
  const caps = cfg.context_score_caps || {};
  if (status === 'matrix_partial_context') {
    if (warnings >= 9) return finiteNumber(caps.matrix_partial_context_warning_9_plus, fallback);
    if (warnings >= 6) return finiteNumber(caps.matrix_partial_context_warning_6_8, fallback);
    if (warnings >= 3) return finiteNumber(caps.matrix_partial_context_warning_3_5, fallback);
    return finiteNumber(caps.matrix_partial_context_warning_0_2, fallback);
  }
  return finiteNumber(caps.matrix_full_context, fallback);
}

function capScoreWithReasons(score, caps) {
  let value = score;
  const applied = [];
  for (const cap of caps) {
    if (cap && Number.isFinite(cap.value) && Number.isFinite(value) && value > cap.value) {
      value = cap.value;
      applied.push(cap);
    }
  }
  return { score: value, applied };
}

function americanPressure(price, scale) {
  const p = numOrNull(price);
  if (p == null) return 0;
  if (p < 0) return (((Math.abs(p) * 100.0) / (Math.abs(p) + 100.0)) - 50.0) * scale;
  return (((100.0 / (p + 100.0)) - 0.50) * 100.0) * scale;
}


function sourcePayoutFairnessCalibration(sourceKey, oddsType, payoutVariant, sideMode, prop, lineValue, selectedSide, scoreBefore, context = {}) {
  if (scoreBefore == null) return { adjusted_score: null, adjustment: 0, cap: null, reason: 'no_selected_score' };
  const source = String(sourceKey || '').toLowerCase();
  if (source !== 'prizepicks') return { adjusted_score: scoreBefore, adjustment: 0, cap: null, reason: 'non_prizepicks_no_adjustment' };

  const odds = String(oddsType || payoutVariant || '').toLowerCase();
  const propKey = String(prop || '').toLowerCase();
  const line = numOrNull(lineValue);
  let adjustment = 0;
  let cap = null;
  let reason = 'prizepicks_no_source_payout_adjustment';

  // Grounded calibration from same player/game/prop/side/line audits:
  // v0.4.10 left PP standard about 15-16 points behind Sleeper, and PP goblin/demon
  // more-only about 27-29 points behind Sleeper, even when prepared/matrix context matched.
  // This layer is intentionally source-fair, not recommendation/ranking logic: it reduces the
  // artificial source/payout discount while preserving a payout risk ceiling below elite.
  if (odds === 'standard') {
    const effectiveMarket = String(context.effective_market_prop_context_status || '').toLowerCase();
    const rawMarket = String(context.raw_market_prop_context_status || effectiveMarket || '').toLowerCase();

    // v0.4.14 root-cause fix:
    // v0.4.13 still keyed the PP-standard restore off effectiveMarket/direct prop row count.
    // For rows where the persisted row-level market status was market_prop_context_present but
    // details.market_context.prop_evidence.row_count was absent/0, effectiveMarket was downgraded
    // to not_found/missing before this layer. That made the restore branch unreachable for the
    // exact market-present same-line rows that SQL simulations targeted, leaving the -15/-16 gap.
    // Use the persisted row market status for this source-fair payout restore gate. Raw not_found /
    // missing rows remain guarded and unrecentered, preserving the v0.4.12 blind-row fix.
    const rowMarketBlind = rawMarket === 'market_prop_context_not_found' || rawMarket === 'market_prop_context_missing' || rawMarket === '';
    if (rowMarketBlind) {
      adjustment = 0;
      cap = null;
      reason = 'prizepicks_standard_raw_market_blind_no_recenter_same_line_guard';
    } else if (rawMarket === 'market_prop_context_present') {
      adjustment = 14;
      cap = 83;
      reason = 'prizepicks_standard_raw_market_present_fairness_restore_plus14_cap83';
    } else {
      adjustment = 0;
      cap = null;
      reason = 'prizepicks_standard_unknown_market_status_no_recenter_guard';
    }
  } else if (odds === 'goblin') {
    adjustment = 20;
    cap = 79;
    reason = 'prizepicks_goblin_more_only_gap_recentered_with_payout_risk_cap';
    if (['total_bases','hits_runs_rbis','rbis','runs','singles','walks'].includes(propKey) && line != null && line <= 0.5) {
      adjustment = 14;
      cap = 76;
      reason = 'prizepicks_goblin_low_line_medium_frequency_tempered_gap_recenter';
    }
  } else if (odds === 'demon') {
    adjustment = 22;
    cap = 77;
    reason = 'prizepicks_demon_more_only_gap_recentered_with_payout_risk_cap';
    if (['home_runs','stolen_bases','doubles'].includes(propKey)) {
      adjustment = 15;
      cap = 74;
      reason = 'prizepicks_demon_low_frequency_tempered_gap_recenter';
    }
  }

  if (!adjustment || cap == null) return { adjusted_score: scoreBefore, adjustment: 0, cap: null, reason };
  const adjusted = Math.min(cap, clamp(scoreBefore + adjustment));
  return { adjusted_score: adjusted, adjustment: adjusted - scoreBefore, cap, reason };
}

function linePressure(canonicalPropKey, lineValue, side) {
  const line = numOrNull(lineValue) ?? 0;
  const prop = String(canonicalPropKey || '');
  const more = side === 'more';
  if (['hits','singles'].includes(prop)) {
    if (line <= 0.5) return more ? 1.25 : -0.75;
    if (line >= 1.5) return more ? -1.25 : 1.25;
  }
  if (['total_bases','hits_runs_rbis','rbis','runs'].includes(prop)) {
    if (line <= 1.5) return more ? 0.75 : -0.50;
    if (line >= 2.5) return more ? -1.50 : 1.50;
  }
  if (prop === 'pitcher_strikeouts') {
    if (line <= 3.5) return more ? 1.25 : -1.00;
    if (line >= 6.5) return more ? -1.50 : 1.50;
  }
  if (['pitcher_outs','pitching_outs'].includes(prop)) {
    if (line <= 14.5) return more ? 1.25 : -1.00;
    if (line >= 18.5) return more ? -1.50 : 1.50;
  }
  return 0;
}

function deterministicSpread(row, side, scale) {
  const player = Number(row.mlb_player_id || 0);
  const game = Number(row.game_pk || 0);
  const line = Math.trunc((Number(row.board_line_value || 0) || 0) * 100);
  const seed = side === 'more'
    ? Math.abs(player * 31 + game * 17 + line * 13)
    : Math.abs(player * 37 + game * 19 + line * 7);
  return (((seed % 11) - 5) * scale);
}

function buildSimulationShadowRow(batchId, profileKey, p, row) {
  const matrixPayload = parseJsonObject(row.matrix_payload_json);
  const details = parseJsonObject(row.details_json);
  const sideCtx = getPath(matrixPayload, ['side_context']) || {};
  const variationCtx = getPath(matrixPayload, ['variation_context']) || {};
  const prepared = getPath(matrixPayload, ['prepared']) || {};
  const sideVariation = getPath(details, ['side_variation']) || {};
  const evidenceInfo = directEvidenceInfo(details);

  const sourceLineType = prepared.source_line_type ?? null;
  const oddsType = prepared.odds_type ?? null;
  const payoutVariant = prepared.payout_variant ?? null;
  const sideMode = sideCtx.side_mode ?? null;
  const availableSides = sideCtx.available_sides == null ? null : (typeof sideCtx.available_sides === 'string' ? sideCtx.available_sides : JSON.stringify(sideCtx.available_sides));
  const variationKey = variationCtx.variation_key ?? sideVariation.variation_key ?? null;
  const overPrice = numOrNull(getPath(sideVariation, ['source_prices','over_price']) ?? getPath(sideCtx, ['source_prices','over_price']) ?? getPath(variationCtx, ['source_prices','over_price']));
  const underPrice = numOrNull(getPath(sideVariation, ['source_prices','under_price']) ?? getPath(sideCtx, ['source_prices','under_price']) ?? getPath(variationCtx, ['source_prices','under_price']));

  const sourceKey = row.source_key;
  const prop = row.canonical_prop_key;
  const modelDeferred = (sourceKey === 'sleeper' && prop === 'rfi_nrfi') || (sourceKey === 'prizepicks' && prop === 'triples') ? 1 : 0;
  const modelDeferredReason = sourceKey === 'sleeper' && prop === 'rfi_nrfi'
    ? 'model_deferred_rfi_nrfi'
    : (sourceKey === 'prizepicks' && prop === 'triples' ? 'model_deferred_low_event_prop' : null);
  const hardBlocked = !modelDeferred && (Number(row.blocking_for_scoring || 0) === 1 || row.matrix_status === 'matrix_deferred' || row.factor_status === 'blocked') ? 1 : 0;
  const completeMarketBlind = ['market_prop_context_missing','market_prop_context_not_found'].includes(row.market_prop_context_status)
    && ['', 'market_game_context_missing','market_game_context_not_found','market_game_context_absent'].includes(String(row.market_game_context_status || '')) ? 1 : 0;

  const cfg = p.config || {};
  const effectiveMarketPropContextStatus = evidenceInfo.rowCount <= 0
    ? (evidenceInfo.coverageCount > 0 ? 'market_prop_context_not_found' : 'market_prop_context_missing')
    : row.market_prop_context_status;
  const rawWarningCount = Math.max(0, Math.trunc(Number(row.warning_count || 0)));
  const effectiveWarnings = effectiveWarningCount(cfg, row, evidenceInfo, effectiveMarketPropContextStatus);
  const effectiveWarningSeverity = effectiveWarnings >= 9 ? 'warning_9_plus' : (effectiveWarnings >= 6 ? 'warning_6_8' : (effectiveWarnings >= 3 ? 'warning_3_5' : 'warning_0_2'));
  const rawBase = (row.factor_status === 'packet_ready' ? p.baseRawPacketReady : p.baseRawPacketPartial)
    + adjustment(cfg.market_raw_adjustments, effectiveMarketPropContextStatus, -2)
    + adjustment(cfg.market_direct_evidence_raw_adjustments, evidenceInfo.bucket, 0)
    + adjustment(cfg.daily_raw_adjustments, row.daily_readiness_status, 0)
    + adjustment(cfg.source_raw_adjustments, sourceKey, 0)
    + adjustment(cfg.odds_raw_adjustments, oddsType, 0);
  const rawMore = clamp(rawBase
    + adjustment(cfg.prop_raw_adjustments, prop, 0)
    + (linePressure(prop, row.board_line_value, 'more') * p.linePressureScale)
    + (sideMode === 'two_sided' ? americanPressure(overPrice, p.pricePressureScale) : 0)
    + deterministicSpread(row, 'more', p.deterministicSpreadScale));
  const rawLess = sideMode === 'two_sided'
    ? clamp(rawBase
      + adjustment(cfg.prop_less_raw_adjustments, prop, 0)
      + (linePressure(prop, row.board_line_value, 'less') * p.linePressureScale)
      + americanPressure(underPrice, p.pricePressureScale)
      + deterministicSpread(row, 'less', p.deterministicSpreadScale))
    : null;

  const symmetryDelta = finiteNumber((cfg.symmetry_rules || {}).two_sided_delta_lt, 1.0);
  const sideSymmetryRisk = sideMode === 'two_sided' && rawMore != null && rawLess != null && Math.abs(rawMore - rawLess) < symmetryDelta;
  let selectedSide = null;
  if (!hardBlocked && !modelDeferred) {
    if (sideMode === 'more_only') selectedSide = 'more';
    else if (sideMode === 'two_sided' && rawMore != null && rawLess != null) {
      if ((rawMore - rawLess) >= p.rawSideDeltaThreshold) selectedSide = 'more';
      else if ((rawLess - rawMore) >= p.rawSideDeltaThreshold) selectedSide = 'less';
      else if (rawMore > rawLess) selectedSide = 'more';
      else if (rawLess > rawMore) selectedSide = 'less';
    }
  }

  const scorePenalty = (completeMarketBlind ? p.scorePenaltyCompleteMarketBlindness : 0)
    + (!completeMarketBlind && effectiveMarketPropContextStatus === 'market_prop_context_missing' ? p.scorePenaltyMarketMissing : 0)
    + (!completeMarketBlind && effectiveMarketPropContextStatus === 'market_prop_context_not_found' ? p.scorePenaltyMarketNotFound : 0)
    + (row.factor_status === 'packet_partial' ? p.scorePenaltyPacketPartial : 0)
    + (row.daily_readiness_status === 'partial_enrichment' ? p.scorePenaltyPartialEnrichment : 0);
  const bonus = (!hardBlocked && !modelDeferred && effectiveMarketPropContextStatus === 'market_prop_context_present' && Number(row.warning_count || 0) === 0 && row.factor_status === 'packet_ready' && row.daily_readiness_status !== 'partial_enrichment') ? p.cleanBonusScore : 0;
  const confidencePenalty = (row.factor_status === 'packet_partial' ? p.confidencePenaltyPacketPartial : 0)
    + (row.daily_readiness_status === 'partial_enrichment' ? p.confidencePenaltyPartialEnrichment : 0)
    + (sourceKey === 'sleeper' && oddsType == null ? p.confidencePenaltySleeperNullOdds : 0)
    + (effectiveWarnings >= 9 ? p.confidencePenaltyWarning9Plus : 0)
    + (effectiveWarnings >= 6 && effectiveWarnings <= 8 ? p.confidencePenaltyWarning68 : 0)
    + (effectiveWarnings >= 3 && effectiveWarnings <= 5 ? p.confidencePenaltyWarning35 : 0);
  const confidenceCap = Math.min(
    100,
    completeMarketBlind ? p.confidenceCapCompleteMarketBlindness : 100,
    (!completeMarketBlind && effectiveMarketPropContextStatus === 'market_prop_context_missing') ? p.confidenceCapMarketMissing : 100,
    (!completeMarketBlind && effectiveMarketPropContextStatus === 'market_prop_context_not_found') ? p.confidenceCapMarketNotFound : 100,
    effectiveWarnings >= 9 ? p.confidenceCapWarning9Plus : 100,
    evidenceInfo.rowCount <= 0 && evidenceInfo.coverageCount > 0 ? p.confidenceCapMarketNotFound : 100,
    evidenceInfo.rowCount <= 0 && evidenceInfo.coverageCount <= 0 ? p.confidenceCapMarketMissing : 100
  );

  const hardCaps = [
    { key: 'market_evidence_score_cap', value: evidenceScoreCap(cfg, evidenceInfo, p.maxScoreCap), evidence_bucket: evidenceInfo.bucket, direct_prop_evidence_row_count: evidenceInfo.rowCount },
    { key: 'context_score_cap', value: contextScoreCap(cfg, row, p.maxScoreCap, effectiveWarnings), matrix_status: row.matrix_status, warning_count: rawWarningCount, effective_warning_count: effectiveWarnings, effective_warning_severity: effectiveWarningSeverity }
  ];
  if (sideSymmetryRisk) {
    hardCaps.push({ key: 'side_symmetry_score_cap', value: evidenceInfo.rowCount <= 0 ? finiteNumber((cfg.symmetry_rules || {}).zero_direct_evidence_symmetry_cap, 76) : finiteNumber((cfg.symmetry_rules || {}).nonzero_direct_evidence_symmetry_cap, 88), side_delta: Math.abs((rawMore ?? 0) - (rawLess ?? 0)) });
  }

  let scoreInteger = null;
  let selectedCapResult = { applied: [] };
  if (!hardBlocked && !modelDeferred && selectedSide) {
    const selectedRaw = selectedSide === 'more' ? rawMore : rawLess;
    const uncappedSelected = Math.min(p.maxScoreCap, clamp(selectedRaw - scorePenalty + bonus));
    selectedCapResult = capScoreWithReasons(uncappedSelected, hardCaps);
    const preFairnessScore = round0(selectedCapResult.score);
    const fairness = sourcePayoutFairnessCalibration(sourceKey, oddsType, payoutVariant, sideMode, prop, row.board_line_value, selectedSide, preFairnessScore, { raw_market_prop_context_status: row.market_prop_context_status, effective_market_prop_context_status: effectiveMarketPropContextStatus, direct_prop_evidence_row_count: evidenceInfo.rowCount, direct_prop_evidence_bucket: evidenceInfo.bucket });
    scoreInteger = round0(fairness.adjusted_score);
    if (fairness.adjustment !== 0 || fairness.reason === 'prizepicks_standard_market_blind_no_recenter_same_line_guard') {
      selectedCapResult.applied = [
        ...(selectedCapResult.applied || []),
        {
          key: 'source_payout_fairness_calibration',
          source_key: sourceKey,
          odds_type: oddsType,
          payout_variant: payoutVariant,
          selected_side: selectedSide,
          score_before: preFairnessScore,
          adjustment: fairness.adjustment,
          cap: fairness.cap,
          score_after: scoreInteger,
          reason: fairness.reason
        }
      ];
    }
  }
  const sideGap = Math.abs((rawMore ?? 0) - (rawLess ?? rawMore ?? 0));
  const confidence = (!hardBlocked && !modelDeferred && selectedSide)
    ? round0(Math.min(confidenceCap, clamp(p.baseConfidence - confidencePenalty + Math.min(6, sideGap * 1.15) + (effectiveMarketPropContextStatus === 'market_prop_context_present' ? 3 : 0) + ((overPrice != null || underPrice != null) ? 2 : 0))))
    : null;
  const sortMicro = Math.abs(((Number(row.mlb_player_id || 0) * 31 + Number(row.game_pk || 0) * 17 + Math.trunc((Number(row.board_line_value || 0) || 0) * 100) * 13) % 999)) * p.microScale / 999.0;
  const scoreSort = scoreInteger == null ? null : scoreInteger + sortMicro;
  const moreFinal = selectedSide === 'more' ? scoreInteger : null;
  const lessAlt = rawLess == null ? null : round0(capScoreWithReasons(Math.min(p.maxScoreCap, clamp(rawLess - scorePenalty + bonus)), hardCaps).score);
  const lessFinal = sideMode === 'more_only' ? null : (selectedSide === 'less' ? scoreInteger : (selectedSide === 'more' ? lessAlt : null));

  const scoreStatus = modelDeferred ? 'model_deferred' : (hardBlocked ? 'simulation_hard_blocked' : (!selectedSide ? 'simulation_side_tie_unresolved' : 'simulated_profile_locked'));
  let scoreGrade = 'BIN_REJECT';
  if (modelDeferred) scoreGrade = 'BIN_MODEL_DEFERRED';
  else if (hardBlocked) scoreGrade = 'BIN_HARD_BLOCK';
  else if (scoreInteger == null) scoreGrade = 'BIN_0_NULL';
  else if (scoreInteger >= p.gradeEliteMin) scoreGrade = 'BIN_ELITE';
  else if (scoreInteger >= p.gradeStrongMin) scoreGrade = 'BIN_STRONG';
  else if (scoreInteger >= p.gradeQualifiedMin) scoreGrade = 'BIN_QUALIFIED';
  else if (scoreInteger >= p.gradeArchiveMin) scoreGrade = 'BIN_ARCHIVE';
  const confidenceStatus = confidence == null ? null : (confidence >= p.minLiveConfidence ? 'confidence_live_eligible' : 'confidence_archive_only');
  const livePlayable = (
    !modelDeferred &&
    !hardBlocked &&
    selectedSide &&
    scoreInteger >= p.minLiveScore &&
    confidence >= p.minLiveConfidence &&
    row.factor_status === 'packet_ready' &&
    ['ready', 'ready_with_warnings'].includes(row.daily_readiness_status) &&
    row.market_prop_context_status === 'market_prop_context_present'
  ) ? 1 : 0;
  const archiveEligible = (!modelDeferred && !hardBlocked && selectedSide && scoreInteger >= p.archiveScoreThreshold) ? 1 : 0;

  const calculationJson = JSON.stringify({
    worker_version: VERSION,
    simulation_only: 1,
    profile_key: profileKey,
    profile_version: p.version,
    active_values_source: 'SCORE_DB.scoring_engine_simulation_profile_configs.config_json',
    all_calibration_variables_db_stored: 1,
    formula_order: 'inventory_defer_gate -> js_bounded_independent_more_less_scores -> price_line_prop_side_pressure -> pre_cap_side_selection -> score_penalties -> score_cap -> confidence_caps_penalties -> score_sort_micro_adjustment -> archive_live_gates',
    raw_side_delta_threshold: p.rawSideDeltaThreshold,
    min_live_score: p.minLiveScore,
    min_live_confidence: p.minLiveConfidence,
    archive_score_threshold: p.archiveScoreThreshold,
    thresholds_locked: 0,
    scoring_enabled: 0,
    true_probability_enabled: 0,
    no_true_hit_probability_claims: 1,
    score_sort_policy: 'score_sort_0_100_only; positive_micro_lt_0_0001; never used for archive/live/bins',
    effective_market_prop_context_status: effectiveMarketPropContextStatus,
    direct_prop_evidence_row_count: evidenceInfo.rowCount,
    direct_prop_evidence_bucket: evidenceInfo.bucket,
    direct_prop_evidence_present: evidenceInfo.present,
    market_coverage_row_count: evidenceInfo.coverageCount,
    raw_warning_count: rawWarningCount,
    effective_warning_count: effectiveWarnings,
    effective_warning_severity: effectiveWarningSeverity,
    effective_warning_policy: 'raw_warning_count_preserved_but_soft_partial_missing_current_readiness_with_direct_evidence_uses_effective_warning_tier',
    score_caps_applied: selectedCapResult.applied,
    source_payout_fairness_calibration_enabled: 1,
    source_payout_fairness_policy: 'prizepicks_standard_raw_market_blind_guard_plus_raw_market_present_restore_plus14_cap83; goblin_demon_more_only_tempered_payout_caps; no_sleeper_boost; no_final_board_mutation',
    side_symmetry_risk: sideSymmetryRisk,
    goblin_demon_less_score_policy: 'NULL_NOT_ZERO',
    d1_memory_policy: 'no_large_scoring_cte; bounded_js_chunk_compute_and_json_each_batch_inserts_one_bind_per_batch'
  });

  return [
    `${batchId}|${profileKey}|sim|${row.matrix_id || row.prepared_row_id || row.source_line_id || `${row.player_name}|${prop}`}`,
    batchId,
    profileKey,
    p.version,
    row.matrix_id,
    row.prepared_row_id,
    row.source_line_id,
    sourceKey,
    row.game_pk,
    row.official_date,
    row.official_game_time_utc,
    row.mlb_player_id,
    row.player_name,
    prop,
    row.board_line_value,
    variationKey,
    sourceLineType,
    oddsType,
    payoutVariant,
    sideMode,
    availableSides,
    row.matrix_status,
    row.matrix_grade,
    row.factor_status,
    row.market_game_context_status,
    row.market_prop_context_status,
    row.daily_readiness_status,
    Number(row.blocking_for_scoring || 0),
    Number(row.warning_count || 0),
    Number(row.blocker_count || 0),
    Number(row.missing_component_count || 0),
    p.maxScoreCap,
    scorePenalty,
    bonus,
    rawMore,
    rawLess,
    moreFinal,
    lessFinal,
    scoreInteger,
    selectedSide,
    scoreStatus,
    scoreGrade,
    archiveEligible,
    0,
    calculationJson,
    row.matrix_payload_json,
    row.details_json,
    confidence,
    confidenceStatus,
    livePlayable,
    modelDeferred,
    modelDeferredReason,
    scoreSort,
    scoreInteger
  ];
}

async function insertShadowRows(env, valueRows) {
  if (!valueRows.length) return 0;
  const jsonRows = JSON.stringify(valueRows);
  const columns = `
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
      created_at, updated_at`;
  const selects = Array.from({ length: 54 }, (_, i) => `json_extract(value, '$[${i}]')`).join(',\n      ');
  const sql = `
    INSERT INTO scoring_engine_simulation_shadow (${columns})
    SELECT
      ${selects},
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    FROM json_each(?)
  `;
  await run(env.SCORE_DB, sql, jsonRows);
  return valueRows.length;
}

async function insertSimulationProfile(env, batchId, profileKey) {
  const p = await profileConstants(env, profileKey);
  const readChunkSize = 75;
  // 54 bound vars per shadow row. D1/SQLite var ceiling is near 999, so 15 rows = 810 vars.
  const writeBatchSize = 10;
  let cursorMatrixId = null;
  let insertedRows = 0;
  let processedChunks = 0;
  while (true) {
    const rows = await all(env.SCORE_DB, `
      SELECT
        matrix_id, prepared_row_id, source_line_id, source_key, game_pk, official_date, official_game_time_utc,
        mlb_player_id, player_name, canonical_prop_key, board_line_value,
        matrix_status, matrix_grade, factor_status, market_game_context_status, market_prop_context_status,
        daily_readiness_status, blocking_for_scoring, warning_count, blocker_count, missing_component_count,
        matrix_payload_json, details_json
      FROM prop_matrix_current
      WHERE (? IS NULL OR matrix_id > ?)
      ORDER BY matrix_id
      LIMIT ?
    `, cursorMatrixId, cursorMatrixId, readChunkSize);
    if (!rows.length) break;
    const built = rows.map(row => buildSimulationShadowRow(batchId, profileKey, p, row));
    for (let i = 0; i < built.length; i += writeBatchSize) {
      insertedRows += await insertShadowRows(env, built.slice(i, i + writeBatchSize));
    }
    processedChunks += 1;
    cursorMatrixId = rows[rows.length - 1].matrix_id;
    if (processedChunks > 1000) throw new Error('scoring_simulation_chunk_guard_exceeded');
  }
  const countRow = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM scoring_engine_simulation_shadow WHERE simulation_batch_id=? AND profile_key=?`, batchId, profileKey);
  const persistedRows = Number(countRow && countRow.rows ? countRow.rows : insertedRows);
  if (persistedRows !== insertedRows) {
    throw new Error(`scoring_simulation_profile_count_mismatch:${profileKey}:inserted=${insertedRows}:persisted=${persistedRows}`);
  }
  return persistedRows;
}

async function assertSimulationProfileComplete(env, batchId, profileKey, expectedRows) {
  const row = await first(env.SCORE_DB, `
    SELECT
      COUNT(*) AS rows,
      COUNT(DISTINCT matrix_id) AS distinct_matrix_ids,
      COUNT(DISTINCT prepared_row_id) AS distinct_prepared_rows
    FROM scoring_engine_simulation_shadow
    WHERE simulation_batch_id=? AND profile_key=?
  `, batchId, profileKey);
  const rows = Number(row && row.rows ? row.rows : 0);
  const matrixIds = Number(row && row.distinct_matrix_ids ? row.distinct_matrix_ids : 0);
  const preparedRows = Number(row && row.distinct_prepared_rows ? row.distinct_prepared_rows : 0);
  if (rows !== expectedRows || matrixIds !== expectedRows || preparedRows !== expectedRows) {
    throw new Error(`scoring_simulation_profile_incomplete:${profileKey}:rows=${rows}:matrix_ids=${matrixIds}:prepared_rows=${preparedRows}:expected=${expectedRows}`);
  }
  return { rows, distinct_matrix_ids: matrixIds, distinct_prepared_rows: preparedRows };
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
      SUM(CASE WHEN live_playable = 1 AND factor_status <> 'packet_ready' THEN 1 ELSE 0 END) AS live_playable_not_packet_ready,
      SUM(CASE WHEN live_playable = 1 AND daily_readiness_status NOT IN ('ready','ready_with_warnings') THEN 1 ELSE 0 END) AS live_playable_not_daily_ready,
      SUM(CASE WHEN live_playable = 1 AND market_prop_context_status <> 'market_prop_context_present' THEN 1 ELSE 0 END) AS live_playable_market_context_not_present,
      SUM(CASE WHEN side_mode = 'two_sided' AND raw_more_score IS NOT NULL AND raw_less_score IS NOT NULL AND ABS(raw_more_score - raw_less_score) >= 0.50 AND selected_side IS NULL AND model_deferred = 0 AND score_status <> 'simulation_hard_blocked' AND COALESCE(blocking_for_scoring,0) = 0 THEN 1 ELSE 0 END) AS raw_delta_selectable_but_null_side,
      SUM(CASE WHEN side_mode = 'two_sided' AND raw_more_score IS NOT NULL AND raw_less_score IS NOT NULL AND ABS(raw_more_score - raw_less_score) < 0.50 AND selected_side IS NULL AND model_deferred = 0 AND score_status <> 'simulation_hard_blocked' AND COALESCE(blocking_for_scoring,0) = 0 THEN 1 ELSE 0 END) AS true_micro_tie_null_side,
      SUM(CASE WHEN source_key = 'sleeper' AND canonical_prop_key = 'rfi_nrfi' AND score_status <> 'model_deferred' THEN 1 ELSE 0 END) AS sleeper_rfi_not_deferred,
      SUM(CASE WHEN source_key = 'prizepicks' AND canonical_prop_key = 'triples' AND score_status <> 'model_deferred' THEN 1 ELSE 0 END) AS prizepicks_triples_not_deferred,
      SUM(CASE WHEN score_sort_0_100 IS NOT NULL AND ABS(score_sort_0_100 - score_integer_0_100) >= 0.0001 THEN 1 ELSE 0 END) AS score_sort_micro_out_of_bounds,
      SUM(CASE WHEN score_sort_0_100 IS NOT NULL AND (score_sort_0_100 < score_integer_0_100 OR score_sort_0_100 >= score_integer_0_100 + 1) THEN 1 ELSE 0 END) AS score_sort_integer_boundary_cross
    FROM scoring_engine_simulation_shadow
    WHERE simulation_batch_id=? AND profile_key=?
  `, batchId, profileKey);
  const out = {};
  for (const [k, v] of Object.entries(row || {})) out[k] = Number(v || 0);
  return out;
}


function d1Changes(res) {
  const raw = res && res.meta && Number.isFinite(Number(res.meta.changes)) ? Number(res.meta.changes) : null;
  return raw === null ? 0 : Math.max(0, Math.trunc(raw));
}

async function deleteByPrimaryKeyChunks(db, tableName, primaryKeyColumn, chunkSize = 1000, maxLoops = 1000) {
  let totalDeleted = 0;
  let loops = 0;
  while (loops < maxLoops) {
    const safeLimit = Math.max(1, Math.min(1000, Math.trunc(Number(chunkSize) || 1000)));
    const res = await run(db, `
      DELETE FROM ${tableName}
      WHERE ${primaryKeyColumn} IN (
        SELECT ${primaryKeyColumn}
        FROM ${tableName}
        LIMIT ${safeLimit}
      )
    `);
    const deleted = d1Changes(res);
    totalDeleted += deleted;
    loops += 1;
    if (deleted < safeLimit) break;
  }
  if (loops >= maxLoops) throw new Error(`chunked_cleanup_guard_exceeded:${tableName}`);
  return totalDeleted;
}

async function refreshSimulationScratchTables(env) {
  const shadowRowsDeleted = await deleteByPrimaryKeyChunks(env.SCORE_DB, 'scoring_engine_simulation_shadow', 'simulation_row_id', 1000, 1000);
  const issueRowsDeleted = await deleteByPrimaryKeyChunks(env.SCORE_DB, 'scoring_engine_simulation_issues', 'issue_id', 1000, 1000);
  return { shadow_rows_deleted: shadowRowsDeleted, issue_rows_deleted: issueRowsDeleted };
}

async function cleanupOldSimulationScratchTablesAfterSuccess(env, activeBatchId, chunkSize = 500, maxLoops = 1000) {
  let shadowRowsDeleted = 0;
  let issueRowsDeleted = 0;
  let loops = 0;
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(Number(chunkSize) || 500)));

  while (loops < maxLoops) {
    const res = await run(env.SCORE_DB, `
      DELETE FROM scoring_engine_simulation_shadow
      WHERE simulation_row_id IN (
        SELECT simulation_row_id
        FROM scoring_engine_simulation_shadow
        WHERE simulation_batch_id <> ?
        LIMIT ${safeLimit}
      )
    `, activeBatchId);
    const deleted = d1Changes(res);
    shadowRowsDeleted += deleted;
    loops += 1;
    if (deleted < safeLimit) break;
  }
  if (loops >= maxLoops) throw new Error('chunked_post_success_shadow_cleanup_guard_exceeded');

  loops = 0;
  while (loops < maxLoops) {
    const res = await run(env.SCORE_DB, `
      DELETE FROM scoring_engine_simulation_issues
      WHERE issue_id IN (
        SELECT issue_id
        FROM scoring_engine_simulation_issues
        WHERE simulation_batch_id <> ?
        LIMIT ${safeLimit}
      )
    `, activeBatchId);
    const deleted = d1Changes(res);
    issueRowsDeleted += deleted;
    loops += 1;
    if (deleted < safeLimit) break;
  }
  if (loops >= maxLoops) throw new Error('chunked_post_success_issue_cleanup_guard_exceeded');

  return { shadow_rows_deleted: shadowRowsDeleted, issue_rows_deleted: issueRowsDeleted };
}

async function expectedModelDeferredRows(env) {
  const row = await first(env.SCORE_DB, `
    SELECT COUNT(*) AS rows
    FROM prop_matrix_current
    WHERE matrix_status = 'matrix_deferred'
       OR (source_key = 'sleeper' AND canonical_prop_key = 'rfi_nrfi')
       OR (source_key = 'prizepicks' AND canonical_prop_key = 'triples')
  `);
  return Number(row && row.rows ? row.rows : 0);
}


async function failStaleRunningSimulationBatches(env) {
  // v0.2.5: repair stale batch records left by D1 object reset/timeouts before creating a new simulation batch.
  await run(env.SCORE_DB, `
    UPDATE scoring_engine_simulation_batches
    SET status='failed_runtime_timeout_stale',
        certification='SCORING_SIMULATION_STALE_RUNNING_MARKED_FAILED',
        certification_grade='FAILED',
        finished_at=COALESCE(finished_at, CURRENT_TIMESTAMP),
        output_json=json_object(
          'ok', 0,
          'data_ok', 0,
          'version', ?,
          'status', 'failed_runtime_timeout_stale',
          'certification', 'SCORING_SIMULATION_STALE_RUNNING_MARKED_FAILED',
          'certification_grade', 'FAILED',
          'repair_reason', 'stale running batch found before new simulation run; previous D1 timeout/object reset left batch open'
        )
    WHERE status='running'
      AND finished_at IS NULL
      AND datetime(started_at) <= datetime(CURRENT_TIMESTAMP, '-5 minutes')
  `, VERSION);
}

async function recordSimulationInvariants(env, batchId, profileKey, summary, expectedDeferredRows) {
  const expectedDeferred = Number(expectedDeferredRows || 0);
  const actualDeferred = Number(summary.model_deferred_rows || 0);
  const deferredMismatch = actualDeferred !== expectedDeferred;
  const checks = [
    ["BLOCKED_OR_DEFERRED_SCORE_LEAK", summary.blocked_or_deferred_score_leak, "BLOCKER", "Hard-blocked or model-deferred rows must not receive score, selected_side, archive_eligible, or live_playable."],
    ["SELECTED_SIDE_WITHOUT_SCORE", summary.selected_side_without_score, "BLOCKER", "No selected_side may exist without score_0_100."],
    ["MORE_ONLY_LESS_SCORE_NOT_NULL", summary.more_only_less_score_not_null, "BLOCKER", "More-only Goblin/Demon rows must keep less_score_0_100 NULL."],
    ["GOBLIN_DEMON_LESS_SELECTED", summary.goblin_demon_less_selected, "BLOCKER", "Goblin/Demon cannot select Less/Under."],
    ["LIVE_PLAYABLE_CONFIDENCE_UNDER_55", summary.live_playable_confidence_under_55, "BLOCKER", "No live_playable row can have confidence_0_100 below 55."],
    ["LIVE_PLAYABLE_SCORE_UNDER_70", summary.live_playable_score_under_70, "BLOCKER", "No live_playable row can have score_0_100 below 70."],
    ["LIVE_PLAYABLE_NULL_SIDE", summary.live_playable_null_side, "BLOCKER", "No live_playable row can have selected_side NULL."],
    ["LIVE_PLAYABLE_NOT_PACKET_READY", summary.live_playable_not_packet_ready, "BLOCKER", "No live_playable row can have factor_status other than packet_ready."],
    ["LIVE_PLAYABLE_NOT_DAILY_READY", summary.live_playable_not_daily_ready, "BLOCKER", "No live_playable row can have daily_readiness_status outside ready/ready_with_warnings."],
    ["LIVE_PLAYABLE_MARKET_CONTEXT_NOT_PRESENT", summary.live_playable_market_context_not_present, "BLOCKER", "No live_playable row can have market_prop_context_status other than market_prop_context_present."],
    ["RAW_DELTA_SELECTABLE_BUT_NULL_SIDE", summary.raw_delta_selectable_but_null_side, "BLOCKER", "Two-sided non-blocked rows with raw side delta >= 0.50 must select a side before cap/compression; hard-blocked/matrix_source_missing rows are excluded."],
    ["SLEEPER_RFI_NOT_DEFERRED", summary.sleeper_rfi_not_deferred, "BLOCKER", "Sleeper rfi_nrfi inventory must route to model_deferred."],
    ["PRIZEPICKS_TRIPLES_NOT_DEFERRED", summary.prizepicks_triples_not_deferred, "BLOCKER", "PrizePicks triples inventory must route to model_deferred_low_event_prop."],
    ["SCORE_SORT_MICRO_OUT_OF_BOUNDS", summary.score_sort_micro_out_of_bounds, "BLOCKER", "score_sort_0_100 micro adjustment must stay below 0.0001 from score_integer_0_100."],
    ["SCORE_SORT_INTEGER_BOUNDARY_CROSS", summary.score_sort_integer_boundary_cross, "BLOCKER", "score_sort_0_100 must never cross an integer boundary."],
    ["MODEL_DEFERRED_COUNT_MISMATCH", deferredMismatch ? actualDeferred : 0, "BLOCKER", `Expected model_deferred rows to equal current matrix deferred rows. expected=${expectedDeferred}; actual=${actualDeferred}.`],
    ["TRUE_MICRO_TIE_REVIEW", summary.true_micro_tie_null_side, "WARNING", "True raw side ties should be very rare on non-blocked rows and require deterministic tie-breaker review if present; hard-blocked rows are excluded."]
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
  await failStaleRunningSimulationBatches(env);
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

  let cleanupStats = { shadow_rows_deleted: 0, issue_rows_deleted: 0 };
  try {
    // v0.3.4: do not delete the prior good shadow before the new simulation proves it can write.
    // New simulation row IDs include batchId, so this run can build beside the previous shadow safely.

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

  const expectedDeferred = await expectedModelDeferredRows(env);
  const strictRows = await insertSimulationProfile(env, batchId, "STRICT_B");
  const strictProfileCompleteness = await assertSimulationProfileComplete(env, batchId, "STRICT_B", matrixRows);
  const hybridRows = await insertSimulationProfile(env, batchId, "HYBRID_CONTROL");
  const hybridProfileCompleteness = await assertSimulationProfileComplete(env, batchId, "HYBRID_CONTROL", matrixRows);
  const strictSummary = await summarizeSimulationProfile(env, batchId, "STRICT_B");
  const hybridSummary = await summarizeSimulationProfile(env, batchId, "HYBRID_CONTROL");
  await recordSimulationInvariants(env, batchId, "STRICT_B", strictSummary, expectedDeferred);
  await recordSimulationInvariants(env, batchId, "HYBRID_CONTROL", hybridSummary, expectedDeferred);

  const strictBlockersRow = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM scoring_engine_simulation_issues WHERE simulation_batch_id=? AND profile_key='STRICT_B' AND severity='BLOCKER' AND issue_count > 0`, batchId);
  const strictWarningsRow = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM scoring_engine_simulation_issues WHERE simulation_batch_id=? AND profile_key='STRICT_B' AND severity='WARNING' AND issue_count > 0`, batchId);
  const hybridBlockersRow = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM scoring_engine_simulation_issues WHERE simulation_batch_id=? AND profile_key='HYBRID_CONTROL' AND severity='BLOCKER' AND issue_count > 0`, batchId);
  const strictBlockers = Number(strictBlockersRow && strictBlockersRow.rows ? strictBlockersRow.rows : 0);
  const strictWarnings = Number(strictWarningsRow && strictWarningsRow.rows ? strictWarningsRow.rows : 0);
  const hybridBlockers = Number(hybridBlockersRow && hybridBlockersRow.rows ? hybridBlockersRow.rows : 0);
  const simulationRowsWritten = strictRows + hybridRows;

  cleanupStats = await cleanupOldSimulationScratchTablesAfterSuccess(env, batchId, 500, 1000);

  const certification = strictBlockers > 0
    ? "SCORING_SIMULATION_V0_3_7_LIVE_PLAYABLE_MARKET_CONTEXT_GATE_BLOCKED_BY_INVARIANTS"
    : (strictWarnings > 0 ? "SCORING_SIMULATION_V0_3_7_LIVE_PLAYABLE_MARKET_CONTEXT_GATE_PASS_WITH_REVIEW_WARNINGS" : "SCORING_SIMULATION_V0_3_7_LIVE_PLAYABLE_MARKET_CONTEXT_GATE_CERTIFIED_FOR_PROFILE_REVIEW");
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
    simulation_chunk_size: 80,
    simulation_write_batch_size: 10,
    profile_completion_guard: {
      expected_rows_per_profile: matrixRows,
      strict_b: strictProfileCompleteness,
      hybrid_control: hybridProfileCompleteness
    },
    fresh_shadow_issue_cleanup: cleanupStats,
    expected_model_deferred_rows_per_profile: expectedDeferred,
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
      "v0.3.7 keeps the v0.3.5 batch-scoped shadow row-id/finalization fixes and tightens live_playable so both profiles require packet_ready, ready/ready_with_warnings, and market_prop_context_present; archive eligibility remains score-only review inventory.",
      "score_0_100 and confidence_0_100 are separated; live_playable requires score/confidence plus packet_ready, daily readiness, and market prop context gates, and never uses score_sort_0_100.",
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
  } catch (err) {
    const errorMessage = String(err && err.message ? err.message : err);
    const output = baseIdentity({
      ok: false,
      data_ok: false,
      request_id: requestId,
      chain_id: chainId,
      simulation_batch_id: batchId,
      status: "scoring_engine_exception",
      certification: "SCORING_ENGINE_EXCEPTION",
      certification_grade: "FAILED",
      matrix_rows_read: matrixRows,
      simulation_rows_written: 0,
      fresh_shadow_issue_cleanup: cleanupStats,
      error: errorMessage,
      external_calls_performed: 0,
      no_ranking: true,
      no_final_board: true
    });
    await run(env.SCORE_DB, `
      UPDATE scoring_engine_simulation_batches
      SET status='failed_runtime_exception', certification='SCORING_ENGINE_EXCEPTION', certification_grade='FAILED', finished_at=CURRENT_TIMESTAMP, output_json=?
      WHERE simulation_batch_id=?
    `, JSON.stringify(output), batchId);
    return output;
  }
}


async function seedProductionScoringProfile(env) {
  await ensureSimulationProfileConfigs(env);
  const p = await profileConstants(env, PRODUCTION_PROFILE_KEY);
  await run(env.SCORE_DB, `
    INSERT INTO scoring_engine_profiles_current (
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
      created_at,
      updated_at
    ) VALUES (?, ?, 'active_engine_scoring_current', 'strict_b_current_scoring_from_existing_db_config', 0, 1, ?, ?, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(profile_key) DO UPDATE SET
      profile_version=excluded.profile_version,
      profile_status='active_engine_scoring_current',
      profile_mode='strict_b_current_scoring_from_existing_db_config',
      thresholds_locked=0,
      scoring_enabled=1,
      archive_score_threshold=excluded.archive_score_threshold,
      final_qualification_threshold=excluded.final_qualification_threshold,
      true_probability_enabled=0,
      formula_metadata_json=excluded.formula_metadata_json,
      updated_at=CURRENT_TIMESTAMP
  `, PRODUCTION_PROFILE_KEY, p.version, p.archiveScoreThreshold, p.gradeQualifiedMin, JSON.stringify({
    ...simulationFormulaMetadata(),
    production_current_scoring: true,
    source_config_table: 'SCORE_DB.scoring_engine_simulation_profile_configs',
    source_profile_key: PRODUCTION_PROFILE_KEY,
    true_probability_enabled: false,
    no_true_hit_probability_claims: true,
    no_ranking: true,
    no_final_board: true
  }));
  return p;
}

async function insertEngineCurrentRows(env, valueRows) {
  if (!valueRows.length) return 0;
  const mapped = valueRows.map(v => [
    String(v[0]).replace('|sim|', '|engine|'), // score_row_id
    v[1],  // batch_id
    v[4],  // matrix_id
    v[5],  // prepared_row_id
    v[6],  // source_line_id
    v[7],  // source_key
    v[8],  // game_pk
    v[9],  // official_date
    v[10], // official_game_time_utc
    v[11], // mlb_player_id
    v[12], // player_name
    v[13], // canonical_prop_key
    v[14], // line_value
    v[15], // variation_key
    v[16], // source_line_type
    v[17], // odds_type
    v[18], // payout_variant
    v[19], // side_mode
    v[20], // available_sides_json
    v[39], // selected_side
    v[36], // more_score_0_100
    v[37], // less_score_0_100
    v[38], // score_0_100
    v[40] === 'simulation_hard_blocked' ? 'blocked_by_matrix' : (v[40] === 'simulated_profile_locked' ? 'scored_current' : v[40]),
    v[41], // score_grade
    null, null, null, null, // side eligibility fields filled below from matrix payload snapshot in SQL? keep null-safe here; older engine proof already validated side mode/available sides.
    v[2],  // profile_key
    v[3],  // profile_version
    0,     // thresholds_locked
    70,    // archive_score_threshold; actual threshold is also embedded in calculation_json
    v[42], // archive_eligible
    0,     // archive_written
    String(v[44] || '').replace('"simulation_only":1', '"simulation_only":0,"production_engine_current":1'),
    v[45], // matrix_payload_json_snapshot
    v[46], // details_json_snapshot
    v[21], // matrix_status
    v[22], // matrix_grade
    v[23], // factor_status
    v[24], // market_game_context_status
    v[25], // market_prop_context_status
    v[26], // daily_readiness_status
    v[27], // blocking_for_scoring
    v[28], // warning_count
    v[29], // blocker_count
    v[30], // missing_component_count
    v[47], // confidence_0_100
    v[48], // confidence_status
    v[49], // live_playable
    v[50], // model_deferred
    v[51], // model_deferred_reason
    v[52], // score_sort_0_100
    v[53], // score_integer_0_100
    v[34], // raw_more_score
    v[35], // raw_less_score
    v[32], // penalty_total
    v[33]  // bonus_total
  ]);
  const jsonRows = JSON.stringify(mapped);
  const columns = `
      score_row_id, batch_id, matrix_id, prepared_row_id, source_line_id, source_key, game_pk, official_date, official_game_time_utc,
      mlb_player_id, player_name, canonical_prop_key, line_value, variation_key, source_line_type, odds_type, payout_variant,
      side_mode, available_sides_json, selected_side, more_score_0_100, less_score_0_100, score_0_100, score_status, score_grade,
      side_eligibility_status, side_eligibility_reason, side_availability_status, goblin_demon_under_blocker,
      profile_key, profile_version, thresholds_locked, archive_score_threshold, archive_eligible, archive_written,
      calculation_json, matrix_payload_json_snapshot, details_json_snapshot,
      matrix_status, matrix_grade, factor_status, market_game_context_status, market_prop_context_status, daily_readiness_status,
      blocking_for_scoring, warning_count, blocker_count, missing_component_count,
      confidence_0_100, confidence_status, live_playable, model_deferred, model_deferred_reason,
      score_sort_0_100, score_integer_0_100, raw_more_score, raw_less_score, penalty_total, bonus_total,
      created_at, updated_at`;
  const selects = Array.from({ length: 59 }, (_, i) => `json_extract(value, '$[${i}]')`).join(',\n      ');
  await run(env.SCORE_DB, `
    INSERT OR REPLACE INTO scoring_engine_current (${columns})
    SELECT
      ${selects},
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    FROM json_each(?)
  `, jsonRows);
  // Fill side eligibility diagnostics from the preserved matrix payload JSON using schema-safe JSON extraction.
  await run(env.SCORE_DB, `
    UPDATE scoring_engine_current
    SET
      side_eligibility_status = json_extract(matrix_payload_json_snapshot, '$.side_context.side_eligibility_status'),
      side_eligibility_reason = json_extract(matrix_payload_json_snapshot, '$.side_context.side_eligibility_reason'),
      side_availability_status = json_extract(matrix_payload_json_snapshot, '$.side_context.side_availability_status'),
      goblin_demon_under_blocker = json_extract(matrix_payload_json_snapshot, '$.side_context.goblin_demon_under_blocker')
    WHERE batch_id = json_extract(?, '$[0][1]')
      AND side_eligibility_status IS NULL
  `, jsonRows);
  return valueRows.length;
}

async function insertEngineCurrentProfileChunk(env, batchId, profileKey, options = {}) {
  const p = await profileConstants(env, profileKey);
  const readChunkSize = Number(options.readChunkSize || 60);
  const writeBatchSize = Number(options.writeBatchSize || 8);
  const maxRowsThisInvocation = Number(options.maxRowsThisInvocation || 420);
  const maxMillis = Number(options.maxMillis || 43000);
  const started = Date.now();
  const cursorRow = await first(env.SCORE_DB, `
    SELECT MAX(matrix_id) AS cursor_matrix_id, COUNT(*) AS rows
    FROM scoring_engine_current
    WHERE batch_id=? AND profile_key=?
  `, batchId, profileKey);
  let cursorMatrixId = cursorRow && cursorRow.cursor_matrix_id ? cursorRow.cursor_matrix_id : null;
  let insertedRows = 0;
  let processedChunks = 0;
  while (insertedRows < maxRowsThisInvocation && (Date.now() - started) < maxMillis) {
    const rows = await all(env.SCORE_DB, `
      SELECT
        matrix_id, prepared_row_id, source_line_id, source_key, game_pk, official_date, official_game_time_utc,
        mlb_player_id, player_name, canonical_prop_key, board_line_value,
        matrix_status, matrix_grade, factor_status, market_game_context_status, market_prop_context_status,
        daily_readiness_status, blocking_for_scoring, warning_count, blocker_count, missing_component_count,
        matrix_payload_json, details_json
      FROM prop_matrix_current
      WHERE (? IS NULL OR matrix_id > ?)
      ORDER BY matrix_id
      LIMIT ?
    `, cursorMatrixId, cursorMatrixId, readChunkSize);
    if (!rows.length) break;
    const built = rows.map(row => buildSimulationShadowRow(batchId, profileKey, p, row));
    for (let i = 0; i < built.length; i += writeBatchSize) {
      insertedRows += await insertEngineCurrentRows(env, built.slice(i, i + writeBatchSize));
      if ((Date.now() - started) >= maxMillis) break;
    }
    processedChunks += 1;
    cursorMatrixId = rows[rows.length - 1].matrix_id;
    if (processedChunks > 100) throw new Error('scoring_engine_current_chunk_guard_exceeded');
  }
  const countRow = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM scoring_engine_current WHERE batch_id=? AND profile_key=?`, batchId, profileKey);
  const persistedRows = Number(countRow && countRow.rows ? countRow.rows : 0);
  const remainingRow = await first(env.SCORE_DB, `
    SELECT COUNT(*) AS rows
    FROM prop_matrix_current
    WHERE (? IS NULL OR matrix_id > ?)
  `, cursorMatrixId, cursorMatrixId);
  return {
    inserted_this_invocation: insertedRows,
    persisted_rows: persistedRows,
    cursor_matrix_id: cursorMatrixId,
    remaining_rows: Number(remainingRow && remainingRow.rows ? remainingRow.rows : 0),
    processed_chunks: processedChunks,
    elapsed_ms: Date.now() - started
  };
}

async function insertEngineCurrentProfile(env, batchId, profileKey) {
  let total = 0;
  for (let i = 0; i < 1000; i++) {
    const chunk = await insertEngineCurrentProfileChunk(env, batchId, profileKey, { maxRowsThisInvocation: 100000, maxMillis: 240000 });
    total = chunk.persisted_rows;
    if (!chunk.remaining_rows) break;
  }
  return total;
}

async function summarizeEngineCurrent(env, batchId) {
  const row = await first(env.SCORE_DB, `
    SELECT
      COUNT(*) AS score_rows,
      SUM(CASE WHEN score_status = 'blocked_by_matrix' THEN 1 ELSE 0 END) AS hard_blocked_rows,
      SUM(CASE WHEN score_status = 'model_deferred' THEN 1 ELSE 0 END) AS model_deferred_rows,
      SUM(CASE WHEN score_status = 'scoring_side_tie_unresolved' OR score_status = 'simulation_side_tie_unresolved' THEN 1 ELSE 0 END) AS side_unresolved_rows,
      SUM(CASE WHEN score_grade = 'BIN_REJECT' THEN 1 ELSE 0 END) AS reject_rows,
      SUM(CASE WHEN score_grade = 'BIN_ARCHIVE' THEN 1 ELSE 0 END) AS archive_rows,
      SUM(CASE WHEN score_grade = 'BIN_QUALIFIED' THEN 1 ELSE 0 END) AS qualified_rows,
      SUM(CASE WHEN score_grade = 'BIN_STRONG' THEN 1 ELSE 0 END) AS strong_rows,
      SUM(CASE WHEN score_grade = 'BIN_ELITE' THEN 1 ELSE 0 END) AS elite_rows,
      SUM(CASE WHEN score_0_100 IS NOT NULL THEN 1 ELSE 0 END) AS non_null_score_rows,
      SUM(CASE WHEN selected_side IS NOT NULL THEN 1 ELSE 0 END) AS selected_side_rows,
      SUM(CASE WHEN archive_eligible = 1 THEN 1 ELSE 0 END) AS archive_eligible_rows,
      SUM(CASE WHEN live_playable = 1 THEN 1 ELSE 0 END) AS live_playable_rows,
      SUM(CASE WHEN selected_side IS NOT NULL AND score_0_100 IS NULL THEN 1 ELSE 0 END) AS selected_side_without_score,
      SUM(CASE WHEN side_mode = 'more_only' AND less_score_0_100 IS NOT NULL THEN 1 ELSE 0 END) AS more_only_less_score_not_null,
      SUM(CASE WHEN source_key = 'prizepicks' AND odds_type IN ('goblin','demon') AND selected_side = 'less' THEN 1 ELSE 0 END) AS goblin_demon_less_selected,
      SUM(CASE WHEN score_status IN ('blocked_by_matrix','model_deferred') AND (score_0_100 IS NOT NULL OR archive_eligible = 1 OR live_playable = 1 OR selected_side IS NOT NULL) THEN 1 ELSE 0 END) AS blocked_or_deferred_score_leak,
      SUM(CASE WHEN live_playable = 1 AND confidence_0_100 < 55 THEN 1 ELSE 0 END) AS live_playable_confidence_under_55,
      SUM(CASE WHEN live_playable = 1 AND score_0_100 < 70 THEN 1 ELSE 0 END) AS live_playable_score_under_70,
      SUM(CASE WHEN live_playable = 1 AND selected_side IS NULL THEN 1 ELSE 0 END) AS live_playable_null_side,
      SUM(CASE WHEN live_playable = 1 AND factor_status <> 'packet_ready' THEN 1 ELSE 0 END) AS live_playable_not_packet_ready,
      SUM(CASE WHEN live_playable = 1 AND daily_readiness_status NOT IN ('ready','ready_with_warnings') THEN 1 ELSE 0 END) AS live_playable_not_daily_ready,
      SUM(CASE WHEN live_playable = 1 AND market_prop_context_status <> 'market_prop_context_present' THEN 1 ELSE 0 END) AS live_playable_market_context_not_present
    FROM scoring_engine_current
    WHERE batch_id=?
  `, batchId);
  const out = {};
  for (const [k, v] of Object.entries(row || {})) out[k] = Number(v || 0);
  return out;
}

async function recordEngineCurrentInvariants(env, batchId, summary) {
  const checks = [
    ['BLOCKED_OR_DEFERRED_SCORE_LEAK', summary.blocked_or_deferred_score_leak, 'BLOCKER', 'Blocked/deferred rows must not receive score, selected_side, archive_eligible, or live_playable.'],
    ['SELECTED_SIDE_WITHOUT_SCORE', summary.selected_side_without_score, 'BLOCKER', 'No selected_side may exist without score_0_100.'],
    ['MORE_ONLY_LESS_SCORE_NOT_NULL', summary.more_only_less_score_not_null, 'BLOCKER', 'More-only Goblin/Demon rows must keep less_score_0_100 NULL.'],
    ['GOBLIN_DEMON_LESS_SELECTED', summary.goblin_demon_less_selected, 'BLOCKER', 'Goblin/Demon cannot select Less/Under.'],
    ['LIVE_PLAYABLE_CONFIDENCE_UNDER_55', summary.live_playable_confidence_under_55, 'BLOCKER', 'No live_playable row can have confidence_0_100 below 55.'],
    ['LIVE_PLAYABLE_SCORE_UNDER_70', summary.live_playable_score_under_70, 'BLOCKER', 'No live_playable row can have score_0_100 below 70.'],
    ['LIVE_PLAYABLE_NULL_SIDE', summary.live_playable_null_side, 'BLOCKER', 'No live_playable row can have selected_side NULL.'],
    ['LIVE_PLAYABLE_NOT_PACKET_READY', summary.live_playable_not_packet_ready, 'BLOCKER', 'No live_playable row can have factor_status other than packet_ready.'],
    ['LIVE_PLAYABLE_NOT_DAILY_READY', summary.live_playable_not_daily_ready, 'BLOCKER', 'No live_playable row can have daily_readiness_status outside ready/ready_with_warnings.'],
    ['LIVE_PLAYABLE_MARKET_CONTEXT_NOT_PRESENT', summary.live_playable_market_context_not_present, 'BLOCKER', 'No live_playable row can have market_prop_context_status other than market_prop_context_present.']
  ];
  for (const [key, count, severity, note] of checks) {
    await writeIssue(env, batchId, key, Number(count || 0) > 0 ? severity : 'INFO', Number(count || 0), { note });
  }
}

async function runScoringEngineCurrent(env, input) {
  const missingBindings = requireBindings(env);
  if (missingBindings.length) {
    return baseIdentity({ ok:false, data_ok:false, status:'blocked_missing_bindings', certification:'SCORING_ENGINE_BINDINGS_MISSING', certification_grade:'BLOCKED', missing_bindings: missingBindings, framework_only:false });
  }
  await ensureScoreSchema(env);
  await seedFrameworkProfile(env);
  const profile = await seedProductionScoringProfile(env);
  const requestId = input.request_id || `scoring_engine_${Date.now().toString(36)}`;
  const runId = input.run_id || null;
  const chainId = input.chain_id || null;
  const started = Date.now();
  const matrixCountRow = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM prop_matrix_current`);
  const matrixRows = Number(matrixCountRow && matrixCountRow.rows ? matrixCountRow.rows : 0);

  let batch = await first(env.SCORE_DB, `
    SELECT batch_id, status, score_rows_written, matrix_rows_read, started_at
    FROM scoring_engine_batches
    WHERE job_key=?
      AND profile_key=?
      AND status IN ('running','partial_continue_scoring_current','running_finalizing_scoring_current')
      AND output_json LIKE ?
    ORDER BY datetime(started_at) DESC
    LIMIT 1
  `, JOB_KEY, PRODUCTION_PROFILE_KEY, `%"request_id":"${requestId}"%`);

  let batchId = batch && batch.batch_id ? batch.batch_id : null;
  let resumedExistingBatch = !!batchId;

  if (!batchId) {
    await run(env.SCORE_DB, `
      UPDATE scoring_engine_batches
      SET status='failed_stale_interrupted', certification='STALE_RUNNING_BATCH_MARKED_FAILED_BEFORE_NEW_RUN', certification_grade='FAIL_STALE_INTERRUPTED', finished_at=COALESCE(finished_at,CURRENT_TIMESTAMP), output_json=COALESCE(output_json, ?)
      WHERE job_key=? AND status IN ('running','partial_continue_scoring_current','running_finalizing_scoring_current')
    `, JSON.stringify({ ok:false, data_ok:false, status:'failed_stale_interrupted', certification:'STALE_RUNNING_BATCH_MARKED_FAILED_BEFORE_NEW_RUN', worker_version:VERSION, reason:'new_scoring_engine_current_run_started' }), JOB_KEY);
    batchId = `scoring_engine_batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const initialOutput = baseIdentity({
      request_id: requestId,
      run_id: runId,
      chain_id: chainId,
      batch_id: batchId,
      status: 'running',
      certification: 'SCORING_ENGINE_CURRENT_STARTED',
      certification_grade: 'RUNNING',
      profile_key: PRODUCTION_PROFILE_KEY,
      profile_version: profile.version,
      matrix_rows_read: matrixRows,
      score_rows_written: 0,
      archive_rows_written: 0,
      chunked_current_scoring: true
    });
    await run(env.SCORE_DB, `
      INSERT INTO scoring_engine_batches (
        batch_id, profile_key, profile_version, worker_version, job_key, status, certification, certification_grade,
        matrix_rows_read, score_rows_written, archive_rows_written, thresholds_locked, archive_score_threshold, final_qualification_threshold, started_at, output_json
      ) VALUES (?, ?, ?, ?, ?, 'running', 'SCORING_ENGINE_CURRENT_STARTED', 'RUNNING', ?, 0, 0, 0, ?, ?, CURRENT_TIMESTAMP, ?)
    `, batchId, PRODUCTION_PROFILE_KEY, profile.version, VERSION, JOB_KEY, matrixRows, profile.archiveScoreThreshold, profile.gradeQualifiedMin, JSON.stringify(initialOutput));
    await run(env.SCORE_DB, `DELETE FROM scoring_engine_current`);
    await run(env.SCORE_DB, `DELETE FROM scoring_engine_issues`);
  }

  if (matrixRows <= 0) {
    await writeIssue(env, batchId, 'NO_MATRIX_ROWS', 'BLOCKER', 1, { reason:'prop_matrix_current has zero rows' });
    const output = baseIdentity({ ok:false, data_ok:false, request_id:requestId, run_id:runId, chain_id:chainId, batch_id:batchId, status:'blocked_no_matrix_rows', certification:'SCORING_ENGINE_BLOCKED_NO_MATRIX_ROWS', certification_grade:'BLOCKED', matrix_rows_read:0, score_rows_written:0, archive_rows_written:0, framework_only:false });
    await run(env.SCORE_DB, `UPDATE scoring_engine_batches SET status='blocked', certification=?, certification_grade='BLOCKED', finished_at=CURRENT_TIMESTAMP, output_json=? WHERE batch_id=?`, output.certification, JSON.stringify(output), batchId);
    return output;
  }

  const chunk = await insertEngineCurrentProfileChunk(env, batchId, PRODUCTION_PROFILE_KEY, { readChunkSize: 60, writeBatchSize: 8, maxRowsThisInvocation: 420, maxMillis: 43000 });
  await run(env.SCORE_DB, `
    UPDATE scoring_engine_batches
    SET status=?, certification=?, certification_grade=?, matrix_rows_read=?, score_rows_written=?, output_json=?
    WHERE batch_id=?
  `,
    chunk.remaining_rows > 0 ? 'partial_continue_scoring_current' : 'running_finalizing_scoring_current',
    chunk.remaining_rows > 0 ? 'SCORING_ENGINE_CURRENT_PARTIAL_CONTINUE_CHUNK_WRITTEN' : 'SCORING_ENGINE_CURRENT_CHUNKS_WRITTEN_FINALIZING',
    chunk.remaining_rows > 0 ? 'PARTIAL' : 'RUNNING',
    matrixRows,
    chunk.persisted_rows,
    JSON.stringify(baseIdentity({
      request_id: requestId,
      run_id: runId,
      chain_id: chainId,
      batch_id: batchId,
      status: chunk.remaining_rows > 0 ? 'partial_continue_scoring_engine_current_chunk_written' : 'running_finalizing_scoring_engine_current',
      certification: chunk.remaining_rows > 0 ? 'SCORING_ENGINE_CURRENT_PARTIAL_CONTINUE_CHUNK_WRITTEN' : 'SCORING_ENGINE_CURRENT_CHUNKS_WRITTEN_FINALIZING',
      certification_grade: chunk.remaining_rows > 0 ? 'PARTIAL' : 'RUNNING',
      profile_key: PRODUCTION_PROFILE_KEY,
      profile_version: profile.version,
      matrix_rows_read: matrixRows,
      score_rows_written: chunk.persisted_rows,
      rows_read: matrixRows,
      rows_written: chunk.persisted_rows,
      inserted_this_invocation: chunk.inserted_this_invocation,
      remaining_rows: chunk.remaining_rows,
      cursor_matrix_id: chunk.cursor_matrix_id,
      resumed_existing_batch: resumedExistingBatch,
      continuation_required: chunk.remaining_rows > 0,
      orchestrator_should_self_continue: chunk.remaining_rows > 0,
      chunked_current_scoring: true,
      no_ranking: true,
      no_final_board: true,
      elapsed_ms: Date.now() - started
    })),
    batchId
  );

  if (chunk.remaining_rows > 0) {
    return baseIdentity({
      request_id: requestId,
      run_id: runId,
      chain_id: chainId,
      batch_id: batchId,
      status: 'partial_continue_scoring_engine_current_chunk_written',
      certification: 'SCORING_ENGINE_CURRENT_PARTIAL_CONTINUE_CHUNK_WRITTEN',
      certification_grade: 'PARTIAL',
      framework_only: false,
      production_scoring_current: true,
      profile_key: PRODUCTION_PROFILE_KEY,
      profile_version: profile.version,
      matrix_rows_read: matrixRows,
      score_rows_written: chunk.persisted_rows,
      rows_read: matrixRows,
      rows_written: chunk.persisted_rows,
      inserted_this_invocation: chunk.inserted_this_invocation,
      remaining_rows: chunk.remaining_rows,
      cursor_matrix_id: chunk.cursor_matrix_id,
      resumed_existing_batch: resumedExistingBatch,
      continuation_required: true,
      orchestrator_should_self_continue: true,
      chunked_current_scoring: true,
      external_calls_performed: 0,
      no_true_hit_probability_claims: true,
      no_ranking: true,
      no_final_board: true,
      elapsed_ms: Date.now() - started
    });
  }

  const scoreRowsWritten = chunk.persisted_rows;

  // v0.4.10 lock: do not keep current-batch certification hostage to heavy post-current work.
  // Root cause observed in production: all 3,086 scoring_engine_current rows were written,
  // but the worker remained in running_finalizing_scoring_current until the service binding
  // timed out. Final Board then correctly ignored the new batch because finished_at stayed NULL.
  // Current scoring is certified by row-parity + non-null selected-side diagnostics here;
  // hit-probability/archives/deep issue ledgers are non-blocking sidecars and must not run
  // inside this terminal current-scoring call.
  const currentParityRow = await first(env.SCORE_DB, `
    SELECT
      COUNT(*) AS current_rows,
      SUM(CASE WHEN selected_side IS NOT NULL THEN 1 ELSE 0 END) AS selected_rows,
      SUM(CASE WHEN score_0_100 >= ? THEN 1 ELSE 0 END) AS archive_eligible_rows,
      SUM(CASE WHEN score_0_100 >= ? THEN 1 ELSE 0 END) AS live_candidate_rows,
      SUM(CASE WHEN score_0_100 >= ? THEN 1 ELSE 0 END) AS strong_candidate_rows,
      SUM(CASE WHEN score_status IN ('blocked_by_matrix','model_deferred','simulation_hard_blocked') AND (score_0_100 IS NOT NULL OR selected_side IS NOT NULL OR live_playable = 1 OR archive_eligible = 1) THEN 1 ELSE 0 END) AS blocked_or_deferred_score_leak
    FROM scoring_engine_current
    WHERE batch_id=?
  `, profile.archiveScoreThreshold, profile.gradeQualifiedMin, profile.gradeStrongMin || 84, batchId);
  const currentRows = Number(currentParityRow && currentParityRow.current_rows || 0);
  const hardIssues = (currentRows !== matrixRows || currentRows !== scoreRowsWritten || Number(currentParityRow && currentParityRow.blocked_or_deferred_score_leak || 0) > 0) ? 1 : 0;
  const archiveRowsWritten = Number(currentParityRow && currentParityRow.archive_eligible_rows || 0);
  const summary = {
    current_rows: currentRows,
    selected_rows: Number(currentParityRow && currentParityRow.selected_rows || 0),
    archive_eligible_rows: archiveRowsWritten,
    live_candidate_rows: Number(currentParityRow && currentParityRow.live_candidate_rows || 0),
    strong_candidate_rows: Number(currentParityRow && currentParityRow.strong_candidate_rows || 0),
    blocked_or_deferred_score_leak: Number(currentParityRow && currentParityRow.blocked_or_deferred_score_leak || 0),
    row_parity_ok: currentRows === matrixRows && currentRows === scoreRowsWritten,
    lightweight_terminal_summary: true
  };
  if (hardIssues > 0) {
    await writeIssue(env, batchId, 'CURRENT_ROW_PARITY_OR_BLOCKED_SCORE_LEAK', 'BLOCKER', 1, {
      matrix_rows_read: matrixRows,
      score_rows_written: scoreRowsWritten,
      current_rows: currentRows,
      blocked_or_deferred_score_leak: summary.blocked_or_deferred_score_leak,
      note: 'v0.4.10 terminal guard: current certification blocked only when row parity fails or blocked/deferred rows leak scores.'
    });
  }
  const certification = hardIssues > 0 ? 'SCORING_ENGINE_CURRENT_BLOCKED_BY_INVARIANTS' : 'SCORING_ENGINE_CURRENT_CERTIFIED_SCORED_ROWS';
  const certificationGrade = hardIssues > 0 ? 'BLOCKED' : 'PASS_WITH_REVIEW_WARNINGS';
  const status = hardIssues > 0 ? 'completed_scoring_current_with_blockers' : 'completed_scoring_current_rows_written';
  const output = baseIdentity({
    request_id: requestId,
    run_id: runId,
    chain_id: chainId,
    batch_id: batchId,
    status,
    certification,
    certification_grade: certificationGrade,
    framework_only: false,
    production_scoring_current: true,
    profile_key: PRODUCTION_PROFILE_KEY,
    profile_version: profile.version,
    matrix_rows_read: matrixRows,
    score_rows_written: scoreRowsWritten,
    rows_read: matrixRows,
    rows_written: scoreRowsWritten,
    archive_rows_written: archiveRowsWritten,
    thresholds_locked: false,
    scoring_enabled: true,
    true_probability_enabled: false,
    no_true_hit_probability_claims: true,
    no_ranking: true,
    no_final_board: true,
    hard_issue_count: hardIssues,
    scoring_summary: summary,
    score_current_table: 'SCORE_DB.scoring_engine_current',
    profile_table: 'SCORE_DB.scoring_engine_profiles_current',
    selected_side_policy: 'STRICT_C_REALISTIC_V3_2 current scoring uses the proven simulation side-selection path; Goblin/Demon remain more-only; no ranking/final-board write here.',
    chunked_current_scoring: true,
    resumed_existing_batch: resumedExistingBatch,
    elapsed_ms: Date.now() - started
  });
  output.hit_probability_phase = {
    attempted: false,
    reason: "disabled_in_scoring_engine_v0_4_10_to_prevent_current_finalization_timeout",
    non_mutating_sidecar: true,
    note: "Run Hit Probability as its own job after scoring current is certified; scoring_engine_current/final-board readiness must not depend on inline sidecar work."
  };


  await run(env.SCORE_DB, `
    UPDATE scoring_engine_batches
    SET status=?, certification=?, certification_grade=?, score_rows_written=?, archive_rows_written=?, finished_at=CURRENT_TIMESTAMP, output_json=?
    WHERE batch_id=?
  `, status, certification, certificationGrade, scoreRowsWritten, archiveRowsWritten, JSON.stringify(output), batchId);
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


async function ensureFinalBoardSchema(env) {
  await run(env.SCORE_DB, `
    CREATE TABLE IF NOT EXISTS scoring_final_board_batches (
      final_board_batch_id TEXT PRIMARY KEY,
      worker_version TEXT,
      source_simulation_batch_id TEXT,
      profile_key TEXT,
      status TEXT,
      certification TEXT,
      certification_grade TEXT,
      simulation_rows_read INTEGER DEFAULT 0,
      final_board_rows_written INTEGER DEFAULT 0,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      finished_at TEXT,
      output_json TEXT
    )
  `);

  await run(env.SCORE_DB, `
    CREATE TABLE IF NOT EXISTS scoring_final_board_current (
      final_board_row_id TEXT PRIMARY KEY,
      final_board_batch_id TEXT NOT NULL,
      final_rank INTEGER,
      source_simulation_batch_id TEXT NOT NULL,
      simulation_row_id TEXT NOT NULL,
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
      selected_side TEXT,
      score_0_100 REAL,
      confidence_0_100 REAL,
      score_sort_0_100 REAL,
      score_grade TEXT,
      factor_status TEXT,
      market_prop_context_status TEXT,
      daily_readiness_status TEXT,
      side_mode TEXT,
      odds_type TEXT,
      payout_variant TEXT,
      variation_key TEXT,
      calculation_json TEXT,
      matrix_payload_json_snapshot TEXT,
      details_json_snapshot TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(env.SCORE_DB, `
    CREATE TABLE IF NOT EXISTS scoring_final_board_archive (
      final_board_row_id TEXT,
      final_board_batch_id TEXT,
      final_rank INTEGER,
      source_simulation_batch_id TEXT,
      simulation_row_id TEXT,
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
      selected_side TEXT,
      score_0_100 REAL,
      confidence_0_100 REAL,
      score_sort_0_100 REAL,
      score_grade TEXT,
      factor_status TEXT,
      market_prop_context_status TEXT,
      daily_readiness_status TEXT,
      side_mode TEXT,
      odds_type TEXT,
      payout_variant TEXT,
      variation_key TEXT,
      calculation_json TEXT,
      matrix_payload_json_snapshot TEXT,
      details_json_snapshot TEXT,
      archived_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(env.SCORE_DB, `
    CREATE TABLE IF NOT EXISTS scoring_final_board_issues (
      issue_id TEXT PRIMARY KEY,
      final_board_batch_id TEXT,
      issue_key TEXT,
      severity TEXT,
      issue_count INTEGER DEFAULT 0,
      issue_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(env.SCORE_DB, `CREATE INDEX IF NOT EXISTS idx_scoring_final_board_current_rank ON scoring_final_board_current(final_rank)`);
  await run(env.SCORE_DB, `CREATE INDEX IF NOT EXISTS idx_scoring_final_board_current_player ON scoring_final_board_current(mlb_player_id, canonical_prop_key)`);
  await run(env.SCORE_DB, `CREATE INDEX IF NOT EXISTS idx_scoring_final_board_current_game ON scoring_final_board_current(game_pk, source_key)`);
}

async function writeFinalBoardIssue(env, batchId, key, severity, count, payload = {}) {
  await run(env.SCORE_DB, `
    INSERT OR REPLACE INTO scoring_final_board_issues (issue_id, final_board_batch_id, issue_key, severity, issue_count, issue_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `, `${batchId}:${key}`, batchId, key, severity, Number(count || 0), JSON.stringify(payload));
}

async function runScoringFinalBoard(env, input) {
  const missingBindings = requireSimulationBindings(env);
  if (missingBindings.length) {
    return baseIdentity({ ok:false, data_ok:false, status:'blocked_missing_bindings', certification:'SCORING_FINAL_BOARD_BINDINGS_MISSING', certification_grade:'BLOCKED', missing_bindings: missingBindings, no_final_board:false });
  }

  await ensureSimulationSchema(env);
  await ensureFinalBoardSchema(env);

  const requestId = input.request_id || `scoring_final_board_${Date.now().toString(36)}`;
  const chainId = input.chain_id || null;
  const finalBatchId = `scoring_final_board_batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
  const started = Date.now();
  const profileKey = 'STRICT_B';

  const requestedSimulationBatchId = input.source_simulation_batch_id || (input.input_json && input.input_json.source_simulation_batch_id) || null;
  const simBatch = requestedSimulationBatchId
    ? await first(env.SCORE_DB, `SELECT simulation_batch_id, worker_version, status, certification, certification_grade FROM scoring_engine_simulation_batches WHERE simulation_batch_id=?`, requestedSimulationBatchId)
    : await first(env.SCORE_DB, `
        SELECT simulation_batch_id, worker_version, status, certification, certification_grade
        FROM scoring_engine_simulation_batches
        WHERE status='completed_simulation_shadow_only'
          AND certification_grade IN ('PASS_WITH_REVIEW_WARNINGS','PASS_SIMULATION_REVIEW_READY')
          AND worker_version LIKE '%v0.3.7%'
        ORDER BY datetime(started_at) DESC
        LIMIT 1
      `);

  if (!simBatch || !simBatch.simulation_batch_id) {
    const output = baseIdentity({ ok:false, data_ok:false, request_id:requestId, chain_id:chainId, final_board_batch_id:finalBatchId, status:'blocked_no_certified_simulation_batch', certification:'SCORING_FINAL_BOARD_BLOCKED_NO_CERTIFIED_SIMULATION_BATCH', certification_grade:'BLOCKED', no_final_board:false });
    await run(env.SCORE_DB, `INSERT INTO scoring_final_board_batches (final_board_batch_id, worker_version, source_simulation_batch_id, profile_key, status, certification, certification_grade, started_at, finished_at, output_json) VALUES (?, ?, NULL, ?, 'blocked', ?, 'BLOCKED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)`, finalBatchId, VERSION, profileKey, output.certification, JSON.stringify(output));
    return output;
  }

  const sourceBatchId = simBatch.simulation_batch_id;
  const eligible = await all(env.SCORE_DB, `
    SELECT *
    FROM scoring_engine_simulation_shadow
    WHERE simulation_batch_id=?
      AND profile_key=?
      AND live_playable=1
      AND archive_eligible=1
      AND invariant_violation_count=0
      AND selected_side IS NOT NULL
      AND score_0_100 >= 76
      AND confidence_0_100 >= 55
      AND factor_status='packet_ready'
      AND market_prop_context_status='market_prop_context_present'
      AND daily_readiness_status IN ('ready','ready_with_warnings')
    ORDER BY score_0_100 DESC, confidence_0_100 DESC, COALESCE(score_sort_0_100, score_0_100) DESC, player_name, canonical_prop_key, selected_side, source_line_id
  `, sourceBatchId, profileKey);

  const simRows = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM scoring_engine_simulation_shadow WHERE simulation_batch_id=? AND profile_key=?`, sourceBatchId, profileKey);
  await run(env.SCORE_DB, `
    INSERT INTO scoring_final_board_batches (final_board_batch_id, worker_version, source_simulation_batch_id, profile_key, status, certification, certification_grade, simulation_rows_read, final_board_rows_written, started_at)
    VALUES (?, ?, ?, ?, 'running', 'SCORING_FINAL_BOARD_STARTED', 'RUNNING', ?, 0, CURRENT_TIMESTAMP)
  `, finalBatchId, VERSION, sourceBatchId, profileKey, Number(simRows && simRows.rows || 0));

  await run(env.SCORE_DB, `
    INSERT INTO scoring_final_board_archive (
      final_board_row_id, final_board_batch_id, final_rank, source_simulation_batch_id, simulation_row_id, matrix_id, prepared_row_id, source_line_id, source_key, game_pk, official_date, official_game_time_utc,
      mlb_player_id, player_name, canonical_prop_key, line_value, selected_side, score_0_100, confidence_0_100, score_sort_0_100, score_grade, factor_status, market_prop_context_status,
      daily_readiness_status, side_mode, odds_type, payout_variant, variation_key, calculation_json, matrix_payload_json_snapshot, details_json_snapshot, archived_at
    )
    SELECT final_board_row_id, final_board_batch_id, final_rank, source_simulation_batch_id, simulation_row_id, matrix_id, prepared_row_id, source_line_id, source_key, game_pk, official_date, official_game_time_utc,
      mlb_player_id, player_name, canonical_prop_key, line_value, selected_side, score_0_100, confidence_0_100, score_sort_0_100, score_grade, factor_status, market_prop_context_status,
      daily_readiness_status, side_mode, odds_type, payout_variant, variation_key, calculation_json, matrix_payload_json_snapshot, details_json_snapshot, CURRENT_TIMESTAMP
    FROM scoring_final_board_current
  `);
  await run(env.SCORE_DB, `DELETE FROM scoring_final_board_current`);

  let rank = 0;
  for (const r of eligible) {
    rank += 1;
    const rowId = `${finalBatchId}:${rank}:${r.simulation_row_id}`;
    await run(env.SCORE_DB, `
      INSERT INTO scoring_final_board_current (
        final_board_row_id, final_board_batch_id, final_rank, source_simulation_batch_id, simulation_row_id, matrix_id, prepared_row_id, source_line_id, source_key, game_pk, official_date, official_game_time_utc,
        mlb_player_id, player_name, canonical_prop_key, line_value, selected_side, score_0_100, confidence_0_100, score_sort_0_100, score_grade, factor_status, market_prop_context_status,
        daily_readiness_status, side_mode, odds_type, payout_variant, variation_key, calculation_json, matrix_payload_json_snapshot, details_json_snapshot, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, rowId, finalBatchId, rank, sourceBatchId, r.simulation_row_id, r.matrix_id, r.prepared_row_id, r.source_line_id, r.source_key, r.game_pk, r.official_date, r.official_game_time_utc,
       r.mlb_player_id, r.player_name, r.canonical_prop_key, r.line_value, r.selected_side, r.score_0_100, r.confidence_0_100, r.score_sort_0_100, r.score_grade, r.factor_status, r.market_prop_context_status,
       r.daily_readiness_status, r.side_mode, r.odds_type, r.payout_variant, r.variation_key, r.calculation_json, r.matrix_payload_json_snapshot, r.details_json_snapshot);
  }

  const badRows = await first(env.SCORE_DB, `
    SELECT COUNT(*) AS rows FROM scoring_final_board_current
    WHERE final_board_batch_id=? AND (
      selected_side IS NULL OR score_0_100 < 76 OR confidence_0_100 < 55 OR factor_status <> 'packet_ready' OR market_prop_context_status <> 'market_prop_context_present' OR daily_readiness_status NOT IN ('ready','ready_with_warnings')
    )
  `, finalBatchId);
  const badCount = Number(badRows && badRows.rows || 0);
  await writeFinalBoardIssue(env, finalBatchId, 'FINAL_BOARD_GATE_VIOLATION', badCount > 0 ? 'BLOCKER' : 'INFO', badCount, { note:'Final board current rows must satisfy live-playable production gates.' });

  const certification = badCount > 0 ? 'SCORING_FINAL_BOARD_BLOCKED_GATE_VIOLATION' : 'SCORING_FINAL_BOARD_CURRENT_CERTIFIED';
  const grade = badCount > 0 ? 'BLOCKED' : 'PASS';
  const status = badCount > 0 ? 'blocked_gate_violation' : 'completed_final_board_current';

  const output = baseIdentity({
    request_id: requestId,
    chain_id: chainId,
    final_board_batch_id: finalBatchId,
    source_simulation_batch_id: sourceBatchId,
    source_simulation_worker_version: simBatch.worker_version,
    profile_key: profileKey,
    status,
    certification,
    certification_grade: grade,
    simulation_rows_read: Number(simRows && simRows.rows || 0),
    final_board_rows_written: eligible.length,
    final_board_current_table: 'SCORE_DB.scoring_final_board_current',
    final_board_archive_table: 'SCORE_DB.scoring_final_board_archive',
    final_board_batches_table: 'SCORE_DB.scoring_final_board_batches',
    final_ui_ready: badCount === 0,
    no_final_board: false,
    final_board_generated: true,
    no_candidate_board_write: true,
    no_true_hit_probability_claims: true,
    ranking_policy: 'final_rank is deterministic display order from score/confidence/sort tie-breakers; no dedupe collapse across line variations.',
    notes: [
      'Final board is generated from latest certified STRICT_B simulation live_playable rows only.',
      'Current table is replacement-style and ready for a separate final UI to read.',
      'No old prop score tables or candidate board tables are touched.'
    ],
    elapsed_ms: Date.now() - started
  });

  await run(env.SCORE_DB, `UPDATE scoring_final_board_batches SET status=?, certification=?, certification_grade=?, final_board_rows_written=?, finished_at=CURRENT_TIMESTAMP, output_json=? WHERE final_board_batch_id=?`, status, certification, grade, eligible.length, JSON.stringify(output), finalBatchId);
  return output;
}


// ============================================================
// Hit Probability / Recent-Form Hit Rate Phase v0.1.6
// ============================================================
// This phase is intentionally isolated. It writes only SCORE_DB.hit_probability_* tables.
// It does not mutate scoring_engine_current, score_final_board_current, prepared board,
// source boards, score fields, ranking, or live/review gates.
const HP_JOB_KEY = "hit-probability";
const HP_MODE = "hit_probability_current_estimate";
const HP_VERSION = "alphadog-v2-scoring-engine-v0.4.16-hp-board-display-calibration-same-worker";
const HP_PROFILE_VERSION = "HP_RECENT_FORM_V0_1_6_STOLEN_BASES_ROUTE_LOCK";
const HP_MAX_ROWS_PER_RUN = 12000;
const HP_PLAYER_CHUNK_SIZE = 70;
const HP_BOARD_MODE = "hp_board_current_build";
const HP_BOARD_JOB_KEY = "hp-board";
const HP_BOARD_PROFILE_KEY = "HP_BOARD_RECENT_FORM_PROFILE";
const HP_BOARD_PROFILE_VERSION = "HP_BOARD_RECENT_FORM_PROFILE_V0_1_1_DISPLAY_CALIBRATED";
const HP_BOARD_LANE_ORDER = {
  HP_PRIMARY_ELITE: 1,
  HP_PRIMARY_STRONG: 2,
  HP_SUPPORTED_REVIEW: 3,
  HP_SCORE_STRONG_HP_WEAK_REVIEW: 4,
  HP_LOW_SAMPLE_REVIEW: 5,
  HP_NEUTRAL_REVIEW: 6,
  HP_WEAK_SUPPORT: 7,
  HP_FADE_RECENT_FORM: 8
};

const HP_HITTER_PROP_PROFILES = {
  hits: { family:"hitter", stat:"hits", label:"Hits", windows:[5,10,20,40], profile:"HITTER_HIGH_FREQ" },
  singles: { family:"hitter", stat:"singles", label:"Singles", windows:[5,10,20,40], profile:"HITTER_MED_FREQ" },
  doubles: { family:"hitter", stat:"doubles", label:"Doubles", windows:[5,10,20,40], profile:"HITTER_LOW_FREQ" },
  home_runs: { family:"hitter", stat:"home_runs", label:"Home Runs", windows:[5,10,20,40], profile:"HITTER_LOW_FREQ" },
  total_bases: { family:"hitter", stat:"total_bases", label:"Total Bases", windows:[5,10,20,40], profile:"HITTER_HIGH_FREQ" },
  runs: { family:"hitter", stat:"runs", label:"Runs", windows:[5,10,20,40], profile:"HITTER_MED_FREQ" },
  rbis: { family:"hitter", stat:"rbi", label:"RBIs", windows:[5,10,20,40], profile:"HITTER_LOW_FREQ" },
  walks: { family:"hitter", stat:"walks", label:"Walks", windows:[5,10,20,40], profile:"HITTER_MED_FREQ" },
  stolen_bases: { family:"hitter", stat:"stolen_bases", label:"Stolen Bases", windows:[5,10,20,40], profile:"HITTER_LOW_FREQ" },
  hits_runs_rbis: { family:"hitter", stat:"hits_runs_rbis", label:"Hits+Runs+RBIs", windows:[5,10,20,40], profile:"HITTER_HIGH_FREQ" }
};

const HP_PITCHER_PROP_PROFILES = {
  pitcher_strikeouts: { family:"pitcher", stat:"strikeouts", label:"Pitcher Strikeouts", windows:[3,5,10,20], profile:"PITCHER_VOLUME" },
  pitcher_outs: { family:"pitcher", stat:"outs_recorded", label:"Pitcher Outs", windows:[3,5,10,20], profile:"PITCHER_VOLUME" },
  hits_allowed: { family:"pitcher", stat:"hits_allowed", label:"Hits Allowed", windows:[3,5,10,20], profile:"PITCHER_DAMAGE" },
  earned_runs: { family:"pitcher", stat:"earned_runs", label:"Earned Runs", windows:[3,5,10,20], profile:"PITCHER_DAMAGE" },
  walks_allowed: { family:"pitcher", stat:"walks_allowed", label:"Walks Allowed", windows:[3,5,10,20], profile:"PITCHER_CONTROL" },
  runs_allowed: { family:"pitcher", stat:"runs_allowed", label:"Runs Allowed", windows:[3,5,10,20], profile:"PITCHER_DAMAGE" }
};

const HP_DEFAULT_CONFIG_BASE = {
  profile_version: HP_PROFILE_VERSION,
  active: 1,
  target_sample: 20,
  low_sample_threshold: 10,
  ultra_low_sample_threshold: 3,
  low_sample_floor: 42.5,
  low_sample_cap: 57.5,
  ultra_low_sample_floor: 44.0,
  ultra_low_sample_cap: 56.0,
  global_floor: 10.0,
  global_cap: 90.0,
  soft_cap_start: 90.0,
  soft_cap_multiplier: 0.0,
  weak_long_window_threshold_1: 70.0,
  weak_long_window_cap_start_1: 80.0,
  weak_long_window_multiplier_1: 0.0,
  weak_long_window_threshold_2: 75.0,
  weak_long_window_cap_start_2: 82.0,
  weak_long_window_multiplier_2: 0.0,
  low_frequency_less_soft_cap_start: 80.0,
  low_frequency_less_multiplier: 0.0,
  max_factor_bonus: 4.0,
  max_factor_penalty: -4.0,
  factor_logit_strength: 0.18,
  divergence_score_threshold: 86.0,
  divergence_hp_threshold: 45.0,
  divergence_reliability_threshold: 95.0
};

const HP_DEFAULT_PROFILE_CONFIGS = [
  { profile_key:"HITTER_HIGH_FREQ_MORE", player_type:"hitter", prop_family:"high_frequency", selected_side:"more", source_key_scope:"all", window_weights_json:"[0.30,0.30,0.25,0.15]" },
  { profile_key:"HITTER_HIGH_FREQ_LESS", player_type:"hitter", prop_family:"high_frequency", selected_side:"less", source_key_scope:"all", window_weights_json:"[0.28,0.30,0.27,0.15]" },
  { profile_key:"HITTER_MED_FREQ_MORE", player_type:"hitter", prop_family:"medium_frequency", selected_side:"more", source_key_scope:"all", window_weights_json:"[0.28,0.30,0.27,0.15]" },
  { profile_key:"HITTER_MED_FREQ_LESS", player_type:"hitter", prop_family:"medium_frequency", selected_side:"less", source_key_scope:"all", window_weights_json:"[0.26,0.29,0.28,0.17]" },
  { profile_key:"HITTER_LOW_FREQ_MORE", player_type:"hitter", prop_family:"low_frequency", selected_side:"more", source_key_scope:"all", window_weights_json:"[0.24,0.26,0.30,0.20]" },
  { profile_key:"HITTER_LOW_FREQ_LESS", player_type:"hitter", prop_family:"low_frequency", selected_side:"less", source_key_scope:"all", window_weights_json:"[0.24,0.26,0.27,0.23]" },
  { profile_key:"PITCHER_VOLUME_MORE", player_type:"pitcher", prop_family:"pitcher_volume", selected_side:"more", source_key_scope:"all", low_sample_threshold:15, window_weights_json:"[0.30,0.30,0.25,0.15]" },
  { profile_key:"PITCHER_VOLUME_LESS", player_type:"pitcher", prop_family:"pitcher_volume", selected_side:"less", source_key_scope:"all", low_sample_threshold:15, window_weights_json:"[0.28,0.30,0.27,0.15]" },
  { profile_key:"PITCHER_DAMAGE_MORE", player_type:"pitcher", prop_family:"pitcher_damage", selected_side:"more", source_key_scope:"all", low_sample_threshold:15, window_weights_json:"[0.25,0.30,0.30,0.15]" },
  { profile_key:"PITCHER_DAMAGE_LESS", player_type:"pitcher", prop_family:"pitcher_damage", selected_side:"less", source_key_scope:"all", low_sample_threshold:15, window_weights_json:"[0.25,0.28,0.30,0.17]" },
  { profile_key:"PITCHER_CONTROL_MORE", player_type:"pitcher", prop_family:"pitcher_control", selected_side:"more", source_key_scope:"all", low_sample_threshold:15, window_weights_json:"[0.25,0.30,0.30,0.15]" },
  { profile_key:"PITCHER_CONTROL_LESS", player_type:"pitcher", prop_family:"pitcher_control", selected_side:"less", source_key_scope:"all", low_sample_threshold:15, window_weights_json:"[0.25,0.28,0.30,0.17]" }
];

function hpUid(prefix){ return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,8); }
function hpNum(v, d=0){ const n=Number(v); return Number.isFinite(n) ? n : d; }
function hpRound(v, d=1){ const m=Math.pow(10,d); return Math.round(hpNum(v)*m)/m; }
function hpClamp(v, lo, hi){ return Math.max(lo, Math.min(hi, hpNum(v, lo))); }
function hpSafeJson(value, max=12000){ let s="{}"; try { s=JSON.stringify(value == null ? {} : value); } catch (_) { s=JSON.stringify({serialization_error:true}); } return s.length > max ? s.slice(0,max) : s; }
function hpJsonParse(s, fallback){ if(!s) return fallback; try { return JSON.parse(s); } catch (_) { return fallback; } }
function hpUnique(arr){ return [...new Set(arr.filter(v => v !== null && v !== undefined && String(v)!==""))]; }
function hpChunks(arr,n){ const out=[]; for(let i=0;i<arr.length;i+=n) out.push(arr.slice(i,i+n)); return out; }
function hpSide(v){ const s=String(v||"").toLowerCase(); if(["more","over","o"].includes(s)) return "more"; if(["less","under","u"].includes(s)) return "less"; return null; }
function hpProfile(prop){ return HP_HITTER_PROP_PROFILES[prop] || HP_PITCHER_PROP_PROFILES[prop] || null; }
function hpLineBucket(line){ const n=hpNum(line, NaN); if(!Number.isFinite(n)) return "LINE_UNKNOWN"; if(Math.abs(n-0.5)<0.0001) return "LINE_0_5"; if(Math.abs(n-1.5)<0.0001) return "LINE_1_5"; if(Math.abs(n-2.5)<0.0001) return "LINE_2_5"; if(Math.abs(n-3.5)<0.0001) return "LINE_3_5"; if(Math.abs(n-4.5)<0.0001) return "LINE_4_5"; if(Math.abs(n-Math.round(n))<0.0001) return "INTEGER_LINE_PUSH_CAPABLE"; return ("HALF_LINE_" + String(n).replace(/[^0-9a-z]/gi,"_")).toUpperCase(); }
const HP_LOW_FREQUENCY_LESS_PROP_KEYS = new Set(['rbis','home_runs','doubles','triples','walks','stolen_bases']);
function hpIsLowFrequencyLessProp(profile, side){
  return side === 'less'
    && profile
    && profile.family === 'hitter'
    && HP_LOW_FREQUENCY_LESS_PROP_KEYS.has(String(profile.stat || '').toLowerCase());
}
function hpProfileConfigKey(profile, side){
  if(hpIsLowFrequencyLessProp(profile, side)) return 'HITTER_LOW_FREQ_LESS';
  return [profile.profile, side].join('_').toUpperCase();
}
function hpStatValue(row, profile){ const s=profile.stat; if(s === "hits_runs_rbis") return hpNum(row.hits)+hpNum(row.runs)+hpNum(row.rbi); if(s === "outs_recorded") return hpNum(row.outs_recorded, Math.round(hpNum(row.innings_pitched_decimal)*3)); return hpNum(row[s]); }
function hpClassify(actual, line, side){ if(!Number.isFinite(actual) || !Number.isFinite(Number(line))) return "unknown"; const l=Number(line); if(Math.abs(actual-l)<0.000001) return "push"; if(side === "more") return actual > l ? "hit" : "miss"; if(side === "less") return actual < l ? "hit" : "miss"; return "unknown"; }
function hpSummarizeWindow(games, line, side, profile, windowSize){ const slice=games.slice(0, windowSize || games.length); let hit=0, miss=0, push=0, unknown=0; const actuals=[]; for(const g of slice){ const actual=hpStatValue(g, profile); actuals.push(actual); const c=hpClassify(actual,line,side); if(c==="hit") hit++; else if(c==="miss") miss++; else if(c==="push") push++; else unknown++; } const nonPush=hit+miss; const raw=nonPush>0 ? hit/nonPush : null; const mean=actuals.length ? actuals.reduce((a,b)=>a+b,0)/actuals.length : null; return { window:windowSize || "all", sample:slice.length, hit, miss, push, unknown, non_push_sample:nonPush, raw_hit_rate:raw, raw_hit_rate_0_100:raw===null?null:hpRound(raw*100,1), mean_actual:mean===null?null:hpRound(mean,3) }; }
function hpWeightedFromSummaries(summaries, weights){ let weighted=0, weight=0; for(let i=0;i<summaries.length;i++){ const r=summaries[i] && summaries[i].raw_hit_rate; const w=Number(weights[i] || 0); if(r !== null && Number.isFinite(r) && w>0){ weighted += r*w; weight += w; } } return weight>0 ? (weighted/weight) : null; }
function hpSoftCapAbove(value, start, multiplier){ const v=hpNum(value); const s=hpNum(start); if(v <= s) return v; return s + ((v - s) * hpClamp(multiplier,0,1)); }
function hpSoftFloorBelow(value, start, multiplier){ const v=hpNum(value); const s=hpNum(start); if(v >= s) return v; return s - ((s - v) * hpClamp(multiplier,0,1)); }
function hpBand(v){ const x=hpNum(v,50); if(x>=90) return "RF_90_PLUS"; if(x>=80) return "RF_80_TO_89"; if(x>=70) return "RF_70_TO_79"; if(x>=62) return "RF_62_TO_69"; if(x>=55) return "RF_55_TO_61"; if(x>=45) return "RF_NEUTRAL_45_TO_54"; if(x>=35) return "RF_35_TO_44"; if(x>=20) return "RF_20_TO_34"; return "RF_BELOW_20"; }
function hpLegacyBand(v, lowSample){ if(lowSample) return "HP_INSUFFICIENT_SAMPLE"; const x=hpNum(v,50); if(x>=70) return "HP_70_PLUS"; if(x>=62) return "HP_62_TO_69"; if(x>=55) return "HP_55_TO_61"; if(x>=45) return "HP_NEUTRAL_45_TO_54"; return "HP_BELOW_45"; }
function hpGrade(v, lowSample){ if(lowSample) return "RF_LOW_SAMPLE_REVIEW"; const x=hpNum(v,50); if(x>=90) return "A_PLUS"; if(x>=80) return "A"; if(x>=70) return "B_PLUS"; if(x>=62) return "B"; if(x>=55) return "C_PLUS"; if(x>=45) return "C"; if(x>=35) return "D"; return "F"; }
function hpFactorAlignment(row){
  const score=hpNum(row.score_0_100, hpNum(row.raw_score_0_100, 70));
  const conf=hpNum(row.confidence_0_100, hpNum(row.raw_confidence_0_100, 75));
  let factor=50 + ((score - 70) * 0.55) + ((conf - 75) * 0.10);
  const statuses=[row.factor_status,row.market_prop_context_status,row.daily_readiness_status].map(v=>String(v||"").toLowerCase());
  for(const s of statuses){ if(!s) continue; if(s.includes('certified') || s.includes('ready') || s.includes('pass')) factor += 1.0; if(s.includes('warning') || s.includes('partial')) factor -= 0.75; if(s.includes('blocked') || s.includes('missing')) factor -= 2.0; }
  if(String(row.source_key||"").toLowerCase().includes('sleeper')) factor -= 0.25;
  return hpClamp(factor, 20, 85);
}
function hpAdjustmentReason(reasons){ return reasons.length ? reasons.join('|') : 'NONE'; }
function hpConfigFromRow(row){ const out={}; for(const k of Object.keys(HP_DEFAULT_CONFIG_BASE)) out[k]=row[k] == null ? HP_DEFAULT_CONFIG_BASE[k] : row[k]; out.profile_key=row.profile_key; out.player_type=row.player_type; out.prop_family=row.prop_family; out.selected_side=row.selected_side; out.source_key_scope=row.source_key_scope || 'all'; out.window_weights=hpJsonParse(row.window_weights_json, [0.30,0.30,0.25,0.15]); return out; }
function hpDefaultConfigByKey(key){ const row=HP_DEFAULT_PROFILE_CONFIGS.find(c=>c.profile_key===key) || HP_DEFAULT_PROFILE_CONFIGS[0]; return hpConfigFromRow({...HP_DEFAULT_CONFIG_BASE, ...row}); }

function hpEstimate(games,line,side,profile,config,row){
  const windows=profile.windows || [5,10,20,40];
  const summaries=windows.map(w=>hpSummarizeWindow(games,line,side,profile,w));
  const full=hpSummarizeWindow(games,line,side,profile,Math.max(...windows));
  const oldWeights=[0.40,0.30,0.20,0.10];
  const newWeights=(config.window_weights || [0.30,0.30,0.25,0.15]).map(Number);
  const rawOld=hpWeightedFromSummaries(summaries, oldWeights);
  const rawNew=hpWeightedFromSummaries(summaries, newWeights);
  const fallback=full.raw_hit_rate !== null ? full.raw_hit_rate : 0.5;
  const rawWeightedOld=rawOld !== null ? rawOld : fallback;
  const rawWeightedNew=rawNew !== null ? rawNew : fallback;
  const nonPush=full.non_push_sample;
  const lowSampleThreshold=Math.max(1, Math.round(hpNum(config.low_sample_threshold, profile.family==='pitcher'?15:10)));
  const ultraLowThreshold=Math.max(0, Math.round(hpNum(config.ultra_low_sample_threshold,3)));
  const targetSample=Math.max(1, hpNum(config.target_sample,20));
  const reliability=hpClamp(nonPush/targetSample,0,1);
  const pushRisk=full.sample>0 ? full.push/full.sample : 0;
  const isLowSample=nonPush < lowSampleThreshold;
  const isUltraLow=nonPush <= ultraLowThreshold;
  const factorScore=hpFactorAlignment(row || {});
  const factorAdjustment=hpClamp((factorScore - 50) * hpNum(config.factor_logit_strength,0.26), hpNum(config.max_factor_penalty,-6.5), hpNum(config.max_factor_bonus,6.5));
  let display=isLowSample ? (50 + (((rawWeightedNew*100)-50) * reliability)) : (rawWeightedNew*100);
  display += factorAdjustment;
  const reasons=[];
  const flags=[];
  if(games.length === 0) flags.push('NO_HISTORICAL_GAME_LOGS');
  if(pushRisk >= 0.15) flags.push('HIGH_PUSH_RISK');
  if(isLowSample){ flags.push('HP_LOW_SAMPLE'); flags.push('HP_FLATTENED_RANGE'); reasons.push('LOW_SAMPLE_DEMOTION'); }
  if(isUltraLow){ flags.push('HP_ULTRA_LOW_SAMPLE'); reasons.push('ULTRA_LOW_SAMPLE_RANGE'); }
  if(profile.family === 'pitcher' && (nonPush < 20 || reliability < 1)){ flags.push('HP_PITCHER_SAMPLE_VOLATILITY'); }
  const longest=summaries[summaries.length-1] && summaries[summaries.length-1].raw_hit_rate_0_100;
  const secondLongest=summaries[summaries.length-2] && summaries[summaries.length-2].raw_hit_rate_0_100;
  const shortest=summaries[0] && summaries[0].raw_hit_rate_0_100;
  if(shortest === 100 && longest !== null && longest < hpNum(config.weak_long_window_threshold_1,70)){ flags.push('HP_HOT_FORM_HIGH_VARIANCE'); }
  if(longest !== null && longest < hpNum(config.weak_long_window_threshold_1,70) && display > hpNum(config.weak_long_window_cap_start_1,88)){ display=hpSoftCapAbove(display, hpNum(config.weak_long_window_cap_start_1,88), hpNum(config.weak_long_window_multiplier_1,0.65)); flags.push('HP_DISPLAY_CAPPED'); reasons.push('LONGEST_WINDOW_SOFT_CAP'); }
  if(secondLongest !== null && secondLongest < hpNum(config.weak_long_window_threshold_2,75) && display > hpNum(config.weak_long_window_cap_start_2,90)){ display=hpSoftCapAbove(display, hpNum(config.weak_long_window_cap_start_2,90), hpNum(config.weak_long_window_multiplier_2,0.75)); flags.push('HP_DISPLAY_CAPPED'); reasons.push('SECOND_LONGEST_WINDOW_SOFT_CAP'); }
  const lowFreqLess = hpIsLowFrequencyLessProp(profile, side);
  if(lowFreqLess && display > hpNum(config.low_frequency_less_soft_cap_start,90)){ display=hpSoftCapAbove(display, hpNum(config.low_frequency_less_soft_cap_start,90), hpNum(config.low_frequency_less_multiplier,0.35)); flags.push('HP_LOW_FREQUENCY_LESS_BASE_RATE'); flags.push('HP_LESS_CAP_APPLIED'); reasons.push('LOW_FREQUENCY_LESS_CAP'); }
  if(display > hpNum(config.soft_cap_start,92)){ display=hpSoftCapAbove(display, hpNum(config.soft_cap_start,92), hpNum(config.soft_cap_multiplier,0.55)); flags.push('HP_DISPLAY_CAPPED'); reasons.push('GLOBAL_SOFT_CAP'); }
  if(isUltraLow){ display=hpClamp(display, hpNum(config.ultra_low_sample_floor,44), hpNum(config.ultra_low_sample_cap,56)); }
  else if(isLowSample){ display=hpClamp(display, hpNum(config.low_sample_floor,37.5), hpNum(config.low_sample_cap,62.5)); }
  display=hpClamp(display, hpNum(config.global_floor,5), hpNum(config.global_cap,95));
  const sampleReliability=hpRound(Math.max(0, Math.min(100, (reliability*100) - (pushRisk*12))),1);
  const displayed=hpRound(display,1);
  const rawNew100=hpRound(rawWeightedNew*100,1);
  const rawOld100=hpRound(rawWeightedOld*100,1);
  const scoreGap=Number.isFinite(hpNum(row && row.score_0_100, NaN)) ? hpRound(hpNum(row.score_0_100)-displayed,1) : null;
  const rankHint=hpRound((0.70*displayed)+(0.20*sampleReliability)+(0.10*factorScore),1);
  const divergence = hpNum(row && row.score_0_100,0) >= hpNum(config.divergence_score_threshold,82) && displayed < hpNum(config.divergence_hp_threshold,55) && sampleReliability >= hpNum(config.divergence_reliability_threshold,90) && nonPush >= 20;
  if(divergence){ flags.push('SCORE_RECENT_FORM_DIVERGENCE'); reasons.push('SCORE_RECENT_FORM_DIVERGENCE'); }
  return {
    estimated_recent_form_hit_rate_0_100: displayed,
    sample_reliability_score_0_100: sampleReliability,
    recent_form_band: hpBand(displayed),
    recent_form_grade: hpGrade(displayed, isLowSample),
    display_adjustment_reason: hpAdjustmentReason(reasons),
    display_warning_flags: hpUnique(flags),
    display_notes: {
      display_metric_label:'Estimated Recent-Form Hit Rate',
      old_probability_fields_are_legacy_display_aliases:true,
      raw_metric_preserved:true,
      factor_enrichment_mild:true,
      factor_alignment_score_0_100: hpRound(factorScore,1),
      factor_adjustment_0_100: hpRound(factorAdjustment,2),
      applied_reasons:hpUnique(reasons)
    },
    raw_empirical_hit_rate_0_1: full.raw_hit_rate !== null ? hpRound(full.raw_hit_rate,4) : null,
    raw_weighted_empirical_rate_v0_1_2_0_100: rawOld100,
    raw_weighted_empirical_rate_v0_1_3_0_100: rawNew100,
    empirical_hit_rate_0_1: hpRound(rawWeightedNew,4),
    reliability_0_1: hpRound(reliability,3),
    push_risk_0_1: hpRound(pushRisk,3),
    sample_size: full.sample,
    non_push_sample: nonPush,
    hit_count: full.hit,
    miss_count: full.miss,
    push_count: full.push,
    factor_alignment_score_0_100: hpRound(factorScore,1),
    factor_adjustment_0_100: hpRound(factorAdjustment,2),
    score_recent_form_gap_0_100: scoreGap,
    recent_form_rank_hint_0_100: rankHint,
    probability_band: hpLegacyBand(displayed, isLowSample),
    probability_confidence_0_100: sampleReliability,
    estimated_hit_probability_0_100: displayed,
    is_low_sample: isLowSample,
    is_divergence: divergence,
    windows:summaries,
    profile_config_used: config
  };
}

async function hpColumnSet(env, table){ const rows=await all(env.SCORE_DB, `PRAGMA table_info(${table})`); return new Set(rows.map(r=>r.name)); }
async function hpAddColumnIfMissing(env, table, col, ddl){ const cols=await hpColumnSet(env, table); if(!cols.has(col)) await run(env.SCORE_DB, `ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`); }
async function hpSeedProfileConfigs(env){
  for(const c0 of HP_DEFAULT_PROFILE_CONFIGS){
    const c={...HP_DEFAULT_CONFIG_BASE, ...c0};
    await run(env.SCORE_DB, `INSERT OR IGNORE INTO hit_probability_profile_configs (profile_key,profile_version,player_type,prop_family,selected_side,source_key_scope,window_weights_json,target_sample,low_sample_threshold,ultra_low_sample_threshold,low_sample_floor,low_sample_cap,ultra_low_sample_floor,ultra_low_sample_cap,global_floor,global_cap,soft_cap_start,soft_cap_multiplier,weak_long_window_threshold_1,weak_long_window_cap_start_1,weak_long_window_multiplier_1,weak_long_window_threshold_2,weak_long_window_cap_start_2,weak_long_window_multiplier_2,low_frequency_less_soft_cap_start,low_frequency_less_multiplier,max_factor_bonus,max_factor_penalty,factor_logit_strength,divergence_score_threshold,divergence_hp_threshold,divergence_reliability_threshold,active,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, c.profile_key,c.profile_version,c.player_type,c.prop_family,c.selected_side,c.source_key_scope,c.window_weights_json,c.target_sample,c.low_sample_threshold,c.ultra_low_sample_threshold,c.low_sample_floor,c.low_sample_cap,c.ultra_low_sample_floor,c.ultra_low_sample_cap,c.global_floor,c.global_cap,c.soft_cap_start,c.soft_cap_multiplier,c.weak_long_window_threshold_1,c.weak_long_window_cap_start_1,c.weak_long_window_multiplier_1,c.weak_long_window_threshold_2,c.weak_long_window_cap_start_2,c.weak_long_window_multiplier_2,c.low_frequency_less_soft_cap_start,c.low_frequency_less_multiplier,c.max_factor_bonus,c.max_factor_penalty,c.factor_logit_strength,c.divergence_score_threshold,c.divergence_hp_threshold,c.divergence_reliability_threshold,c.active);
    await run(env.SCORE_DB, `UPDATE hit_probability_profile_configs SET profile_version=?, player_type=?, prop_family=?, selected_side=?, source_key_scope=?, window_weights_json=?, target_sample=?, low_sample_threshold=?, ultra_low_sample_threshold=?, low_sample_floor=?, low_sample_cap=?, ultra_low_sample_floor=?, ultra_low_sample_cap=?, global_floor=?, global_cap=?, soft_cap_start=?, soft_cap_multiplier=?, weak_long_window_threshold_1=?, weak_long_window_cap_start_1=?, weak_long_window_multiplier_1=?, weak_long_window_threshold_2=?, weak_long_window_cap_start_2=?, weak_long_window_multiplier_2=?, low_frequency_less_soft_cap_start=?, low_frequency_less_multiplier=?, max_factor_bonus=?, max_factor_penalty=?, factor_logit_strength=?, divergence_score_threshold=?, divergence_hp_threshold=?, divergence_reliability_threshold=?, active=?, updated_at=CURRENT_TIMESTAMP WHERE profile_key=?`, c.profile_version,c.player_type,c.prop_family,c.selected_side,c.source_key_scope,c.window_weights_json,c.target_sample,c.low_sample_threshold,c.ultra_low_sample_threshold,c.low_sample_floor,c.low_sample_cap,c.ultra_low_sample_floor,c.ultra_low_sample_cap,c.global_floor,c.global_cap,c.soft_cap_start,c.soft_cap_multiplier,c.weak_long_window_threshold_1,c.weak_long_window_cap_start_1,c.weak_long_window_multiplier_1,c.weak_long_window_threshold_2,c.weak_long_window_cap_start_2,c.weak_long_window_multiplier_2,c.low_frequency_less_soft_cap_start,c.low_frequency_less_multiplier,c.max_factor_bonus,c.max_factor_penalty,c.factor_logit_strength,c.divergence_score_threshold,c.divergence_hp_threshold,c.divergence_reliability_threshold,c.active,c.profile_key);

  }
}
async function hpLoadProfileConfigs(env){
  const rows=await all(env.SCORE_DB, `SELECT * FROM hit_probability_profile_configs WHERE active=1`);
  const map=new Map();
  for(const r of rows) map.set(r.profile_key, hpConfigFromRow(r));
  return map;
}

async function hpEnsureSchema(env){
  const stmts=[
    `CREATE TABLE IF NOT EXISTS hit_probability_batches (batch_id TEXT PRIMARY KEY, request_id TEXT, run_id TEXT, worker_version TEXT, profile_version TEXT, mode TEXT, status TEXT, source_table TEXT, source_final_board_batch_id TEXT, source_engine_batch_id TEXT, source_rows_read INTEGER DEFAULT 0, supported_rows INTEGER DEFAULT 0, probability_rows_written INTEGER DEFAULT 0, issue_rows_written INTEGER DEFAULT 0, hitter_players_checked INTEGER DEFAULT 0, pitcher_players_checked INTEGER DEFAULT 0, certification_status TEXT, certification_grade TEXT, output_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS hit_probability_current (probability_row_id TEXT PRIMARY KEY, batch_id TEXT, source_table TEXT, final_board_row_id TEXT, score_row_id TEXT, prepared_row_id TEXT, matrix_id TEXT, source_line_id TEXT, source_key TEXT, game_pk INTEGER, official_date TEXT, official_game_time_utc TEXT, mlb_player_id INTEGER, player_name TEXT, canonical_prop_key TEXT, line_value REAL, selected_side TEXT, prop_family TEXT, prop_line_profile_key TEXT, probability_model_version TEXT, probability_status TEXT, probability_grade TEXT, estimated_hit_probability_0_100 REAL, probability_confidence_0_100 REAL, probability_band TEXT, empirical_hit_rate_0_1 REAL, reliability_0_1 REAL, sample_size INTEGER, non_push_sample INTEGER, hit_count INTEGER, miss_count INTEGER, push_count INTEGER, push_risk_0_1 REAL, score_0_100 REAL, score_grade TEXT, board_tier TEXT, live_playable INTEGER, review_playable INTEGER, warning_count INTEGER DEFAULT 0, blocker_count INTEGER DEFAULT 0, model_notes_json TEXT, window_summary_json TEXT, source_snapshot_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS hit_probability_issues (issue_id TEXT PRIMARY KEY, batch_id TEXT, probability_row_id TEXT, final_board_row_id TEXT, score_row_id TEXT, prepared_row_id TEXT, game_pk INTEGER, mlb_player_id INTEGER, canonical_prop_key TEXT, selected_side TEXT, severity TEXT, issue_type TEXT, reason TEXT, details_json TEXT, official_date TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS hit_probability_profile_configs (profile_key TEXT PRIMARY KEY, profile_version TEXT, player_type TEXT, prop_family TEXT, selected_side TEXT, source_key_scope TEXT DEFAULT 'all', window_weights_json TEXT, target_sample REAL DEFAULT 20, low_sample_threshold REAL DEFAULT 10, ultra_low_sample_threshold REAL DEFAULT 3, low_sample_floor REAL DEFAULT 42.5, low_sample_cap REAL DEFAULT 57.5, ultra_low_sample_floor REAL DEFAULT 44, ultra_low_sample_cap REAL DEFAULT 56, global_floor REAL DEFAULT 10, global_cap REAL DEFAULT 90, soft_cap_start REAL DEFAULT 90, soft_cap_multiplier REAL DEFAULT 0, weak_long_window_threshold_1 REAL DEFAULT 70, weak_long_window_cap_start_1 REAL DEFAULT 80, weak_long_window_multiplier_1 REAL DEFAULT 0, weak_long_window_threshold_2 REAL DEFAULT 75, weak_long_window_cap_start_2 REAL DEFAULT 82, weak_long_window_multiplier_2 REAL DEFAULT 0, low_frequency_less_soft_cap_start REAL DEFAULT 80, low_frequency_less_multiplier REAL DEFAULT 0, max_factor_bonus REAL DEFAULT 4, max_factor_penalty REAL DEFAULT -4, factor_logit_strength REAL DEFAULT 0.18, divergence_score_threshold REAL DEFAULT 86, divergence_hp_threshold REAL DEFAULT 45, divergence_reliability_threshold REAL DEFAULT 95, active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE INDEX IF NOT EXISTS idx_hit_probability_current_board ON hit_probability_current(final_board_row_id)`,
    `CREATE INDEX IF NOT EXISTS idx_hit_probability_current_prepared ON hit_probability_current(prepared_row_id)`,
    `CREATE INDEX IF NOT EXISTS idx_hit_probability_current_player_prop ON hit_probability_current(mlb_player_id, canonical_prop_key, selected_side)`,
    `CREATE INDEX IF NOT EXISTS idx_hit_probability_current_band ON hit_probability_current(probability_band, probability_confidence_0_100)`,
    `CREATE INDEX IF NOT EXISTS idx_hit_probability_batches_status ON hit_probability_batches(status, updated_at)`,
    `CREATE INDEX IF NOT EXISTS idx_hit_probability_issues_batch ON hit_probability_issues(batch_id, severity)`,
    `CREATE INDEX IF NOT EXISTS idx_hit_probability_profile_configs_active ON hit_probability_profile_configs(active, profile_key)`
  ];
  for(const s of stmts) await run(env.SCORE_DB, s);
  const addCols=[
    ['raw_empirical_hit_rate_0_1','REAL'],
    ['raw_weighted_empirical_rate_v0_1_2_0_100','REAL'],
    ['raw_weighted_empirical_rate_v0_1_3_0_100','REAL'],
    ['estimated_recent_form_hit_rate_0_100','REAL'],
    ['sample_reliability_score_0_100','REAL'],
    ['recent_form_band','TEXT'],
    ['recent_form_grade','TEXT'],
    ['display_adjustment_reason','TEXT'],
    ['display_warning_flags_json','TEXT'],
    ['display_notes_json','TEXT'],
    ['factor_alignment_score_0_100','REAL'],
    ['factor_adjustment_0_100','REAL'],
    ['score_recent_form_gap_0_100','REAL'],
    ['recent_form_rank_hint_0_100','REAL'],
    ['profile_config_json','TEXT']
  ];
  for(const [col,ddl] of addCols) await hpAddColumnIfMissing(env, 'hit_probability_current', col, ddl);
  await run(env.SCORE_DB, `CREATE INDEX IF NOT EXISTS idx_hit_probability_recent_form_band ON hit_probability_current(recent_form_band, sample_reliability_score_0_100)`);
  await run(env.SCORE_DB, `CREATE INDEX IF NOT EXISTS idx_hit_probability_recent_form_rank_hint ON hit_probability_current(recent_form_rank_hint_0_100)`);
  await hpSeedProfileConfigs(env);
}
async function hpSourceRows(env, input = {}){
  const preferScoringCurrent = input && (input.source_preference === "scoring_engine_current" || input.force_scoring_engine_current_source === true);
  if(!preferScoringCurrent){
    const finalRows = await all(env.SCORE_DB, `SELECT * FROM score_final_board_current ORDER BY rank_order ASC LIMIT ${HP_MAX_ROWS_PER_RUN}`);
    if(finalRows.length){ return { source_table:"score_final_board_current", rows:finalRows, final_board_batch_id:finalRows[0].final_board_batch_id || null, engine_batch_id:finalRows[0].source_engine_batch_id || null }; }
  }
  const scoreRows = await all(env.SCORE_DB, `SELECT * FROM scoring_engine_current WHERE score_0_100 IS NOT NULL ORDER BY score_0_100 DESC LIMIT ${HP_MAX_ROWS_PER_RUN}`);
  return { source_table:"scoring_engine_current", rows:scoreRows, final_board_batch_id:null, engine_batch_id:scoreRows[0] ? scoreRows[0].batch_id : null };
}
async function hpFetchHitterLogs(env, playerIds, maxDate){ const map=new Map(); for(const c of hpChunks(playerIds, HP_PLAYER_CHUNK_SIZE)){ if(!c.length) continue; const q=`SELECT player_id, game_pk, game_date, hits, singles, doubles, home_runs, total_bases, runs, rbi, walks, stolen_bases FROM hitter_game_logs WHERE player_id IN (${c.map(()=>'?').join(',')}) AND game_date < ? ORDER BY player_id, game_date DESC`; const rows=await all(env.STATS_HITTER_DB, q, ...c, maxDate); for(const r of rows){ const k=String(r.player_id); if(!map.has(k)) map.set(k,[]); map.get(k).push(r); } } return map; }
async function hpFetchPitcherLogs(env, playerIds, maxDate){ const map=new Map(); for(const c of hpChunks(playerIds, HP_PLAYER_CHUNK_SIZE)){ if(!c.length) continue; const q=`SELECT player_id, game_pk, game_date, outs_recorded, innings_pitched_decimal, hits_allowed, runs_allowed, earned_runs, walks_allowed, strikeouts FROM pitcher_game_logs WHERE player_id IN (${c.map(()=>'?').join(',')}) AND game_date < ? ORDER BY player_id, game_date DESC`; const rows=await all(env.STATS_PITCHER_DB, q, ...c, maxDate); for(const r of rows){ const k=String(r.player_id); if(!map.has(k)) map.set(k,[]); map.get(k).push(r); } } return map; }
async function hpWriteIssue(env,batchId,src,probabilityRowId,severity,issueType,reason,details={}){ await run(env.SCORE_DB, `INSERT INTO hit_probability_issues (issue_id,batch_id,probability_row_id,final_board_row_id,score_row_id,prepared_row_id,game_pk,mlb_player_id,canonical_prop_key,selected_side,severity,issue_type,reason,details_json,official_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, hpUid('hp_issue'), batchId, probabilityRowId || null, src.final_board_row_id || null, src.score_row_id || null, src.prepared_row_id || null, src.game_pk || null, src.mlb_player_id || null, src.canonical_prop_key || null, src.selected_side || null, severity, issueType, reason, hpSafeJson(details,4000), src.official_date || null); }


async function hpEnsureBoardSchema(env){
  const stmts=[
    `CREATE TABLE IF NOT EXISTS hp_board_batches (hp_board_batch_id TEXT PRIMARY KEY, request_id TEXT, run_id TEXT, worker_version TEXT, profile_key TEXT, profile_version TEXT, mode TEXT, status TEXT, source_table TEXT, source_hp_batch_id TEXT, source_final_board_batch_id TEXT, source_engine_batch_id TEXT, source_rows_read INTEGER DEFAULT 0, board_rows_written INTEGER DEFAULT 0, history_rows_written INTEGER DEFAULT 0, issue_rows_written INTEGER DEFAULT 0, primary_rows INTEGER DEFAULT 0, review_rows INTEGER DEFAULT 0, fade_rows INTEGER DEFAULT 0, certification_status TEXT, certification_grade TEXT, thresholds_locked INTEGER DEFAULT 0, no_true_probability_claims INTEGER DEFAULT 1, output_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS hp_board_current (hp_board_row_id TEXT PRIMARY KEY, hp_board_batch_id TEXT, source_hp_batch_id TEXT, source_final_board_batch_id TEXT, source_engine_batch_id TEXT, probability_row_id TEXT, final_board_row_id TEXT, prepared_row_id TEXT, matrix_id TEXT, source_line_id TEXT, profile_key TEXT, hp_profile_version TEXT, hp_rank INTEGER, hp_lane TEXT, hp_lane_rank INTEGER, hp_sort_0_100 REAL, source_key TEXT, game_pk INTEGER, official_date TEXT, official_game_time_utc TEXT, mlb_player_id INTEGER, player_name TEXT, canonical_prop_key TEXT, line_value REAL, selected_side TEXT, prop_family TEXT, estimated_hit_probability_0_100 REAL, probability_confidence_0_100 REAL, probability_band TEXT, probability_grade TEXT, empirical_hit_rate_0_1 REAL, reliability_0_1 REAL, sample_size INTEGER, non_push_sample INTEGER, hit_count INTEGER, miss_count INTEGER, push_count INTEGER, push_risk_0_1 REAL, score_0_100 REAL, score_grade TEXT, board_tier TEXT, live_playable INTEGER, review_playable INTEGER, hp_primary_playable INTEGER DEFAULT 0, hp_review_playable INTEGER DEFAULT 0, hp_fade_flag INTEGER DEFAULT 0, warning_count INTEGER DEFAULT 0, blocker_count INTEGER DEFAULT 0, lane_reason TEXT, calibration_json TEXT, source_snapshot_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS hp_board_history (hp_board_row_id TEXT PRIMARY KEY, hp_board_batch_id TEXT, source_hp_batch_id TEXT, source_final_board_batch_id TEXT, source_engine_batch_id TEXT, probability_row_id TEXT, final_board_row_id TEXT, prepared_row_id TEXT, matrix_id TEXT, source_line_id TEXT, profile_key TEXT, hp_profile_version TEXT, hp_rank INTEGER, hp_lane TEXT, hp_lane_rank INTEGER, hp_sort_0_100 REAL, source_key TEXT, game_pk INTEGER, official_date TEXT, official_game_time_utc TEXT, mlb_player_id INTEGER, player_name TEXT, canonical_prop_key TEXT, line_value REAL, selected_side TEXT, prop_family TEXT, estimated_hit_probability_0_100 REAL, probability_confidence_0_100 REAL, probability_band TEXT, probability_grade TEXT, empirical_hit_rate_0_1 REAL, reliability_0_1 REAL, sample_size INTEGER, non_push_sample INTEGER, hit_count INTEGER, miss_count INTEGER, push_count INTEGER, push_risk_0_1 REAL, score_0_100 REAL, score_grade TEXT, board_tier TEXT, live_playable INTEGER, review_playable INTEGER, hp_primary_playable INTEGER DEFAULT 0, hp_review_playable INTEGER DEFAULT 0, hp_fade_flag INTEGER DEFAULT 0, warning_count INTEGER DEFAULT 0, blocker_count INTEGER DEFAULT 0, lane_reason TEXT, calibration_json TEXT, source_snapshot_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS hp_board_issues (issue_id TEXT PRIMARY KEY, hp_board_batch_id TEXT, source_hp_batch_id TEXT, source_final_board_batch_id TEXT, source_engine_batch_id TEXT, probability_row_id TEXT, hp_board_row_id TEXT, final_board_row_id TEXT, prepared_row_id TEXT, game_pk INTEGER, mlb_player_id INTEGER, canonical_prop_key TEXT, selected_side TEXT, severity TEXT, issue_type TEXT, reason TEXT, details_json TEXT, official_date TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE INDEX IF NOT EXISTS idx_hp_board_batches_status ON hp_board_batches(status, updated_at)`,
    `CREATE INDEX IF NOT EXISTS idx_hp_board_current_rank ON hp_board_current(profile_key, hp_rank)`,
    `CREATE INDEX IF NOT EXISTS idx_hp_board_current_lane ON hp_board_current(hp_lane, hp_lane_rank)`,
    `CREATE INDEX IF NOT EXISTS idx_hp_board_current_final_board ON hp_board_current(final_board_row_id)`,
    `CREATE INDEX IF NOT EXISTS idx_hp_board_current_prepared ON hp_board_current(prepared_row_id)`,
    `CREATE INDEX IF NOT EXISTS idx_hp_board_current_player_prop ON hp_board_current(mlb_player_id, canonical_prop_key, selected_side)`,
    `CREATE INDEX IF NOT EXISTS idx_hp_board_current_date ON hp_board_current(official_date, source_key, canonical_prop_key)`,
    `CREATE INDEX IF NOT EXISTS idx_hp_board_history_batch ON hp_board_history(hp_board_batch_id, hp_rank)`,
    `CREATE INDEX IF NOT EXISTS idx_hp_board_issues_batch ON hp_board_issues(hp_board_batch_id, severity)`
  ];
  for(const sql of stmts) await run(env.SCORE_DB, sql);
}

function hpBoardLane(row){
  const hp=hpNum(row.estimated_hit_probability_0_100, 0);
  const conf=hpNum(row.probability_confidence_0_100, 0);
  const sample=hpNum(row.sample_size, 0);
  const score=hpNum(row.score_0_100, 0);
  if(hp >= 70 && conf >= 95 && sample >= 20 && score >= 84) return 'HP_PRIMARY_ELITE';
  if(hp >= 62 && conf >= 90 && sample >= 20 && score >= 84) return 'HP_PRIMARY_STRONG';
  if(hp >= 55 && conf >= 70 && sample >= 15 && score >= 76) return 'HP_SUPPORTED_REVIEW';
  if(score >= 84 && hp < 45 && sample >= 15) return 'HP_SCORE_STRONG_HP_WEAK_REVIEW';
  if(sample < 15) return 'HP_LOW_SAMPLE_REVIEW';
  if(hp >= 45 && hp < 55) return 'HP_NEUTRAL_REVIEW';
  if(hp < 35 && conf >= 90 && sample >= 20) return 'HP_FADE_RECENT_FORM';
  return 'HP_WEAK_SUPPORT';
}

function hpBoardLaneReason(lane){
  if(lane === 'HP_PRIMARY_ELITE') return 'Recent-form HP is 70+ with strong confidence, full sample support, and strong framework score.';
  if(lane === 'HP_PRIMARY_STRONG') return 'Recent-form HP is 62+ with strong confidence, stable sample, and strong framework score.';
  if(lane === 'HP_SUPPORTED_REVIEW') return 'Recent-form HP is supportive but not primary; keep as review lane.';
  if(lane === 'HP_SCORE_STRONG_HP_WEAK_REVIEW') return 'Framework score is strong, but recent-form HP is weak; review divergence before using.';
  if(lane === 'HP_LOW_SAMPLE_REVIEW') return 'Recent-form sample is below HP board threshold; preserve row for review only.';
  if(lane === 'HP_NEUTRAL_REVIEW') return 'Recent-form HP is neutral; not primary support.';
  if(lane === 'HP_FADE_RECENT_FORM') return 'Recent-form HP is materially weak with stable confidence; fade/reject candidate.';
  return 'Recent-form HP support is weak or incomplete; not a primary candidate.';
}

function hpBoardRawHpBucket(hp){
  const v=hpNum(hp,0);
  if(v >= 90) return '90_PLUS';
  if(v >= 80) return '80_TO_89';
  if(v >= 70) return '70_TO_79';
  if(v >= 60) return '60_TO_69';
  if(v >= 50) return '50_TO_59';
  if(v >= 40) return '40_TO_49';
  if(v >= 30) return '30_TO_39';
  if(v >= 20) return '20_TO_29';
  if(v >= 10) return '10_TO_19';
  return 'BELOW_10';
}

function hpBoardDisplayCalibrationAction(bucket, gap){
  if(bucket === '90_PLUS') return 'display_soft_cap_top_bucket';
  if(bucket === '80_TO_89' || bucket === '70_TO_79') return 'display_soft_cap_high_bucket';
  if(bucket === '60_TO_69') return 'display_mild_adjustment';
  if(bucket === '50_TO_59' || bucket === '40_TO_49') return 'display_minor_adjustment';
  if(bucket === '30_TO_39' || bucket === '20_TO_29' || bucket === '10_TO_19') return 'display_minor_lift';
  return gap < 0 ? 'display_minor_lift' : 'preserve_raw_low_bucket';
}

function hpBuildBoardDisplayCalibrationMap(rows){
  const buckets={};
  for(const r of rows || []){
    const bucket=hpBoardRawHpBucket(r.estimated_hit_probability_0_100);
    if(!buckets[bucket]) buckets[bucket]={ bucket, rows:0, total_raw_hp:0, total_non_push_sample:0, total_hits:0, total_misses:0, total_pushes:0 };
    const b=buckets[bucket];
    b.rows += 1;
    b.total_raw_hp += hpNum(r.estimated_hit_probability_0_100,0);
    b.total_non_push_sample += hpNum(r.non_push_sample,0);
    b.total_hits += hpNum(r.hit_count,0);
    b.total_misses += hpNum(r.miss_count,0);
    b.total_pushes += hpNum(r.push_count,0);
  }
  for(const b of Object.values(buckets)){
    b.bucket_avg_estimate = b.rows > 0 ? hpRound(b.total_raw_hp / b.rows, 2) : null;
    b.bucket_pooled_empirical = b.total_non_push_sample > 0 ? hpRound(100.0 * b.total_hits / b.total_non_push_sample, 2) : null;
    b.bucket_gap_estimate_minus_empirical = (b.bucket_avg_estimate != null && b.bucket_pooled_empirical != null) ? hpRound(b.bucket_avg_estimate - b.bucket_pooled_empirical, 2) : null;
    b.calibration_action = hpBoardDisplayCalibrationAction(b.bucket, hpNum(b.bucket_gap_estimate_minus_empirical,0));
    b.calibrated_display_hp_0_100 = b.bucket_pooled_empirical != null ? b.bucket_pooled_empirical : b.bucket_avg_estimate;
  }
  return buckets;
}

function hpBoardCalibrationJson(row, bucketCalibration){
  const rawBucket=hpBoardRawHpBucket(row && row.estimated_hit_probability_0_100);
  const b=(bucketCalibration && bucketCalibration[rawBucket]) || {};
  return hpSafeJson({
    calibration_profile: HP_BOARD_PROFILE_VERSION,
    calibration_type: 'internal_recent_form_display_only',
    framework_only: true,
    true_probability_claim: false,
    no_true_probability_claims: true,
    raw_bucket: rawBucket,
    raw_estimated_hit_probability_0_100: hpRound(row && row.estimated_hit_probability_0_100, 2),
    bucket_rows: b.rows || 0,
    bucket_total_non_push_sample: b.total_non_push_sample || 0,
    bucket_total_hits: b.total_hits || 0,
    bucket_total_misses: b.total_misses || 0,
    bucket_total_pushes: b.total_pushes || 0,
    bucket_avg_estimate: b.bucket_avg_estimate == null ? null : b.bucket_avg_estimate,
    bucket_pooled_empirical: b.bucket_pooled_empirical == null ? null : b.bucket_pooled_empirical,
    bucket_gap_estimate_minus_empirical: b.bucket_gap_estimate_minus_empirical == null ? null : b.bucket_gap_estimate_minus_empirical,
    calibration_action: b.calibration_action || 'preserve_raw_bucket',
    calibrated_display_hp_0_100: b.calibrated_display_hp_0_100 == null ? hpRound(row && row.estimated_hit_probability_0_100, 2) : b.calibrated_display_hp_0_100,
    raw_hp_preserved: true,
    lanes_preserved: true,
    ranks_preserved: true,
    true_calibration_blocked_reason: 'No settled outcome/backtest/settlement table exists in SCORE_DB; this is internal recent-form display calibration only.',
    note: 'Use calibrated_display_hp_0_100 only as display compression/lift for current recent-form HP buckets. Do not treat as true modeled hit probability.',
    primary_elite: 'hp>=70 confidence>=95 sample>=20 score>=84',
    primary_strong: 'hp>=62 confidence>=90 sample>=20 score>=84',
    supported_review: 'hp>=55 confidence>=70 sample>=15 score>=76',
    divergence_review: 'score>=84 hp<45 sample>=15',
    low_sample_review: 'sample<15',
    neutral_review: '45<=hp<55',
    fade_recent_form: 'hp<35 confidence>=90 sample>=20'
  }, 5000);
}

async function runHpBoardCurrent(env, input = {}){
  const started=Date.now();
  if(!env.SCORE_DB) return baseIdentity({ ok:false, data_ok:false, version:HP_VERSION, job_key:HP_BOARD_JOB_KEY, mode:HP_BOARD_MODE, status:'blocked_missing_score_db', certification:'HP_BOARD_MISSING_SCORE_DB', certification_grade:'BLOCKED' });
  await hpEnsureSchema(env);
  await hpEnsureBoardSchema(env);

  const sourceRows=await all(env.SCORE_DB, `SELECT * FROM hit_probability_current ORDER BY probability_row_id LIMIT ${HP_MAX_ROWS_PER_RUN}`);
  if(!sourceRows.length){
    return baseIdentity({ ok:false, data_ok:false, version:HP_VERSION, worker_name:WORKER_NAME, logical_worker_name:'alphadog-v2-hit-probability', deployed_worker_slot:'alphadog-v2-score-audit', job_key:HP_BOARD_JOB_KEY, mode:HP_BOARD_MODE, status:'blocked_no_hit_probability_current_rows', certification:'HP_BOARD_NO_HIT_PROBABILITY_CURRENT_ROWS', certification_grade:'BLOCKED', no_true_probability_claims:true, no_final_board_mutation:true, no_prepared_board_mutation:true });
  }

  const sourceHpBatchId=String(sourceRows[0].batch_id || 'unknown_hp_batch');
  const hpBatch=await first(env.SCORE_DB, `SELECT * FROM hit_probability_batches WHERE batch_id=?`, sourceHpBatchId) || {};
  const hpBoardBatchId='hp_board_batch_for_' + sourceHpBatchId;
  const sourceFinalBoardBatchId=hpBatch.source_final_board_batch_id || null;
  const sourceEngineBatchId=hpBatch.source_engine_batch_id || null;
  const classified=sourceRows.map(r => {
    const lane=hpBoardLane(r);
    const hp=hpNum(r.estimated_hit_probability_0_100, 0);
    const conf=hpNum(r.probability_confidence_0_100, 0);
    const sample=hpNum(r.sample_size, 0);
    const score=hpNum(r.score_0_100, 0);
    return {
      ...r,
      hp_lane: lane,
      lane_reason: hpBoardLaneReason(lane),
      hp_primary_playable: (hp >= 62 && conf >= 90 && sample >= 20 && score >= 84) ? 1 : 0,
      hp_review_playable: (hp >= 45 && score >= 76) ? 1 : 0,
      hp_fade_flag: (hp < 35 && conf >= 90 && sample >= 20) ? 1 : 0
    };
  });
  classified.sort((a,b) => {
    const ao=HP_BOARD_LANE_ORDER[a.hp_lane] || 99;
    const bo=HP_BOARD_LANE_ORDER[b.hp_lane] || 99;
    if(ao !== bo) return ao - bo;
    const fields=['estimated_hit_probability_0_100','probability_confidence_0_100','sample_size','score_0_100'];
    for(const f of fields){ const d=hpNum(b[f],0)-hpNum(a[f],0); if(Math.abs(d)>0.000001) return d; }
    return String(a.player_name||'').localeCompare(String(b.player_name||''))
      || String(a.canonical_prop_key||'').localeCompare(String(b.canonical_prop_key||''))
      || String(a.selected_side||'').localeCompare(String(b.selected_side||''))
      || (hpNum(a.line_value,0)-hpNum(b.line_value,0));
  });
  const laneRanks={};
  classified.forEach((r,idx)=>{ r.hp_rank=idx+1; laneRanks[r.hp_lane]=(laneRanks[r.hp_lane]||0)+1; r.hp_lane_rank=laneRanks[r.hp_lane]; });

  const displayCalibrationByBucket=hpBuildBoardDisplayCalibrationMap(classified);

  await run(env.SCORE_DB, `DELETE FROM hp_board_current`);
  await run(env.SCORE_DB, `DELETE FROM hp_board_history WHERE hp_board_batch_id=?`, hpBoardBatchId);
  await run(env.SCORE_DB, `DELETE FROM hp_board_issues WHERE hp_board_batch_id=?`, hpBoardBatchId);

  let primaryRows=0, reviewRows=0, fadeRows=0;
  for(const r of classified){
    primaryRows += r.hp_primary_playable ? 1 : 0;
    reviewRows += r.hp_review_playable ? 1 : 0;
    fadeRows += r.hp_fade_flag ? 1 : 0;
    const hpBoardRowId='hpboard|' + hpBoardBatchId + '|' + r.probability_row_id;
    const calibration=hpBoardCalibrationJson(r, displayCalibrationByBucket);
    await run(env.SCORE_DB, `INSERT OR REPLACE INTO hp_board_current (hp_board_row_id,hp_board_batch_id,source_hp_batch_id,source_final_board_batch_id,source_engine_batch_id,probability_row_id,final_board_row_id,prepared_row_id,matrix_id,source_line_id,profile_key,hp_profile_version,hp_rank,hp_lane,hp_lane_rank,hp_sort_0_100,source_key,game_pk,official_date,official_game_time_utc,mlb_player_id,player_name,canonical_prop_key,line_value,selected_side,prop_family,estimated_hit_probability_0_100,probability_confidence_0_100,probability_band,probability_grade,empirical_hit_rate_0_1,reliability_0_1,sample_size,non_push_sample,hit_count,miss_count,push_count,push_risk_0_1,score_0_100,score_grade,board_tier,live_playable,review_playable,hp_primary_playable,hp_review_playable,hp_fade_flag,warning_count,blocker_count,lane_reason,calibration_json,source_snapshot_json,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
      hpBoardRowId,hpBoardBatchId,sourceHpBatchId,sourceFinalBoardBatchId,sourceEngineBatchId,r.probability_row_id||null,r.final_board_row_id||null,r.prepared_row_id||null,r.matrix_id||null,r.source_line_id||null,HP_BOARD_PROFILE_KEY,HP_BOARD_PROFILE_VERSION,r.hp_rank,r.hp_lane,r.hp_lane_rank,hpNum(r.estimated_hit_probability_0_100,0),r.source_key||null,r.game_pk||null,r.official_date||null,r.official_game_time_utc||null,r.mlb_player_id||null,r.player_name||null,r.canonical_prop_key||null,r.line_value||null,r.selected_side||null,r.prop_family||null,r.estimated_hit_probability_0_100||null,r.probability_confidence_0_100||null,r.probability_band||null,r.probability_grade||null,r.empirical_hit_rate_0_1||null,r.reliability_0_1||null,r.sample_size||0,r.non_push_sample||0,r.hit_count||0,r.miss_count||0,r.push_count||0,r.push_risk_0_1||0,r.score_0_100||null,r.score_grade||null,r.board_tier||null,r.live_playable||0,r.review_playable||0,r.hp_primary_playable,r.hp_review_playable,r.hp_fade_flag,r.warning_count||0,r.blocker_count||0,r.lane_reason,calibration,r.source_snapshot_json||null);
  }

  await run(env.SCORE_DB, `INSERT OR REPLACE INTO hp_board_history SELECT * FROM hp_board_current WHERE hp_board_batch_id=?`, hpBoardBatchId);
  await run(env.SCORE_DB, `INSERT OR REPLACE INTO hp_board_issues (issue_id,hp_board_batch_id,source_hp_batch_id,source_final_board_batch_id,source_engine_batch_id,probability_row_id,hp_board_row_id,final_board_row_id,prepared_row_id,game_pk,mlb_player_id,canonical_prop_key,selected_side,severity,issue_type,reason,details_json,official_date)
    SELECT 'hpboard_issue|' || c.hp_board_batch_id || '|' || i.issue_id, c.hp_board_batch_id, c.source_hp_batch_id, c.source_final_board_batch_id, c.source_engine_batch_id, i.probability_row_id, c.hp_board_row_id, i.final_board_row_id, i.prepared_row_id, i.game_pk, i.mlb_player_id, i.canonical_prop_key, i.selected_side, i.severity, i.issue_type, i.reason, i.details_json, i.official_date
    FROM hit_probability_issues i JOIN hp_board_current c ON c.probability_row_id=i.probability_row_id WHERE i.batch_id=?`, sourceHpBatchId);

  const qa=await first(env.SCORE_DB, `SELECT COUNT(*) AS rows, COUNT(DISTINCT hp_board_row_id) AS hp_rows, COUNT(DISTINCT hp_rank) AS ranks, MIN(hp_rank) AS min_rank, MAX(hp_rank) AS max_rank, COUNT(DISTINCT final_board_row_id) AS final_rows, COUNT(DISTINCT prepared_row_id) AS prepared_rows, SUM(CASE WHEN final_board_row_id IS NULL THEN 1 ELSE 0 END) AS null_final_rows, SUM(CASE WHEN prepared_row_id IS NULL THEN 1 ELSE 0 END) AS null_prepared_rows, SUM(CASE WHEN blocker_count > 0 THEN 1 ELSE 0 END) AS blocker_rows, ROUND(AVG(score_0_100),2) AS avg_score, ROUND(AVG(estimated_hit_probability_0_100),2) AS avg_hp FROM hp_board_current WHERE hp_board_batch_id=?`, hpBoardBatchId) || {};
  const issueCountRow=await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM hp_board_issues WHERE hp_board_batch_id=?`, hpBoardBatchId) || {};
  const rowCount=Number(qa.rows||0);
  let status='completed_hp_board_current_display_calibrated';
  let cert='HP_BOARD_DISPLAY_CALIBRATION_CERTIFIED_INTERNAL_RECENT_FORM';
  let grade='PASS_WITH_TRUE_CALIBRATION_BLOCKED';
  if(rowCount === 0 || rowCount !== Number(qa.hp_rows||0) || rowCount !== Number(qa.ranks||0) || Number(qa.min_rank||0) !== 1 || Number(qa.max_rank||0) !== rowCount || rowCount !== Number(qa.final_rows||0) || rowCount !== Number(qa.prepared_rows||0) || Number(qa.null_final_rows||0)>0 || Number(qa.null_prepared_rows||0)>0 || Number(qa.blocker_rows||0)>0){
    status='failed_hp_board_integrity_check';
    cert='HP_BOARD_PROFILE_CURRENT_INTEGRITY_FAILED';
    grade='BLOCKED';
  }
  const output=baseIdentity({
    ok: grade !== 'BLOCKED',
    data_ok: grade !== 'BLOCKED',
    version: HP_VERSION,
    worker_name: WORKER_NAME,
    logical_worker_name: 'alphadog-v2-hit-probability',
    deployed_worker_slot: 'alphadog-v2-score-audit',
    job_key: HP_BOARD_JOB_KEY,
    mode: HP_BOARD_MODE,
    request_id: input.request_id || hpBatch.request_id || null,
    run_id: input.run_id || hpBatch.run_id || null,
    chain_id: input.chain_id || null,
    status,
    certification: cert,
    certification_status: cert,
    certification_grade: grade,
    hp_board_batch_id: hpBoardBatchId,
    source_hp_batch_id: sourceHpBatchId,
    source_final_board_batch_id: sourceFinalBoardBatchId,
    source_engine_batch_id: sourceEngineBatchId,
    profile_key: HP_BOARD_PROFILE_KEY,
    profile_version: HP_BOARD_PROFILE_VERSION,
    source_table: 'hit_probability_current',
    source_rows_read: sourceRows.length,
    board_rows_written: rowCount,
    history_rows_written: rowCount,
    issue_rows_written: Number(issueCountRow.rows || 0),
    primary_rows: primaryRows,
    review_rows: reviewRows,
    fade_rows: fadeRows,
    warning_rows: Number((await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM hp_board_current WHERE hp_board_batch_id=? AND warning_count>0`, hpBoardBatchId) || {}).rows || 0),
    blocker_rows: Number(qa.blocker_rows || 0),
    avg_score: qa.avg_score,
    avg_hp: qa.avg_hp,
    display_calibration_profile: HP_BOARD_PROFILE_VERSION,
    calibration_type: 'internal_recent_form_display_only',
    true_calibration_blocked_reason: 'No settled outcome/backtest/settlement table exists in SCORE_DB.',
    raw_hp_preserved: true,
    lanes_preserved: true,
    ranks_preserved: true,
    display_calibration_by_bucket: displayCalibrationByBucket,
    thresholds_locked: true,
    framework_only: true,
    no_true_probability_claims: true,
    no_score_mutation: true,
    no_scoring_engine_current_mutation: true,
    no_final_board_mutation: true,
    no_prepared_board_mutation: true,
    no_source_board_mutation: true,
    hp_board_ranking: true,
    no_candidate_board_write: true,
    layout: 'final_board_style_hp_focused',
    qa_status: grade === 'BLOCKED' ? 'FAIL_HP_BOARD_INTEGRITY' : 'PASS_INTERNAL_DISPLAY_CALIBRATION_WRITTEN_SAME_WORKER',
    elapsed_ms: Date.now()-started
  });
  await run(env.SCORE_DB, `INSERT OR REPLACE INTO hp_board_batches (hp_board_batch_id,request_id,run_id,worker_version,profile_key,profile_version,mode,status,source_table,source_hp_batch_id,source_final_board_batch_id,source_engine_batch_id,source_rows_read,board_rows_written,history_rows_written,issue_rows_written,primary_rows,review_rows,fade_rows,certification_status,certification_grade,thresholds_locked,no_true_probability_claims,output_json,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, hpBoardBatchId,output.request_id,output.run_id,HP_VERSION,HP_BOARD_PROFILE_KEY,HP_BOARD_PROFILE_VERSION,HP_BOARD_MODE,status,'hit_probability_current',sourceHpBatchId,sourceFinalBoardBatchId,sourceEngineBatchId,sourceRows.length,rowCount,rowCount,Number(issueCountRow.rows||0),primaryRows,reviewRows,fadeRows,cert,grade,1,1,hpSafeJson(output,14000));
  return output;
}

async function runHitProbabilityCurrent(env, input = {}){
  const started=Date.now();
  if(!env.SCORE_DB || !env.STATS_HITTER_DB || !env.STATS_PITCHER_DB) return baseIdentity({ ok:false, data_ok:false, version:HP_VERSION, job_key:HP_JOB_KEY, status:"blocked_missing_db_bindings", certification:"HIT_PROBABILITY_MISSING_DB_BINDINGS", certification_grade:"BLOCKED", required_bindings:{SCORE_DB:!!env.SCORE_DB,STATS_HITTER_DB:!!env.STATS_HITTER_DB,STATS_PITCHER_DB:!!env.STATS_PITCHER_DB}, no_score_mutation:true, no_final_board_mutation:true });
  await hpEnsureSchema(env);
  const configs=await hpLoadProfileConfigs(env);
  const batchId=hpUid('hit_probability_batch');
  const source=await hpSourceRows(env, input);
  const maxDate = source.rows.reduce((m,r)=> String(r.official_date||"")>m ? String(r.official_date||"") : m, "0000-00-00") || new Date().toISOString().slice(0,10);
  const supported=[];
  const unsupported=[];
  for(const r of source.rows){ const prop=String(r.canonical_prop_key||""); const profile=hpProfile(prop); const side=hpSide(r.selected_side || r.prop_side); if(!profile || !side || !r.mlb_player_id || r.line_value == null){ unsupported.push({row:r, reason:!profile?'unsupported_prop':(!side?'missing_side':(!r.mlb_player_id?'missing_player':'missing_line'))}); } else supported.push({...r, selected_side:side, _profile:profile}); }
  const hitterIds=hpUnique(supported.filter(r=>r._profile.family==='hitter').map(r=>Number(r.mlb_player_id)));
  const pitcherIds=hpUnique(supported.filter(r=>r._profile.family==='pitcher').map(r=>Number(r.mlb_player_id)));
  const hitterLogs=await hpFetchHitterLogs(env,hitterIds,maxDate);
  const pitcherLogs=await hpFetchPitcherLogs(env,pitcherIds,maxDate);
  await run(env.SCORE_DB, "DELETE FROM hit_probability_current");
  await run(env.SCORE_DB, "DELETE FROM hit_probability_issues WHERE created_at < datetime('now','-2 days')");
  let written=0, issues=0, blocked=0, warningRows=0, lowSampleIssues=0, divergenceIssues=0, cappedRows=0, lowFreqLessRows=0, pitcherVolatilityRows=0;
  for(const src of unsupported){ issues++; blocked++; await hpWriteIssue(env,batchId,src.row,null,'blocker','HIT_PROBABILITY_ROW_UNSUPPORTED',src.reason,{isolated_same_scoring_worker_slot:true,no_score_mutation:true}); }
  for(const r of supported){
    const profile=r._profile;
    const logs=(profile.family==='hitter' ? hitterLogs : pitcherLogs).get(String(r.mlb_player_id)) || [];
    const configKey=hpProfileConfigKey(profile, r.selected_side);
    const config=configs.get(configKey) || hpDefaultConfigByKey(configKey);
    const est=hpEstimate(logs, Number(r.line_value), r.selected_side, profile, config, r);
    const probabilityRowId=hpUid('hp_row');
    const hasHistory = logs.length > 0;
    const status=hasHistory ? (est.is_low_sample ? 'recent_form_low_sample_review' : 'recent_form_estimated_current') : 'blocked_no_history';
    const grade=status === 'recent_form_estimated_current' ? est.recent_form_grade : (status === 'recent_form_low_sample_review' ? 'RF_LOW_SAMPLE_REVIEW' : 'RF_BLOCKED');
    const warningFlags=est.display_warning_flags || [];
    const warningCount=warningFlags.length;
    if(warningCount) warningRows++;
    if(status === 'blocked_no_history') blocked++;
    if(warningFlags.includes('HP_DISPLAY_CAPPED') || warningFlags.includes('HP_LESS_CAP_APPLIED')) cappedRows++;
    if(warningFlags.includes('HP_LOW_FREQUENCY_LESS_BASE_RATE')) lowFreqLessRows++;
    if(warningFlags.includes('HP_PITCHER_SAMPLE_VOLATILITY')) pitcherVolatilityRows++;
    const profileKey=[configKey, r.canonical_prop_key, hpLineBucket(r.line_value), r.selected_side].join('__').toUpperCase();
    await run(env.SCORE_DB, `INSERT INTO hit_probability_current (probability_row_id,batch_id,source_table,final_board_row_id,score_row_id,prepared_row_id,matrix_id,source_line_id,source_key,game_pk,official_date,official_game_time_utc,mlb_player_id,player_name,canonical_prop_key,line_value,selected_side,prop_family,prop_line_profile_key,probability_model_version,probability_status,probability_grade,estimated_hit_probability_0_100,probability_confidence_0_100,probability_band,empirical_hit_rate_0_1,reliability_0_1,sample_size,non_push_sample,hit_count,miss_count,push_count,push_risk_0_1,score_0_100,score_grade,board_tier,live_playable,review_playable,warning_count,blocker_count,model_notes_json,window_summary_json,source_snapshot_json,raw_empirical_hit_rate_0_1,raw_weighted_empirical_rate_v0_1_2_0_100,raw_weighted_empirical_rate_v0_1_3_0_100,estimated_recent_form_hit_rate_0_100,sample_reliability_score_0_100,recent_form_band,recent_form_grade,display_adjustment_reason,display_warning_flags_json,display_notes_json,factor_alignment_score_0_100,factor_adjustment_0_100,score_recent_form_gap_0_100,recent_form_rank_hint_0_100,profile_config_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, probabilityRowId,batchId,source.source_table,r.final_board_row_id||null,r.score_row_id||null,r.prepared_row_id||null,r.matrix_id||null,r.source_line_id||null,r.source_key||null,r.game_pk||null,r.official_date||null,r.official_game_time_utc||null,r.mlb_player_id||null,r.player_name||null,r.canonical_prop_key||null,r.line_value||null,r.selected_side,profile.family,profileKey,HP_PROFILE_VERSION,status,grade,est.estimated_hit_probability_0_100,est.probability_confidence_0_100,est.probability_band,est.empirical_hit_rate_0_1,est.reliability_0_1,est.sample_size,est.non_push_sample,est.hit_count,est.miss_count,est.push_count,est.push_risk_0_1,r.score_0_100||null,r.score_grade||null,r.board_tier||null,r.live_playable||0,r.review_playable||0,warningCount,status==='blocked_no_history'?1:0,hpSafeJson({estimated_not_true_probability:true,display_metric_label:'Estimated Recent-Form Hit Rate',method:'profiled_recent_form_weighted_empirical_with_balanced_caps_walks_less_and_stolen_bases_route_lock_v0_1_6',same_deployed_worker_slot:'alphadog-v2-score-audit',no_score_mutation:true,no_final_board_mutation:true,no_ranking:true,profile_label:profile.label,profile_config_key:configKey},4000),hpSafeJson(est.windows,6000),hpSafeJson({source_final_board_batch_id:source.final_board_batch_id, source_engine_batch_id:source.engine_batch_id},3000),est.raw_empirical_hit_rate_0_1,est.raw_weighted_empirical_rate_v0_1_2_0_100,est.raw_weighted_empirical_rate_v0_1_3_0_100,est.estimated_recent_form_hit_rate_0_100,est.sample_reliability_score_0_100,est.recent_form_band,est.recent_form_grade,est.display_adjustment_reason,hpSafeJson(warningFlags,2000),hpSafeJson(est.display_notes,5000),est.factor_alignment_score_0_100,est.factor_adjustment_0_100,est.score_recent_form_gap_0_100,est.recent_form_rank_hint_0_100,hpSafeJson(config,6000));
    written++;
    if(est.is_low_sample){ issues++; lowSampleIssues++; await hpWriteIssue(env,batchId,r,probabilityRowId,'warning','HP_LOW_SAMPLE','Recent-form sample below configured threshold; display value compressed but row preserved.',{sample_size:est.sample_size,non_push_sample:est.non_push_sample,prop_line_profile_key:profileKey,display_value:est.estimated_recent_form_hit_rate_0_100,raw_v0_1_3:est.raw_weighted_empirical_rate_v0_1_3_0_100,config_key:configKey}); }
    if(est.is_divergence){ issues++; divergenceIssues++; await hpWriteIssue(env,batchId,r,probabilityRowId,'info','SCORE_RECENT_FORM_DIVERGENCE','High structural score with weak recent-form hit rate; non-blocking audit signal only.',{score_0_100:r.score_0_100,estimated_recent_form_hit_rate_0_100:est.estimated_recent_form_hit_rate_0_100,sample_reliability_score_0_100:est.sample_reliability_score_0_100,non_push_sample:est.non_push_sample,score_recent_form_gap_0_100:est.score_recent_form_gap_0_100}); }
    if(!hasHistory){ issues++; await hpWriteIssue(env,batchId,r,probabilityRowId,'blocker','NO_HISTORICAL_GAME_LOGS','No historical logs available for isolated recent-form calculation.',{prop_line_profile_key:profileKey}); }
  }
  const rowParityOk = source.rows.length === written + unsupported.length;
  const status=written>0 ? (rowParityOk ? 'completed_recent_form_hit_rate_written' : 'failed_recent_form_row_parity_mismatch') : 'completed_no_supported_rows';
  const cert=written>0 ? (rowParityOk ? 'RECENT_FORM_HIT_RATE_PROVISIONAL_PASS' : 'RECENT_FORM_HIT_RATE_ROW_PARITY_FAILED') : 'RECENT_FORM_HIT_RATE_NO_SUPPORTED_ROWS';
  const grade=!rowParityOk ? 'BLOCKED' : (blocked>0 || warningRows>0 || issues>0 ? 'PASS_WITH_WARNINGS' : 'PASS');
  const output=baseIdentity({ ok:rowParityOk, data_ok:rowParityOk, version:HP_VERSION, worker_name:WORKER_NAME, logical_worker_name:'alphadog-v2-hit-probability', deployed_worker_slot:'alphadog-v2-score-audit', job_key:HP_JOB_KEY, request_id:input.request_id||null, run_id:input.run_id||null, chain_id:input.chain_id||null, mode:input.mode||HP_MODE, status, certification:cert, certification_grade:grade, batch_id:batchId, source_table:source.source_table, source_final_board_batch_id:source.final_board_batch_id, source_engine_batch_id:source.engine_batch_id, source_rows_read:source.rows.length, rows_read:source.rows.length, supported_rows:supported.length, unsupported_rows:unsupported.length, probability_rows_written:written, recent_form_rows_written:written, rows_written:written, row_parity_ok:rowParityOk, issue_rows_written:issues, low_sample_issue_rows:lowSampleIssues, divergence_issue_rows:divergenceIssues, warning_rows:warningRows, blocker_rows:blocked, capped_rows:cappedRows, low_frequency_less_rows:lowFreqLessRows, pitcher_volatility_rows:pitcherVolatilityRows, hitter_players_checked:hitterIds.length, pitcher_players_checked:pitcherIds.length, profile_version:HP_PROFILE_VERSION, profile_config_table:'hit_probability_profile_configs', active_profile_configs:[...configs.keys()].sort(), supported_hitter_props:Object.keys(HP_HITTER_PROP_PROFILES), supported_pitcher_props:Object.keys(HP_PITCHER_PROP_PROFILES), display_metric_label:'Estimated Recent-Form Hit Rate', raw_metric_preserved:true, legacy_probability_columns_are_display_aliases:true, estimated_not_true_probability:true, framework_only:true, no_score_mutation:true, no_scoring_engine_current_mutation:true, no_final_board_mutation:true, no_prepared_board_mutation:true, no_source_board_mutation:true, no_ranking:true, no_pick_recommendation:true, no_live_playable_mutation:true, no_review_playable_mutation:true, architecture_note:'Recent-form layer is isolated. Profile constants are stored in SCORE_DB.hit_probability_profile_configs for future calibration; worker hard-codes only safety invariants and fallbacks.', elapsed_ms:Date.now()-started });
  await run(env.SCORE_DB, `INSERT OR REPLACE INTO hit_probability_batches (batch_id,request_id,run_id,worker_version,profile_version,mode,status,source_table,source_final_board_batch_id,source_engine_batch_id,source_rows_read,supported_rows,probability_rows_written,issue_rows_written,hitter_players_checked,pitcher_players_checked,certification_status,certification_grade,output_json,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, batchId,input.request_id||null,input.run_id||null,HP_VERSION,HP_PROFILE_VERSION,input.mode||HP_MODE,status,source.source_table,source.final_board_batch_id,source.engine_batch_id,source.rows.length,supported.length,written,issues,hitterIds.length,pitcherIds.length,cert,grade,hpSafeJson(output,14000));
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
        const isFinalBoard = input && (input.mode === "scoring_final_board_generate" || input.job_key === "scoring-final-board");
        const isSimulation = input && (input.mode === "scoring_engine_simulation_shadow_strict_b" || input.job_key === "scoring-engine-simulation");
        const isHitProbabilityEstimate = input && (input.mode === "hit_probability_current_estimate" || input.job_key === "hit-probability");
        const isHpBoard = input && (input.mode === HP_BOARD_MODE || input.job_key === HP_BOARD_JOB_KEY);
        const isHitProbability = isHitProbabilityEstimate || isHpBoard;
        await controlLifecycleHeartbeat(env, input, isHitProbability ? "running_hit_probability_worker_started" : (isSimulation ? "running_scoring_engine_simulation_worker_started" : (isFinalBoard ? "running_scoring_final_board_worker_started" : "running_scoring_engine_worker_started")), { selected_mode: input.mode || null });
        const isFrameworkGate = input && input.mode === "scoring_engine_framework_profile_gate" && input.framework_only === true && input.real_scoring_enabled !== true;
        let output;
        if (isHpBoard) {
          output = await runHpBoardCurrent(env, input);
        } else if (isHitProbabilityEstimate) {
          output = await runHitProbabilityCurrent(env, input);
          if (output && output.ok !== false && input.skip_hp_board !== true) {
            const hpBoardOutput = await runHpBoardCurrent(env, { ...input, mode: HP_BOARD_MODE, job_key: HP_BOARD_JOB_KEY });
            output.hp_board_output = hpBoardOutput;
            output.hp_board_current_written = hpBoardOutput.board_rows_written || 0;
            output.hp_board_batch_id = hpBoardOutput.hp_board_batch_id || null;
            output.hp_board_certification = hpBoardOutput.certification || null;
            output.hp_board_certification_grade = hpBoardOutput.certification_grade || null;
            output.no_ranking = true;
            output.hp_board_ranking = true;
          }
        } else {
          output = isFinalBoard ? await runScoringFinalBoard(env, input) : (isSimulation ? await runScoringSimulation(env, input) : (isFrameworkGate ? await runScoringEngine(env, input) : await runScoringEngineCurrent(env, input)));
        }
        if (isWorkerPartialContinueOutput(output)) {
          output.control_lifecycle = await controlLifecyclePartial(env, input, output);
          return jsonResponse(output, 200);
        }
        output.control_lifecycle = await controlLifecycleFinalize(env, input, output, output.ok !== false && output.data_ok !== false ? "completed" : "failed");
        return jsonResponse(output, output.ok !== false ? 200 : 500);
      } catch (err) {
        const failOutput = baseIdentity({
          ok: false,
          data_ok: false,
          request_id: input.request_id || null,
          run_id: input.run_id || null,
          job_key: input.job_key || JOB_KEY,
          status: "scoring_engine_exception",
          certification: "SCORING_ENGINE_EXCEPTION",
          certification_grade: "FAILED",
          error: String(err && err.message ? err.message : err),
          external_calls_performed: 0,
          no_ranking: true,
          no_final_board: true
        });
        failOutput.control_lifecycle = await controlLifecycleFinalize(env, input, failOutput, "failed");
        return jsonResponse(failOutput, 500);
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
