const WORKER_NAME = "alphadog-v2-score-audit";
const LOGICAL_WORKER_NAME = "alphadog-v2-scoring-engine";
const VERSION = "alphadog-v2-score-audit-v0.4.61-v3-board-calendar-guard";
const JOB_KEY = "scoring-engine";
const PROFILE_KEY = "SCORING_FRAMEWORK_V0_1_PROFILE_GATE";
const PRODUCTION_PROFILE_KEY = "STRICT_C_HP_FIRST_TRUST_V4_1";
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
    formula_key: "SCORING_SIMULATION_V0_4_25_HP_TIEBREAK_D1_SAFE_NO_CASE_ADJ",
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
  },
  STRICT_C_REALITY_SANITY_V4_0: {
    profile_version: "0.4.19-sanity-map-calibration-db-profile",
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
      price_pressure_scale: 0.14,
      line_pressure_scale: 0.90,
      deterministic_spread_scale: 0.35,
      base_confidence: 100,
      score_sort_micro_scale: 0.0001,
      clean_bonus_score: 0,
      market_raw_adjustments: { market_prop_context_present: 2, market_prop_context_not_found: -5, market_prop_context_missing: -7, default: -3 },
      market_direct_evidence_raw_adjustments: { direct_prop_evidence_rows_gte_5: 1, direct_prop_evidence_rows_2_to_4: 0.5, direct_prop_evidence_rows_1: 0, direct_prop_evidence_rows_0_with_coverage: -2, direct_prop_evidence_rows_0_no_coverage: -4, default: 0 },
      market_evidence_score_caps: { direct_prop_evidence_rows_gte_5: 94, direct_prop_evidence_rows_2_to_4: 90, direct_prop_evidence_rows_1: 86, direct_prop_evidence_rows_0_with_coverage: 80, direct_prop_evidence_rows_0_no_coverage: 74, default: 88 },
      context_score_caps: { matrix_full_context: 94, matrix_partial_context_warning_0_2: 90, matrix_partial_context_warning_3_5: 84, matrix_partial_context_warning_6_8: 80, matrix_partial_context_warning_9_plus: 74 },
      effective_warning_rules: { enabled: true, soft_partial_context_effective_warning_count: 6, soft_partial_context_requires_blocker_count_lte: 0, soft_partial_context_requires_direct_prop_evidence_rows_gte: 1, soft_partial_context_factor_statuses: ["packet_partial"], soft_partial_context_daily_statuses: ["missing_current_readiness", "daily_readiness_missing_soft_fallback", "partial_enrichment"], soft_partial_context_market_prop_statuses: ["market_prop_context_present"] },
      symmetry_rules: { two_sided_delta_lt: 1.0, zero_direct_evidence_symmetry_cap: 74, nonzero_direct_evidence_symmetry_cap: 84 },
      daily_raw_adjustments: { ready_with_warnings: 0, partial_enrichment: -4, not_applicable: 0, default: 0 },
      source_raw_adjustments: { sleeper: 0, prizepicks: 0, default: 0 },
      odds_raw_adjustments: { standard: 0, goblin: -5, demon: -7, default: 0 },
      prop_raw_adjustments: { pitcher_strikeouts: 0, hits: 1, total_bases: 0, hits_runs_rbis: 0, home_runs: -5, stolen_bases: -5, earned_runs: -1, earned_runs_allowed: -1, hits_allowed: -1, pitcher_outs: 0, pitching_outs: 0, walks: -1, walks_allowed: -1, rbis: -1, runs: -1, doubles: -2, singles: 0, fantasy: -2, default: 0 },
      prop_less_raw_adjustments: { pitcher_strikeouts: -1, hits: 0, total_bases: 1, hits_runs_rbis: 1, home_runs: 0, stolen_bases: 0, earned_runs: -1, earned_runs_allowed: -1, hits_allowed: -1, pitcher_outs: -1, pitching_outs: -1, walks: 1, walks_allowed: -1, rbis: 1, runs: 1, doubles: 1, singles: 1, fantasy: 0, default: 0 },
      score_penalty_market_not_found: 9,
      score_penalty_market_missing: 12,
      score_penalty_complete_market_blindness: 16,
      score_penalty_packet_partial: 5,
      score_penalty_partial_enrichment: 7,
      confidence_cap_market_not_found: 58,
      confidence_cap_market_missing: 48,
      confidence_cap_complete_market_blindness: 38,
      confidence_cap_warning_9_plus: 42,
      confidence_penalty_packet_partial: 10,
      confidence_penalty_partial_enrichment: 16,
      confidence_penalty_sleeper_null_odds: 0,
      confidence_penalty_warning_6_8: 7,
      confidence_penalty_warning_3_5: 4,
      confidence_penalty_warning_9_plus: 28,
      source_payout_fairness: {
        enabled: true,
        prizepicks_standard_adjustment: 8,
        prizepicks_standard_cap: 82,
        prizepicks_goblin_adjustment: 6,
        prizepicks_goblin_cap: 76,
        prizepicks_demon_adjustment: 4,
        prizepicks_demon_cap: 74,
        prizepicks_low_line_temper_adjustment: 3,
        prizepicks_low_line_temper_cap: 74,
        market_blind_recenter_enabled: false
      },
      hp_board_sanity_calibration: {
        enabled: true,
        base: 50,
        hp_weight: 0.45,
        sample_bonus_40: 3,
        sample_bonus_30: 2,
        sample_bonus_20: 1,
        sample_bonus_15: 0,
        sample_penalty_under_15: -3,
        prop_lift_hrrbi_more_0_5: 4,
        prop_lift_hits_more_0_5: 2,
        prop_lift_total_bases_more_0_5: 1,
        prop_lift_low_frequency_less_0_5: 1,
        prop_lift_run_rbi_less_0_5: 1,
        demon_penalty: 5,
        goblin_penalty: 3,
        hp_cap_below_45: 74,
        hp_cap_below_55: 78,
        hp_cap_below_62: 82,
        hp_cap_below_70: 86,
        hp_cap_below_80: 89,
        hp_cap_below_90: 92,
        hp_cap_90_plus: 94,
        sample_cap_under_15: 80,
        sample_cap_under_20: 83,
        sample_cap_under_30: 86,
        sample_cap_30_plus: 94,
        demon_cap: 78,
        goblin_cap: 83,
        standard_cap: 94
      },
      model_deferred_rules: { sleeper_rfi_nrfi: "model_deferred_rfi_nrfi", prizepicks_triples: "model_deferred_low_event_prop" }
    }
  }

};

// HP-first trust-score production profile. This intentionally keeps score as a system-trust metric,
// not as a translation of hit probability. Hard blockers are only true identity/side/shape blockers;
// partial matrix/context gaps are scored with penalties and warnings so HP can decide the real edge later.
DEFAULT_SIM_CONFIGS.STRICT_C_HP_FIRST_TRUST_V4_1 = {
  profile_version: "0.4.21-hp-first-trust-score-engine",
  config: {
    ...DEFAULT_SIM_CONFIGS.STRICT_C_REALITY_SANITY_V4_0.config,
    min_live_score: 82,
    archive_score_threshold: 50,
    grade_archive_min: 50,
    grade_qualified_min: 65,
    grade_strong_min: 82,
    grade_elite_min: 92,
    base_raw_packet_ready: 80,
    base_raw_packet_partial: 68,
    score_penalty_matrix_soft_block: 8,
    confidence_penalty_matrix_soft_block: 10,
    score_penalty_market_not_found: 6,
    score_penalty_market_missing: 8,
    score_penalty_complete_market_blindness: 11,
    score_penalty_packet_partial: 8,
    score_penalty_partial_enrichment: 6,
    market_evidence_score_caps: {
      direct_prop_evidence_rows_gte_5: 96,
      direct_prop_evidence_rows_2_to_4: 92,
      direct_prop_evidence_rows_1: 88,
      direct_prop_evidence_rows_0_with_coverage: 82,
      direct_prop_evidence_rows_0_no_coverage: 76,
      default: 88
    },
    context_score_caps: {
      matrix_full_context: 96,
      matrix_partial_context_warning_0_2: 92,
      matrix_partial_context_warning_3_5: 86,
      matrix_partial_context_warning_6_8: 80,
      matrix_partial_context_warning_9_plus: 74
    },
    hp_board_sanity_calibration: {
      enabled: false,
      reason: "v0.4.21 score is preserved as trust metric; HP gates/sorts separately and does not cap score"
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
        formula_metadata_json=excluded.formula_metadata_json,
        updated_at=CURRENT_TIMESTAMP
      WHERE scoring_engine_simulation_profile_configs.config_json IS NULL
         OR length(scoring_engine_simulation_profile_configs.config_json) < 5
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
  const cfg = applyScoreSharpeningConfig(JSON.parse(row.config_json || "{}"));
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
    scorePenaltyMatrixSoftBlock: finiteNumber(cfg.score_penalty_matrix_soft_block, 0),
    confidencePenaltyMatrixSoftBlock: finiteNumber(cfg.confidence_penalty_matrix_soft_block, 0),
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

function mergeConfigMap(base, patch) {
  return { ...(base || {}), ...(patch || {}) };
}

function applyScoreSharpeningConfig(rawCfg) {
  const cfg = { ...(rawCfg || {}) };
  // Runtime sharpen overlay: preserve DB-config architecture, but prevent broad warning/partial-context drag
  // from compressing valid, fully factor-covered rows into the 30s/40s after the HP-first board repair.
  // This does not lower HP gates and does not turn HP into score; it only restores score headroom.
  cfg.score_sharpening_overlay = 'v0.4.23-score-headroom-warning-drag-rebalance';
  cfg.base_raw_packet_ready = Math.max(finiteNumber(cfg.base_raw_packet_ready, 82), 84);
  cfg.base_raw_packet_partial = Math.max(finiteNumber(cfg.base_raw_packet_partial, 76), 80);
  cfg.market_raw_adjustments = mergeConfigMap(cfg.market_raw_adjustments, {
    market_prop_context_present: 4,
    market_prop_context_not_found: -1,
    market_prop_context_missing: -2,
    default: 0
  });
  cfg.market_direct_evidence_raw_adjustments = mergeConfigMap(cfg.market_direct_evidence_raw_adjustments, {
    direct_prop_evidence_rows_gte_5: 3,
    direct_prop_evidence_rows_2_to_4: 2,
    direct_prop_evidence_rows_1: 1,
    direct_prop_evidence_rows_0_with_coverage: 0,
    direct_prop_evidence_rows_0_no_coverage: -1,
    default: 0
  });
  cfg.market_evidence_score_caps = mergeConfigMap(cfg.market_evidence_score_caps, {
    direct_prop_evidence_rows_gte_5: 99,
    direct_prop_evidence_rows_2_to_4: 96,
    direct_prop_evidence_rows_1: 92,
    direct_prop_evidence_rows_0_with_coverage: 88,
    direct_prop_evidence_rows_0_no_coverage: 84,
    default: 94
  });
  cfg.context_score_caps = mergeConfigMap(cfg.context_score_caps, {
    matrix_full_context: 100,
    matrix_partial_context_warning_0_2: 98,
    matrix_partial_context_warning_3_5: 96,
    matrix_partial_context_warning_6_8: 94,
    matrix_partial_context_warning_9_plus: 90
  });
  cfg.effective_warning_rules = mergeConfigMap(cfg.effective_warning_rules, {
    enabled: true,
    soft_partial_context_effective_warning_count: 3,
    soft_partial_context_requires_blocker_count_lte: 0,
    soft_partial_context_requires_direct_prop_evidence_rows_gte: 0,
    soft_partial_context_factor_statuses: ['packet_partial', 'packet_ready'],
    soft_partial_context_daily_statuses: ['missing_current_readiness', 'partial_enrichment', 'ready_with_warnings', 'ready'],
    soft_partial_context_market_prop_statuses: ['market_prop_context_present', 'market_prop_context_not_found', 'market_prop_context_missing']
  });
  cfg.daily_raw_adjustments = mergeConfigMap(cfg.daily_raw_adjustments, {
    ready: 2,
    ready_with_warnings: 2,
    partial_enrichment: -1,
    missing_current_readiness: -1,
    default: 1
  });
  cfg.source_raw_adjustments = mergeConfigMap(cfg.source_raw_adjustments, { sleeper: 0, prizepicks: 0, default: 0 });
  cfg.odds_raw_adjustments = mergeConfigMap(cfg.odds_raw_adjustments, { standard: 0, goblin: -0.5, demon: 0.5, default: 0 });
  cfg.prop_raw_adjustments = mergeConfigMap(cfg.prop_raw_adjustments, {
    hits: 4,
    total_bases: 2,
    hits_runs_rbis: 2,
    singles: 2,
    doubles: 0,
    rbis: 1,
    runs: 1,
    walks: 0,
    home_runs: -2,
    stolen_bases: -2,
    pitcher_strikeouts: 4,
    hits_allowed: 3,
    walks_allowed: 2,
    earned_runs: 2,
    earned_runs_allowed: 2,
    pitcher_outs: 3,
    pitching_outs: 3,
    default: 0
  });
  cfg.prop_less_raw_adjustments = mergeConfigMap(cfg.prop_less_raw_adjustments, {
    hits: 1,
    total_bases: 3,
    hits_runs_rbis: 3,
    singles: 2,
    doubles: 3,
    rbis: 3,
    runs: 2,
    walks: 2,
    home_runs: 4,
    stolen_bases: 4,
    pitcher_strikeouts: -1,
    hits_allowed: -1,
    walks_allowed: -1,
    earned_runs: -1,
    earned_runs_allowed: -1,
    pitcher_outs: -1,
    pitching_outs: -1,
    default: 0
  });
  cfg.score_penalty_market_not_found = Math.min(finiteNumber(cfg.score_penalty_market_not_found, 4), 2);
  cfg.score_penalty_market_missing = Math.min(finiteNumber(cfg.score_penalty_market_missing, 6), 3);
  cfg.score_penalty_complete_market_blindness = Math.min(finiteNumber(cfg.score_penalty_complete_market_blindness, 10), 6);
  cfg.score_penalty_packet_partial = Math.min(finiteNumber(cfg.score_penalty_packet_partial, 3), 1);
  cfg.score_penalty_partial_enrichment = Math.min(finiteNumber(cfg.score_penalty_partial_enrichment, 4), 1);
  cfg.confidence_cap_market_not_found = Math.max(finiteNumber(cfg.confidence_cap_market_not_found, 65), 74);
  cfg.confidence_cap_market_missing = Math.max(finiteNumber(cfg.confidence_cap_market_missing, 54), 68);
  cfg.confidence_cap_complete_market_blindness = Math.max(finiteNumber(cfg.confidence_cap_complete_market_blindness, 45), 62);
  cfg.confidence_cap_warning_9_plus = Math.max(finiteNumber(cfg.confidence_cap_warning_9_plus, 50), 70);
  cfg.confidence_penalty_packet_partial = Math.min(finiteNumber(cfg.confidence_penalty_packet_partial, 10), 5);
  cfg.confidence_penalty_partial_enrichment = Math.min(finiteNumber(cfg.confidence_penalty_partial_enrichment, 15), 6);
  cfg.confidence_penalty_warning_6_8 = Math.min(finiteNumber(cfg.confidence_penalty_warning_6_8, 8), 4);
  cfg.confidence_penalty_warning_3_5 = Math.min(finiteNumber(cfg.confidence_penalty_warning_3_5, 4), 2);
  cfg.confidence_penalty_warning_9_plus = Math.min(finiteNumber(cfg.confidence_penalty_warning_9_plus, 20), 8);
  cfg.source_payout_fairness = mergeConfigMap(cfg.source_payout_fairness, {
    enabled: true,
    policy: 'cautious_payout_value_nudge_v1',
    max_abs_score_adjustment: 1,
    prizepicks_standard_adjustment: 0,
    prizepicks_standard_cap: 100,
    prizepicks_goblin_adjustment: -1,
    prizepicks_goblin_cap: 100,
    prizepicks_demon_adjustment: 1,
    prizepicks_demon_cap: 100,
    prizepicks_low_line_temper_adjustment: 0,
    prizepicks_low_line_temper_cap: 100,
    score_sort_goblin_nudge: -0.25,
    score_sort_demon_nudge: 0.25,
    score_sort_standard_nudge: 0
  });
  return cfg;
}

function hpStableTieHash(row) {
  const player = Number(row && row.mlb_player_id || 0);
  const game = Number(row && row.game_pk || 0);
  const line = Math.trunc((Number(row && row.line_value || 0) || 0) * 100);
  const prop = String(row && row.canonical_prop_key || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return Math.abs((player * 31 + game * 17 + line * 13 + prop * 7) % 997) / 997.0;
}

function hpBoardTieBreakAdjustment(row) {
  const conf = Math.min(100, Math.max(0, hpNum(row && row.probability_confidence_0_100, 0))) / 100;
  const sample = Math.min(40, Math.max(0, hpNum(row && (row.non_push_sample != null ? row.non_push_sample : row.sample_size), 0))) / 40;
  const reliability = Math.min(1, Math.max(0, hpNum(row && row.reliability_0_1, 0)));
  const pushRisk = Math.min(1, Math.max(0, hpNum(row && row.push_risk_0_1, 0)));
  const source = String(row && row.source_key || '').toLowerCase();
  const prop = String(row && row.canonical_prop_key || '').toLowerCase();
  const sourceLine = String(row && row.source_line_id || '').toLowerCase();
  const variant = sourceLine.includes('|demon|') ? 'demon' : (sourceLine.includes('|goblin|') ? 'goblin' : 'regular');
  const sourceAdj = source === 'prizepicks' ? 0.018 : (source === 'sleeper' ? 0.014 : 0);
  const variantAdj = variant === 'regular' ? 0.014 : (variant === 'goblin' ? 0.010 : 0.006);
  const propAdj = ['hits','total_bases','hits_runs_rbis','pitcher_strikeouts','hits_allowed'].includes(prop) ? 0.010 : 0;
  return (conf * 0.035) + (sample * 0.025) + (reliability * 0.020) - (pushRisk * 0.030) + sourceAdj + variantAdj + propAdj + (hpStableTieHash(row) * 0.009);
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
  const fairCfg = (context && context.source_payout_fairness_config) || {};
  if (fairCfg.enabled === false) {
    return { adjusted_score: scoreBefore, adjustment: 0, cap: null, sort_nudge: 0, reason: 'source_payout_value_nudge_disabled_by_db_config', policy: 'disabled' };
  }
  if (scoreBefore == null) {
    return { adjusted_score: null, adjustment: 0, cap: null, sort_nudge: 0, reason: 'no_selected_score', policy: 'cautious_payout_value_nudge_v1' };
  }

  const source = String(sourceKey || '').toLowerCase();
  const odds = String(oddsType || payoutVariant || '').toLowerCase();
  const policy = String(fairCfg.policy || 'cautious_payout_value_nudge_v1');
  const maxAbs = Math.max(0, Math.min(1, Math.abs(finiteNumber(fairCfg.max_abs_score_adjustment, 1))));

  // v0.4.29: payout is a small value/risk nudge, not a proxy for line difficulty.
  // Goblin can be easy but pays less: apply only a tiny caution penalty.
  // Demon can be hard but pays more: apply only a tiny value bonus.
  // The real difficulty stays in line pressure, side selection, factors, and HP. This layer must never
  // fake probability, never create big source re-centers, and never override caps/context quality.
  if (source !== 'prizepicks') {
    return { adjusted_score: scoreBefore, adjustment: 0, cap: null, sort_nudge: 0, reason: 'regular_source_neutral_no_payout_value_nudge', policy };
  }

  let requested = 0;
  let sortNudge = 0;
  let reason = 'prizepicks_standard_neutral_no_payout_value_nudge';
  if (odds === 'goblin') {
    requested = -Math.abs(finiteNumber(fairCfg.prizepicks_goblin_adjustment, -1));
    sortNudge = -Math.abs(finiteNumber(fairCfg.score_sort_goblin_nudge, -0.25));
    reason = 'prizepicks_goblin_tiny_payout_caution_penalty';
  } else if (odds === 'demon') {
    requested = Math.abs(finiteNumber(fairCfg.prizepicks_demon_adjustment, 1));
    sortNudge = Math.abs(finiteNumber(fairCfg.score_sort_demon_nudge, 0.25));
    reason = 'prizepicks_demon_tiny_multiplier_value_bonus';
  } else if (odds === 'standard') {
    requested = finiteNumber(fairCfg.prizepicks_standard_adjustment, 0);
    sortNudge = finiteNumber(fairCfg.score_sort_standard_nudge, 0);
  }

  const adjustment = Math.max(-maxAbs, Math.min(maxAbs, requested));
  const boundedSortNudge = Math.max(-0.49, Math.min(0.49, sortNudge));
  if (!adjustment && !boundedSortNudge) {
    return { adjusted_score: scoreBefore, adjustment: 0, cap: null, sort_nudge: 0, reason, policy };
  }
  const adjusted = clamp(scoreBefore + adjustment);
  return { adjusted_score: adjusted, adjustment: adjusted - scoreBefore, cap: null, sort_nudge: boundedSortNudge, reason, policy };
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
  const missingSideContext = !sideMode;
  const missingVariationKey = !variationKey;
  const impossiblePrizePicksSideShape = sourceKey === 'prizepicks' && ['goblin','demon'].includes(String(oddsType || '').toLowerCase()) && sideMode !== 'more_only';
  const hardBlocked = !modelDeferred && (
    row.matrix_status === 'matrix_deferred' ||
    row.factor_status === 'blocked' ||
    missingSideContext ||
    missingVariationKey ||
    impossiblePrizePicksSideShape
  ) ? 1 : 0;
  const matrixSoftBlocked = !hardBlocked && !modelDeferred && Number(row.blocking_for_scoring || 0) === 1 ? 1 : 0;
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

  const scorePenalty = (matrixSoftBlocked ? p.scorePenaltyMatrixSoftBlock : 0)
    + (completeMarketBlind ? p.scorePenaltyCompleteMarketBlindness : 0)
    + (!completeMarketBlind && effectiveMarketPropContextStatus === 'market_prop_context_missing' ? p.scorePenaltyMarketMissing : 0)
    + (!completeMarketBlind && effectiveMarketPropContextStatus === 'market_prop_context_not_found' ? p.scorePenaltyMarketNotFound : 0)
    + (row.factor_status === 'packet_partial' ? p.scorePenaltyPacketPartial : 0)
    + (row.daily_readiness_status === 'partial_enrichment' ? p.scorePenaltyPartialEnrichment : 0);
  const bonus = (!hardBlocked && !modelDeferred && effectiveMarketPropContextStatus === 'market_prop_context_present' && Number(row.warning_count || 0) === 0 && row.factor_status === 'packet_ready' && row.daily_readiness_status !== 'partial_enrichment') ? p.cleanBonusScore : 0;
  const confidencePenalty = (matrixSoftBlocked ? p.confidencePenaltyMatrixSoftBlock : 0)
    + (row.factor_status === 'packet_partial' ? p.confidencePenaltyPacketPartial : 0)
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
  let payoutValueNudge = { adjusted_score: null, adjustment: 0, cap: null, sort_nudge: 0, reason: 'not_evaluated', policy: 'cautious_payout_value_nudge_v1' };
  let selectedCapResult = { applied: [] };
  if (!hardBlocked && !modelDeferred && selectedSide) {
    const selectedRaw = selectedSide === 'more' ? rawMore : rawLess;
    const uncappedSelected = Math.min(p.maxScoreCap, clamp(selectedRaw - scorePenalty + bonus));
    selectedCapResult = capScoreWithReasons(uncappedSelected, hardCaps);
    const preFairnessScore = round0(selectedCapResult.score);
    const fairness = sourcePayoutFairnessCalibration(sourceKey, oddsType, payoutVariant, sideMode, prop, row.board_line_value, selectedSide, preFairnessScore, { raw_market_prop_context_status: row.market_prop_context_status, effective_market_prop_context_status: effectiveMarketPropContextStatus, direct_prop_evidence_row_count: evidenceInfo.rowCount, direct_prop_evidence_bucket: evidenceInfo.bucket, source_payout_fairness_config: cfg.source_payout_fairness || {} });
    payoutValueNudge = fairness;
    scoreInteger = round0(fairness.adjusted_score);
    selectedCapResult.applied = [
      ...(selectedCapResult.applied || []),
      {
        key: 'cautious_payout_value_nudge',
        source_key: sourceKey,
        odds_type: oddsType,
        payout_variant: payoutVariant,
        selected_side: selectedSide,
        score_before: preFairnessScore,
        score_adjustment: fairness.adjustment,
        score_sort_nudge: fairness.sort_nudge,
        cap: fairness.cap,
        score_after: scoreInteger,
        reason: fairness.reason,
        policy: fairness.policy,
        probability_not_mutated: true
      }
    ];
  }
  const sideGap = Math.abs((rawMore ?? 0) - (rawLess ?? rawMore ?? 0));
  const confidence = (!hardBlocked && !modelDeferred && selectedSide)
    ? round0(Math.min(confidenceCap, clamp(p.baseConfidence - confidencePenalty + Math.min(6, sideGap * 1.15) + (effectiveMarketPropContextStatus === 'market_prop_context_present' ? 3 : 0) + ((overPrice != null || underPrice != null) ? 2 : 0))))
    : null;
  const sortMicro = Math.abs(((Number(row.mlb_player_id || 0) * 31 + Number(row.game_pk || 0) * 17 + Math.trunc((Number(row.board_line_value || 0) || 0) * 100) * 13) % 999)) * p.microScale / 999.0;
  const payoutSortNudge = Number(payoutValueNudge && payoutValueNudge.sort_nudge || 0);
  const scoreSort = scoreInteger == null ? null : clamp(scoreInteger + payoutSortNudge + sortMicro);
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
    formula_order: 'true_unusable_gate -> side_validation -> trust_score_components -> soft_context_penalties -> trust_score_cap -> confidence_penalties -> hp_probability_gate_later',
    score_semantics: 'score_0_100 is system trust/support quality, not hit probability and not a probability translation',
    hp_first_design: 'hit probability is computed later and gates final usability at 60%; engine avoids cutting scorable rows with partial context',
    raw_side_delta_threshold: p.rawSideDeltaThreshold,
    min_live_score: p.minLiveScore,
    min_live_confidence: p.minLiveConfidence,
    archive_score_threshold: p.archiveScoreThreshold,
    thresholds_locked: 0,
    scoring_enabled: 0,
    true_probability_enabled: 0,
    no_true_hit_probability_claims: 1,
    score_sort_policy: 'score_sort_0_100_only; includes bounded payout value nudge <=0.49 plus deterministic micro; never used for archive/live/bins',
    score_sharpening_overlay: cfg.score_sharpening_overlay || null,
    effective_market_prop_context_status: effectiveMarketPropContextStatus,
    direct_prop_evidence_row_count: evidenceInfo.rowCount,
    direct_prop_evidence_bucket: evidenceInfo.bucket,
    direct_prop_evidence_present: evidenceInfo.present,
    market_coverage_row_count: evidenceInfo.coverageCount,
    raw_matrix_blocking_for_scoring: Number(row.blocking_for_scoring || 0),
    matrix_soft_blocked_scored_with_penalty: matrixSoftBlocked,
    raw_warning_count: rawWarningCount,
    effective_warning_count: effectiveWarnings,
    effective_warning_severity: effectiveWarningSeverity,
    effective_warning_policy: 'raw_warning_count_preserved_but_soft_partial_missing_current_readiness_with_direct_evidence_uses_effective_warning_tier',
    score_caps_applied: selectedCapResult.applied,
    source_payout_fairness_calibration_enabled: 1,
    source_payout_fairness_policy: 'cautious_payout_value_nudge_v1; goblin_tiny_penalty; demon_tiny_bonus; no_hp_mutation; no_final_board_mutation',
    source_payout_value_nudge: payoutValueNudge,
    source_payout_fairness_config_snapshot: cfg.source_payout_fairness || {},
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
      SUM(CASE WHEN score_sort_0_100 IS NOT NULL AND ABS(score_sort_0_100 - score_integer_0_100) > 0.5001 THEN 1 ELSE 0 END) AS score_sort_nudge_out_of_bounds,
      SUM(CASE WHEN score_sort_0_100 IS NOT NULL AND (score_sort_0_100 < 0 OR score_sort_0_100 > 100) THEN 1 ELSE 0 END) AS score_sort_range_violation
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
    ["SCORE_SORT_NUDGE_OUT_OF_BOUNDS", summary.score_sort_nudge_out_of_bounds, "BLOCKER", "score_sort_0_100 payout/tiebreak nudge must stay within +/-0.5001 from score_integer_0_100."],
    ["SCORE_SORT_RANGE_VIOLATION", summary.score_sort_range_violation, "BLOCKER", "score_sort_0_100 must remain inside 0..100."],
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

  const chunk = await insertEngineCurrentProfileChunk(env, batchId, PRODUCTION_PROFILE_KEY, { readChunkSize: 70, writeBatchSize: 10, maxRowsThisInvocation: 560, maxMillis: 56000 });
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
const HP_VERSION = "alphadog-v2-scoring-engine-v0.4.38-full-v032-fast-restore-board";
const HP_PROFILE_VERSION = "HP_RECENT_FORM_V0_2_0_HITTER_PROP_SOFT_TIEBREAK";
const HP_MAX_ROWS_PER_RUN = 12000;
const HP_CURRENT_CHUNK_ROWS_PER_INVOCATION = 180;
const HP_CURRENT_CHUNK_MAX_MILLIS = 32000;
const HP_PLAYER_CHUNK_SIZE = 50;
const HP_BOARD_MODE = "hp_board_current_build";
const HP_BOARD_JOB_KEY = "hp-board";
const HP_BOARD_PROFILE_KEY = "HP_BOARD_RECENT_FORM_PROFILE";
const HP_BOARD_PROFILE_VERSION = "HP_BOARD_HP_FIRST_TRUST_SCORE_V0_1_8_PROP_DIFFICULTY_SHARPENING";
const HP_BOARD_CHUNK_ROWS_PER_INVOCATION = 140;
const HP_BOARD_LANE_ORDER = {
  HP_PREMIUM_TRUSTED: 1,
  HP_PREMIUM_LOW_TRUST_REVIEW: 2,
  HP_STRONG_TRUSTED: 3,
  HP_STRONG_LOW_TRUST_REVIEW: 4,
  HP_EDGE_TRUSTED_REVIEW: 5,
  HP_EDGE_LOW_TRUST_REVIEW: 6,
  HP_THIN_EDGE_REVIEW: 7,
  HP_LOW_SAMPLE_REVIEW: 8,
  HP_KILLED_LOW_PROBABILITY: 98,
  HP_UNSUPPORTED: 99,
  HP_PRIMARY_ELITE: 1,
  HP_PRIMARY_STRONG: 3,
  HP_SUPPORTED_REVIEW: 5,
  HP_SCORE_STRONG_HP_WEAK_REVIEW: 98,
  HP_NEUTRAL_REVIEW: 98,
  HP_WEAK_SUPPORT: 98,
  HP_FADE_RECENT_FORM: 98
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
function hpHashUnit(parts){
  const s = (Array.isArray(parts) ? parts.join('|') : String(parts || ''));
  let h = 2166136261;
  for (let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}
function hpSignalVarianceAdjustment(row, summaries, line, side, profile, factorScore, pushRisk){
  const l = hpNum(line, NaN);
  const full = summaries && summaries.length ? summaries[summaries.length - 1] : null;
  const short = summaries && summaries.length ? summaries[0] : null;
  const longRate = full && full.raw_hit_rate_0_100 !== null ? hpNum(full.raw_hit_rate_0_100, 50) : 50;
  const shortRate = short && short.raw_hit_rate_0_100 !== null ? hpNum(short.raw_hit_rate_0_100, 50) : longRate;
  const meanActual = full && full.mean_actual !== null ? hpNum(full.mean_actual, NaN) : NaN;
  let marginAdj = 0;
  if (Number.isFinite(meanActual) && Number.isFinite(l)) {
    const signedMargin = side === 'less' ? (l - meanActual) : (meanActual - l);
    const scale = profile && profile.family === 'pitcher' ? 2.0 : (profile && profile.profile === 'HITTER_LOW_FREQ' ? 1.0 : 1.6);
    marginAdj = hpClamp(signedMargin * scale, -1.35, 1.35);
  }
  const trendAdj = hpClamp((shortRate - longRate) * 0.018, -0.9, 0.9);
  const factorAdj = hpClamp((hpNum(factorScore,50) - 50) * 0.018, -0.75, 0.75);
  const pushAdj = -hpClamp(hpNum(pushRisk,0) * 1.6, 0, 0.55);
  const sourceAdj = String(row && row.source_key || '').toLowerCase() === 'sleeper' ? -0.05 : 0.05;
  const deterministicTieBreak = (hpHashUnit([row && row.prepared_row_id, row && row.source_line_id, row && row.game_pk, row && row.mlb_player_id, row && row.canonical_prop_key, row && row.line_value, side]) - 0.5) * 0.48;
  return hpRound(hpClamp(marginAdj + trendAdj + factorAdj + pushAdj + sourceAdj + deterministicTieBreak, -2.4, 2.4), 3);
}

function hpPropDifficultyCalibration(row, summaries, line, side, profile) {
  const prop = String(row && row.canonical_prop_key || profile && profile.stat || '').toLowerCase();
  const l = hpNum(line, NaN);
  const full = summaries && summaries.length ? summaries[summaries.length - 1] : null;
  const meanActual = full && full.mean_actual != null ? hpNum(full.mean_actual, NaN) : NaN;
  const raw = full && full.raw_hit_rate_0_100 != null ? hpNum(full.raw_hit_rate_0_100, 50) : 50;
  let adj = 0;
  const reasons = [];

  // v0.4.31: prop-difficulty sharpening is a small, transparent layer on top of actual
  // historical classification. It does not overwrite the player sample; it prevents broad
  // events (HRRBI) and narrow events (hits, singles, doubles, walks) from looking equally
  // reliable just because both cleared the same old bucket.
  if (prop === 'hits_runs_rbis') {
    if (side === 'more') {
      if (Number.isFinite(l) && l <= 0.5) { adj += 1.35; reasons.push('hrrbi_more_0_5_three_paths_hit_run_rbi'); }
      else if (Number.isFinite(l) && l <= 1.5) { adj += 0.45; reasons.push('hrrbi_more_1_5_broader_than_hits_but_multi_event'); }
      else { adj -= 0.75; reasons.push('hrrbi_more_high_line_multi_event_penalty'); }
    } else if (side === 'less') {
      if (Number.isFinite(l) && l <= 0.5) { adj -= 1.25; reasons.push('hrrbi_less_0_5_must_avoid_three_paths'); }
      else if (Number.isFinite(l) && l >= 1.5) { adj += 0.70; reasons.push('hrrbi_less_multi_event_under_path'); }
    }
  } else if (prop === 'hits') {
    if (side === 'more') {
      if (Number.isFinite(l) && l <= 0.5) { adj += 0.35; reasons.push('hits_more_0_5_clean_contact_single_path'); }
      else { adj -= 0.95; reasons.push('hits_more_multi_hit_volume_penalty'); }
    } else if (side === 'less') {
      if (Number.isFinite(l) && l <= 0.5) { adj -= 0.65; reasons.push('hits_less_0_5_any_hit_breaks_under'); }
      else { adj += 0.50; reasons.push('hits_less_multi_hit_under_path'); }
    }
  } else if (prop === 'total_bases') {
    if (side === 'more') {
      if (Number.isFinite(l) && l <= 0.5) { adj += 0.20; reasons.push('total_bases_more_0_5_single_total_base_path'); }
      else if (Number.isFinite(l) && l <= 1.5) { adj -= 0.35; reasons.push('total_bases_more_needs_damage_or_multiple_singles'); }
      else { adj -= 1.15; reasons.push('total_bases_more_high_damage_line_penalty'); }
    } else if (side === 'less') {
      if (Number.isFinite(l) && l <= 0.5) { adj -= 0.80; reasons.push('total_bases_less_0_5_any_base_breaks_under'); }
      else { adj += 0.60; reasons.push('total_bases_less_damage_suppression_path'); }
    }
  } else if (prop === 'rbis') {
    if (side === 'more') { adj -= 0.45; reasons.push('rbi_more_requires_teammate_traffic'); }
    else { adj += 0.65; reasons.push('rbi_less_low_frequency_opportunity_suppression'); }
  } else if (prop === 'runs') {
    if (side === 'more') { adj -= 0.35; reasons.push('runs_more_requires_reach_base_and_conversion'); }
    else { adj += 0.50; reasons.push('runs_less_teammate_conversion_suppression'); }
  } else if (prop === 'walks') {
    if (side === 'more') { adj -= 0.55; reasons.push('walks_more_requires_zone_patience_and_pitcher_nibble'); }
    else { adj += 0.40; reasons.push('walks_less_contact_or_zone_attack_path'); }
  } else if (prop === 'singles') {
    if (side === 'more') { adj -= 0.45; reasons.push('singles_more_excludes_extra_base_contact'); }
    else { adj += 0.35; reasons.push('singles_less_allows_extra_base_contact_to_still_win_under'); }
  } else if (prop === 'doubles') {
    if (side === 'more') { adj -= 1.15; reasons.push('doubles_more_gap_damage_rare_event'); }
    else { adj += 0.70; reasons.push('doubles_less_rare_event_suppression'); }
  } else if (prop === 'home_runs') {
    if (side === 'more') { adj -= 2.10; reasons.push('home_runs_more_rare_event_damage_penalty'); }
    else { adj += 1.00; reasons.push('home_runs_less_rare_event_under_path'); }
  } else if (prop === 'stolen_bases') {
    if (side === 'more') { adj -= 1.65; reasons.push('stolen_bases_more_role_and_game_state_dependency'); }
    else { adj += 0.75; reasons.push('stolen_bases_less_rare_event_under_path'); }
  }

  if (Number.isFinite(meanActual) && Number.isFinite(l)) {
    const margin = side === 'less' ? (l - meanActual) : (meanActual - l);
    if (margin >= 1.0) { adj += 0.35; reasons.push('mean_actual_clears_line_with_room'); }
    else if (margin <= -1.0) { adj -= 0.35; reasons.push('mean_actual_under_line_pressure'); }
  }
  if (raw >= 90 && ['home_runs','doubles','stolen_bases'].includes(prop) && side === 'more') {
    adj -= 0.40; reasons.push('rare_event_high_raw_extra_caution');
  }
  return { adjustment_0_100: hpRound(hpClamp(adj, -2.4, 2.4), 3), reasons: hpUnique(reasons), policy: 'prop_difficulty_sharpening_v0_4_31' };
}

function hpSoftCapAbove(value, start, multiplier){ const v=hpNum(value); const s=hpNum(start); if(v <= s) return v; return s + ((v - s) * hpClamp(multiplier,0,1)); }
function hpSoftFloorBelow(value, start, multiplier){ const v=hpNum(value); const s=hpNum(start); if(v >= s) return v; return s - ((s - v) * hpClamp(multiplier,0,1)); }

function hpHitterPropSoftTiebreakPenalty(row, line, side, profile) {
  const family = String(profile && profile.family || '').toLowerCase();
  if (family === 'pitcher') return { penalty_0_100: 0, reason: 'pitcher_props_skipped_already_variable', policy: 'hitter_prop_soft_tiebreak_v0_4_32' };
  const prop = String(row && row.canonical_prop_key || profile && profile.stat || '').toLowerCase();
  const l = hpNum(line, NaN);
  const s = String(side || '').toLowerCase();
  let penalty = 0;
  let reason = 'no_hitter_prop_tiebreak';

  // v0.4.32: a tiny post-cap difficulty tiebreak so broad/narrow hitter props do not all
  // flatten at the same 90.0 display ceiling. This is intentionally not a model override:
  // it is a ranked display tiebreak only, based on event structure. HRRBI 0.5 MORE is the
  // baseline because it has the broadest low-threshold path: hit + run + RBI.
  if (prop === 'hits_runs_rbis') {
    if (s === 'more') {
      if (Number.isFinite(l) && l <= 0.5) { penalty = 0.00; reason = 'baseline_hrrbi_more_0_5_three_scoring_paths'; }
      else if (Number.isFinite(l) && l <= 1.5) { penalty = 0.35; reason = 'hrrbi_more_1_5_requires_stacked_box_score'; }
      else { penalty = 0.80; reason = 'hrrbi_more_high_line_multi_event_pressure'; }
    } else if (s === 'less') {
      if (Number.isFinite(l) && l <= 0.5) { penalty = 0.95; reason = 'hrrbi_less_0_5_must_fade_hit_run_rbi_paths'; }
      else if (Number.isFinite(l) && l <= 1.5) { penalty = 0.35; reason = 'hrrbi_less_1_5_under_path_but_multi_event_exposure'; }
      else { penalty = 0.20; reason = 'hrrbi_less_high_line_more_under_room'; }
    }
  } else if (prop === 'hits') {
    if (s === 'more') {
      if (Number.isFinite(l) && l <= 0.5) { penalty = 0.45; reason = 'hits_more_0_5_single_channel_vs_hrrbi'; }
      else { penalty = 1.15; reason = 'hits_more_multi_hit_repetition_pressure'; }
    } else if (s === 'less') {
      if (Number.isFinite(l) && l <= 0.5) { penalty = 0.85; reason = 'hits_less_0_5_any_hit_breaks_under'; }
      else { penalty = 0.55; reason = 'hits_less_multi_hit_line_under_room'; }
    }
  } else if (prop === 'total_bases') {
    if (s === 'more') {
      if (Number.isFinite(l) && l <= 0.5) { penalty = 0.50; reason = 'total_bases_more_0_5_same_single_base_cash_path_but_damage_pricing_tiebreak'; }
      else if (Number.isFinite(l) && l <= 1.5) { penalty = 0.85; reason = 'total_bases_more_1_5_needs_damage_or_two_singles'; }
      else { penalty = 1.45; reason = 'total_bases_more_high_line_damage_pressure'; }
    } else if (s === 'less') {
      if (Number.isFinite(l) && l <= 0.5) { penalty = 0.90; reason = 'total_bases_less_0_5_any_hit_breaks_under'; }
      else if (Number.isFinite(l) && l <= 1.5) { penalty = 0.65; reason = 'total_bases_less_1_5_can_survive_single_but_not_damage'; }
      else { penalty = 0.35; reason = 'total_bases_less_high_line_under_room'; }
    }
  } else if (prop === 'singles') {
    if (s === 'more') { penalty = 1.10; reason = 'singles_more_excludes_extra_base_hits'; }
    else { penalty = 0.45; reason = 'singles_less_can_survive_extra_base_contact'; }
  } else if (prop === 'runs') {
    if (s === 'more') { penalty = 1.30; reason = 'runs_more_requires_reach_base_and_teammate_conversion'; }
    else { penalty = 0.70; reason = 'runs_less_fades_conversion_environment'; }
  } else if (prop === 'rbis') {
    if (s === 'more') { penalty = 1.45; reason = 'rbi_more_requires_base_traffic_and_conversion'; }
    else { penalty = 0.65; reason = 'rbi_less_common_under_but_opportunity_sensitive'; }
  } else if (prop === 'walks') {
    if (s === 'more') { penalty = 1.55; reason = 'walks_more_depends_on_pitcher_zone_and_hitter_take_profile'; }
    else { penalty = 0.55; reason = 'walks_less_zone_attack_or_contact_path'; }
  } else if (prop === 'doubles') {
    if (s === 'more') { penalty = 2.05; reason = 'doubles_more_gap_damage_specific_event'; }
    else { penalty = 0.40; reason = 'doubles_less_rare_event_under_path'; }
  } else if (prop === 'home_runs') {
    if (s === 'more') { penalty = 2.35; reason = 'home_runs_more_rare_damage_event'; }
    else { penalty = 0.35; reason = 'home_runs_less_rare_event_under_path'; }
  } else if (prop === 'stolen_bases') {
    if (s === 'more') { penalty = 2.20; reason = 'stolen_bases_more_role_game_state_and_battery_dependency'; }
    else { penalty = 0.50; reason = 'stolen_bases_less_rare_event_under_path'; }
  }

  // Scale slightly with line pressure, but keep the layer soft. This prevents a 0.5 line and a
  // much higher line from receiving exactly the same post-cap treatment.
  if (Number.isFinite(l) && s === 'more' && l >= 1.5) penalty += Math.min(0.30, (l - 1.5) * 0.10);
  if (Number.isFinite(l) && s === 'less' && l >= 2.5) penalty = Math.max(0.15, penalty - 0.10);

  penalty = hpRound(hpClamp(penalty, 0, 2.65), 3);
  return { penalty_0_100: penalty, reason, policy: 'hitter_prop_soft_tiebreak_v0_4_32', baseline: 'hits_runs_rbis_more_0_5_no_penalty' };
}
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
function hpEvidenceTarget(profile, side){
  if(!profile) return 60;
  if(profile.family === 'pitcher') return 32;
  const key=String(profile.profile||'').toUpperCase();
  const stat=String(profile.stat||'').toLowerCase();
  if(key === 'HITTER_HIGH_FREQ') return side === 'less' ? 70 : 60;
  if(key === 'HITTER_MED_FREQ') return side === 'less' ? 80 : 75;
  if(stat === 'home_runs' || stat === 'stolen_bases') return side === 'less' ? 95 : 130;
  if(stat === 'doubles' || stat === 'rbis') return side === 'less' ? 90 : 115;
  return side === 'less' ? 85 : 105;
}
function hpOutcomeVolatilityPenalty(profile, side){
  if(!profile) return 0;
  if(profile.family === 'pitcher') return 2.0;
  const key=String(profile.profile||'').toUpperCase();
  const stat=String(profile.stat||'').toLowerCase();
  if(key === 'HITTER_HIGH_FREQ') return side === 'less' ? 1.5 : 1.0;
  if(key === 'HITTER_MED_FREQ') return side === 'less' ? 2.5 : 3.5;
  if(stat === 'home_runs' || stat === 'stolen_bases') return side === 'less' ? 4.0 : 8.0;
  if(stat === 'doubles' || stat === 'rbis') return side === 'less' ? 3.0 : 6.0;
  return side === 'less' ? 3.0 : 5.0;
}
function hpWindowStabilityScore(summaries){
  const vals=(summaries||[]).map(w => w && w.raw_hit_rate_0_100).filter(v => Number.isFinite(Number(v))).map(Number);
  if(vals.length < 2) return { score:0, range:null, stdev:null };
  const mean=vals.reduce((a,b)=>a+b,0)/vals.length;
  const variance=vals.reduce((a,b)=>a+Math.pow(b-mean,2),0)/vals.length;
  const stdev=Math.sqrt(variance);
  const range=Math.max(...vals)-Math.min(...vals);
  const score=hpClamp(10 - (stdev*0.28) - (range*0.06), -10, 10);
  return { score:hpRound(score,2), range:hpRound(range,2), stdev:hpRound(stdev,2) };
}
function hpEvidenceConfidenceScore(args){
  const profile=args.profile;
  const side=args.side;
  const nonPush=hpNum(args.nonPush,0);
  const pushRisk=hpNum(args.pushRisk,0);
  const displayed=hpNum(args.displayed,50);
  const rawRate=hpClamp(hpNum(args.rawWeightedNew100, displayed),0,100) / 100;
  const factorScore=hpNum(args.factorScore,50);
  const target=hpEvidenceTarget(profile, side);
  const sampleRatio=hpClamp(nonPush / Math.max(1,target),0,1);
  const sampleBase=44 + (40 * Math.sqrt(sampleRatio));
  const stability=hpWindowStabilityScore(args.summaries||[]);
  const binomialSe = nonPush > 0 ? Math.sqrt(Math.max(0.0001, rawRate*(1-rawRate)) / nonPush) * 100 : 20;
  const sePenalty = hpClamp(binomialSe * 0.75, 0, 9);
  const volatilityPenalty = hpOutcomeVolatilityPenalty(profile, side);
  const factorSupport = hpClamp((factorScore - 50) * 0.035, -2.5, 2.5);
  const lowSamplePenalty = nonPush < 20 ? (20 - nonPush) * 0.55 : 0;
  const pushPenalty = hpClamp(pushRisk * 18, 0, 8);
  let confidence = sampleBase + stability.score + factorSupport - sePenalty - volatilityPenalty - lowSamplePenalty - pushPenalty;
  if(nonPush >= 40 && stability.score > 4 && binomialSe < 5) confidence += 2;
  if(nonPush < 10) confidence = Math.min(confidence, 58);
  else if(nonPush < 20) confidence = Math.min(confidence, 72);
  const hardCeil = profile && profile.family === 'pitcher' ? 76 : 92;
  confidence=hpClamp(confidence, 35, hardCeil);
  return {
    confidence_0_100: hpRound(confidence,1),
    evidence_target_sample: hpRound(target,1),
    evidence_sample_ratio: hpRound(sampleRatio,3),
    evidence_sample_base_0_100: hpRound(sampleBase,2),
    evidence_window_stability_score_0_100: stability.score,
    evidence_window_range_0_100: stability.range,
    evidence_window_stdev_0_100: stability.stdev,
    evidence_binomial_se_0_100: hpRound(binomialSe,2),
    evidence_binomial_se_penalty_0_100: hpRound(sePenalty,2),
    evidence_prop_volatility_penalty_0_100: hpRound(volatilityPenalty,2),
    evidence_factor_support_0_100: hpRound(factorSupport,2),
    evidence_low_sample_penalty_0_100: hpRound(lowSamplePenalty,2),
    evidence_push_penalty_0_100: hpRound(pushPenalty,2),
    evidence_confidence_policy:'confidence reflects evidence quality/sample/stability/volatility only; estimated HP is not capped or penalized because it looks high or low'
  };
}
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
  const propDifficultyCalibration = hpPropDifficultyCalibration(row || {}, summaries, line, side, profile);
  display += propDifficultyCalibration.adjustment_0_100;
  const reasons=[];
  if (propDifficultyCalibration.adjustment_0_100 !== 0) reasons.push('PROP_DIFFICULTY_SHARPENING');
  const flags=[];
  if (propDifficultyCalibration.adjustment_0_100 !== 0) flags.push('HP_PROP_DIFFICULTY_SHARPENED');
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
  const varianceAdjustment = hpSignalVarianceAdjustment(row || {}, summaries, line, side, profile, factorScore, pushRisk);
  if (varianceAdjustment !== 0) {
    display += varianceAdjustment;
    flags.push('HP_SIGNAL_VARIANCE_ADJUSTED');
    reasons.push('SIGNAL_VARIANCE_TIEBREAK');
  }
  display=hpClamp(display, hpNum(config.global_floor,5), hpNum(config.global_cap,95));
  const hitterPropSoftTiebreak = hpHitterPropSoftTiebreakPenalty(row || {}, line, side, profile);
  if (hitterPropSoftTiebreak.penalty_0_100 > 0) {
    display -= hitterPropSoftTiebreak.penalty_0_100;
    flags.push('HP_HITTER_PROP_SOFT_TIEBREAK');
    reasons.push('HITTER_PROP_SOFT_TIEBREAK');
  } else if (hitterPropSoftTiebreak.reason === 'baseline_hrrbi_more_0_5_three_scoring_paths') {
    flags.push('HP_HITTER_PROP_TIEBREAK_BASELINE');
  }
  display=hpClamp(display, hpNum(config.global_floor,5), hpNum(config.global_cap,95));
  const displayed=hpRound(display,1);
  const rawNew100=hpRound(rawWeightedNew*100,1);
  const rawOld100=hpRound(rawWeightedOld*100,1);
  const evidenceConfidence = hpEvidenceConfidenceScore({ profile, side, nonPush, pushRisk, displayed, rawWeightedNew100: rawNew100, summaries, factorScore, row });
  const sampleReliability=evidenceConfidence.confidence_0_100;
  if(sampleReliability < 80){ flags.push('HP_EVIDENCE_CONFIDENCE_REDUCED'); reasons.push('EVIDENCE_CONFIDENCE_CALIBRATION'); }
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
      variance_adjustment_0_100: hpRound(varianceAdjustment,3),
      variance_adjustment_inputs:'line_margin+short_long_trend+factor_alignment+push_risk+deterministic_identity_tiebreak',
      hitter_prop_soft_tiebreak: hitterPropSoftTiebreak,
      prop_difficulty_sharpening: propDifficultyCalibration,
      evidence_confidence_calibration:evidenceConfidence,
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
    variance_adjustment_0_100: hpRound(varianceAdjustment,3),
    hitter_prop_soft_tiebreak_penalty_0_100: hitterPropSoftTiebreak.penalty_0_100,
    prop_difficulty_adjustment_0_100: propDifficultyCalibration.adjustment_0_100,
    score_recent_form_gap_0_100: scoreGap,
    recent_form_rank_hint_0_100: rankHint,
    evidence_confidence_calibration: evidenceConfidence,
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
  const forceFinalBoard = input && (input.source_preference === "score_final_board_current" || input.force_final_board_source === true);
  if(!forceFinalBoard){
    const scoreRows = await all(env.SCORE_DB, `
      SELECT *
      FROM scoring_engine_current
      WHERE score_0_100 IS NOT NULL
        AND selected_side IS NOT NULL
        AND COALESCE(blocker_count, 0) = 0
        AND score_status IN ('scored_current','simulated_profile_locked')
      ORDER BY score_0_100 DESC, confidence_0_100 DESC
      LIMIT ${HP_MAX_ROWS_PER_RUN}`);
    if(scoreRows.length){
      return { source_table:"scoring_engine_current", rows:scoreRows, final_board_batch_id:null, engine_batch_id:scoreRows[0].batch_id || null };
    }
  }
  const finalRows = await all(env.SCORE_DB, `SELECT * FROM score_final_board_current ORDER BY rank_order ASC LIMIT ${HP_MAX_ROWS_PER_RUN}`);
  if(finalRows.length){ return { source_table:"score_final_board_current", rows:finalRows, final_board_batch_id:finalRows[0].final_board_batch_id || null, engine_batch_id:finalRows[0].source_engine_batch_id || null }; }
  return { source_table:"scoring_engine_current", rows:[], final_board_batch_id:null, engine_batch_id:null };
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
  if(hp < 60) return 'HP_KILLED_LOW_PROBABILITY';
  if(sample < 20) return 'HP_LOW_SAMPLE_REVIEW';
  if(hp >= 85 && score >= 82 && conf >= 70) return 'HP_PREMIUM_TRUSTED';
  if(hp >= 85) return 'HP_PREMIUM_LOW_TRUST_REVIEW';
  if(hp >= 75 && score >= 82 && conf >= 80) return 'HP_STRONG_TRUSTED';
  if(hp >= 75) return 'HP_STRONG_LOW_TRUST_REVIEW';
  if(hp >= 65 && score >= 82 && conf >= 70) return 'HP_EDGE_TRUSTED_REVIEW';
  if(hp >= 65) return 'HP_EDGE_LOW_TRUST_REVIEW';
  if(hp >= 60) return 'HP_THIN_EDGE_REVIEW';
  return 'HP_UNSUPPORTED';
}

function hpBoardLaneReason(lane){
  if(lane === 'HP_PREMIUM_TRUSTED') return 'HP is 85+ and the system trust score is strong; premium trusted candidate.';
  if(lane === 'HP_PREMIUM_LOW_TRUST_REVIEW') return 'HP is 85+ but system trust is not strong enough for premium trusted status; high-probability review.';
  if(lane === 'HP_STRONG_TRUSTED') return 'HP is 75+ with strong trust support; strong trusted candidate.';
  if(lane === 'HP_STRONG_LOW_TRUST_REVIEW') return 'HP is 75+ but trust score/context is weaker; strong-probability review.';
  if(lane === 'HP_EDGE_TRUSTED_REVIEW') return 'HP is 65+ and trust score is supportive; edge review candidate.';
  if(lane === 'HP_EDGE_LOW_TRUST_REVIEW') return 'HP is 65+ but trust score/context is thin; low-trust edge review.';
  if(lane === 'HP_THIN_EDGE_REVIEW') return 'HP is 60–64.9; thin edge, review only.';
  if(lane === 'HP_LOW_SAMPLE_REVIEW') return 'HP is 60+ but sample is below the 20 non-push/live-gate threshold; keep as review only and do not promote live.';
  if(lane === 'HP_KILLED_LOW_PROBABILITY') return 'HP is below 60%; not useful for testing/final consideration regardless of trust score.';
  if(lane === 'HP_UNSUPPORTED') return 'HP/trust support is incomplete or unsupported.';
  if(lane === 'HP_PRIMARY_ELITE') return 'Legacy alias: premium HP and strong trust.';
  if(lane === 'HP_PRIMARY_STRONG') return 'Legacy alias: strong HP and strong trust.';
  if(lane === 'HP_SUPPORTED_REVIEW') return 'Legacy alias: HP-supported review.';
  if(lane === 'HP_SCORE_STRONG_HP_WEAK_REVIEW') return 'Legacy alias: trust score strong but HP weak; killed by HP-first gate.';
  if(lane === 'HP_LOW_SAMPLE_REVIEW') return 'Recent-form sample is below HP board threshold; preserve row for review only.';
  if(lane === 'HP_NEUTRAL_REVIEW') return 'Legacy alias: HP below useful threshold.';
  if(lane === 'HP_FADE_RECENT_FORM') return 'Legacy alias: HP materially weak; killed by HP-first gate.';
  return 'HP-first trust-score lane.';
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
    calibration_type: 'hp_first_trust_score_board',
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
    primary_elite: 'hp>=85 confidence>=70 sample>=20 score>=82',
    primary_strong: 'hp>=75 confidence>=80 sample>=20 score>=82',
    supported_review: 'hp>=55 confidence>=70 sample>=15 score>=76',
    divergence_review: 'score>=84 hp<45 sample>=15',
    low_sample_review: 'sample<15',
    neutral_review: '45<=hp<55',
    fade_recent_form: 'hp<35 confidence>=90 sample>=20'
  }, 5000);
}


function hpBoardSanityCalibratedScore(row, cfg = {}) {
  if (!cfg || cfg.enabled === false) return hpNum(row && row.score_0_100, null);
  const hp = hpNum(row && row.estimated_hit_probability_0_100, null);
  const current = hpNum(row && row.score_0_100, null);
  if (hp == null || current == null) return current;
  const nonPush = hpNum(row && (row.non_push_sample != null ? row.non_push_sample : row.sample_size), 0);
  const prop = String(row && row.canonical_prop_key || '').toLowerCase();
  const side = String(row && row.selected_side || '').toLowerCase();
  const line = hpNum(row && row.line_value, 0);
  const sourceLine = String(row && row.source_line_id || '').toLowerCase();
  const isGoblin = sourceLine.includes('|goblin|');
  const isDemon = sourceLine.includes('|demon|');
  let sampleAdj = hpNum(cfg.sample_penalty_under_15, -3);
  if (nonPush >= 40) sampleAdj = hpNum(cfg.sample_bonus_40, 3);
  else if (nonPush >= 30) sampleAdj = hpNum(cfg.sample_bonus_30, 2);
  else if (nonPush >= 20) sampleAdj = hpNum(cfg.sample_bonus_20, 1);
  else if (nonPush >= 15) sampleAdj = hpNum(cfg.sample_bonus_15, 0);

  let propLift = 0;
  if (prop === 'hits_runs_rbis' && side === 'more' && line === 0.5) propLift = hpNum(cfg.prop_lift_hrrbi_more_0_5, 4);
  else if (prop === 'hits' && side === 'more' && line === 0.5) propLift = hpNum(cfg.prop_lift_hits_more_0_5, 2);
  else if (prop === 'total_bases' && side === 'more' && line === 0.5) propLift = hpNum(cfg.prop_lift_total_bases_more_0_5, 1);
  else if (['doubles','triples','home_runs'].includes(prop) && side === 'less' && line === 0.5) propLift = hpNum(cfg.prop_lift_low_frequency_less_0_5, 1);
  else if (['rbis','runs'].includes(prop) && side === 'less' && line === 0.5) propLift = hpNum(cfg.prop_lift_run_rbi_less_0_5, 1);

  const variationPenalty = isDemon ? hpNum(cfg.demon_penalty, 5) : (isGoblin ? hpNum(cfg.goblin_penalty, 3) : 0);
  const raw = Math.round(hpNum(cfg.base, 50) + (hpNum(cfg.hp_weight, 0.45) * hp) + sampleAdj + propLift - variationPenalty);

  let hpCap = hpNum(cfg.hp_cap_90_plus, 94);
  if (hp < 20) hpCap = hpNum(cfg.hp_cap_below_20, 55);
  else if (hp < 35) hpCap = hpNum(cfg.hp_cap_below_35, 64);
  else if (hp < 45) hpCap = hpNum(cfg.hp_cap_below_45, 72);
  else if (hp < 55) hpCap = hpNum(cfg.hp_cap_below_55, 78);
  else if (hp < 62) hpCap = hpNum(cfg.hp_cap_below_62, 82);
  else if (hp < 70) hpCap = hpNum(cfg.hp_cap_below_70, 86);
  else if (hp < 80) hpCap = hpNum(cfg.hp_cap_below_80, 89);
  else if (hp < 90) hpCap = hpNum(cfg.hp_cap_below_90, 92);

  let sampleCap = hpNum(cfg.sample_cap_30_plus, 94);
  if (['pitcher_strikeouts','pitcher_strikeouts_combo','pitcher_outs','earned_runs','hits_allowed','walks_allowed','pitcher_walks'].includes(prop)) {
    if (nonPush < 15) sampleCap = hpNum(cfg.pitcher_sample_cap_under_15, 76);
    else if (nonPush < 20) sampleCap = hpNum(cfg.pitcher_sample_cap_under_20, 80);
    else if (nonPush < 30) sampleCap = hpNum(cfg.pitcher_sample_cap_under_30, 84);
  } else {
    if (nonPush < 10) sampleCap = hpNum(cfg.sample_cap_under_10, 70);
    else if (nonPush < 15) sampleCap = hpNum(cfg.sample_cap_under_15, 76);
    else if (nonPush < 20) sampleCap = hpNum(cfg.sample_cap_under_20, 80);
    else if (nonPush < 30) sampleCap = hpNum(cfg.sample_cap_under_30, 86);
  }

  const variationCap = isDemon ? hpNum(cfg.demon_cap, 78) : (isGoblin ? hpNum(cfg.goblin_cap, 83) : hpNum(cfg.standard_cap, 94));
  return Math.max(0, Math.min(100, raw, hpCap, sampleCap, variationCap));
}

async function runHpBoardCurrent(env, input = {}){
  const started=Date.now();
  if(!env.SCORE_DB) return baseIdentity({ ok:false, data_ok:false, version:HP_VERSION, job_key:HP_BOARD_JOB_KEY, mode:HP_BOARD_MODE, status:'blocked_missing_score_db', certification:'HP_BOARD_MISSING_SCORE_DB', certification_grade:'BLOCKED' });
  await hpEnsureSchema(env);
  await hpEnsureBoardSchema(env);
  await ensureScoreSchema(env);

  const sourceRows=await all(env.SCORE_DB, `SELECT * FROM hit_probability_current ORDER BY probability_row_id LIMIT ${HP_MAX_ROWS_PER_RUN}`);
  if(!sourceRows.length){
    return baseIdentity({ ok:false, data_ok:false, version:HP_VERSION, worker_name:WORKER_NAME, logical_worker_name:'alphadog-v2-hit-probability', deployed_worker_slot:'alphadog-v2-score-audit', job_key:HP_BOARD_JOB_KEY, mode:HP_BOARD_MODE, status:'blocked_no_hit_probability_current_rows', certification:'HP_BOARD_NO_HIT_PROBABILITY_CURRENT_ROWS', certification_grade:'BLOCKED', no_true_probability_claims:true, no_final_board_mutation:true, no_prepared_board_mutation:true });
  }

  const sourceHpBatchId=String(sourceRows[0].batch_id || 'unknown_hp_batch');
  const hpBatch=await first(env.SCORE_DB, `SELECT * FROM hit_probability_batches WHERE batch_id=?`, sourceHpBatchId) || {};
  const hpBoardBatchId='hp_board_batch_for_' + sourceHpBatchId;
  const sourceFinalBoardBatchId=hpBatch.source_final_board_batch_id || null;
  const sourceEngineBatchId=hpBatch.source_engine_batch_id || null;
  const classified=sourceRows.map(src => {
    const r = { ...src, raw_framework_score_0_100: src.score_0_100 };
    const lane=hpBoardLane(r);
    const hp=hpNum(r.estimated_hit_probability_0_100, 0);
    const conf=hpNum(r.probability_confidence_0_100, 0);
    const sample=hpNum(r.sample_size, 0);
    const score=hpNum(r.score_0_100, 0);
    const hpEligible = hp >= 60;
    const trusted = score >= 82 && conf >= 70 && sample >= 15;
    const primary = hpEligible && sample >= 15 && ((hp >= 85 && score >= 82 && conf >= 70) || (hp >= 75 && score >= 88 && conf >= 80));
    const review = hpEligible && !primary;
    return {
      ...r,
      hp_lane: lane,
      lane_reason: hpBoardLaneReason(lane),
      hp_sort_0_100: hpRound((0.72 * hp) + (0.28 * score) + hpBoardTieBreakAdjustment(r), 6),
      hp_primary_playable: primary ? 1 : 0,
      hp_review_playable: review ? 1 : 0,
      hp_fade_flag: hp < 60 ? 1 : 0,
      board_tier: !hpEligible ? 'KILLED_LOW_HP' : (primary ? 'PRIMARY' : 'REVIEW'),
      live_playable: primary ? 1 : 0,
      review_playable: review ? 1 : 0,
      score_grade: score >= 92 ? 'BIN_ELITE' : (score >= 82 ? 'BIN_STRONG' : (score >= 65 ? 'BIN_QUALIFIED' : (score >= 50 ? 'BIN_ARCHIVE' : 'BIN_REJECT'))),
      hp_board_sanity_calibration_enabled: false,
      hp_first_trust_score_policy: true
    };
  });
  classified.sort((a,b) => {
    const ao=HP_BOARD_LANE_ORDER[a.hp_lane] || 99;
    const bo=HP_BOARD_LANE_ORDER[b.hp_lane] || 99;
    if(ao !== bo) return ao - bo;
    const fields=['hp_sort_0_100','estimated_hit_probability_0_100','score_0_100','probability_confidence_0_100','sample_size'];
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
      hpBoardRowId,hpBoardBatchId,sourceHpBatchId,sourceFinalBoardBatchId,sourceEngineBatchId,r.probability_row_id||null,r.final_board_row_id||null,r.prepared_row_id||null,r.matrix_id||null,r.source_line_id||null,HP_BOARD_PROFILE_KEY,HP_BOARD_PROFILE_VERSION,r.hp_rank,r.hp_lane,r.hp_lane_rank,hpNum(r.hp_sort_0_100, hpNum(r.estimated_hit_probability_0_100,0)),r.source_key||null,r.game_pk||null,r.official_date||null,r.official_game_time_utc||null,r.mlb_player_id||null,r.player_name||null,r.canonical_prop_key||null,r.line_value||null,r.selected_side||null,r.prop_family||null,r.estimated_hit_probability_0_100||null,r.probability_confidence_0_100||null,r.probability_band||null,r.probability_grade||null,r.empirical_hit_rate_0_1||null,r.reliability_0_1||null,r.sample_size||0,r.non_push_sample||0,r.hit_count||0,r.miss_count||0,r.push_count||0,r.push_risk_0_1||0,r.score_0_100||null,r.score_grade||null,r.board_tier||null,r.live_playable||0,r.review_playable||0,r.hp_primary_playable,r.hp_review_playable,r.hp_fade_flag,r.warning_count||0,r.blocker_count||0,r.lane_reason,calibration,r.source_snapshot_json||null);
  }

  await run(env.SCORE_DB, `INSERT OR REPLACE INTO hp_board_history SELECT * FROM hp_board_current WHERE hp_board_batch_id=?`, hpBoardBatchId);
  await run(env.SCORE_DB, `INSERT OR REPLACE INTO hp_board_issues (issue_id,hp_board_batch_id,source_hp_batch_id,source_final_board_batch_id,source_engine_batch_id,probability_row_id,hp_board_row_id,final_board_row_id,prepared_row_id,game_pk,mlb_player_id,canonical_prop_key,selected_side,severity,issue_type,reason,details_json,official_date)
    SELECT 'hpboard_issue|' || c.hp_board_batch_id || '|' || i.issue_id, c.hp_board_batch_id, c.source_hp_batch_id, c.source_final_board_batch_id, c.source_engine_batch_id, i.probability_row_id, c.hp_board_row_id, i.final_board_row_id, i.prepared_row_id, i.game_pk, i.mlb_player_id, i.canonical_prop_key, i.selected_side, i.severity, i.issue_type, i.reason, i.details_json, i.official_date
    FROM hit_probability_issues i JOIN hp_board_current c ON c.probability_row_id=i.probability_row_id WHERE i.batch_id=?`, sourceHpBatchId);

  const qa=await first(env.SCORE_DB, `SELECT COUNT(*) AS rows, COUNT(DISTINCT hp_board_row_id) AS hp_rows, COUNT(DISTINCT hp_rank) AS ranks, MIN(hp_rank) AS min_rank, MAX(hp_rank) AS max_rank, COUNT(DISTINCT final_board_row_id) AS final_rows, COUNT(DISTINCT prepared_row_id) AS prepared_rows, SUM(CASE WHEN final_board_row_id IS NULL THEN 1 ELSE 0 END) AS null_final_rows, SUM(CASE WHEN prepared_row_id IS NULL THEN 1 ELSE 0 END) AS null_prepared_rows, SUM(CASE WHEN blocker_count > 0 THEN 1 ELSE 0 END) AS blocker_rows, ROUND(AVG(score_0_100),2) AS avg_score, ROUND(AVG(estimated_hit_probability_0_100),2) AS avg_hp FROM hp_board_current WHERE hp_board_batch_id=?`, hpBoardBatchId) || {};
  const issueCountRow=await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM hp_board_issues WHERE hp_board_batch_id=?`, hpBoardBatchId) || {};
  const rowCount=Number(qa.rows||0);
  let status='completed_hp_board_current_hp_first_trust_score';
  let cert='HP_BOARD_HP_FIRST_TRUST_SCORE_CERTIFIED';
  let grade='PASS_WITH_TRUE_CALIBRATION_BLOCKED';
  const finalLinkOk = sourceFinalBoardBatchId ? (rowCount === Number(qa.final_rows||0) && Number(qa.null_final_rows||0) === 0) : true;
  if(rowCount === 0 || rowCount !== Number(qa.hp_rows||0) || rowCount !== Number(qa.ranks||0) || Number(qa.min_rank||0) !== 1 || Number(qa.max_rank||0) !== rowCount || !finalLinkOk || rowCount !== Number(qa.prepared_rows||0) || Number(qa.null_prepared_rows||0)>0 || Number(qa.blocker_rows||0)>0){
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


async function runHpBoardCurrentFastTerminal(env, input = {}, hpBatch = null){
  const started = Date.now();
  if(!env.SCORE_DB) return baseIdentity({ ok:false, data_ok:false, version:HP_VERSION, worker_name:WORKER_NAME, logical_worker_name:'alphadog-v2-hit-probability', job_key:HP_JOB_KEY, status:'blocked_missing_score_db_for_fast_hp_board', certification:'HP_BOARD_FAST_TERMINAL_MISSING_SCORE_DB', certification_grade:'BLOCKED' });
  await hpEnsureSchema(env);
  await hpEnsureBoardSchema(env);
  const requestId = input.request_id || (hpBatch && hpBatch.request_id) || null;
  let source = hpBatch;
  if(!source || !source.batch_id){
    source = await first(env.SCORE_DB, `SELECT * FROM hit_probability_batches WHERE request_id=? ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC LIMIT 1`, requestId || '');
  }
  if(!source || !source.batch_id){
    return baseIdentity({ ok:false, data_ok:false, version:HP_VERSION, worker_name:WORKER_NAME, logical_worker_name:'alphadog-v2-hit-probability', job_key:HP_JOB_KEY, request_id:requestId, status:'blocked_missing_source_hp_batch_for_fast_hp_board', certification:'HP_BOARD_FAST_TERMINAL_MISSING_SOURCE_HP_BATCH', certification_grade:'BLOCKED' });
  }
  const sourceHpBatchId = source.batch_id;
  const sourceFinalBoardBatchId = source.source_final_board_batch_id || null;
  const sourceEngineBatchId = source.source_engine_batch_id || null;
  const sourceRows = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows, COUNT(DISTINCT probability_row_id) AS distinct_rows, SUM(CASE WHEN prepared_row_id IS NULL THEN 1 ELSE 0 END) AS null_prepared_rows FROM hit_probability_current WHERE batch_id=?`, sourceHpBatchId) || {};
  const hpRows = Number(sourceRows.rows || 0);
  if(hpRows <= 0){
    return baseIdentity({ ok:false, data_ok:false, version:HP_VERSION, worker_name:WORKER_NAME, logical_worker_name:'alphadog-v2-hit-probability', job_key:HP_JOB_KEY, request_id:requestId, batch_id:sourceHpBatchId, status:'blocked_no_hp_current_rows_for_fast_hp_board', certification:'HP_BOARD_FAST_TERMINAL_NO_HP_CURRENT_ROWS', certification_grade:'BLOCKED' });
  }
  const existing = await first(env.SCORE_DB, `SELECT hp_board_batch_id FROM hp_board_batches WHERE source_hp_batch_id=? ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC LIMIT 1`, sourceHpBatchId);
  const hpBoardBatchId = existing && existing.hp_board_batch_id ? existing.hp_board_batch_id : hpUid('hp_board_batch');
  const calibrationJson = hpSafeJson({
    calibration_type:'hp_first_trust_score_fast_terminal',
    hp_reality_gate:'hp_under_60_killed_not_playable',
    score_meaning:'system_trust_support_quality_preserved_from_scoring_engine',
    board_sort_formula:'0.72*hit_probability + 0.28*score + deterministic_factor_tiebreak_lt_0.15',
    hp_board_tiebreak_phase:'v0.4.25 post-HP deterministic factor/source/sample/reliability tiebreak; display HP preserved; D1-safe no-CASE-adj fast-terminal expression',
    score_is_not_translated_from_hp:true,
    caps_do_not_mutate_score:true,
    true_calibration_blocked_reason:'No settled outcome/backtest/settlement table exists in SCORE_DB.',
    version:HP_VERSION
  }, 3000);

  await run(env.SCORE_DB, `DELETE FROM hp_board_current`);
  await run(env.SCORE_DB, `DELETE FROM hp_board_history WHERE hp_board_batch_id=?`, hpBoardBatchId);
  await run(env.SCORE_DB, `DELETE FROM hp_board_issues WHERE hp_board_batch_id=?`, hpBoardBatchId);

  await run(env.SCORE_DB, `
    INSERT OR REPLACE INTO hp_board_current (
      hp_board_row_id,hp_board_batch_id,source_hp_batch_id,source_final_board_batch_id,source_engine_batch_id,
      probability_row_id,final_board_row_id,prepared_row_id,matrix_id,source_line_id,profile_key,hp_profile_version,
      hp_rank,hp_lane,hp_lane_rank,hp_sort_0_100,source_key,game_pk,official_date,official_game_time_utc,
      mlb_player_id,player_name,canonical_prop_key,line_value,selected_side,prop_family,
      estimated_hit_probability_0_100,probability_confidence_0_100,probability_band,probability_grade,
      empirical_hit_rate_0_1,reliability_0_1,sample_size,non_push_sample,hit_count,miss_count,push_count,push_risk_0_1,
      score_0_100,score_grade,board_tier,live_playable,review_playable,hp_primary_playable,hp_review_playable,hp_fade_flag,
      warning_count,blocker_count,lane_reason,calibration_json,source_snapshot_json,updated_at
    )
    SELECT
      ? || ranked.probability_row_id,
      ?,?,?,?,
      ranked.probability_row_id,ranked.final_board_row_id,ranked.prepared_row_id,ranked.matrix_id,ranked.source_line_id,?, ?,
      ranked.hp_rank,ranked.hp_lane,ranked.hp_lane_rank,ranked.hp_sort_0_100,ranked.source_key,ranked.game_pk,ranked.official_date,ranked.official_game_time_utc,
      ranked.mlb_player_id,ranked.player_name,ranked.canonical_prop_key,ranked.line_value,ranked.selected_side,ranked.prop_family,
      ranked.estimated_hit_probability_0_100,ranked.probability_confidence_0_100,ranked.probability_band,ranked.probability_grade,
      ranked.empirical_hit_rate_0_1,ranked.reliability_0_1,ranked.sample_size,ranked.non_push_sample,ranked.hit_count,ranked.miss_count,ranked.push_count,ranked.push_risk_0_1,
      ranked.score_0_100,ranked.trust_score_grade,ranked.hp_board_tier,ranked.hp_live_playable,ranked.hp_review_playable,
      ranked.hp_live_playable,ranked.hp_review_playable,CASE WHEN ranked.hp < 60 THEN 1 ELSE 0 END,
      COALESCE(ranked.warning_count,0),COALESCE(ranked.blocker_count,0),ranked.lane_reason,?,ranked.source_snapshot_json,CURRENT_TIMESTAMP
    FROM (
      SELECT base.*,
             ROW_NUMBER() OVER (ORDER BY base.lane_order ASC, base.hp_sort_0_100 DESC, base.hp DESC, base.score DESC, COALESCE(base.probability_confidence_0_100,0) DESC, COALESCE(base.sample_size,0) DESC, COALESCE(base.player_name,''), COALESCE(base.canonical_prop_key,''), COALESCE(base.selected_side,''), COALESCE(base.line_value,0)) AS hp_rank,
             ROW_NUMBER() OVER (PARTITION BY base.hp_lane ORDER BY base.hp_sort_0_100 DESC, base.hp DESC, base.score DESC, COALESCE(base.probability_confidence_0_100,0) DESC, COALESCE(base.sample_size,0) DESC, COALESCE(base.player_name,''), COALESCE(base.canonical_prop_key,''), COALESCE(base.selected_side,''), COALESCE(base.line_value,0)) AS hp_lane_rank
      FROM (
        SELECT c.*,
          COALESCE(c.estimated_hit_probability_0_100,0) AS hp,
          COALESCE(c.score_0_100,0) AS score,
          ROUND(
            (0.72 * COALESCE(c.estimated_hit_probability_0_100,0))
            + (0.28 * COALESCE(c.score_0_100,0))
            + (COALESCE(c.probability_confidence_0_100,0) * 0.00035)
            + (COALESCE(c.sample_size,0) * 0.00045)
            + (COALESCE(c.reliability_0_1,0) * 0.020)
            - (COALESCE(c.push_risk_0_1,0) * 0.030)
            + (COALESCE(c.mlb_player_id,0) * 0.000000001)
            + (COALESCE(c.game_pk,0) * 0.0000000001)
            + (COALESCE(c.line_value,0) * 0.00000001),
            6
          ) AS hp_sort_0_100,
          CASE
            WHEN COALESCE(c.score_0_100,0) >= 92 THEN 'BIN_ELITE'
            WHEN COALESCE(c.score_0_100,0) >= 82 THEN 'BIN_STRONG'
            WHEN COALESCE(c.score_0_100,0) >= 65 THEN 'BIN_QUALIFIED'
            WHEN COALESCE(c.score_0_100,0) >= 50 THEN 'BIN_ARCHIVE'
            ELSE 'BIN_REJECT'
          END AS trust_score_grade,
          CASE
            WHEN COALESCE(c.estimated_hit_probability_0_100,0) < 60 THEN 'HP_KILLED_LOW_PROBABILITY'
            WHEN COALESCE(c.sample_size,0) < 20 THEN 'HP_LOW_SAMPLE_REVIEW'
            WHEN COALESCE(c.estimated_hit_probability_0_100,0) >= 85 AND COALESCE(c.score_0_100,0) >= 82 AND COALESCE(c.probability_confidence_0_100,0) >= 70 THEN 'HP_PREMIUM_TRUSTED'
            WHEN COALESCE(c.estimated_hit_probability_0_100,0) >= 85 THEN 'HP_PREMIUM_LOW_TRUST_REVIEW'
            WHEN COALESCE(c.estimated_hit_probability_0_100,0) >= 75 AND COALESCE(c.score_0_100,0) >= 82 AND COALESCE(c.probability_confidence_0_100,0) >= 80 THEN 'HP_STRONG_TRUSTED'
            WHEN COALESCE(c.estimated_hit_probability_0_100,0) >= 75 THEN 'HP_STRONG_LOW_TRUST_REVIEW'
            WHEN COALESCE(c.estimated_hit_probability_0_100,0) >= 65 AND COALESCE(c.score_0_100,0) >= 82 AND COALESCE(c.probability_confidence_0_100,0) >= 70 THEN 'HP_EDGE_TRUSTED_REVIEW'
            WHEN COALESCE(c.estimated_hit_probability_0_100,0) >= 65 THEN 'HP_EDGE_LOW_TRUST_REVIEW'
            ELSE 'HP_THIN_EDGE_REVIEW'
          END AS hp_lane,
          CASE
            WHEN COALESCE(c.estimated_hit_probability_0_100,0) < 60 THEN 98
            WHEN COALESCE(c.sample_size,0) < 20 THEN 8
            WHEN COALESCE(c.estimated_hit_probability_0_100,0) >= 85 AND COALESCE(c.score_0_100,0) >= 82 AND COALESCE(c.probability_confidence_0_100,0) >= 70 THEN 1
            WHEN COALESCE(c.estimated_hit_probability_0_100,0) >= 85 THEN 2
            WHEN COALESCE(c.estimated_hit_probability_0_100,0) >= 75 AND COALESCE(c.score_0_100,0) >= 82 AND COALESCE(c.probability_confidence_0_100,0) >= 80 THEN 3
            WHEN COALESCE(c.estimated_hit_probability_0_100,0) >= 75 THEN 4
            WHEN COALESCE(c.estimated_hit_probability_0_100,0) >= 65 AND COALESCE(c.score_0_100,0) >= 82 AND COALESCE(c.probability_confidence_0_100,0) >= 70 THEN 5
            WHEN COALESCE(c.estimated_hit_probability_0_100,0) >= 65 THEN 6
            ELSE 7
          END AS lane_order,
          CASE
            WHEN COALESCE(c.estimated_hit_probability_0_100,0) < 60 THEN 'KILLED_LOW_HP'
            WHEN COALESCE(c.estimated_hit_probability_0_100,0) >= 85 AND COALESCE(c.score_0_100,0) >= 82 AND COALESCE(c.probability_confidence_0_100,0) >= 70 AND COALESCE(c.sample_size,0) >= 20 THEN 'PRIMARY'
            WHEN COALESCE(c.estimated_hit_probability_0_100,0) >= 75 AND COALESCE(c.score_0_100,0) >= 82 AND COALESCE(c.probability_confidence_0_100,0) >= 80 AND COALESCE(c.sample_size,0) >= 20 THEN 'PRIMARY'
            ELSE 'REVIEW'
          END AS hp_board_tier,
          CASE
            WHEN COALESCE(c.estimated_hit_probability_0_100,0) >= 85 AND COALESCE(c.score_0_100,0) >= 82 AND COALESCE(c.probability_confidence_0_100,0) >= 70 AND COALESCE(c.sample_size,0) >= 20 AND COALESCE(c.blocker_count,0)=0 THEN 1
            WHEN COALESCE(c.estimated_hit_probability_0_100,0) >= 75 AND COALESCE(c.score_0_100,0) >= 82 AND COALESCE(c.probability_confidence_0_100,0) >= 80 AND COALESCE(c.sample_size,0) >= 20 AND COALESCE(c.blocker_count,0)=0 THEN 1
            ELSE 0
          END AS hp_live_playable,
          CASE
            WHEN COALESCE(c.estimated_hit_probability_0_100,0) >= 60 AND NOT (
              (COALESCE(c.estimated_hit_probability_0_100,0) >= 85 AND COALESCE(c.score_0_100,0) >= 82 AND COALESCE(c.probability_confidence_0_100,0) >= 70 AND COALESCE(c.sample_size,0) >= 20)
              OR (COALESCE(c.estimated_hit_probability_0_100,0) >= 75 AND COALESCE(c.score_0_100,0) >= 82 AND COALESCE(c.probability_confidence_0_100,0) >= 80 AND COALESCE(c.sample_size,0) >= 20)
            ) AND COALESCE(c.blocker_count,0)=0 THEN 1
            ELSE 0
          END AS hp_review_playable,
          CASE
            WHEN COALESCE(c.estimated_hit_probability_0_100,0) < 60 THEN 'Hit probability is below 60%; killed from useful board/testing consideration regardless of score.'
            WHEN COALESCE(c.sample_size,0) < 20 THEN 'HP survives but sample is below the 20 non-push/live-gate threshold; review only.'
            WHEN COALESCE(c.estimated_hit_probability_0_100,0) >= 85 AND COALESCE(c.score_0_100,0) >= 82 THEN 'Premium HP with strong trust support.'
            WHEN COALESCE(c.estimated_hit_probability_0_100,0) >= 85 THEN 'Premium HP survives; score says lower system trust, review only.'
            WHEN COALESCE(c.estimated_hit_probability_0_100,0) >= 75 AND COALESCE(c.score_0_100,0) >= 82 THEN 'Strong HP with strong trust support.'
            WHEN COALESCE(c.estimated_hit_probability_0_100,0) >= 75 THEN 'Strong HP survives; score says lower system trust, review only.'
            WHEN COALESCE(c.estimated_hit_probability_0_100,0) >= 65 AND COALESCE(c.score_0_100,0) >= 82 THEN 'Positive HP edge with strong trust support; review only.'
            WHEN COALESCE(c.estimated_hit_probability_0_100,0) >= 65 THEN 'Positive HP edge with lower system trust; review only.'
            ELSE 'Thin HP edge above 60%; review only.'
          END AS lane_reason
        FROM hit_probability_current c
        WHERE c.batch_id=?
      ) base
    ) ranked`,
    'hpboard|' + hpBoardBatchId + '|', hpBoardBatchId, sourceHpBatchId, sourceFinalBoardBatchId, sourceEngineBatchId,
    HP_BOARD_PROFILE_KEY, HP_BOARD_PROFILE_VERSION, calibrationJson, sourceHpBatchId
  );

  await run(env.SCORE_DB, `INSERT OR REPLACE INTO hp_board_history SELECT * FROM hp_board_current WHERE hp_board_batch_id=?`, hpBoardBatchId);
  await run(env.SCORE_DB, `INSERT OR REPLACE INTO hp_board_issues (issue_id,hp_board_batch_id,source_hp_batch_id,source_final_board_batch_id,source_engine_batch_id,probability_row_id,hp_board_row_id,final_board_row_id,prepared_row_id,game_pk,mlb_player_id,canonical_prop_key,selected_side,severity,issue_type,reason,details_json,official_date)
    SELECT 'hpboard_issue|' || c.hp_board_batch_id || '|' || i.issue_id, c.hp_board_batch_id, c.source_hp_batch_id, c.source_final_board_batch_id, c.source_engine_batch_id, i.probability_row_id, c.hp_board_row_id, i.final_board_row_id, i.prepared_row_id, i.game_pk, i.mlb_player_id, i.canonical_prop_key, i.selected_side, i.severity, i.issue_type, i.reason, i.details_json, i.official_date
    FROM hit_probability_issues i JOIN hp_board_current c ON c.probability_row_id=i.probability_row_id WHERE i.batch_id=?`, sourceHpBatchId);

  const qa = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows, COUNT(DISTINCT hp_board_row_id) AS hp_rows, COUNT(DISTINCT hp_rank) AS ranks, MIN(hp_rank) AS min_rank, MAX(hp_rank) AS max_rank, COUNT(DISTINCT final_board_row_id) AS final_rows, COUNT(DISTINCT prepared_row_id) AS prepared_rows, SUM(CASE WHEN final_board_row_id IS NULL THEN 1 ELSE 0 END) AS null_final_rows, SUM(CASE WHEN prepared_row_id IS NULL THEN 1 ELSE 0 END) AS null_prepared_rows, SUM(CASE WHEN calibration_json IS NULL THEN 1 ELSE 0 END) AS missing_calibration_rows, SUM(CASE WHEN blocker_count > 0 THEN 1 ELSE 0 END) AS blocker_rows, ROUND(AVG(score_0_100),2) AS avg_score, ROUND(AVG(estimated_hit_probability_0_100),2) AS avg_hp FROM hp_board_current WHERE hp_board_batch_id=?`, hpBoardBatchId) || {};
  const issueCountRow = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM hp_board_issues WHERE hp_board_batch_id=?`, hpBoardBatchId) || {};
  const primaryRow = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM hp_board_current WHERE hp_board_batch_id=? AND hp_primary_playable=1`, hpBoardBatchId) || {};
  const reviewRow = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM hp_board_current WHERE hp_board_batch_id=? AND hp_review_playable=1`, hpBoardBatchId) || {};
  const fadeRow = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM hp_board_current WHERE hp_board_batch_id=? AND hp_fade_flag=1`, hpBoardBatchId) || {};
  const lowHpPlayableRow = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM hp_board_current WHERE hp_board_batch_id=? AND COALESCE(estimated_hit_probability_0_100,0) < 60 AND (COALESCE(hp_primary_playable,0)=1 OR COALESCE(live_playable,0)=1 OR board_tier='PRIMARY') AND COALESCE(blocker_count,0)=0`, hpBoardBatchId) || {};
  const eligibleMissingScoreRow = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM hp_board_current WHERE hp_board_batch_id=? AND COALESCE(estimated_hit_probability_0_100,0) >= 60 AND score_0_100 IS NULL AND COALESCE(blocker_count,0)=0`, hpBoardBatchId) || {};
  const eligibleNotVisibleRow = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM hp_board_current WHERE hp_board_batch_id=? AND COALESCE(estimated_hit_probability_0_100,0) >= 60 AND COALESCE(hp_review_playable,0)=0 AND COALESCE(hp_primary_playable,0)=0 AND COALESCE(blocker_count,0)=0`, hpBoardBatchId) || {};
  const weakPrimaryRow = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM hp_board_current WHERE hp_board_batch_id=? AND COALESCE(hp_primary_playable,0)=1 AND (COALESCE(score_0_100,0) < 82 OR COALESCE(sample_size,0) < 20 OR COALESCE(probability_confidence_0_100,0) < 70 OR COALESCE(blocker_count,0) > 0)`, hpBoardBatchId) || {};
  const lowSamplePrimaryRow = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM hp_board_current WHERE hp_board_batch_id=? AND COALESCE(hp_primary_playable,0)=1 AND COALESCE(sample_size,0) < 20`, hpBoardBatchId) || {};
  const boardRows = Number(qa.rows || 0);
  const finalLinkOk = sourceFinalBoardBatchId ? (Number(qa.null_final_rows || 0) === 0) : true;
  const integrityOk = boardRows === hpRows && boardRows === Number(qa.hp_rows || 0) && boardRows === Number(qa.ranks || 0) && Number(qa.min_rank || 0) === 1 && Number(qa.max_rank || 0) === boardRows && finalLinkOk && Number(qa.null_prepared_rows || 0) === 0 && Number(qa.missing_calibration_rows || 0) === 0;
  const hpFirstOk = Number(lowHpPlayableRow.rows || 0) === 0 && Number(eligibleMissingScoreRow.rows || 0) === 0 && Number(eligibleNotVisibleRow.rows || 0) === 0 && Number(weakPrimaryRow.rows || 0) === 0 && Number(lowSamplePrimaryRow.rows || 0) === 0;
  const ok = integrityOk && hpFirstOk;
  const status = ok ? 'completed_hp_board_current_hp_first_trust_score_fast_terminal' : 'failed_hp_board_hp_first_trust_guard';
  const cert = ok ? 'HP_BOARD_HP_FIRST_TRUST_SCORE_CERTIFIED_TIMEOUT_SAFE' : 'HP_BOARD_HP_FIRST_TRUST_SCORE_GUARD_FAILED';
  const grade = ok ? 'PASS_WITH_TRUE_CALIBRATION_BLOCKED' : 'BLOCKED';
  const output = baseIdentity({
    ok, data_ok: ok, version:HP_VERSION, worker_name:WORKER_NAME, logical_worker_name:'alphadog-v2-hit-probability', deployed_worker_slot:'alphadog-v2-score-audit',
    job_key:HP_JOB_KEY, mode:input.mode || HP_MODE, request_id:requestId, run_id:input.run_id || source.run_id || null, chain_id:input.chain_id || null,
    status, certification:cert, certification_status:cert, certification_grade:grade,
    batch_id:sourceHpBatchId, hp_board_batch_id:hpBoardBatchId, source_hp_batch_id:sourceHpBatchId, source_final_board_batch_id:sourceFinalBoardBatchId, source_engine_batch_id:sourceEngineBatchId,
    source_table:'hit_probability_current', source_rows_read:hpRows, rows_read:hpRows, supported_rows:hpRows,
    probability_rows_written:hpRows, recent_form_rows_written:hpRows, hp_board_current_written:boardRows, board_rows_written:boardRows, history_rows_written:boardRows, rows_written:boardRows,
    issue_rows_written:Number(issueCountRow.rows || 0), primary_rows:Number(primaryRow.rows || 0), review_rows:Number(reviewRow.rows || 0), fade_rows:Number(fadeRow.rows || 0),
    low_hp_playable_rows:Number(lowHpPlayableRow.rows || 0), eligible_hp_missing_score_rows:Number(eligibleMissingScoreRow.rows || 0), eligible_hp_not_visible_rows:Number(eligibleNotVisibleRow.rows || 0), weak_primary_rows:Number(weakPrimaryRow.rows || 0), low_sample_primary_rows:Number(lowSamplePrimaryRow.rows || 0), hp_live_min_score:82, hp_live_min_sample:20,
    avg_score:qa.avg_score, avg_hp:qa.avg_hp, row_parity_ok:boardRows === hpRows, rank_integrity_ok:Number(qa.ranks || 0) === boardRows, hp_first_gate_ok:hpFirstOk,
    true_calibration_blocked_reason:'No settled outcome/backtest/settlement table exists in SCORE_DB.', raw_hp_preserved:true, score_preserved_as_trust_metric:true, no_true_hit_probability_claims:true, no_true_probability_claims:true,
    no_score_mutation:true, no_scoring_engine_current_mutation:true, no_final_board_mutation:true, no_prepared_board_mutation:true, no_source_board_mutation:true, hp_board_ranking:true, no_candidate_board_write:true,
    fast_terminal_sql_builder:true, timeout_safe_board_build:true, elapsed_ms:Date.now() - started
  });
  await run(env.SCORE_DB, `UPDATE hit_probability_batches SET status=?, certification_status=?, certification_grade=?, probability_rows_written=?, issue_rows_written=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, status, cert, grade, hpRows, Number(issueCountRow.rows || 0), hpSafeJson(output,14000), sourceHpBatchId);
  await run(env.SCORE_DB, `INSERT OR REPLACE INTO hp_board_batches (hp_board_batch_id,request_id,run_id,worker_version,profile_key,profile_version,mode,status,source_table,source_hp_batch_id,source_final_board_batch_id,source_engine_batch_id,source_rows_read,board_rows_written,history_rows_written,issue_rows_written,primary_rows,review_rows,fade_rows,certification_status,certification_grade,thresholds_locked,no_true_probability_claims,output_json,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, hpBoardBatchId,requestId,output.run_id,HP_VERSION,HP_BOARD_PROFILE_KEY,HP_BOARD_PROFILE_VERSION,HP_BOARD_MODE,status,'hit_probability_current',sourceHpBatchId,sourceFinalBoardBatchId,sourceEngineBatchId,hpRows,boardRows,boardRows,Number(issueCountRow.rows||0),Number(primaryRow.rows||0),Number(reviewRow.rows||0),Number(fadeRow.rows||0),cert,grade,1,1,hpSafeJson(output,14000));
  return output;
}


async function runHitProbabilityCurrent(env, input = {}){
  const started=Date.now();
  if(!env.SCORE_DB || !env.STATS_HITTER_DB || !env.STATS_PITCHER_DB) return baseIdentity({ ok:false, data_ok:false, version:HP_VERSION, job_key:HP_JOB_KEY, status:"blocked_missing_db_bindings", certification:"HIT_PROBABILITY_MISSING_DB_BINDINGS", certification_grade:"BLOCKED", required_bindings:{SCORE_DB:!!env.SCORE_DB,STATS_HITTER_DB:!!env.STATS_HITTER_DB,STATS_PITCHER_DB:!!env.STATS_PITCHER_DB}, no_score_mutation:true, no_final_board_mutation:true });
  await hpEnsureSchema(env);
  const requestId=input.request_id||null;
  const runId=input.run_id||null;
  const chainId=input.chain_id||null;

  let batch=await first(env.SCORE_DB, `SELECT * FROM hit_probability_batches WHERE request_id=? AND status IN ('running_hit_probability_current','partial_continue_hit_probability_current','hit_probability_current_complete_hp_board_pending','completed_recent_form_hit_rate_written','completed_hp_board_current_display_calibrated_fast_terminal','completed_hp_board_current_display_calibrated') ORDER BY datetime(created_at) DESC LIMIT 1`, requestId || '');
  let batchId=batch && batch.batch_id ? batch.batch_id : null;
  let source=null;

  if(batch && (batch.status === 'hit_probability_current_complete_hp_board_pending' || batch.status === 'completed_recent_form_hit_rate_written' || (String(batch.status || '').startsWith('completed_hp_board_current_display_calibrated') || String(batch.status || '').startsWith('completed_hp_board_current_hp_first_trust_score')))){
    const writtenRow=await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM hit_probability_current WHERE batch_id=?`, batchId) || {};
    const unsupportedRow=await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM hit_probability_issues WHERE batch_id=? AND issue_type='HIT_PROBABILITY_ROW_UNSUPPORTED'`, batchId) || {};
    const issueRow=await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM hit_probability_issues WHERE batch_id=?`, batchId) || {};
    const sourceRows=Number(batch.source_rows_read||0);
    const written=Number(writtenRow.rows||0);
    const unsupported=Number(unsupportedRow.rows||0);
    const issues=Number(issueRow.rows||0);
    const rowParityOk=sourceRows === (written + unsupported);
    if(!rowParityOk){
      const output=baseIdentity({
        ok:false,data_ok:false,version:HP_VERSION,worker_name:WORKER_NAME,logical_worker_name:'alphadog-v2-hit-probability',deployed_worker_slot:'alphadog-v2-score-audit',job_key:HP_JOB_KEY,
        request_id:requestId,run_id:runId,chain_id:chainId,mode:input.mode||HP_MODE,status:'failed_recent_form_row_parity_mismatch',certification:'RECENT_FORM_HIT_RATE_ROW_PARITY_FAILED',certification_grade:'BLOCKED',
        batch_id:batchId,source_table:batch.source_table,source_final_board_batch_id:batch.source_final_board_batch_id||null,source_engine_batch_id:batch.source_engine_batch_id||null,
        source_rows_read:sourceRows,rows_read:sourceRows,supported_rows:Number(batch.supported_rows||written),unsupported_rows:unsupported,probability_rows_written:written,recent_form_rows_written:written,rows_written:written,row_parity_ok:false,issue_rows_written:issues,
        hp_current_chunked:true,hp_board_ready:false,no_score_mutation:true,no_scoring_engine_current_mutation:true,no_final_board_mutation:true,no_prepared_board_mutation:true,no_source_board_mutation:true,no_ranking:true,elapsed_ms:Date.now()-started
      });
      await run(env.SCORE_DB, `UPDATE hit_probability_batches SET status=?, certification_status=?, certification_grade=?, probability_rows_written=?, issue_rows_written=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, output.status, output.certification, output.certification_grade, written, issues, hpSafeJson(output,14000), batchId);
      return output;
    }
    const boardOutput = await runHpBoardCurrentFastTerminal(env, input, batch);
    return boardOutput;
  }

  if(!batchId){
    await run(env.SCORE_DB, `UPDATE hit_probability_batches SET status='failed_stale_interrupted', certification_status='STALE_HIT_PROBABILITY_BATCH_MARKED_FAILED_BEFORE_NEW_RUN', certification_grade='FAIL_STALE_INTERRUPTED', output_json=COALESCE(output_json, ?), updated_at=CURRENT_TIMESTAMP WHERE status IN ('running_hit_probability_current','partial_continue_hit_probability_current','hit_probability_current_complete_hp_board_pending')`, hpSafeJson({ok:false,data_ok:false,status:'failed_stale_interrupted',certification:'STALE_HIT_PROBABILITY_BATCH_MARKED_FAILED_BEFORE_NEW_RUN',worker_version:HP_VERSION,reason:'new_hit_probability_run_started'},4000));
    batchId=hpUid('hit_probability_batch');
    source=await hpSourceRows(env, input);
    const initialOutput=baseIdentity({
      ok:true,
      data_ok:true,
      version:HP_VERSION,
      worker_name:WORKER_NAME,
      logical_worker_name:'alphadog-v2-hit-probability',
      deployed_worker_slot:'alphadog-v2-score-audit',
      job_key:HP_JOB_KEY,
      request_id:requestId,
      run_id:runId,
      chain_id:chainId,
      mode:input.mode||HP_MODE,
      status:'running_hit_probability_current',
      certification:'HIT_PROBABILITY_CURRENT_STARTED',
      certification_grade:'RUNNING',
      batch_id:batchId,
      source_table:source.source_table,
      source_final_board_batch_id:source.final_board_batch_id||null,
      source_engine_batch_id:source.engine_batch_id||null,
      source_rows_read:source.rows.length,
      rows_read:source.rows.length,
      hp_current_chunked:true,
      hp_current_chunk_rows_per_invocation:HP_CURRENT_CHUNK_ROWS_PER_INVOCATION,
      no_score_mutation:true,
      no_final_board_mutation:true,
      no_prepared_board_mutation:true
    });
    await run(env.SCORE_DB, `INSERT OR REPLACE INTO hit_probability_batches (batch_id,request_id,run_id,worker_version,profile_version,mode,status,source_table,source_final_board_batch_id,source_engine_batch_id,source_rows_read,supported_rows,probability_rows_written,issue_rows_written,hitter_players_checked,pitcher_players_checked,certification_status,certification_grade,output_json,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, batchId,requestId,runId,HP_VERSION,HP_PROFILE_VERSION,input.mode||HP_MODE,'running_hit_probability_current',source.source_table,source.final_board_batch_id||null,source.engine_batch_id||null,source.rows.length,0,0,0,0,0,'HIT_PROBABILITY_CURRENT_STARTED','RUNNING',hpSafeJson(initialOutput,8000));
    await run(env.SCORE_DB, "DELETE FROM hit_probability_current");
    await run(env.SCORE_DB, "DELETE FROM hit_probability_issues WHERE created_at < datetime('now','-2 days') OR batch_id=?", batchId);
  } else {
    source=await hpSourceRows(env, input);
  }

  const currentRow=await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM hit_probability_current WHERE batch_id=?`, batchId) || {};
  const unsupportedRow=await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM hit_probability_issues WHERE batch_id=? AND issue_type='HIT_PROBABILITY_ROW_UNSUPPORTED'`, batchId) || {};
  const processedOffset=Number(currentRow.rows||0)+Number(unsupportedRow.rows||0);
  const sourceRowsTotal=source.rows.length;
  const slice=source.rows.slice(processedOffset, processedOffset + HP_CURRENT_CHUNK_ROWS_PER_INVOCATION);
  const configs=await hpLoadProfileConfigs(env);
  const maxDate = source.rows.reduce((m,r)=> String(r.official_date||"")>m ? String(r.official_date||"") : m, "0000-00-00") || new Date().toISOString().slice(0,10);

  const supported=[];
  const unsupported=[];
  for(const r of slice){ const prop=String(r.canonical_prop_key||""); const profile=hpProfile(prop); const side=hpSide(r.selected_side || r.prop_side); if(!profile || !side || !r.mlb_player_id || r.line_value == null){ unsupported.push({row:r, reason:!profile?'unsupported_prop':(!side?'missing_side':(!r.mlb_player_id?'missing_player':'missing_line'))}); } else supported.push({...r, selected_side:side, _profile:profile}); }
  const hitterIds=hpUnique(supported.filter(r=>r._profile.family==='hitter').map(r=>Number(r.mlb_player_id)));
  const pitcherIds=hpUnique(supported.filter(r=>r._profile.family==='pitcher').map(r=>Number(r.mlb_player_id)));
  const hitterLogs=await hpFetchHitterLogs(env,hitterIds,maxDate);
  const pitcherLogs=await hpFetchPitcherLogs(env,pitcherIds,maxDate);

  let writtenThisInvocation=0, issuesThisInvocation=0, blockedThisInvocation=0, warningRowsThisInvocation=0, lowSampleIssuesThisInvocation=0, divergenceIssuesThisInvocation=0, cappedRowsThisInvocation=0, lowFreqLessRowsThisInvocation=0, pitcherVolatilityRowsThisInvocation=0;
  for(const src of unsupported){ issuesThisInvocation++; blockedThisInvocation++; await hpWriteIssue(env,batchId,src.row,null,'blocker','HIT_PROBABILITY_ROW_UNSUPPORTED',src.reason,{isolated_same_scoring_worker_slot:true,no_score_mutation:true,hp_current_chunked:true}); }
  for(const r of supported){
    if((Date.now()-started) >= HP_CURRENT_CHUNK_MAX_MILLIS) break;
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
    if(warningCount) warningRowsThisInvocation++;
    if(status === 'blocked_no_history') blockedThisInvocation++;
    if(warningFlags.includes('HP_DISPLAY_CAPPED') || warningFlags.includes('HP_LESS_CAP_APPLIED')) cappedRowsThisInvocation++;
    if(warningFlags.includes('HP_LOW_FREQUENCY_LESS_BASE_RATE')) lowFreqLessRowsThisInvocation++;
    if(warningFlags.includes('HP_PITCHER_SAMPLE_VOLATILITY')) pitcherVolatilityRowsThisInvocation++;
    const profileKey=[configKey, r.canonical_prop_key, hpLineBucket(r.line_value), r.selected_side].join('__').toUpperCase();
    await run(env.SCORE_DB, `INSERT INTO hit_probability_current (probability_row_id,batch_id,source_table,final_board_row_id,score_row_id,prepared_row_id,matrix_id,source_line_id,source_key,game_pk,official_date,official_game_time_utc,mlb_player_id,player_name,canonical_prop_key,line_value,selected_side,prop_family,prop_line_profile_key,probability_model_version,probability_status,probability_grade,estimated_hit_probability_0_100,probability_confidence_0_100,probability_band,empirical_hit_rate_0_1,reliability_0_1,sample_size,non_push_sample,hit_count,miss_count,push_count,push_risk_0_1,score_0_100,score_grade,board_tier,live_playable,review_playable,warning_count,blocker_count,model_notes_json,window_summary_json,source_snapshot_json,raw_empirical_hit_rate_0_1,raw_weighted_empirical_rate_v0_1_2_0_100,raw_weighted_empirical_rate_v0_1_3_0_100,estimated_recent_form_hit_rate_0_100,sample_reliability_score_0_100,recent_form_band,recent_form_grade,display_adjustment_reason,display_warning_flags_json,display_notes_json,factor_alignment_score_0_100,factor_adjustment_0_100,score_recent_form_gap_0_100,recent_form_rank_hint_0_100,profile_config_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, probabilityRowId,batchId,source.source_table,r.final_board_row_id||null,r.score_row_id||null,r.prepared_row_id||null,r.matrix_id||null,r.source_line_id||null,r.source_key||null,r.game_pk||null,r.official_date||null,r.official_game_time_utc||null,r.mlb_player_id||null,r.player_name||null,r.canonical_prop_key||null,r.line_value||null,r.selected_side,profile.family,profileKey,HP_PROFILE_VERSION,status,grade,est.estimated_hit_probability_0_100,est.probability_confidence_0_100,est.probability_band,est.empirical_hit_rate_0_1,est.reliability_0_1,est.sample_size,est.non_push_sample,est.hit_count,est.miss_count,est.push_count,est.push_risk_0_1,r.score_0_100||null,r.score_grade||null,r.board_tier||null,r.live_playable||0,r.review_playable||0,warningCount,status==='blocked_no_history'?1:0,hpSafeJson({estimated_not_true_probability:true,display_metric_label:'Estimated Recent-Form Hit Rate',method:'profiled_recent_form_weighted_empirical_with_post_cap_hitter_prop_tiebreak_v0_2_0_chunked',same_deployed_worker_slot:'alphadog-v2-score-audit',no_score_mutation:true,no_final_board_mutation:true,no_ranking:true,profile_label:profile.label,profile_config_key:configKey,hp_current_chunked:true},4000),hpSafeJson(est.windows,6000),hpSafeJson({source_final_board_batch_id:source.final_board_batch_id, source_engine_batch_id:source.engine_batch_id},3000),est.raw_empirical_hit_rate_0_1,est.raw_weighted_empirical_rate_v0_1_2_0_100,est.raw_weighted_empirical_rate_v0_1_3_0_100,est.estimated_recent_form_hit_rate_0_100,est.sample_reliability_score_0_100,est.recent_form_band,est.recent_form_grade,est.display_adjustment_reason,hpSafeJson(warningFlags,2000),hpSafeJson(est.display_notes,5000),est.factor_alignment_score_0_100,est.factor_adjustment_0_100,est.score_recent_form_gap_0_100,est.recent_form_rank_hint_0_100,hpSafeJson(config,6000));
    writtenThisInvocation++;
    if(est.is_low_sample){ issuesThisInvocation++; lowSampleIssuesThisInvocation++; await hpWriteIssue(env,batchId,r,probabilityRowId,'warning','HP_LOW_SAMPLE','Recent-form sample below configured threshold; display value compressed but row preserved.',{sample_size:est.sample_size,non_push_sample:est.non_push_sample,prop_line_profile_key:profileKey,display_value:est.estimated_recent_form_hit_rate_0_100,raw_v0_1_3:est.raw_weighted_empirical_rate_v0_1_3_0_100,config_key:configKey,hp_current_chunked:true}); }
    if(est.is_divergence){ issuesThisInvocation++; divergenceIssuesThisInvocation++; await hpWriteIssue(env,batchId,r,probabilityRowId,'info','SCORE_RECENT_FORM_DIVERGENCE','High structural score with weak recent-form hit rate; non-blocking audit signal only.',{score_0_100:r.score_0_100,estimated_recent_form_hit_rate_0_100:est.estimated_recent_form_hit_rate_0_100,sample_reliability_score_0_100:est.sample_reliability_score_0_100,non_push_sample:est.non_push_sample,score_recent_form_gap_0_100:est.score_recent_form_gap_0_100,hp_current_chunked:true}); }
    if(!hasHistory){ issuesThisInvocation++; await hpWriteIssue(env,batchId,r,probabilityRowId,'blocker','NO_HISTORICAL_GAME_LOGS','No historical logs available for isolated recent-form calculation.',{prop_line_profile_key:profileKey,hp_current_chunked:true}); }
  }

  const writtenRow2=await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM hit_probability_current WHERE batch_id=?`, batchId) || {};
  const unsupportedRow2=await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM hit_probability_issues WHERE batch_id=? AND issue_type='HIT_PROBABILITY_ROW_UNSUPPORTED'`, batchId) || {};
  const issueRow2=await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM hit_probability_issues WHERE batch_id=?`, batchId) || {};
  const hitterTotalRow=await first(env.SCORE_DB, `SELECT COUNT(DISTINCT mlb_player_id) AS rows FROM hit_probability_current WHERE batch_id=? AND prop_family='hitter'`, batchId) || {};
  const pitcherTotalRow=await first(env.SCORE_DB, `SELECT COUNT(DISTINCT mlb_player_id) AS rows FROM hit_probability_current WHERE batch_id=? AND prop_family='pitcher'`, batchId) || {};
  const writtenTotal=Number(writtenRow2.rows||0);
  const unsupportedTotal=Number(unsupportedRow2.rows||0);
  const issuesTotal=Number(issueRow2.rows||0);
  const processedTotal=writtenTotal + unsupportedTotal;
  const remainingRows=Math.max(0, sourceRowsTotal - processedTotal);
  const currentComplete=remainingRows <= 0;

  const partialOutput=baseIdentity({
    ok:true,
    data_ok:true,
    version:HP_VERSION,
    worker_name:WORKER_NAME,
    logical_worker_name:'alphadog-v2-hit-probability',
    deployed_worker_slot:'alphadog-v2-score-audit',
    job_key:HP_JOB_KEY,
    request_id:requestId,
    run_id:runId,
    chain_id:chainId,
    mode:input.mode||HP_MODE,
    status: currentComplete ? 'partial_continue_hit_probability_current_ready_for_hp_board' : 'partial_continue_hit_probability_current_chunk_written',
    certification: currentComplete ? 'HIT_PROBABILITY_CURRENT_READY_FOR_HP_BOARD_PARTIAL_CONTINUE' : 'HIT_PROBABILITY_CURRENT_PARTIAL_CONTINUE_CHUNK_WRITTEN',
    certification_grade:'PARTIAL',
    batch_id:batchId,
    source_table:source.source_table,
    source_final_board_batch_id:source.final_board_batch_id||null,
    source_engine_batch_id:source.engine_batch_id||null,
    source_rows_read:sourceRowsTotal,
    rows_read:sourceRowsTotal,
    supported_rows:writtenTotal,
    unsupported_rows:unsupportedTotal,
    probability_rows_written:writtenTotal,
    recent_form_rows_written:writtenTotal,
    rows_written:writtenTotal,
    issue_rows_written:issuesTotal,
    inserted_this_invocation:writtenThisInvocation,
    unsupported_this_invocation:unsupported.length,
    issues_this_invocation:issuesThisInvocation,
    low_sample_issue_rows_this_invocation:lowSampleIssuesThisInvocation,
    divergence_issue_rows_this_invocation:divergenceIssuesThisInvocation,
    warning_rows_this_invocation:warningRowsThisInvocation,
    blocker_rows_this_invocation:blockedThisInvocation,
    capped_rows_this_invocation:cappedRowsThisInvocation,
    low_frequency_less_rows_this_invocation:lowFreqLessRowsThisInvocation,
    pitcher_volatility_rows_this_invocation:pitcherVolatilityRowsThisInvocation,
    processed_rows:processedTotal,
    remaining_rows:remainingRows,
    hitter_players_checked:Number(hitterTotalRow.rows||0),
    pitcher_players_checked:Number(pitcherTotalRow.rows||0),
    hp_current_chunked:true,
    hp_current_chunk_rows_per_invocation:HP_CURRENT_CHUNK_ROWS_PER_INVOCATION,
    hp_board_step_separated:true,
    continuation_required:true,
    orchestrator_should_self_continue:true,
    no_score_mutation:true,
    no_scoring_engine_current_mutation:true,
    no_final_board_mutation:true,
    no_prepared_board_mutation:true,
    no_source_board_mutation:true,
    no_ranking:true,
    elapsed_ms:Date.now()-started
  });

  await run(env.SCORE_DB, `UPDATE hit_probability_batches SET status=?, certification_status=?, certification_grade=?, supported_rows=?, probability_rows_written=?, issue_rows_written=?, hitter_players_checked=?, pitcher_players_checked=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, currentComplete ? 'hit_probability_current_complete_hp_board_pending' : 'partial_continue_hit_probability_current', partialOutput.certification, 'PARTIAL', writtenTotal, writtenTotal, issuesTotal, Number(hitterTotalRow.rows||0), Number(pitcherTotalRow.rows||0), hpSafeJson(partialOutput,14000), batchId);
  return partialOutput;
}


const ENRICHMENT_V1_JOB_KEY = "score-enrichment-v1";
const ENRICHMENT_V1_MODE = "score_enrichment_v1_side_expanded";
const ENRICHMENT_V1_VERSION = "alphadog-v2-score-enrichment-v1-v0.1.11-hitter-raw-payload-directional-parser";
const ENRICHMENT_V1_CHUNK_ROWS = 250;

function clampNum(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
function lowerText(v) { return String(v == null ? "" : v).toLowerCase(); }
function scoreJson(value, max = 14000) {
  let text = "{}";
  try { text = JSON.stringify(value == null ? {} : value); } catch (_) { text = JSON.stringify({ serialization_error: true }); }
  return text.length > max ? text.slice(0, max) : text;
}
function enrichmentProfileFor(prop, family) {
  const p = lowerText(prop);
  const f = lowerText(family);
  if (p === "hitter_strikeouts") return "hitter_strikeout";
  if (p === "walks") return "hitter_walk_obp";
  if (p === "stolen_bases") return "stolen_base_attempt";
  if (p === "plate_appearances") return "hitter_plate_appearances";
  if (["home_runs", "total_bases", "doubles", "triples"].includes(p)) return "hitter_power";
  if (["hits", "singles"].includes(p)) return "hitter_contact";
  if (["runs", "rbis", "hits_runs_rbis"].includes(p)) return "hitter_run_rbi";
  if (p === "fantasy_score") return "fantasy_score_deferred";
  if (p === "pitcher_strikeouts") return "pitcher_strikeout";
  if (p === "pitcher_outs") return "pitcher_outs";
  if (p === "pitches_thrown") return "pitcher_pitches_thrown";
  if (p === "hits_allowed") return "pitcher_hits_allowed";
  if (["earned_runs", "runs_allowed"].includes(p)) return "pitcher_earned_runs_allowed";
  if (p === "walks_allowed") return "pitcher_walks";
  if (p === "rfi_nrfi") return "rfi_nrfi";
  return f === "pitcher" ? "pitcher_generic" : "hitter_contact";
}
const ENRICHMENT_PROFILE_WEIGHTS = {
  hitter_contact: { baseline:40, recent_form:10, direct_matchup:13, split_fit:10, lineup_pa:8, market:3, park_environment:7, bullpen:3, lineup_status:3, opponent_defense:3 },
  hitter_power: { baseline:35, recent_form:15, direct_matchup:12, split_fit:10, lineup_opportunity:3, market:3, park_environment:12, bullpen:5, lineup_status:5 },
  hitter_run_rbi: { baseline:28, recent_form:10, direct_matchup:11, split_fit:8, lineup_role:15, market:6, park_environment:6, bullpen:8, lineup_status:4, run_strategy:4 },
  hitter_plate_appearances: { baseline:34, lineup_slot:28, lineup_confirmed:12, team_total:8, pitcher_pitch_to_contact:6, schedule_rest:4, market:3, park_weather:5 },
  hitter_strikeout: { baseline:35, recent_discipline:18, pitcher_k_whiff:14, pitch_mix_split:13, lineup_pa:5, market:3, bullpen_k:5, lineup_status:4, umpire:3 },
  hitter_walk_obp: { baseline:34, recent_discipline:18, pitcher_control:16, pitch_mix_zone:10, umpire:7, lineup_pa:5, market:4, lineup_status:6 },
  stolen_base_attempt: { baseline:30, runner_attempt_history:20, runner_speed:10, pitcher_hold:15, catcher_pop_throw:10, game_state_strategy:12, market:3 },
  stolen_base_success: { baseline:25, runner_speed:20, catcher_pop_throw:20, pitcher_hold:18, jump_route_context:7, game_state_strategy:5, market:5 },
  pitcher_strikeout: { baseline:35, pitcher_k_whiff:20, opponent_k_profile:13, pitch_mix_fit:14, workload_pitch_count:6, umpire:5, market:4, park_weather:3 },
  pitcher_outs: { baseline:35, starter_workload:18, opponent_pressure:12, bullpen_availability:14, rest_pitch_count:10, market:4, park_weather:4, starter_confirmation:3 },
  pitcher_pitches_thrown: { baseline:35, starter_workload:20, pitch_count_history:16, bullpen_availability:12, rest_pitch_count:9, game_script_market:4, starter_confirmation:4 },
  pitcher_hits_allowed: { baseline:30, pitcher_contact_prevention:17, opponent_contact:14, pitch_mix_split:10, defense_framing:10, market:5, park_weather:10, workload:4 },
  pitcher_earned_runs_allowed: { baseline:30, pitcher_run_prevention:17, opponent_run_quality:14, pitch_mix_split:8, bullpen_inherited_runner_risk:10, market_implied_runs:7, park_weather:10, workload:4 },
  pitcher_walks: { baseline:35, pitcher_control:18, opponent_walk_chase:13, pitch_mix_split:8, umpire:10, catcher_framing:5, workload:6, market:5 },
  rfi_nrfi: { sp_first_inning:24, top_order_matchup:18, team_first_inning:11, market_game_total:12, park_weather:12, umpire:8, opener_bulk_risk:10, source_line_quality:5 },
  fantasy_score_deferred: { baseline:0, model_deferred:100 },
  pitcher_generic: { baseline:35, recent_form:15, matchup:15, market:5, daily_context:15, factor_packet:15 }
};
function directionLayerFromHp(hp, selectedSide) {
  if (hp == null || !Number.isFinite(Number(hp))) return 0;
  const n = Number(hp);
  if (n >= 85) return 3;
  if (n >= 75) return 2;
  if (n >= 60) return 1;
  if (n > 40) return 0;
  if (n > 25) return -1;
  if (n > 15) return -2;
  return -3;
}
function directionLabel(layer) {
  return ({ "3":"extremely_favorable", "2":"strongly_favorable", "1":"moderately_favorable", "0":"neutral", "-1":"moderately_unfavorable", "-2":"strongly_unfavorable", "-3":"extremely_unfavorable" })[String(layer)] || "neutral";
}
function weightPressure(weight, layer) {
  const mult = ({ "3":1, "2":0.66, "1":0.33, "0":0, "-1":-0.33, "-2":-0.66, "-3":-1 })[String(layer)] ?? 0;
  return Math.round(Number(weight || 0) * mult * 100) / 100;
}

function safeParseJsonText(text) {
  if (!text || typeof text !== "string") return {};
  try { return JSON.parse(text); } catch (_) { return {}; }
}
function asNumMaybe(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function deepGetAny(obj, keys) {
  const stack = [obj];
  const keySet = new Set(keys.map(k => String(k).toLowerCase()));
  let guard = 0;
  while (stack.length && guard++ < 3500) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    if (Array.isArray(cur)) { for (const x of cur) stack.push(x); continue; }
    for (const [k, v] of Object.entries(cur)) {
      const lk = String(k).toLowerCase();
      if (keySet.has(lk)) return v;
      if (v && typeof v === "object") stack.push(v);
    }
  }
  return null;
}
function firstText(obj, keys) {
  const v = deepGetAny(obj, keys);
  return v == null ? "" : String(v).toLowerCase();
}
function firstNum(obj, keys) {
  const v = deepGetAny(obj, keys);
  return asNumMaybe(v);
}
function layerFromSignedScore(score) {
  const n = Number(score || 0);
  if (n >= 2.25) return 3;
  if (n >= 1.25) return 2;
  if (n >= 0.35) return 1;
  if (n <= -2.25) return -3;
  if (n <= -1.25) return -2;
  if (n <= -0.35) return -1;
  return 0;
}
function invertLayer(layer) { return -Number(layer || 0); }
function isLessSide(side) { return lowerText(side) === "less" || lowerText(side) === "under"; }
function sideApplyMoreScore(scoreForMore, selectedSide) {
  return isLessSide(selectedSide) ? -Number(scoreForMore || 0) : Number(scoreForMore || 0);
}
function firstMarketObj(packet) {
  const market = packet && packet.market_context ? packet.market_context : {};
  const raw = market.game_market_summary || market.market_game_summary || market.game_summary || null;
  if (Array.isArray(raw)) return raw[0] || {};
  if (raw && typeof raw === "object") return raw;
  if (typeof raw === "string" && raw.trim()) {
    try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? (parsed[0] || {}) : (parsed || {}); } catch (_) {}
  }
  const found = deepGetAny(packet, ["derived_home_implied_runs", "total_consensus_line", "home_ml_consensus"]);
  return found == null ? {} : packet;
}
function marketGameNums(packet) {
  const m = firstMarketObj(packet);
  const total = firstNum(m, ["total_consensus_line", "game_total", "total_line"]);
  const homeImp = firstNum(m, ["derived_home_implied_runs", "home_implied_runs"]);
  const awayImp = firstNum(m, ["derived_away_implied_runs", "away_implied_runs"]);
  const maxImp = Math.max(homeImp == null ? 0 : homeImp, awayImp == null ? 0 : awayImp);
  const minImp = Math.min(homeImp == null ? 99 : homeImp, awayImp == null ? 99 : awayImp);
  return { total, homeImp, awayImp, maxImp: maxImp || null, minImp: minImp === 99 ? null : minImp };
}
function pitcherMetricNums(packet) {
  return {
    era: firstNum(packet, ["era_calculated", "era"]),
    whip: firstNum(packet, ["whip_calculated", "whip"]),
    kRate: firstNum(packet, ["k_rate_calculated", "k_rate"]),
    bbRate: firstNum(packet, ["bb_rate_calculated", "bb_rate"]),
    hrRate: firstNum(packet, ["hr_rate_calculated", "hr_rate"]),
    ipPerApp: firstNum(packet, ["innings_per_appearance_calculated", "ip_per_appearance"]),
    pitchesPerOut: firstNum(packet, ["pitches_per_out_calculated", "pitches_per_out"]),
    strikesPerPitch: firstNum(packet, ["strikes_per_pitch_calculated", "strike_rate"]),
    bf: firstNum(packet, ["batters_faced_sum", "batters_faced"]),
    hitsAllowed: firstNum(packet, ["hits_allowed_sum", "hits_allowed"]),
    walksAllowed: firstNum(packet, ["walks_allowed_sum", "walks_allowed"]),
    earnedRuns: firstNum(packet, ["earned_runs_sum", "earned_runs"]),
    starts: firstNum(packet, ["starts_count", "starts"]),
    apps: firstNum(packet, ["appearances_count", "appearances_count"])
  };
}
function pitcherPacketScore(packet, profileKey, selectedSide) {
  if (!profileKey || !profileKey.startsWith("pitcher")) return 0;
  const m = pitcherMetricNums(packet || {});
  const g = marketGameNums(packet || {});
  let more = 0;
  if (profileKey === "pitcher_strikeout") {
    if (m.kRate != null) { if (m.kRate >= 0.27) more += 1.8; else if (m.kRate >= 0.235) more += 0.9; else if (m.kRate <= 0.18) more -= 1.4; else if (m.kRate <= 0.205) more -= 0.7; }
    if (m.ipPerApp != null) { if (m.ipPerApp >= 5.7) more += 0.6; else if (m.ipPerApp <= 4.6) more -= 0.6; }
    if (m.strikesPerPitch != null) { if (m.strikesPerPitch >= 0.66) more += 0.4; else if (m.strikesPerPitch <= 0.61) more -= 0.4; }
  } else if (profileKey === "pitcher_walks") {
    if (m.bbRate != null) { if (m.bbRate >= 0.10) more += 1.6; else if (m.bbRate >= 0.085) more += 0.8; else if (m.bbRate <= 0.055) more -= 1.2; else if (m.bbRate <= 0.070) more -= 0.6; }
    if (m.strikesPerPitch != null) { if (m.strikesPerPitch <= 0.61) more += 0.5; else if (m.strikesPerPitch >= 0.67) more -= 0.5; }
  } else if (profileKey === "pitcher_hits_allowed") {
    if (m.whip != null) { if (m.whip >= 1.38) more += 1.4; else if (m.whip >= 1.24) more += 0.8; else if (m.whip <= 1.05) more -= 1.0; }
    if (m.ipPerApp != null) { if (m.ipPerApp >= 5.2) more += 0.5; else if (m.ipPerApp <= 4.5) more -= 0.5; }
    if (g.maxImp != null) { if (g.maxImp >= 5.0) more += 0.8; else if (g.maxImp <= 3.8) more -= 0.4; }
  } else if (profileKey === "pitcher_earned_runs_allowed") {
    if (m.era != null) { if (m.era >= 4.70) more += 1.4; else if (m.era >= 4.10) more += 0.8; else if (m.era <= 3.20) more -= 0.9; }
    if (m.whip != null) { if (m.whip >= 1.38) more += 0.8; else if (m.whip <= 1.10) more -= 0.5; }
    if (m.hrRate != null) { if (m.hrRate >= 0.040) more += 0.7; else if (m.hrRate <= 0.012) more -= 0.3; }
    if (g.maxImp != null) { if (g.maxImp >= 5.0) more += 1.0; else if (g.maxImp <= 3.8) more -= 0.4; }
  } else if (profileKey === "pitcher_outs") {
    if (m.ipPerApp != null) { if (m.ipPerApp >= 5.8) more += 1.5; else if (m.ipPerApp >= 5.3) more += 0.7; else if (m.ipPerApp <= 5.0) more -= 0.9; }
    if (m.pitchesPerOut != null) { if (m.pitchesPerOut >= 5.55) more -= 0.9; else if (m.pitchesPerOut <= 5.0) more += 0.6; }
    if (m.whip != null) { if (m.whip >= 1.40) more -= 0.8; else if (m.whip <= 1.10) more += 0.5; }
    if (g.total != null) { if (g.total >= 9.5) more -= 0.5; else if (g.total <= 7.5) more += 0.3; }
  }
  return sideApplyMoreScore(more, selectedSide);
}
function pitcherMarketScore(packet, profileKey, selectedSide) {
  if (!profileKey || !profileKey.startsWith("pitcher")) return 0;
  const g = marketGameNums(packet || {});
  let more = 0;
  if (profileKey === "pitcher_outs") {
    if (g.total != null) { if (g.total >= 9.5) more -= 0.6; else if (g.total <= 7.5) more += 0.4; }
  } else if (profileKey === "pitcher_hits_allowed" || profileKey === "pitcher_earned_runs_allowed" || profileKey === "pitcher_walks") {
    if (g.maxImp != null) { if (g.maxImp >= 5.0) more += 0.8; else if (g.maxImp <= 3.8) more -= 0.4; }
    if (g.total != null) { if (g.total >= 9.5) more += 0.4; else if (g.total <= 7.5) more -= 0.3; }
  } else if (profileKey === "pitcher_strikeout") {
    if (g.total != null) { if (g.total >= 9.5) more -= 0.4; else if (g.total <= 7.5) more += 0.3; }
  }
  return sideApplyMoreScore(more, selectedSide);
}

function getBoardLineValue(packet) {
  return firstNum(packet, ["line_value", "board_line_value", "projection_line", "line"]);
}
function arrayFromMaybe(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === "string") { try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : []; } catch (_) { return []; } }
  return [];
}
function firstObjectByWindow(rows, needles) {
  const arr = arrayFromMaybe(rows);
  for (const n of needles) {
    const needle = lowerText(n);
    const found = arr.find(r => lowerText(r && (r.metric_window || r.window || r.split_key || r.split_code || r.split_description)).includes(needle));
    if (found) return found;
  }
  return null;
}
function hitterMetricBase(packet) {
  const bm = packet && packet.base_metrics ? packet.base_metrics : {};
  return bm.season_summary || bm.legacy_summary_table_row || firstObjectByWindow(bm.snapshots, ["season", "std", "current"]) || {};
}
function numFromObj(obj, keys) {
  for (const k of keys) {
    const v = obj && Object.prototype.hasOwnProperty.call(obj, k) ? obj[k] : null;
    const n = asNumMaybe(v);
    if (n != null) return n;
  }
  return firstNum(obj, keys);
}
function hitterRateForProp(obj, prop) {
  const games = numFromObj(obj, ["games_count", "games_logged", "games"]);
  const pa = numFromObj(obj, ["pa_sum", "total_pa", "pa"]);
  const ab = numFromObj(obj, ["ab_sum", "total_ab", "ab"]);
  const denomGame = games && games > 0 ? games : null;
  const perGame = (keys) => {
    const v = numFromObj(obj, keys);
    return (v != null && denomGame) ? v / denomGame : null;
  };
  const perPa = (keys) => {
    const v = numFromObj(obj, keys);
    return (v != null && pa && pa > 0) ? v / pa : null;
  };
  const p = lowerText(prop);
  if (p === "hits") return perGame(["hits_sum", "total_hits", "hits"]);
  if (p === "singles") return perGame(["singles_sum", "total_singles", "singles"]);
  if (p === "doubles") return perGame(["doubles_sum", "total_doubles", "doubles"]);
  if (p === "triples") return perGame(["triples_sum", "total_triples", "triples"]);
  if (p === "home_runs") return perGame(["home_runs_sum", "total_home_runs", "home_runs"]);
  if (p === "walks") return perGame(["walks_sum", "total_walks", "walks"]);
  if (p === "hitter_strikeouts") return perGame(["strikeouts_sum", "total_strikeouts", "strikeouts"]);
  if (p === "runs") return perGame(["runs_sum", "total_runs", "runs"]);
  if (p === "rbis") return perGame(["rbi_sum", "total_rbi", "rbis", "rbi"]);
  if (p === "stolen_bases") return perGame(["stolen_bases_sum", "total_stolen_bases", "stolen_bases"]);
  if (p === "total_bases") return perGame(["total_bases_derived_sum", "total_bases", "tb"]);
  if (p === "hits_runs_rbis") {
    const h = perGame(["hits_sum", "total_hits", "hits"]);
    const r = perGame(["runs_sum", "total_runs", "runs"]);
    const bi = perGame(["rbi_sum", "total_rbi", "rbis", "rbi"]);
    return [h,r,bi].some(x => x != null) ? (Number(h||0)+Number(r||0)+Number(bi||0)) : null;
  }
  const generic = perPa(["hits_sum", "total_hits", "hits"]);
  if (generic != null && pa && ab) return generic * (pa / Math.max(1, games || 1));
  return null;
}
function lineDifficultyScore(mean, line) {
  if (mean == null || line == null) return 0;
  const m = Number(mean), l = Number(line);
  if (!Number.isFinite(m) || !Number.isFinite(l)) return 0;
  const scale = Math.max(0.45, Math.sqrt(Math.max(0.15, l + 0.35)));
  const z = (m - l) / scale;
  if (z >= 0.85) return 2.0;
  if (z >= 0.35) return 1.0;
  if (z <= -0.85) return -2.0;
  if (z <= -0.35) return -1.0;
  return 0;
}
function recentTrendScore(packet, prop) {
  const bm = packet && packet.base_metrics ? packet.base_metrics : {};
  const base = hitterMetricBase(packet);
  const baseRate = hitterRateForProp(base, prop);
  const recent = firstObjectByWindow(bm.snapshots, ["last10", "l10", "recent10", "last_10", "10"])
              || firstObjectByWindow(bm.snapshots, ["last5", "l5", "recent5", "last_5", "5"]);
  const recentRate = hitterRateForProp(recent, prop);
  if (baseRate == null || recentRate == null || baseRate <= 0) return 0;
  const ratio = recentRate / baseRate;
  if (ratio >= 1.35) return 1.2;
  if (ratio >= 1.15) return 0.6;
  if (ratio <= 0.65) return -1.2;
  if (ratio <= 0.85) return -0.6;
  return 0;
}
function splitFitScore(packet, prop) {
  const daily = packet && packet.daily_context ? packet.daily_context : {};
  const starterHand = firstText(daily, ["starter_hand", "pitcher_hand", "opposing_starter_hand"]);
  const splits = arrayFromMaybe(packet && packet.base_metrics && packet.base_metrics.splits);
  if (!splits.length || !starterHand) return 0;
  const wantsLeft = starterHand.startsWith("l");
  const split = splits.find(r => {
    const txt = lowerText(`${r.split_key||""} ${r.split_code||""} ${r.split_description||""}`);
    return wantsLeft ? (txt.includes("lhp") || txt.includes("left") || txt.includes("vs_l")) : (txt.includes("rhp") || txt.includes("right") || txt.includes("vs_r"));
  });
  if (!split) return 0;
  const splitRate = hitterRateForProp(split, prop);
  const baseRate = hitterRateForProp(hitterMetricBase(packet), prop);
  if (splitRate == null || baseRate == null || baseRate <= 0) return 0;
  const ratio = splitRate / baseRate;
  if (ratio >= 1.30) return 1.0;
  if (ratio >= 1.12) return 0.5;
  if (ratio <= 0.70) return -1.0;
  if (ratio <= 0.88) return -0.5;
  return 0;
}
function parseParkNotesNum(text, label) {
  const t = String(text || "");
  const re = new RegExp(label + "\\s+(\\d+(?:\\.\\d+)?)", "i");
  const m = t.match(re);
  return m ? asNumMaybe(m[1]) : null;
}
function hitterDailyContextScore(packet, profileKey) {
  const daily = packet && packet.daily_context ? packet.daily_context : {};
  const readiness = daily.readiness || {};
  const weather = daily.weather || {};
  const teamBp = daily.team_bullpen || {};
  const oppBp = daily.opponent_bullpen || {};
  const teamSched = daily.team_schedule || {};
  const oppSched = daily.opponent_schedule || {};
  let score = 0;
  const avail = firstText(daily, ["availability_status", "player_availability_status", "roster_status"]);
  if (avail.includes("unavailable") || avail.includes("injured") || avail.includes("inactive")) score -= 3;
  const lineupSlot = firstNum(daily, ["lineup_slot", "batting_order", "batting_order_slot"]);
  if (lineupSlot != null) {
    if (profileKey === "hitter_run_rbi") { if (lineupSlot <= 4) score += 1.2; else if (lineupSlot >= 8) score -= 1.0; else if (lineupSlot >= 6) score -= 0.4; }
    else if (profileKey === "hitter_contact" || profileKey === "hitter_power" || profileKey === "hitter_walk_obp" || profileKey === "hitter_strikeout") { if (lineupSlot <= 3) score += 0.7; else if (lineupSlot >= 8) score -= 0.8; }
    else if (profileKey.startsWith("stolen")) { if (lineupSlot <= 2) score += 0.7; else if (lineupSlot >= 8) score -= 0.5; }
  }
  const temp = firstNum(weather, ["temperature_f"]);
  if ((profileKey === "hitter_power" || profileKey === "hitter_run_rbi" || profileKey === "hitter_contact") && temp != null) {
    if (temp >= 82) score += 0.6; else if (temp >= 76) score += 0.3; else if (temp <= 50) score -= 0.5;
  }
  const parkNotes = firstText(weather, ["park_weather_notes"]);
  const runPf = parseParkNotesNum(parkNotes, "run");
  const hrPf = parseParkNotesNum(parkNotes, "hr");
  if (profileKey === "hitter_power" && hrPf != null) { if (hrPf >= 110) score += 1.1; else if (hrPf >= 104) score += 0.5; else if (hrPf <= 90) score -= 1.1; else if (hrPf <= 96) score -= 0.5; }
  if ((profileKey === "hitter_contact" || profileKey === "hitter_run_rbi") && runPf != null) { if (runPf >= 106) score += 0.7; else if (runPf <= 94) score -= 0.7; }
  const rain = firstNum(weather, ["rain_risk_flag"]);
  const delay = firstNum(weather, ["delay_risk_flag"]);
  if (rain === 1 || delay === 1) score -= 0.4;
  const bpText = `${firstText(readiness, ["bullpen_context_status"])} ${firstText(oppBp, ["bullpen_context_status", "availability_grade", "bullpen_risk_level", "fatigue_status"])} ${firstText(teamBp, ["bullpen_context_status", "availability_grade", "bullpen_risk_level", "fatigue_status"])}`;
  if ((profileKey === "hitter_power" || profileKey === "hitter_run_rbi" || profileKey === "hitter_contact" || profileKey === "hitter_walk_obp") && (bpText.includes("taxed") || bpText.includes("fatigue") || bpText.includes("thin") || bpText.includes("high"))) score += 0.6;
  const schedText = `${firstText(readiness, ["schedule_spot_context_status"])} ${JSON.stringify(teamSched||{})} ${JSON.stringify(oppSched||{})}`.toLowerCase();
  if (schedText.includes("travel_risk") || schedText.includes("three_in_four") || schedText.includes("four_in_six")) score -= 0.3;
  return score;
}
function hitterPacketScore(packet, profileKey, selectedSide) {
  if (!(profileKey && (profileKey.startsWith("hitter") || profileKey.startsWith("stolen")))) return 0;
  const prop = lowerText(packet && (packet.canonical_prop_key || (packet.board_context && packet.board_context.canonical_prop_key)) || "");
  const line = getBoardLineValue(packet);
  let more = 0;
  const base = hitterMetricBase(packet);
  const mean = hitterRateForProp(base, prop);
  more += lineDifficultyScore(mean, line);
  more += recentTrendScore(packet, prop);
  more += splitFitScore(packet, prop);
  more += hitterDailyContextScore(packet, profileKey);
  const g = marketGameNums(packet || {});
  if (profileKey === "hitter_run_rbi" && g.maxImp != null) { if (g.maxImp >= 5.0) more += 0.5; else if (g.maxImp <= 3.7) more -= 0.4; }
  if ((profileKey === "hitter_power" || profileKey === "hitter_contact") && g.total != null) { if (g.total >= 9.5) more += 0.4; else if (g.total <= 7.5) more -= 0.3; }
  return sideApplyMoreScore(clampNum(more, -3, 3), selectedSide);
}
function profileDirectionalWeight(weights, keys, fallback) {
  let total = 0;
  for (const k of keys) total += Number(weights[k] || 0);
  return total || fallback || 0;
}
function marketLayerFromPayload(packet, profileKey, selectedSide) {
  const market = packet.market_context || {};
  const evidence = Array.isArray(market.player_prop_evidence) ? market.player_prop_evidence : [];
  const side = lowerText(selectedSide);
  let sameSidePrices = [];
  for (const e of evidence) {
    const os = lowerText(e.outcome_side || e.side || e.market_side);
    const pa = asNumMaybe(e.price_american);
    if (pa != null && (!os || os === side || (side === "more" && os === "over") || (side === "less" && os === "under"))) sameSidePrices.push(pa);
  }
  if (!sameSidePrices.length) return layerFromSignedScore(pitcherMarketScore(packet, profileKey, selectedSide));
  const avg = sameSidePrices.reduce((a,b)=>a+b,0) / sameSidePrices.length;
  // Negative American prices imply market support for that side. Keep this conservative.
  if (avg <= -170) return 2;
  if (avg <= -125) return 1;
  if (avg >= 170) return -2;
  if (avg >= 125) return -1;
  return 0;
}
function dailyLayerFromPayload(packet, profileKey, selectedSide) {
  const daily = packet.daily_context || {};
  let score = 0;
  if (profileKey.startsWith("hitter") || profileKey.startsWith("stolen")) {
    score += hitterDailyContextScore(packet, profileKey);
  } else if (profileKey.startsWith("pitcher")) {
    const starterStatus = firstText(daily, ["starter_status", "starter_context_status", "source_status"]);
    const openerFlag = firstNum(daily, ["opener_flag"]);
    const bulkFlag = firstNum(daily, ["bulk_pitcher_flag"]);
    const windContext = firstText(daily, ["wind_context", "park_weather_notes", "wind_direction_cardinal"]);
    const bullpenRisk = firstText(daily, ["bullpen_risk_level", "availability_grade", "bullpen_status", "bullpen_context_status", "fatigue_status"]);
    if (starterStatus.includes("confirmed") || starterStatus.includes("probable")) score += 0.6;
    if (openerFlag === 1 || bulkFlag === 1) score -= (profileKey === "pitcher_outs" ? 2.0 : 0.7);
    if (profileKey === "pitcher_outs" && (bullpenRisk.includes("high") || bullpenRisk.includes("fatigue") || bullpenRisk.includes("taxed"))) score += 0.5;
    if (profileKey === "pitcher_pitches_thrown") {
      if (starterStatus.includes("confirmed") || starterStatus.includes("probable")) score += 0.7;
      if (bullpenRisk.includes("high") || bullpenRisk.includes("fatigue") || bullpenRisk.includes("severe") || bullpenRisk.includes("taxed")) score += 0.4;
      if (openerFlag === 1 || bulkFlag === 1) score -= 2.4;
    }
    if ((profileKey === "pitcher_hits_allowed" || profileKey === "pitcher_earned_runs_allowed") && (windContext.includes("out") || windContext.includes("boost") || windContext.includes("carry"))) score += isLessSide(selectedSide) ? -0.8 : 0.8;
  }
  let layer = layerFromSignedScore(score);
  if (isLessSide(selectedSide) && (profileKey.startsWith("hitter") || profileKey.startsWith("stolen"))) layer = invertLayer(layer);
  return layer;
}
function packetLayerFromPayload(packet, profileKey, selectedSide) {
  const missing = Array.isArray(packet.missing_factors) ? packet.missing_factors.length : 0;
  const warnings = Array.isArray(packet.warning_flags) ? packet.warning_flags.length : 0;
  const factorStatus = lowerText(packet.factor_status || packet.factor_grade || "");
  let score = 0;
  if (factorStatus.includes("ready")) score += 0.4;
  // Missing data is confidence drag elsewhere; keep HP pressure milder than true negative evidence.
  if (missing >= 3) score -= 0.4;
  else if (missing > 0) score -= 0.15;
  if (warnings >= 6) score -= 0.25;
  if (profileKey.startsWith("hitter") || profileKey.startsWith("stolen")) score += hitterPacketScore(packet, profileKey, selectedSide);
  else score += pitcherPacketScore(packet, profileKey, selectedSide);
  let layer = layerFromSignedScore(clampNum(score, -3, 3));
  if (isLessSide(selectedSide) && (profileKey.startsWith("hitter") || profileKey.startsWith("stolen"))) layer = invertLayer(layer);
  return layer;
}
function contextLayerWeight(profileKey, weights, layerKey) {
  // These are context-pressure weights, not full profile weights. Keep them conservative so HP V2 can apply calibrated damping.
  if (layerKey === "factor_packet") {
    if (profileKey === "hitter_contact") return 8;
    if (profileKey === "hitter_power") return 10;
    if (profileKey === "hitter_run_rbi") return 10;
    if (profileKey === "hitter_strikeout") return 10;
    if (profileKey === "hitter_walk_obp") return 8;
    if (profileKey.startsWith("stolen")) return 10;
    if (profileKey.startsWith("pitcher")) return 12;
    return 8;
  }
  if (layerKey === "daily_context") {
    if (profileKey === "hitter_plate_appearances") return 10;
    if (profileKey === "pitcher_pitches_thrown") return 9;
    if (profileKey === "hitter_run_rbi" || profileKey === "stolen_base_attempt" || profileKey === "pitcher_outs") return 8;
    if (profileKey.startsWith("pitcher")) return 7;
    if (profileKey === "hitter_power") return 7;
    return 6;
  }
  if (layerKey === "market_context") return Math.min(Number(weights.market || weights.market_game_total || weights.source_line_quality || weights.market_implied_runs || 0), 7);
  if (layerKey === "matrix_quality") return 0;
  return 0;
}
function layerObj(factor_key, weight, layer, quality, sourceClass, extra = {}) {
  return { factor_key, profile_weight: weight, hp_direction_layer: layer, hp_direction_label: directionLabel(layer), hp_weight_pressure: weightPressure(weight, layer), confidence_quality_multiplier: quality, data_source_class: sourceClass, missing: quality === 0, ...extra };
}
function qualityForStatus(status, grade) {
  const s = lowerText(status); const g = lowerText(grade);
  if (s.includes("ready") || g === "ready") return 1.0;
  if (s.includes("partial") || g.includes("warning")) return 0.65;
  if (s.includes("missing") || s.includes("not_found") || s.includes("blocked")) return 0.0;
  return 0.75;
}
function confidenceCapForRow(row, baselineAvailable) {
  if (Number(row.blocking_for_scoring || 0) === 1 || Number(row.blocker_count || 0) > 0) return 0;
  if (!baselineAvailable) return 40;
  let cap = 100;
  const daily = lowerText(row.daily_readiness_status);
  const factor = lowerText(row.factor_status);
  const marketProp = lowerText(row.market_prop_context_status);
  if (!daily || daily.includes("missing") || daily.includes("not_found")) cap = Math.min(cap, 60);
  if (daily.includes("partial")) cap = Math.min(cap, 85);
  if (!factor || factor.includes("missing") || factor.includes("not_found")) cap = Math.min(cap, 65);
  if (marketProp.includes("not_found") || marketProp.includes("missing")) {
    cap = Math.min(cap, lowerText(row.factor_family).includes("pitcher") ? 72 : 75);
  }
  return cap;
}
function enrichmentStatus(row, baselineAvailable) {
  if (Number(row.blocking_for_scoring || 0) === 1 || Number(row.blocker_count || 0) > 0) return "enrichment_blocked";
  if (!baselineAvailable) return "baseline_missing";
  if (Number(row.warning_count || 0) > 0 || lowerText(row.matrix_status).includes("partial") || lowerText(row.factor_status).includes("partial") || lowerText(row.daily_readiness_status).includes("partial")) return "enrichment_ready_with_warnings";
  return "enrichment_ready";
}
function enrichmentGrade(status) {
  if (status === "enrichment_ready") return "READY";
  if (status === "enrichment_ready_with_warnings") return "READY_WITH_WARNINGS";
  if (status === "baseline_missing") return "DEFERRED_BASELINE_MISSING";
  if (status === "enrichment_blocked") return "BLOCKED";
  return "REVIEW";
}
async function ensureScoreEnrichmentV1Schema(env) {
  await run(env.SCORE_DB, `CREATE TABLE IF NOT EXISTS score_enrichment_batches (
    batch_id TEXT PRIMARY KEY,
    request_id TEXT,
    run_id TEXT,
    worker_name TEXT,
    worker_version TEXT,
    mode TEXT,
    status TEXT,
    source_matrix_batch_id TEXT,
    matrix_rows_read INTEGER DEFAULT 0,
    expected_enrichment_rows INTEGER DEFAULT 0,
    enrichment_rows_written INTEGER DEFAULT 0,
    baseline_matched_rows INTEGER DEFAULT 0,
    baseline_missing_rows INTEGER DEFAULT 0,
    blocked_rows INTEGER DEFAULT 0,
    warning_rows INTEGER DEFAULT 0,
    certification_status TEXT,
    certification_grade TEXT,
    output_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.SCORE_DB, `CREATE TABLE IF NOT EXISTS score_enrichment_current (
    enrichment_row_id TEXT PRIMARY KEY,
    batch_id TEXT,
    matrix_id TEXT,
    prepared_row_id TEXT,
    source_line_id TEXT,
    source_key TEXT,
    game_pk INTEGER,
    official_date TEXT,
    official_game_time_utc TEXT,
    mlb_player_id INTEGER,
    player_name TEXT,
    team_id TEXT,
    opponent_team_id TEXT,
    canonical_prop_key TEXT,
    board_line_value REAL,
    selected_side TEXT,
    factor_family TEXT,
    factor_packet_id TEXT,
    profile_key TEXT,
    baseline_hp_row_id TEXT,
    baseline_hp_available INTEGER DEFAULT 0,
    baseline_hp_0_100 REAL,
    baseline_confidence_raw_0_100 REAL,
    baseline_confidence_v2_0_60 REAL,
    baseline_sample_size INTEGER,
    baseline_hit_count INTEGER,
    baseline_miss_count INTEGER,
    profile_weight_json TEXT,
    factor_layer_json TEXT,
    factor_hp_pressure REAL DEFAULT 0,
    enrichment_confidence_add_available_0_40 REAL DEFAULT 0,
    confidence_cap_0_100 REAL DEFAULT 100,
    data_quality_score_0_100 REAL DEFAULT 0,
    enrichment_status TEXT,
    enrichment_grade TEXT,
    matrix_status TEXT,
    matrix_grade TEXT,
    factor_status TEXT,
    factor_grade TEXT,
    market_game_context_status TEXT,
    market_prop_context_status TEXT,
    daily_readiness_status TEXT,
    blocking_for_scoring INTEGER DEFAULT 0,
    warning_count INTEGER DEFAULT 0,
    blocker_count INTEGER DEFAULT 0,
    missing_component_count INTEGER DEFAULT 0,
    baseline_missing INTEGER DEFAULT 0,
    hp_v2_ready INTEGER DEFAULT 0,
    final_score_ready INTEGER DEFAULT 0,
    enrichment_payload_json TEXT,
    matrix_payload_json_snapshot TEXT,
    details_json_snapshot TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.SCORE_DB, `CREATE TABLE IF NOT EXISTS score_enrichment_issues (
    issue_id TEXT PRIMARY KEY,
    batch_id TEXT,
    enrichment_row_id TEXT,
    prepared_row_id TEXT,
    severity TEXT,
    issue_code TEXT,
    issue_message TEXT,
    details_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.SCORE_DB, `CREATE INDEX IF NOT EXISTS idx_score_enrichment_current_batch ON score_enrichment_current(batch_id)`);
  await run(env.SCORE_DB, `CREATE INDEX IF NOT EXISTS idx_score_enrichment_current_prepared ON score_enrichment_current(prepared_row_id)`);
  await run(env.SCORE_DB, `CREATE INDEX IF NOT EXISTS idx_score_enrichment_current_profile ON score_enrichment_current(profile_key, selected_side)`);
}
async function latestMatrixBatchIdForEnrichment(env) {
  const row = await first(env.SCORE_DB, `SELECT batch_id, COUNT(*) AS rows FROM prop_matrix_current GROUP BY batch_id ORDER BY COUNT(*) DESC LIMIT 1`);
  return row && row.batch_id ? String(row.batch_id) : null;
}
async function runScoreEnrichmentV1(env, input = {}) {
  const started = Date.now();
  await ensureScoreEnrichmentV1Schema(env);
  const requestId = input.request_id || `score_enrichment_v1_${Date.now().toString(36)}`;
  const runId = input.run_id || null;
  const chainId = input.chain_id || null;
  const nestedInput = (input && input.input_json && typeof input.input_json === "object") ? input.input_json : {};
  const requestedBatchId = input.batch_id || input.enrichment_batch_id || input.resume_batch_id || nestedInput.batch_id || nestedInput.enrichment_batch_id || nestedInput.resume_batch_id || null;
  const batchId = requestedBatchId || `score_enrichment_batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
  const sourceMatrixBatchId = input.source_matrix_batch_id || nestedInput.source_matrix_batch_id || await latestMatrixBatchIdForEnrichment(env);
  if (!sourceMatrixBatchId) throw new Error("No prop_matrix_current batch found for Enrichment V1");
  let offset = Number(input.enrichment_offset ?? input.offset ?? nestedInput.enrichment_offset ?? nestedInput.offset ?? 0) || 0;
  const limit = Math.max(50, Math.min(Number(input.chunk_rows || nestedInput.chunk_rows || ENRICHMENT_V1_CHUNK_ROWS), 750));
  let resumeMismatchReset = false;

  const totalRow = await first(env.SCORE_DB, `WITH matrix_rows AS (
    SELECT m.*,
      CASE
        WHEN lower(COALESCE(m.source_key,''))='prizepicks'
         AND (
           lower(COALESCE(json_extract(m.matrix_payload_json,'$.prepared.payout_variant'),'')) IN ('goblin','demon')
           OR lower(COALESCE(json_extract(m.matrix_payload_json,'$.prepared.odds_type'),'')) IN ('goblin','demon')
           OR COALESCE(json_extract(m.matrix_payload_json,'$.prepared.is_goblin'),0)=1
           OR COALESCE(json_extract(m.matrix_payload_json,'$.prepared.is_demon'),0)=1
           OR m.source_line_id LIKE '%|goblin|%'
           OR m.source_line_id LIKE '%|demon|%'
         )
        THEN 1 ELSE 0
      END AS prizepicks_variant_more_only
    FROM prop_matrix_current m
    WHERE m.batch_id=?
  ), side_expanded AS (
    SELECT matrix_id FROM matrix_rows
    UNION ALL
    SELECT matrix_id FROM matrix_rows WHERE (prop_side IS NULL OR prop_side='') AND prizepicks_variant_more_only=0
  ) SELECT COUNT(*) AS rows FROM side_expanded`, sourceMatrixBatchId);
  const expectedRows = Number(totalRow && totalRow.rows || 0);
  await run(env.SCORE_DB, `INSERT OR IGNORE INTO score_enrichment_batches (batch_id, request_id, run_id, worker_name, worker_version, mode, status, source_matrix_batch_id, expected_enrichment_rows, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, batchId, requestId, runId, WORKER_NAME, ENRICHMENT_V1_VERSION, ENRICHMENT_V1_MODE, sourceMatrixBatchId, expectedRows);
  let versionReset = false;
  const batchVersionRow = await first(env.SCORE_DB, `SELECT worker_version FROM score_enrichment_batches WHERE batch_id=?`, batchId);
  if (batchVersionRow && batchVersionRow.worker_version && String(batchVersionRow.worker_version) !== ENRICHMENT_V1_VERSION) {
    versionReset = true;
    resumeMismatchReset = true;
    offset = 0;
  }
  const mixedCurrentRows = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM score_enrichment_current WHERE batch_id IN (SELECT batch_id FROM score_enrichment_batches WHERE source_matrix_batch_id=?) AND batch_id<>?`, sourceMatrixBatchId, batchId);
  if (Number(mixedCurrentRows && mixedCurrentRows.rows || 0) > 0) {
    versionReset = true;
    resumeMismatchReset = true;
    offset = 0;
  }
  if (versionReset) {
    const sameMatrixBatches = await all(env.SCORE_DB, `SELECT batch_id FROM score_enrichment_batches WHERE source_matrix_batch_id=?`, sourceMatrixBatchId);
    for (const b of sameMatrixBatches) {
      await run(env.SCORE_DB, `DELETE FROM score_enrichment_current WHERE batch_id=?`, b.batch_id);
      await run(env.SCORE_DB, `DELETE FROM score_enrichment_issues WHERE batch_id=?`, b.batch_id);
      if (b.batch_id !== batchId) {
        await run(env.SCORE_DB, `UPDATE score_enrichment_batches SET status='cancelled_version_superseded', certification_status='SCORE_ENRICHMENT_V1_CANCELLED_VERSION_SUPERSEDED', certification_grade='CANCELLED', updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, b.batch_id);
      }
    }
    await run(env.SCORE_DB, `UPDATE score_enrichment_batches SET status='running_version_reset', worker_version=?, certification_status='SCORE_ENRICHMENT_V1_VERSION_RESET_CLEAN_CONTEXT', certification_grade='RESET', updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, ENRICHMENT_V1_VERSION, batchId);
  }
  if (requestedBatchId && offset > 0) {
    const existingForBatch = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM score_enrichment_current WHERE batch_id=?`, batchId);
    const existingRows = Number(existingForBatch && existingForBatch.rows || 0);
    if (existingRows + 5 < offset) {
      resumeMismatchReset = true;
      offset = 0;
      const priorBatches = await all(env.SCORE_DB, `SELECT batch_id FROM score_enrichment_batches WHERE request_id=?`, requestId);
      for (const b of priorBatches) {
        await run(env.SCORE_DB, `DELETE FROM score_enrichment_current WHERE batch_id=?`, b.batch_id);
        await run(env.SCORE_DB, `DELETE FROM score_enrichment_issues WHERE batch_id=?`, b.batch_id);
        if (b.batch_id !== batchId) {
          await run(env.SCORE_DB, `UPDATE score_enrichment_batches SET status='cancelled_resume_mismatch_reset', certification_status='SCORE_ENRICHMENT_V1_CANCELLED_RESUME_MISMATCH_RESET', certification_grade='CANCELLED', updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, b.batch_id);
        }
      }
    }
  }
  if (offset === 0) {
    await run(env.SCORE_DB, `DELETE FROM score_enrichment_current WHERE batch_id=?`, batchId);
    await run(env.SCORE_DB, `DELETE FROM score_enrichment_issues WHERE batch_id=?`, batchId);
  }
  await run(env.SCORE_DB, `UPDATE score_enrichment_batches SET status='running', run_id=?, worker_version=?, expected_enrichment_rows=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, runId, ENRICHMENT_V1_VERSION, expectedRows, batchId);

  const rows = await all(env.SCORE_DB, `WITH matrix_rows AS (
    SELECT m.*,
      CASE
        WHEN lower(COALESCE(m.source_key,''))='prizepicks'
         AND (
           lower(COALESCE(json_extract(m.matrix_payload_json,'$.prepared.payout_variant'),'')) IN ('goblin','demon')
           OR lower(COALESCE(json_extract(m.matrix_payload_json,'$.prepared.odds_type'),'')) IN ('goblin','demon')
           OR COALESCE(json_extract(m.matrix_payload_json,'$.prepared.is_goblin'),0)=1
           OR COALESCE(json_extract(m.matrix_payload_json,'$.prepared.is_demon'),0)=1
           OR m.source_line_id LIKE '%|goblin|%'
           OR m.source_line_id LIKE '%|demon|%'
         )
        THEN 1 ELSE 0
      END AS prizepicks_variant_more_only
    FROM prop_matrix_current m
    WHERE m.batch_id=?
  ), side_expanded AS (
    SELECT m.*, CASE WHEN m.prop_side IS NULL OR m.prop_side='' THEN 'more' ELSE lower(m.prop_side) END AS selected_side
    FROM matrix_rows m
    UNION ALL
    SELECT m.*, 'less' AS selected_side
    FROM matrix_rows m
    WHERE (m.prop_side IS NULL OR m.prop_side='')
      AND m.prizepicks_variant_more_only=0
  )
  SELECT s.matrix_id, s.batch_id AS matrix_batch_id, s.prepared_row_id, s.source_line_id, s.source_key, s.game_pk,
         s.official_date, s.official_game_time_utc, s.mlb_player_id, s.player_name, s.team_id, s.opponent_team_id,
         s.canonical_prop_key, s.board_line_value, s.selected_side, s.factor_family, s.factor_packet_id, s.factor_status,
         s.market_game_context_status, s.market_prop_context_status, s.daily_readiness_status, s.matrix_status,
         s.matrix_grade, s.blocking_for_scoring, s.warning_count, s.blocker_count, s.missing_component_count,
         s.matrix_payload_json, s.details_json,
         COALESCE(hpv2.baseline_hp_row_id, hp.baseline_hp_row_id) AS baseline_hp_row_id,
         COALESCE(hpv2.baseline_hp_0_100, hp.baseline_hp_0_100) AS baseline_hp_0_100,
         COALESCE(hpv2.baseline_confidence_0_100, hp.baseline_confidence_0_100) AS baseline_confidence_0_100,
         COALESCE(hpv2.non_push_sample, hp.non_push_sample) AS non_push_sample,
         COALESCE(hpv2.hit_count, hp.hit_count) AS hit_count,
         COALESCE(hpv2.miss_count, hp.miss_count) AS miss_count,
         COALESCE(hpv2.sample_profile, hp.sample_profile) AS sample_profile,
         COALESCE(hpv2.role_profile, hp.role_profile) AS role_profile,
         COALESCE(hpv2.volatility_profile, hp.volatility_profile) AS volatility_profile,
         COALESCE(hpv2.variance_profile, hp.variance_profile) AS variance_profile,
         COALESCE(hpv2.line_difficulty_profile, hp.line_difficulty_profile) AS line_difficulty_profile,
         CASE WHEN hpv2.baseline_hp_row_id IS NOT NULL THEN 'player_baseline_hp_v2_current' WHEN hp.baseline_hp_row_id IS NOT NULL THEN 'player_baseline_hp_current' ELSE 'missing' END AS baseline_source_mode,
         COALESCE(h.factor_grade, p.factor_grade) AS factor_grade,
         COALESCE(h.factor_payload_json, p.factor_payload_json) AS factor_payload_json,
         COALESCE(h.details_json, p.details_json) AS factor_details_json
  FROM side_expanded s
  LEFT JOIN player_baseline_hp_v2_current hpv2
    ON hpv2.player_id=s.mlb_player_id AND hpv2.canonical_prop_key=s.canonical_prop_key AND hpv2.line_value=s.board_line_value AND lower(hpv2.selected_side)=s.selected_side
  LEFT JOIN player_baseline_hp_current hp
    ON hp.player_id=s.mlb_player_id AND hp.canonical_prop_key=s.canonical_prop_key AND hp.line_value=s.board_line_value AND lower(hp.selected_side)=s.selected_side
  LEFT JOIN prop_factor_hitter_packets h ON h.packet_id=s.factor_packet_id
  LEFT JOIN prop_factor_pitcher_packets p ON p.packet_id=s.factor_packet_id
  ORDER BY s.matrix_id, s.selected_side
  LIMIT ? OFFSET ?`, sourceMatrixBatchId, limit, offset);

  let written = 0, baselineMatched = 0, baselineMissing = 0, blocked = 0, warnings = 0, issues = 0;
  const currentStatements = [];
  const issueStatements = [];
  const flushD1Batch = async (stmts, size = 50) => {
    for (let i = 0; i < stmts.length; i += size) {
      await env.SCORE_DB.batch(stmts.slice(i, i + size));
    }
  };
  for (const row of rows) {
    const baselineAvailable = !!row.baseline_hp_row_id;
    if (baselineAvailable) baselineMatched++; else baselineMissing++;
    if (Number(row.blocking_for_scoring || 0) === 1 || Number(row.blocker_count || 0) > 0) blocked++;
    if (Number(row.warning_count || 0) > 0 || !baselineAvailable) warnings++;
    const profileKey = enrichmentProfileFor(row.canonical_prop_key, row.factor_family);
    const weights = ENRICHMENT_PROFILE_WEIGHTS[profileKey] || ENRICHMENT_PROFILE_WEIGHTS.hitter_contact;
    const baselineHp = baselineAvailable ? Number(row.baseline_hp_0_100) : null;
    const baselineConfRaw = baselineAvailable ? Number(row.baseline_confidence_0_100 || 0) : 0;
    const baselineConfV2 = baselineAvailable ? Math.round(clampNum(baselineConfRaw * 0.60, 0, 60) * 10) / 10 : 0;
    const baselineLayer = directionLayerFromHp(baselineHp, row.selected_side);
    const factorQuality = qualityForStatus(row.factor_status, row.factor_grade);
    const dailyQuality = lowerText(row.daily_readiness_status).includes("partial") ? 0.5 : (lowerText(row.daily_readiness_status).includes("ready") ? 1 : 0.35);
    const marketQuality = lowerText(row.market_prop_context_status).includes("present") ? 1 : (lowerText(row.market_game_context_status).includes("present") ? 0.55 : 0);
    const matrixQuality = Number(row.blocking_for_scoring || 0) === 1 ? 0 : (Number(row.warning_count || 0) > 0 ? 0.65 : 1);
    const confAdd = Math.round((baselineAvailable ? 5 : 0) + (10 * factorQuality) + (12 * dailyQuality) + (8 * marketQuality) + (5 * matrixQuality));
    const confAddClamped = clampNum(confAdd, 0, 40);
    const confidenceCap = confidenceCapForRow(row, baselineAvailable);
    const dataQuality = Math.round(((factorQuality * 0.30) + (dailyQuality * 0.30) + (marketQuality * 0.20) + (matrixQuality * 0.20)) * 1000) / 10;
    const status = enrichmentStatus(row, baselineAvailable);
    const grade = enrichmentGrade(status);
    const factorPayload = safeParseJsonText(row.factor_payload_json);
    const rowBlocked = status === "enrichment_blocked" || Number(row.blocking_for_scoring || 0) === 1 || Number(row.blocker_count || 0) > 0 || confidenceCap === 0;
    const noHpAnchor = rowBlocked || !baselineAvailable;
    const packetLayer = noHpAnchor ? 0 : packetLayerFromPayload(factorPayload, profileKey, row.selected_side);
    const dailyLayer = noHpAnchor ? 0 : dailyLayerFromPayload(factorPayload, profileKey, row.selected_side);
    const marketLayer = noHpAnchor ? 0 : marketLayerFromPayload(factorPayload, profileKey, row.selected_side);
    const matrixLayer = rowBlocked ? -3 : 0;
    const factorLayers = [
      layerObj("baseline_anchor", weights.baseline || weights.sp_first_inning || 0, baselineLayer, baselineAvailable ? Math.min(1, baselineConfRaw / 100) : 0, baselineAvailable ? "confirmed_baseline_anchor" : "missing", { anchor_only:true, hp_weight_pressure:0, baseline_source_mode: row.baseline_source_mode || null, note:"Baseline HP is the anchor. Do not add this pressure again in HP V2." }),
      layerObj("factor_packet_context", noHpAnchor ? 0 : contextLayerWeight(profileKey, weights, "factor_packet"), packetLayer, factorQuality, factorQuality >= 1 ? "confirmed_mined_directional" : (factorQuality > 0 ? "partial_mined_directional" : "missing"), { suppressed_by_blocker: rowBlocked, suppressed_by_missing_baseline_anchor: !baselineAvailable }),
      layerObj("daily_game_context", noHpAnchor ? 0 : contextLayerWeight(profileKey, weights, "daily_context"), dailyLayer, dailyQuality, dailyQuality >= 1 ? "confirmed_daily_directional" : "partial_daily_directional", { suppressed_by_blocker: rowBlocked, suppressed_by_missing_baseline_anchor: !baselineAvailable }),
      layerObj("market_context", noHpAnchor ? 0 : contextLayerWeight(profileKey, weights, "market_context"), marketLayer, marketQuality, marketQuality >= 1 ? "confirmed_market_directional" : (marketQuality > 0 ? "game_market_only" : "missing"), { suppressed_by_blocker: rowBlocked, suppressed_by_missing_baseline_anchor: !baselineAvailable }),
      layerObj("matrix_quality", 0, matrixLayer, matrixQuality, matrixQuality >= 1 ? "complete_matrix" : "partial_matrix", { blocker_only:true, suppressed_by_blocker: rowBlocked })
    ];
    const factorPressure = noHpAnchor ? 0 : Math.round(factorLayers.filter(x => !x.anchor_only).reduce((a, x) => a + Number(x.hp_weight_pressure || 0), 0) * 100) / 100;
    const enrichmentRowId = `${row.matrix_id}|${row.selected_side}`;
    const payload = {
      version: ENRICHMENT_V1_VERSION,
      profile_key: profileKey,
      side_expanded: true,
      selected_side: row.selected_side,
      prizepicks_goblin_demon_more_only_contract: true,
      baseline_confidence_cap_60: true,
      enrichment_confidence_max_40: true,
      confidence_definition: "strength_and_completeness_of_data_conditions_not_probability",
      hit_probability_definition: "realism_based_probability_from_baseline_to_be_enriched_by_hit_prob_v2_later",
      hp_v2_not_calculated_in_this_phase: true,
      final_score_not_calculated_in_this_phase: true,
      baseline_source_mode: row.baseline_source_mode || null,
      v2_heb_bridge_preferred: row.baseline_source_mode === "player_baseline_hp_v2_current",
      sample_profile: row.sample_profile || null,
      role_profile: row.role_profile || null,
      volatility_profile: row.volatility_profile || null,
      variance_profile: row.variance_profile || null,
      line_difficulty_profile: row.line_difficulty_profile || null
    };
    currentStatements.push(env.SCORE_DB.prepare(`INSERT OR REPLACE INTO score_enrichment_current (
      enrichment_row_id,batch_id,matrix_id,prepared_row_id,source_line_id,source_key,game_pk,official_date,official_game_time_utc,mlb_player_id,player_name,team_id,opponent_team_id,canonical_prop_key,board_line_value,selected_side,factor_family,factor_packet_id,profile_key,baseline_hp_row_id,baseline_hp_available,baseline_hp_0_100,baseline_confidence_raw_0_100,baseline_confidence_v2_0_60,baseline_sample_size,baseline_hit_count,baseline_miss_count,profile_weight_json,factor_layer_json,factor_hp_pressure,enrichment_confidence_add_available_0_40,confidence_cap_0_100,data_quality_score_0_100,enrichment_status,enrichment_grade,matrix_status,matrix_grade,factor_status,factor_grade,market_game_context_status,market_prop_context_status,daily_readiness_status,blocking_for_scoring,warning_count,blocker_count,missing_component_count,baseline_missing,hp_v2_ready,final_score_ready,enrichment_payload_json,matrix_payload_json_snapshot,details_json_snapshot,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(
      enrichmentRowId,batchId,row.matrix_id,row.prepared_row_id,row.source_line_id,row.source_key,row.game_pk,row.official_date,row.official_game_time_utc,row.mlb_player_id,row.player_name,row.team_id,row.opponent_team_id,row.canonical_prop_key,row.board_line_value,row.selected_side,row.factor_family,row.factor_packet_id,profileKey,row.baseline_hp_row_id || null,baselineAvailable ? 1 : 0,baselineHp,baselineConfRaw,baselineConfV2,Number(row.non_push_sample || 0),Number(row.hit_count || 0),Number(row.miss_count || 0),scoreJson(weights,3000),scoreJson(factorLayers,6000),factorPressure,confAddClamped,confidenceCap,dataQuality,status,grade,row.matrix_status,row.matrix_grade,row.factor_status,row.factor_grade || null,row.market_game_context_status,row.market_prop_context_status,row.daily_readiness_status,Number(row.blocking_for_scoring || 0),Number(row.warning_count || 0),Number(row.blocker_count || 0),Number(row.missing_component_count || 0),baselineAvailable ? 0 : 1,(baselineAvailable && status !== "enrichment_blocked") ? 1 : 0,(baselineAvailable && status === "enrichment_ready") ? 1 : 0,scoreJson(payload,6000),null,null));
    if (!baselineAvailable || status === "enrichment_blocked") {
      issues++;
      issueStatements.push(env.SCORE_DB.prepare(`INSERT OR REPLACE INTO score_enrichment_issues (issue_id,batch_id,enrichment_row_id,prepared_row_id,severity,issue_code,issue_message,details_json,created_at) VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(`${batchId}|${enrichmentRowId}|${baselineAvailable ? "blocked" : "baseline_missing"}`, batchId, enrichmentRowId, row.prepared_row_id, baselineAvailable ? "BLOCKER" : "WARNING", baselineAvailable ? "ENRICHMENT_BLOCKED" : "BASELINE_HP_MISSING", baselineAvailable ? "Matrix row blocks scoring/enrichment" : "No matching side-specific baseline HP row", scoreJson({ profile_key: profileKey, canonical_prop_key: row.canonical_prop_key, selected_side: row.selected_side }, 3000)));
    }
    written++;
  }
  await flushD1Batch(currentStatements, 25);
  await flushD1Batch(issueStatements, 25);
  const totals = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows, SUM(CASE WHEN baseline_hp_available=1 THEN 1 ELSE 0 END) AS matched, SUM(CASE WHEN baseline_hp_available=0 THEN 1 ELSE 0 END) AS missing, SUM(CASE WHEN enrichment_status='enrichment_blocked' THEN 1 ELSE 0 END) AS blocked, SUM(CASE WHEN enrichment_status LIKE '%warnings%' THEN 1 ELSE 0 END) AS warn FROM score_enrichment_current WHERE batch_id=?`, batchId);
  const writtenTotal = Number(totals && totals.rows || 0);
  const remaining = Math.max(0, expectedRows - (offset + rows.length));
  const complete = remaining <= 0;
  const output = baseIdentity({
    ok:true,data_ok:true,version:ENRICHMENT_V1_VERSION,worker_name:WORKER_NAME,logical_worker_name:"alphadog-v2-score-enrichment-v1",deployed_worker_slot:"alphadog-v2-score-audit",job_key:ENRICHMENT_V1_JOB_KEY,request_id:requestId,run_id:runId,chain_id:chainId,mode:ENRICHMENT_V1_MODE,status:complete?"completed_score_enrichment_v1_side_expanded":"partial_continue_score_enrichment_v1_side_expanded",certification:complete?"SCORE_ENRICHMENT_V1_CERTIFIED_SIDE_EXPANDED":"SCORE_ENRICHMENT_V1_PARTIAL_CONTINUE",certification_grade:complete?"PASS_WITH_REVIEW_WARNINGS_ALLOWED":"PARTIAL",batch_id:batchId,enrichment_batch_id:batchId,source_matrix_batch_id:sourceMatrixBatchId,matrix_rows_read:Math.ceil(expectedRows/2),expected_enrichment_rows:expectedRows,enrichment_rows_written:writtenTotal,rows_read:expectedRows,rows_written:writtenTotal,inserted_this_invocation:written,baseline_matched_rows:Number(totals && totals.matched || 0),baseline_missing_rows:Number(totals && totals.missing || 0),blocked_rows:Number(totals && totals.blocked || 0),warning_rows:Number(totals && totals.warn || 0),issue_rows_written:issues,offset,chunk_rows:limit,next_offset:offset+rows.length,remaining_rows:remaining,resume_mismatch_reset:resumeMismatchReset,version_reset:versionReset,requested_batch_id:requestedBatchId,batched_compact_writes:true,compact_snapshots:true,directional_context_layers:true,hitter_raw_payload_directional_parser_v0_1_11:true,baseline_anchor_not_double_counted:true,clean_source_matrix_batch_ownership:true,conservative_context_pressure:true,blocked_rows_zero_context_pressure:true,baseline_missing_rows_zero_context_pressure:true,d1_microflush_25:true,chunk_rows_target_250:true,side_expanded:true,goblin_demon_less_excluded:true,prizepicks_goblin_demon_more_only_contract:true,baseline_confidence_cap_60:true,enrichment_confidence_max_40:true,no_hp_v2:true,no_current_scoring_mutation:true,no_final_score:true,no_final_board:true,no_ranking:true,continuation_required:!complete,orchestrator_should_self_continue:!complete,elapsed_ms:Date.now()-started });
  await run(env.SCORE_DB, `UPDATE score_enrichment_batches SET status=?, matrix_rows_read=?, expected_enrichment_rows=?, enrichment_rows_written=?, baseline_matched_rows=?, baseline_missing_rows=?, blocked_rows=?, warning_rows=?, certification_status=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, complete?"completed":"partial_continue", Math.ceil(expectedRows/2), expectedRows, writtenTotal, output.baseline_matched_rows, output.baseline_missing_rows, output.blocked_rows, output.warning_rows, output.certification, output.certification_grade, scoreJson(output,14000), batchId);
  return output;
}

// ============================================================================
// Expansion / V2 Baseline Shadow Scoring Lane (worker-owned, non-production)
// Owns heavy V2/V3 shadow scoring logic for:
// score-enrichment-v2-shadow -> hit-probability-v3-shadow -> final-score-v2-shadow -> final-board-v3-shadow
// ============================================================================
const SHADOW_SCORE_VERSION = "alphadog-v2-score-audit-v0.4.65-calendar-status-canonical-guard";
const SCORE_ENRICHMENT_V2_SHADOW_JOB_KEY = "score-enrichment-v2-shadow";
const SCORE_ENRICHMENT_V2_SHADOW_MODE = "score_enrichment_v2_shadow";
const HIT_PROBABILITY_V3_SHADOW_JOB_KEY = "hit-probability-v3-shadow";
const HIT_PROBABILITY_V3_SHADOW_MODE = "hit_probability_v3_shadow";
const FINAL_SCORE_V2_SHADOW_JOB_KEY = "final-score-v2-shadow";
const FINAL_SCORE_V2_SHADOW_MODE = "final_score_v2_shadow";
const FINAL_BOARD_V3_SHADOW_JOB_KEY = "final-board-v3-shadow";
const FINAL_BOARD_V3_SHADOW_MODE = "score_final_board_v3_shadow";
const V2_ENRICHMENT_CHUNK_ROWS = 400;
const V3_HP_CHUNK_ROWS = 800;
const V2_FINAL_SCORE_CHUNK_ROWS = 900;
const V3_FINAL_BOARD_CHUNK_ROWS = 500;

function v2Rid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function v2Json(value, max = 9000) {
  let text = "{}";
  try { text = JSON.stringify(value == null ? {} : value); } catch (_) { text = JSON.stringify({ serialization_error:true }); }
  return text.length > max ? text.slice(0, max) : text;
}
async function v2Flush(db, stmts, size = 25) {
  if (!stmts || !stmts.length) return { statements:0, batches:0, fallback:false };
  const chunkSize = Math.max(1, Math.min(50, Number(size || 25) || 25));
  let statements = 0;
  let batches = 0;
  let fallback = false;
  for (let i = 0; i < stmts.length; i += chunkSize) {
    const chunk = stmts.slice(i, i + chunkSize);
    if (db && typeof db.batch === "function") {
      try {
        await db.batch(chunk);
        statements += chunk.length;
        batches++;
        continue;
      } catch (err) {
        fallback = true;
        // Keep correctness over speed if a runtime rejects batch for this chunk.
        // Individual statement errors still surface and fail the run normally.
      }
    } else {
      fallback = true;
    }
    for (const stmt of chunk) {
      await stmt.run();
      statements++;
    }
  }
  return { statements, batches, fallback };
}
function v2Num(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function v2Clamp(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
function v2Side(v) { return String(v == null ? "" : v).toLowerCase(); }
function v2Prop(v) { return String(v == null ? "" : v).toLowerCase(); }
function v2Source(v) { return String(v == null ? "" : v).toLowerCase(); }
function v2PayoutVariantFromPayload(row) {
  const payload = safeParseJsonText(row && row.enrichment_payload_json);
  const vals = [
    row && row.payout_variant,
    row && row.odds_type,
    payload.payout_variant,
    payload.odds_type,
    payload.line_variant,
    payload.source_line_type,
    payload.variant,
    row && row.source_line_id
  ].filter(x => x !== undefined && x !== null && String(x).trim());
  const raw = vals.join("|").toLowerCase();
  if (raw.includes("|demon|") || raw.includes("demon")) return "demon";
  if (raw.includes("|goblin|") || raw.includes("goblin")) return "goblin";
  return "standard";
}
function v2BaselineSourceForShadow(row, hasOld, hasExpansion) {
  if (hasOld) {
    const payload = safeParseJsonText(row && row.enrichment_payload_json);
    const sourceMode = String(payload.baseline_source_mode || row.baseline_source_mode || "").toLowerCase();
    const baselineId = String(row && row.baseline_hp_row_id || "");
    if (baselineId.startsWith("pbhp_v2|") || sourceMode === "player_baseline_hp_v2_current") return "baseline_v2_bridge";
    return "production_v1";
  }
  if (hasExpansion) return "expansion_v2_shadow";
  return "missing";
}
function v2FactorCap(prop, family, source, line, side) {
  const p = v2Prop(prop);
  const f = v2Prop(family);
  if (["home_runs", "total_bases", "doubles", "triples"].includes(p)) return 8;
  if (["pitcher_fantasy_score"].includes(p)) return 10;
  if (p === "rfi_nrfi") return 12;
  if (["pitcher_strikeouts", "hitter_strikeouts", "pitcher_outs"].includes(p)) return 5;
  if (["runs_allowed", "earned_runs", "hits_allowed", "walks_allowed"].includes(p)) return 7;
  return 4;
}
function v2FactorQualityTier(row) {
  const q = v2Num(row && row.data_quality_score_0_100, 0);
  const warnings = Number(row && row.warning_count || 0);
  const missing = Number(row && row.missing_component_count || 0);
  if (q <= 0) return "no_data";
  if (missing > 0 || warnings >= 8) return "conflicting_or_partial";
  if (q < 45) return "low_data";
  if (q < 65) return "medium_data";
  if (q < 80) return "good_data";
  return "strong_data";
}
function v2EffectTier(effect) {
  const n = Number(effect || 0);
  if (n >= 7) return "extremely_favorable";
  if (n >= 4) return "very_favorable";
  if (n >= 2) return "favorable";
  if (n >= 0.35) return "slightly_favorable";
  if (n <= -7) return "extremely_negative";
  if (n <= -4) return "very_negative";
  if (n <= -2) return "negative";
  if (n <= -0.35) return "slightly_negative";
  return "neutral";
}
function v2ExpansionNamespaceFor(row) {
  const prop = v2Prop(row && row.canonical_prop_key);
  const source = v2Source(row && row.source_key);
  if (prop === "runs_allowed") return "RA_";
  if (prop === "pitcher_fantasy_score" && source.includes("prize")) return "PFS_PP_";
  if (prop === "pitcher_fantasy_score" && source.includes("sleeper")) return "PFS_SL_";
  if (prop === "rfi_nrfi" && source.includes("sleeper")) return "RFI_SL_";
  if (prop === "rfi_nrfi" && source.includes("prize")) return "RFI_PP_";
  return null;
}
function v2SafeStatusFromBlockers(row, hasBaseline) {
  if (Number(row && (row.blocking_for_scoring || row.blocker_count) || 0) > 0) return "blocked_source_row";
  if (!hasBaseline) return "deferred_baseline_missing";
  return "ready";
}
function v2CertificationGrade(ok, partial = false) {
  if (partial) return "PARTIAL";
  return ok ? "PASS_WITH_REVIEW_WARNINGS_ALLOWED" : "FAILED";
}
async function ensureV2ShadowTables(env) {
  if (!env || !env.SCORE_DB) throw new Error("missing_SCORE_DB_for_v2_shadow_tables");
  const ddl = [
    `CREATE TABLE IF NOT EXISTS v2_score_enrichment_batches (batch_id TEXT PRIMARY KEY, request_id TEXT, run_id TEXT, worker_version TEXT, mode TEXT, status TEXT, source_enrichment_batch_id TEXT, source_rows_read INTEGER DEFAULT 0, events_written INTEGER DEFAULT 0, old_baseline_rows INTEGER DEFAULT 0, expansion_baseline_rows INTEGER DEFAULT 0, missing_baseline_rows INTEGER DEFAULT 0, blocked_rows INTEGER DEFAULT 0, warning_rows INTEGER DEFAULT 0, issue_rows_written INTEGER DEFAULT 0, certification_status TEXT, certification_grade TEXT, output_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS v2_score_enrichment_events (event_id TEXT PRIMARY KEY, batch_id TEXT, source_enrichment_batch_id TEXT, enrichment_row_id TEXT, prepared_row_id TEXT, matrix_id TEXT, source_line_id TEXT, game_pk INTEGER, official_date TEXT, mlb_player_id INTEGER, player_name TEXT, team_id TEXT, opponent_team_id TEXT, canonical_prop_key TEXT, source_key TEXT, line_value REAL, selected_side TEXT, payout_variant TEXT, baseline_hp_row_id TEXT, baseline_source TEXT, baseline_profile_key TEXT, baseline_hp_0_100 REAL, baseline_confidence_0_100 REAL, factor_id TEXT, factor_family TEXT, factor_quality_tier TEXT, factor_effect_tier TEXT, factor_direction TEXT, factor_weight REAL, factor_cap REAL, factor_effect_0_100 REAL, factor_effect_multiplier REAL, event_status TEXT, event_grade TEXT, blocker_count INTEGER DEFAULT 0, warning_count INTEGER DEFAULT 0, factor_application_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS v2_score_enrichment_issues (issue_id TEXT PRIMARY KEY, batch_id TEXT, event_id TEXT, severity TEXT, issue_code TEXT, issue_message TEXT, details_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS v2_hit_probability_batches (batch_id TEXT PRIMARY KEY, request_id TEXT, run_id TEXT, worker_version TEXT, mode TEXT, status TEXT, source_v2_enrichment_batch_id TEXT, source_rows_read INTEGER DEFAULT 0, rows_written INTEGER DEFAULT 0, hp_ready_rows INTEGER DEFAULT 0, hp_deferred_rows INTEGER DEFAULT 0, hp_blocked_rows INTEGER DEFAULT 0, normalized_groups INTEGER DEFAULT 0, normalization_blocked_groups INTEGER DEFAULT 0, issue_rows_written INTEGER DEFAULT 0, certification_status TEXT, certification_grade TEXT, output_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS v2_hit_probability_current (hp_v3_row_id TEXT PRIMARY KEY, batch_id TEXT, source_v2_enrichment_batch_id TEXT, event_id TEXT, prepared_row_id TEXT, matrix_id TEXT, source_line_id TEXT, game_pk INTEGER, official_date TEXT, mlb_player_id INTEGER, player_name TEXT, canonical_prop_key TEXT, source_key TEXT, line_value REAL, selected_side TEXT, payout_variant TEXT, baseline_hp_row_id TEXT, baseline_source TEXT, baseline_hp_0_100 REAL, baseline_confidence_0_100 REAL, composite_factor_signature TEXT, composite_factor_effect_0_100 REAL, v3_hp_raw REAL, v3_hp_final REAL, v3_confidence_0_100 REAL, normalization_status TEXT, hp_v3_status TEXT, hp_v3_grade TEXT, blocker_count INTEGER DEFAULT 0, warning_count INTEGER DEFAULT 0, model_payload_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS v2_hit_probability_issues (issue_id TEXT PRIMARY KEY, batch_id TEXT, hp_v3_row_id TEXT, severity TEXT, issue_code TEXT, issue_message TEXT, details_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS v2_final_score_batches (batch_id TEXT PRIMARY KEY, request_id TEXT, run_id TEXT, worker_version TEXT, mode TEXT, status TEXT, source_hp_v3_batch_id TEXT, source_rows_read INTEGER DEFAULT 0, rows_written INTEGER DEFAULT 0, eligible_rows INTEGER DEFAULT 0, review_rows INTEGER DEFAULT 0, blocked_rows INTEGER DEFAULT 0, issue_rows_written INTEGER DEFAULT 0, certification_status TEXT, certification_grade TEXT, output_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS v2_final_score_current (final_score_v2_row_id TEXT PRIMARY KEY, batch_id TEXT, source_hp_v3_batch_id TEXT, hp_v3_row_id TEXT, prepared_row_id TEXT, matrix_id TEXT, source_line_id TEXT, game_pk INTEGER, official_date TEXT, mlb_player_id INTEGER, player_name TEXT, canonical_prop_key TEXT, source_key TEXT, line_value REAL, selected_side TEXT, payout_variant TEXT, hit_probability_0_100 REAL, certainty_0_100 REAL, final_score_0_100 REAL, final_score_confidence_0_100 REAL, final_score_status TEXT, final_score_grade TEXT, final_score_lane TEXT, review_playable INTEGER DEFAULT 0, live_playable INTEGER DEFAULT 0, eligible_for_final_board INTEGER DEFAULT 0, blocked_reason TEXT, details_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS v2_final_score_issues (issue_id TEXT PRIMARY KEY, batch_id TEXT, final_score_v2_row_id TEXT, severity TEXT, issue_code TEXT, issue_message TEXT, details_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS v2_final_board_batches (batch_id TEXT PRIMARY KEY, request_id TEXT, run_id TEXT, worker_version TEXT, mode TEXT, status TEXT, source_final_score_v2_batch_id TEXT, source_rows_read INTEGER DEFAULT 0, eligible_rows_read INTEGER DEFAULT 0, rows_written INTEGER DEFAULT 0, issue_rows_written INTEGER DEFAULT 0, certification_status TEXT, certification_grade TEXT, output_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS v2_final_board_current (board_v3_row_id TEXT PRIMARY KEY, batch_id TEXT, source_final_score_v2_batch_id TEXT, final_score_v2_row_id TEXT, prepared_row_id TEXT, matrix_id TEXT, source_line_id TEXT, game_pk INTEGER, official_date TEXT, mlb_player_id INTEGER, player_name TEXT, canonical_prop_key TEXT, source_key TEXT, line_value REAL, selected_side TEXT, payout_variant TEXT, rank_order INTEGER, hit_probability_0_100 REAL, certainty_0_100 REAL, overall_score_0_100 REAL, board_status TEXT, board_grade TEXT, board_lane TEXT, review_playable INTEGER DEFAULT 1, live_playable INTEGER DEFAULT 0, sort_tuple_json TEXT, details_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS v2_final_board_issues (issue_id TEXT PRIMARY KEY, batch_id TEXT, board_v3_row_id TEXT, severity TEXT, issue_code TEXT, issue_message TEXT, details_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`
  ];
  for (const sql of ddl) await run(env.SCORE_DB, sql);
}
async function latestV1EnrichmentBatch(env) {
  const row = await first(env.SCORE_DB, `SELECT batch_id FROM score_enrichment_batches WHERE status='completed' ORDER BY datetime(updated_at) DESC LIMIT 1`);
  if (row && row.batch_id) return row.batch_id;
  const cur = await first(env.SCORE_DB, `SELECT batch_id, COUNT(*) AS rows FROM score_enrichment_current GROUP BY batch_id ORDER BY COUNT(*) DESC LIMIT 1`);
  return cur && cur.batch_id ? cur.batch_id : null;
}
async function latestV2EnrichmentBatch(env) {
  const row = await first(env.SCORE_DB, `SELECT batch_id FROM v2_score_enrichment_batches WHERE status='completed' ORDER BY datetime(updated_at) DESC LIMIT 1`);
  return row && row.batch_id ? row.batch_id : null;
}
async function latestHpV3Batch(env) {
  const row = await first(env.SCORE_DB, `SELECT batch_id FROM v2_hit_probability_batches WHERE status='completed' ORDER BY datetime(updated_at) DESC LIMIT 1`);
  return row && row.batch_id ? row.batch_id : null;
}
async function latestFinalScoreV2Batch(env) {
  const row = await first(env.SCORE_DB, `SELECT batch_id FROM v2_final_score_batches WHERE status='completed' ORDER BY datetime(updated_at) DESC LIMIT 1`);
  return row && row.batch_id ? row.batch_id : null;
}

function v2HasExplicitOffset(input = {}, keys = []) {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(input, k) && input[k] !== null && input[k] !== undefined && String(input[k]).trim() !== "") return true;
  }
  return false;
}
function v2ReadOffset(input = {}, keys = []) {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(input, k) && input[k] !== null && input[k] !== undefined && String(input[k]).trim() !== "") {
      const n = Number(input[k]);
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
    }
  }
  return 0;
}
function v2NestedInput(input = {}) {
  return (input && input.input_json && typeof input.input_json === "object") ? input.input_json : {};
}
function v2FirstDefined(input = {}, nested = {}, keys = []) {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(input, k) && input[k] !== null && input[k] !== undefined && String(input[k]).trim() !== "") return input[k];
    if (Object.prototype.hasOwnProperty.call(nested, k) && nested[k] !== null && nested[k] !== undefined && String(nested[k]).trim() !== "") return nested[k];
  }
  return null;
}
function v2HasExplicitOffsetDeep(input = {}, nested = {}, keys = []) {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(input, k) && input[k] !== null && input[k] !== undefined && String(input[k]).trim() !== "") return true;
    if (Object.prototype.hasOwnProperty.call(nested, k) && nested[k] !== null && nested[k] !== undefined && String(nested[k]).trim() !== "") return true;
  }
  return false;
}
function v2ReadOffsetDeep(input = {}, nested = {}, keys = []) {
  const v = v2FirstDefined(input, nested, keys);
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}
function v2SafeIdPart(value) {
  return String(value || "shadow")
    .replace(/[^a-zA-Z0-9_\-]/g, "_")
    .slice(0, 96);
}
function v2CanonicalBatchId(prefix, requestId) {
  return `${prefix}_${v2SafeIdPart(requestId)}`;
}
async function v2BatchExists(env, batchTable, batchId) {
  const allowed = new Set(["v2_score_enrichment_batches", "v2_hit_probability_batches", "v2_final_score_batches", "v2_final_board_batches"]);
  if (!allowed.has(batchTable)) throw new Error(`unsupported_v2_shadow_batch_table:${batchTable}`);
  if (!env || !env.SCORE_DB || !batchId) return false;
  const row = await first(env.SCORE_DB, `SELECT batch_id FROM ${batchTable} WHERE batch_id=? LIMIT 1`, batchId);
  return !!(row && row.batch_id);
}
async function v2CountBatchRows(env, tableName, batchId) {
  if (!env || !env.SCORE_DB || !batchId) return 0;
  const allowed = new Set(["v2_score_enrichment_events", "v2_hit_probability_current", "v2_final_score_current", "v2_final_board_current"]);
  if (!allowed.has(tableName)) throw new Error(`unsupported_v2_shadow_resume_table:${tableName}`);
  const row = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM ${tableName} WHERE batch_id=?`, batchId);
  return Math.max(0, Number(row && row.rows || 0) || 0);
}
async function v2StartOrResumeBatch(env, cfg = {}) {
  const {
    batchId,
    batchTable,
    currentTable,
    issueTable,
    insertSql,
    insertBinds = [],
    updateSql,
    updateBinds = [],
    explicitOffset,
    resetRequested = false
  } = cfg;
  if (!batchId) throw new Error("missing_v2_shadow_batch_id");
  const isNew = !cfg.resumeExisting;
  if (isNew || resetRequested) {
    await run(env.SCORE_DB, insertSql, ...insertBinds);
    if (currentTable) await run(env.SCORE_DB, `DELETE FROM ${currentTable} WHERE batch_id=?`, batchId);
    if (issueTable) await run(env.SCORE_DB, `DELETE FROM ${issueTable} WHERE batch_id=?`, batchId);
    return { offset:0, resumed:false, reset:true };
  }
  await run(env.SCORE_DB, updateSql, ...updateBinds);
  const inferredOffset = explicitOffset === null ? await v2CountBatchRows(env, currentTable, batchId) : explicitOffset;
  return { offset:Math.max(0, Number(inferredOffset || 0) || 0), resumed:true, reset:false };
}
async function runScoreEnrichmentV2Shadow(env, input = {}) {
  const started = Date.now();
  if (!env.SCORE_DB) return baseIdentity({ ok:false, data_ok:false, version:SHADOW_SCORE_VERSION, worker_name:WORKER_NAME, logical_worker_name:"alphadog-v2-score-enrichment-v2-shadow", deployed_worker_slot:WORKER_NAME, job_key:SCORE_ENRICHMENT_V2_SHADOW_JOB_KEY, status:"blocked_missing_score_db", certification:"SCORE_ENRICHMENT_V2_SHADOW_MISSING_SCORE_DB", certification_grade:"BLOCKED" });
  await ensureV2ShadowTables(env);
  const requestId = input.request_id || v2Rid("score_enrichment_v2");
  const runId = input.run_id || null;
  const chainId = input.chain_id || null;
  const nestedInput = v2NestedInput(input);
  const explicitOffsetProvided = v2HasExplicitOffsetDeep(input, nestedInput, ["v2_enrichment_offset", "offset"]);
  let offset = explicitOffsetProvided ? v2ReadOffsetDeep(input, nestedInput, ["v2_enrichment_offset", "offset"]) : 0;
  const limit = Math.max(50, Math.min(500, Number(v2FirstDefined(input, nestedInput, ["chunk_rows"]) || V2_ENRICHMENT_CHUNK_ROWS) || V2_ENRICHMENT_CHUNK_ROWS));
  const sourceBatchId = v2FirstDefined(input, nestedInput, ["source_enrichment_batch_id"]) || await latestV1EnrichmentBatch(env);
  if (!sourceBatchId) return baseIdentity({ ok:false, data_ok:false, version:SHADOW_SCORE_VERSION, worker_name:WORKER_NAME, logical_worker_name:"alphadog-v2-score-enrichment-v2-shadow", deployed_worker_slot:WORKER_NAME, job_key:SCORE_ENRICHMENT_V2_SHADOW_JOB_KEY, request_id:requestId, run_id:runId, chain_id:chainId, mode:SCORE_ENRICHMENT_V2_SHADOW_MODE, status:"blocked_missing_source_enrichment_batch", certification:"SCORE_ENRICHMENT_V2_SHADOW_MISSING_SOURCE_BATCH", certification_grade:"BLOCKED" });
  let batchId = v2FirstDefined(input, nestedInput, ["v2_enrichment_batch_id", "resume_batch_id"]) || v2CanonicalBatchId("v2_score_enrichment_batch", requestId);
  const resumeExisting = await v2BatchExists(env, "v2_score_enrichment_batches", batchId);
  const resumeState = await v2StartOrResumeBatch(env, {
    batchId,
    resumeExisting,
    currentTable:"v2_score_enrichment_events",
    issueTable:"v2_score_enrichment_issues",
    explicitOffset: explicitOffsetProvided ? offset : null,
    insertSql:`INSERT OR REPLACE INTO v2_score_enrichment_batches (batch_id,request_id,run_id,worker_version,mode,status,source_enrichment_batch_id,certification_status,certification_grade,output_json,updated_at) VALUES (?,?,?,?,?,'running',?,'SCORE_ENRICHMENT_V2_SHADOW_STARTED','RUNNING',?,CURRENT_TIMESTAMP)`,
    insertBinds:[batchId, requestId, runId, SHADOW_SCORE_VERSION, SCORE_ENRICHMENT_V2_SHADOW_MODE, sourceBatchId, v2Json({ request_id:requestId, source_enrichment_batch_id:sourceBatchId, no_production_mutation:true })],
    updateSql:`UPDATE v2_score_enrichment_batches SET run_id=?, worker_version=?, mode=?, source_enrichment_batch_id=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
    updateBinds:[runId, SHADOW_SCORE_VERSION, SCORE_ENRICHMENT_V2_SHADOW_MODE, sourceBatchId, batchId]
  });
  offset = resumeState.offset;
  const totalRow = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM score_enrichment_current WHERE batch_id=?`, sourceBatchId);
  const total = Number(totalRow && totalRow.rows || 0);
  const rows = await all(env.SCORE_DB, `SELECT e.*, xb.baseline_hp_row_id AS expansion_baseline_hp_row_id, xb.baseline_hp_0_100 AS expansion_baseline_hp_0_100, xb.baseline_confidence_0_100 AS expansion_baseline_confidence_0_100, xb.baseline_hp_profile_key AS expansion_baseline_hp_profile_key, xb.profile_namespace AS expansion_profile_namespace, xb.source_formula_key AS expansion_source_formula_key
    FROM score_enrichment_current e
    LEFT JOIN expansion_player_baseline_hp_current xb ON xb.canonical_prop_key=e.canonical_prop_key
      AND lower(xb.selected_side)=lower(e.selected_side)
      AND abs(COALESCE(xb.line_value, -9999)-COALESCE(e.board_line_value, -9998)) < 0.0001
      AND (
        (e.canonical_prop_key='runs_allowed' AND xb.profile_namespace='RA_' AND xb.player_id=e.mlb_player_id)
        OR (e.canonical_prop_key='pitcher_fantasy_score' AND instr(lower(COALESCE(e.source_key,'')), 'prize') > 0 AND xb.profile_namespace='PFS_PP_' AND xb.player_id=e.mlb_player_id)
        OR (e.canonical_prop_key='pitcher_fantasy_score' AND instr(lower(COALESCE(e.source_key,'')), 'sleeper') > 0 AND xb.profile_namespace='PFS_SL_' AND xb.player_id=e.mlb_player_id)
        OR (e.canonical_prop_key='rfi_nrfi' AND instr(lower(COALESCE(e.source_key,'')), 'sleeper') > 0 AND xb.profile_namespace='RFI_SL_' AND xb.player_id=e.mlb_player_id)
        OR (e.canonical_prop_key='rfi_nrfi' AND instr(lower(COALESCE(e.source_key,'')), 'prize') > 0 AND xb.profile_namespace='RFI_PP_' AND xb.entity_id='rfi_pp_game_pair_pool')
      )
    WHERE e.batch_id=?
    ORDER BY e.enrichment_row_id
    LIMIT ? OFFSET ?`, sourceBatchId, limit, offset);
  const stmts = [];
  const issueStmts = [];
  let oldRows = 0, expansionRows = 0, missingRows = 0, blockedRows = 0, warningRows = 0, written = 0;
  for (const row of rows) {
    const hasOld = !!row.baseline_hp_row_id && Number(row.baseline_hp_available || 0) === 1;
    const hasExpansion = !!row.expansion_baseline_hp_row_id;
    const baselineId = hasOld ? row.baseline_hp_row_id : (hasExpansion ? row.expansion_baseline_hp_row_id : null);
    const baselineSource = v2BaselineSourceForShadow(row, hasOld, hasExpansion);
    const baselineHp = hasOld ? v2Num(row.baseline_hp_0_100, null) : (hasExpansion ? v2Num(row.expansion_baseline_hp_0_100, null) : null);
    const baselineConf = hasOld ? v2Num(row.baseline_confidence_raw_0_100, v2Num(row.baseline_confidence_v2_0_60, 0)) : (hasExpansion ? v2Num(row.expansion_baseline_confidence_0_100, 0) : null);
    const baselineProfile = hasOld ? row.profile_key : (hasExpansion ? row.expansion_baseline_hp_profile_key : null);
    const status = v2SafeStatusFromBlockers(row, !!baselineId && baselineHp !== null);
    const cap = v2FactorCap(row.canonical_prop_key, row.factor_family, row.source_key, row.board_line_value, row.selected_side);
    const rawPressure = v2Num(row.factor_hp_pressure, 0) || 0;
    const effect = v2Clamp(rawPressure, -cap, cap);
    const multiplier = Math.round((1 + (effect / 100)) * 10000) / 10000;
    const factorTier = v2EffectTier(effect);
    const direction = effect > 0 ? "lift" : (effect < 0 ? "drag" : "neutral");
    const quality = v2FactorQualityTier(row);
    const payoutVariant = v2PayoutVariantFromPayload(row);
    const eventId = `v2_event|${batchId}|${row.enrichment_row_id}`;
    if (hasOld) oldRows++; else if (hasExpansion) expansionRows++; else missingRows++;
    if (status === "blocked_source_row") blockedRows++;
    if (status !== "ready" || Number(row.warning_count || 0) > 0) warningRows++;
    const application = { baseline_source:baselineSource, expansion_namespace:v2ExpansionNamespaceFor(row), factor_cap:cap, raw_factor_hp_pressure:rawPressure, capped_factor_effect_0_100:effect, multiplicative_modifier:multiplier, no_production_table_mutation:true, production_tables_read_only:["score_enrichment_current","player_baseline_hp_v2_current","expansion_player_baseline_hp_current"] };
    stmts.push(env.SCORE_DB.prepare(`INSERT OR REPLACE INTO v2_score_enrichment_events (event_id,batch_id,source_enrichment_batch_id,enrichment_row_id,prepared_row_id,matrix_id,source_line_id,game_pk,official_date,mlb_player_id,player_name,team_id,opponent_team_id,canonical_prop_key,source_key,line_value,selected_side,payout_variant,baseline_hp_row_id,baseline_source,baseline_profile_key,baseline_hp_0_100,baseline_confidence_0_100,factor_id,factor_family,factor_quality_tier,factor_effect_tier,factor_direction,factor_weight,factor_cap,factor_effect_0_100,factor_effect_multiplier,event_status,event_grade,blocker_count,warning_count,factor_application_json,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(eventId,batchId,sourceBatchId,row.enrichment_row_id,row.prepared_row_id,row.matrix_id,row.source_line_id,row.game_pk,row.official_date,row.mlb_player_id,row.player_name,row.team_id,row.opponent_team_id,row.canonical_prop_key,row.source_key,row.board_line_value,row.selected_side,payoutVariant,baselineId,baselineSource,baselineProfile,baselineHp,baselineConf,"composite_v2_context",row.factor_family || enrichmentProfileFor(row.canonical_prop_key,row.factor_family),quality,factorTier,direction,1,cap,effect,multiplier,status,status === "ready" ? "READY" : (status === "blocked_source_row" ? "BLOCKED" : "DEFERRED"),Number(row.blocker_count || 0),Number(row.warning_count || 0) + (status === "deferred_baseline_missing" ? 1 : 0),v2Json(application,5000)));
    if (status !== "ready") {
      const code = status === "blocked_source_row" ? "SOURCE_ROW_BLOCKED" : "BASELINE_MISSING_SHADOW_DEFERRED";
      issueStmts.push(env.SCORE_DB.prepare(`INSERT OR REPLACE INTO v2_score_enrichment_issues (issue_id,batch_id,event_id,severity,issue_code,issue_message,details_json,created_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(`${batchId}|${eventId}|${code}`,batchId,eventId,status === "blocked_source_row" ? "BLOCKER" : "WARNING",code,status === "blocked_source_row" ? "Source enrichment row blocks scoring" : "No production or expansion baseline matched; HP V3 must not emit fake HP",v2Json({ canonical_prop_key:row.canonical_prop_key, source_key:row.source_key, line_value:row.board_line_value, selected_side:row.selected_side, baseline_source:baselineSource },3000)));
    }
    written++;
  }
  const eventFlush = await v2Flush(env.SCORE_DB, stmts, 50);
  const issueFlush = await v2Flush(env.SCORE_DB, issueStmts, 50);
  const remaining = Math.max(0, total - (offset + rows.length));
  const complete = remaining <= 0;
  const issueBackfill = complete ? await v2BackfillScoreEnrichmentIssues(env, batchId) : { attempted:false, inserted_or_replaced:0 };
  const counts = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows, SUM(CASE WHEN baseline_source='production_v1' THEN 1 ELSE 0 END) AS old_rows, SUM(CASE WHEN baseline_source='baseline_v2_bridge' THEN 1 ELSE 0 END) AS baseline_v2_bridge_rows, SUM(CASE WHEN baseline_source='expansion_v2_shadow' THEN 1 ELSE 0 END) AS expansion_rows, SUM(CASE WHEN baseline_source='missing' THEN 1 ELSE 0 END) AS missing_rows, SUM(CASE WHEN event_status='blocked_source_row' THEN 1 ELSE 0 END) AS blocked_rows, SUM(CASE WHEN event_status<>'ready' OR warning_count>0 THEN 1 ELSE 0 END) AS warning_rows FROM v2_score_enrichment_events WHERE batch_id=?`, batchId);
  const issueCount = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM v2_score_enrichment_issues WHERE batch_id=?`, batchId);
  const cert = complete ? "SCORE_ENRICHMENT_V2_SHADOW_CERTIFIED_WORKER_OWNED" : "SCORE_ENRICHMENT_V2_SHADOW_PARTIAL_CONTINUE";
  const grade = v2CertificationGrade(true, !complete);
  const output = baseIdentity({ ok:true,data_ok:true,version:SHADOW_SCORE_VERSION,worker_name:WORKER_NAME,logical_worker_name:"alphadog-v2-score-enrichment-v2-shadow",deployed_worker_slot:WORKER_NAME,job_key:SCORE_ENRICHMENT_V2_SHADOW_JOB_KEY,request_id:requestId,run_id:runId,chain_id:chainId,mode:SCORE_ENRICHMENT_V2_SHADOW_MODE,status:complete?"completed_score_enrichment_v2_shadow":"partial_continue_score_enrichment_v2_shadow",certification:cert,certification_grade:grade,batch_id:batchId,v2_score_enrichment_batch_id:batchId,source_enrichment_batch_id:sourceBatchId,source_rows_read:total,events_written:Number(counts&&counts.rows||0),rows_read:total,rows_written:Number(counts&&counts.rows||0),inserted_this_invocation:written,v2_d1_batch_flush:true,v2_event_flush_statements:eventFlush.statements,v2_event_flush_batches:eventFlush.batches,v2_event_flush_fallback:eventFlush.fallback,v2_issue_flush_statements:issueFlush.statements,v2_issue_flush_batches:issueFlush.batches,v2_issue_flush_fallback:issueFlush.fallback,v2_issue_backfill_attempted:issueBackfill.attempted,v2_issue_backfill_inserted:issueBackfill.inserted_or_replaced,old_baseline_rows:Number(counts&&counts.old_rows||0),baseline_v2_bridge_rows:Number(counts&&counts.baseline_v2_bridge_rows||0),expansion_baseline_rows:Number(counts&&counts.expansion_rows||0),missing_baseline_rows:Number(counts&&counts.missing_rows||0),blocked_rows:Number(counts&&counts.blocked_rows||0),warning_rows:Number(counts&&counts.warning_rows||0),issue_rows_written:Number(issueCount&&issueCount.rows||0),offset,chunk_rows:limit,chunk_rows_target_150:true,next_offset:offset+rows.length,remaining_rows:remaining,worker_owned_shadow_logic:true,orchestrator_dispatch_only:true,writes_v2_shadow_tables_only:true,production_tables_read_only:["score_enrichment_current","player_baseline_hp_v2_current","expansion_player_baseline_hp_current"],no_fake_hp:true,continuation_required:!complete,orchestrator_should_self_continue:!complete,resume_existing_batch:resumeExisting,resume_inferred_offset:!explicitOffsetProvided,resume_batch_row_count_before:offset,elapsed_ms:Date.now()-started });
  await run(env.SCORE_DB, `UPDATE v2_score_enrichment_batches SET status=?, source_rows_read=?, events_written=?, old_baseline_rows=?, expansion_baseline_rows=?, missing_baseline_rows=?, blocked_rows=?, warning_rows=?, issue_rows_written=?, certification_status=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, complete?"completed":"partial_continue", total, output.events_written, output.old_baseline_rows, output.expansion_baseline_rows, output.missing_baseline_rows, output.blocked_rows, output.warning_rows, output.issue_rows_written, cert, grade, v2Json(output,14000), batchId);
  return output;
}

function v3ShadowReliabilityWeight(row, confidence) {
  const source = String(row && row.baseline_source || '').toLowerCase();
  if (source !== 'expansion_v2_shadow') return 1;
  const c = v2Clamp(Number(confidence || 0), 5, 95) / 100;
  const prop = String(row && row.canonical_prop_key || '').toLowerCase();
  if (prop === 'rfi_nrfi') return v2Clamp(c, 0.05, 0.35);
  return v2Clamp(c, 0.10, 0.60);
}
function v3ShadowCalibrateHp(row, rawHp, confidence) {
  if (rawHp === null || rawHp === undefined) return { hp: null, reliability_weight: null, calibration_applied: false, calibration_reason: 'no_baseline_hp' };
  const source = String(row && row.baseline_source || '').toLowerCase();
  if (source !== 'expansion_v2_shadow') return { hp: rawHp, reliability_weight: 1, calibration_applied: false, calibration_reason: 'production_or_non_expansion_passthrough' };
  const w = v3ShadowReliabilityWeight(row, confidence);
  const calibrated = Math.round(v2Clamp(50 + ((Number(rawHp) - 50) * w), 1, 99) * 100) / 100;
  const prop = String(row && row.canonical_prop_key || '').toLowerCase();
  return { hp: calibrated, reliability_weight: Math.round(w * 10000) / 10000, calibration_applied: true, calibration_reason: prop === 'rfi_nrfi' ? 'expansion_rfi_binary_low_sample_confidence_shrink' : 'expansion_baseline_confidence_shrink' };
}
async function v2BackfillScoreEnrichmentIssues(env, batchId) {
  if (!env || !env.SCORE_DB || !batchId) return { attempted:false, inserted_or_replaced:0 };
  const before = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM v2_score_enrichment_issues WHERE batch_id=?`, batchId);
  await run(env.SCORE_DB, `INSERT OR REPLACE INTO v2_score_enrichment_issues (issue_id,batch_id,event_id,severity,issue_code,issue_message,details_json,created_at)
    SELECT
      e.batch_id || '|' || e.event_id || '|' || CASE WHEN e.event_status='blocked_source_row' THEN 'SOURCE_ROW_BLOCKED' ELSE 'BASELINE_MISSING_SHADOW_DEFERRED' END AS issue_id,
      e.batch_id,
      e.event_id,
      CASE WHEN e.event_status='blocked_source_row' THEN 'BLOCKER' ELSE 'WARNING' END AS severity,
      CASE WHEN e.event_status='blocked_source_row' THEN 'SOURCE_ROW_BLOCKED' ELSE 'BASELINE_MISSING_SHADOW_DEFERRED' END AS issue_code,
      CASE WHEN e.event_status='blocked_source_row' THEN 'Source enrichment row blocks scoring' ELSE 'No production or expansion baseline matched; HP V3 must not emit fake HP' END AS issue_message,
      '{"backfilled":true,"source":"score_enrichment_v2_shadow_final_audit"}' AS details_json,
      CURRENT_TIMESTAMP
    FROM v2_score_enrichment_events e
    WHERE e.batch_id=?
      AND e.event_status<>'ready'
      AND NOT EXISTS (
        SELECT 1 FROM v2_score_enrichment_issues i
        WHERE i.batch_id=e.batch_id
          AND i.event_id=e.event_id
      )`, batchId);
  const after = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM v2_score_enrichment_issues WHERE batch_id=?`, batchId);
  return { attempted:true, inserted_or_replaced:Math.max(0, Number(after && after.rows || 0) - Number(before && before.rows || 0)), before:Number(before && before.rows || 0), after:Number(after && after.rows || 0) };
}

async function runHitProbabilityV3Shadow(env, input = {}) {
  const started = Date.now();
  if (!env.SCORE_DB) return baseIdentity({ ok:false,data_ok:false,version:SHADOW_SCORE_VERSION,worker_name:WORKER_NAME,logical_worker_name:"alphadog-v2-hit-probability-v3-shadow",deployed_worker_slot:WORKER_NAME,job_key:HIT_PROBABILITY_V3_SHADOW_JOB_KEY,status:"blocked_missing_score_db",certification:"HIT_PROBABILITY_V3_SHADOW_MISSING_SCORE_DB",certification_grade:"BLOCKED" });
  await ensureV2ShadowTables(env);
  const requestId = input.request_id || v2Rid("hit_probability_v3");
  const runId = input.run_id || null;
  const chainId = input.chain_id || null;
  const nestedInput = v2NestedInput(input);
  const sourceBatchId = v2FirstDefined(input, nestedInput, ["source_v2_enrichment_batch_id", "v2_score_enrichment_batch_id", "v2_enrichment_batch_id"]) || await latestV2EnrichmentBatch(env);
  if (!sourceBatchId) return baseIdentity({ ok:false,data_ok:false,version:SHADOW_SCORE_VERSION,worker_name:WORKER_NAME,logical_worker_name:"alphadog-v2-hit-probability-v3-shadow",deployed_worker_slot:WORKER_NAME,job_key:HIT_PROBABILITY_V3_SHADOW_JOB_KEY,request_id:requestId,run_id:runId,chain_id:chainId,mode:HIT_PROBABILITY_V3_SHADOW_MODE,status:"blocked_missing_v2_enrichment_batch",certification:"HIT_PROBABILITY_V3_SHADOW_MISSING_ENRICHMENT",certification_grade:"BLOCKED" });
  const explicitOffsetProvided = v2HasExplicitOffsetDeep(input, nestedInput, ["hp_v3_offset", "offset"]);
  let offset = explicitOffsetProvided ? v2ReadOffsetDeep(input, nestedInput, ["hp_v3_offset", "offset"]) : 0;
  const limit = Math.max(100, Math.min(800, Number(v2FirstDefined(input, nestedInput, ["chunk_rows"]) || V3_HP_CHUNK_ROWS) || V3_HP_CHUNK_ROWS));
  let batchId = v2FirstDefined(input, nestedInput, ["hp_v3_batch_id", "resume_batch_id"]) || v2CanonicalBatchId("v2_hp_v3_batch", requestId);
  const resumeExisting = await v2BatchExists(env, "v2_hit_probability_batches", batchId);
  const resumeState = await v2StartOrResumeBatch(env, {
    batchId,
    resumeExisting,
    currentTable:"v2_hit_probability_current",
    issueTable:"v2_hit_probability_issues",
    explicitOffset: explicitOffsetProvided ? offset : null,
    insertSql:`INSERT OR REPLACE INTO v2_hit_probability_batches (batch_id,request_id,run_id,worker_version,mode,status,source_v2_enrichment_batch_id,certification_status,certification_grade,output_json,updated_at) VALUES (?,?,?,?,?,'running',?,'HIT_PROBABILITY_V3_SHADOW_STARTED','RUNNING',?,CURRENT_TIMESTAMP)`,
    insertBinds:[batchId, requestId, runId, SHADOW_SCORE_VERSION, HIT_PROBABILITY_V3_SHADOW_MODE, sourceBatchId, v2Json({ source_v2_enrichment_batch_id:sourceBatchId })],
    updateSql:`UPDATE v2_hit_probability_batches SET run_id=?, worker_version=?, mode=?, source_v2_enrichment_batch_id=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
    updateBinds:[runId, SHADOW_SCORE_VERSION, HIT_PROBABILITY_V3_SHADOW_MODE, sourceBatchId, batchId]
  });
  offset = resumeState.offset;
  const totalRow = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM v2_score_enrichment_events WHERE batch_id=?`, sourceBatchId);
  const total = Number(totalRow && totalRow.rows || 0);
  const rows = await all(env.SCORE_DB, `SELECT * FROM v2_score_enrichment_events WHERE batch_id=? ORDER BY event_id LIMIT ? OFFSET ?`, sourceBatchId, limit, offset);
  const confidenceGroups = await all(env.SCORE_DB, `SELECT canonical_prop_key, source_key, payout_variant, selected_side, line_value, COUNT(*) AS rows FROM v2_score_enrichment_events WHERE batch_id=? AND event_status='ready' GROUP BY canonical_prop_key, source_key, payout_variant, selected_side, line_value`, sourceBatchId);
  const confidenceGroupCounts = new Map(confidenceGroups.map(g => [`${lowerText(g.canonical_prop_key)}|${lowerText(g.source_key)}|${lowerText(g.payout_variant)}|${lowerText(g.selected_side)}|${Number(g.line_value)}`, Number(g.rows || 0)]));
  const confidenceCapForV3Group = (row) => {
    const k = `${lowerText(row.canonical_prop_key)}|${lowerText(row.source_key)}|${lowerText(row.payout_variant)}|${lowerText(row.selected_side)}|${Number(row.line_value)}`;
    const n = confidenceGroupCounts.get(k) || 0;
    if (n > 0 && n < 2) return { cap:60, group_rows:n, reason:'single_row_prop_source_variant_side_line_confidence_cap' };
    if (n > 0 && n < 5) return { cap:72, group_rows:n, reason:'tiny_prop_source_variant_side_line_confidence_cap' };
    if (n > 0 && n < 10) return { cap:82, group_rows:n, reason:'small_prop_source_variant_side_line_confidence_cap' };
    return { cap:95, group_rows:n, reason:null };
  };
  const stmts = [], issueStmts = [];
  let written = 0;
  for (const row of rows) {
    const hpId = `v3_hp|${batchId}|${row.event_id}`;
    const hasBaseline = !!row.baseline_hp_row_id && row.baseline_hp_0_100 !== null && row.event_status === "ready";
    const effect = v2Num(row.factor_effect_0_100, 0) || 0;
    const raw = hasBaseline ? Math.round(v2Clamp(Number(row.baseline_hp_0_100) * Number(row.factor_effect_multiplier || 1), 1, 99) * 100) / 100 : null;
    const groupConfidence = confidenceCapForV3Group(row);
    const baseConfidence = hasBaseline ? v2Clamp(Number(row.baseline_confidence_0_100 || 0), 5, 95) : null;
    const confidence = hasBaseline ? Math.round(Math.min(baseConfidence, groupConfidence.cap) * 100) / 100 : null;
    const calibrated = hasBaseline ? v3ShadowCalibrateHp(row, raw, confidence) : { hp:null, reliability_weight:null, calibration_applied:false, calibration_reason:'no_baseline_hp' };
    const finalHp = calibrated.hp;
    const status = hasBaseline ? "ready_raw" : (row.event_status === "blocked_source_row" ? "blocked_source_row" : "deferred_baseline_missing");
    const grade = hasBaseline ? "READY" : (status === "blocked_source_row" ? "BLOCKED" : "DEFERRED");
    stmts.push(env.SCORE_DB.prepare(`INSERT OR REPLACE INTO v2_hit_probability_current (hp_v3_row_id,batch_id,source_v2_enrichment_batch_id,event_id,prepared_row_id,matrix_id,source_line_id,game_pk,official_date,mlb_player_id,player_name,canonical_prop_key,source_key,line_value,selected_side,payout_variant,baseline_hp_row_id,baseline_source,baseline_hp_0_100,baseline_confidence_0_100,composite_factor_signature,composite_factor_effect_0_100,v3_hp_raw,v3_hp_final,v3_confidence_0_100,normalization_status,hp_v3_status,hp_v3_grade,blocker_count,warning_count,model_payload_json,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(hpId,batchId,sourceBatchId,row.event_id,row.prepared_row_id,row.matrix_id,row.source_line_id,row.game_pk,row.official_date,row.mlb_player_id,row.player_name,row.canonical_prop_key,row.source_key,row.line_value,row.selected_side,row.payout_variant,row.baseline_hp_row_id,row.baseline_source,row.baseline_hp_0_100,row.baseline_confidence_0_100,`${row.factor_id || 'factor'}:${row.factor_effect_tier || 'neutral'}:${row.factor_quality_tier || 'unknown'}`,effect,raw,finalHp,confidence,hasBaseline?"raw_pending_pair_normalization":"not_normalizable",status,grade,status === "blocked_source_row" ? 1 : 0,status === "deferred_baseline_missing" ? 1 : 0,v2Json({ no_fake_hp_when_baseline_missing:true, baseline_missing_outputs_null:!hasBaseline, multiplicative_modifier:row.factor_effect_multiplier, confidence_group_rows:groupConfidence.group_rows, confidence_cap_reason:groupConfidence.reason, confidence_cap_applied:hasBaseline && baseConfidence != null && confidence < baseConfidence, calibration_applied:calibrated.calibration_applied, calibration_reason:calibrated.calibration_reason, reliability_weight:calibrated.reliability_weight, raw_hp_before_calibration:raw, final_hp_after_calibration:finalHp },4000)));
    if (!hasBaseline) {
      issueStmts.push(env.SCORE_DB.prepare(`INSERT OR REPLACE INTO v2_hit_probability_issues (issue_id,batch_id,hp_v3_row_id,severity,issue_code,issue_message,details_json,created_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(`${batchId}|${hpId}|NO_BASELINE_HP`,batchId,hpId,status === "blocked_source_row" ? "BLOCKER" : "WARNING",status === "blocked_source_row" ? "SOURCE_ROW_BLOCKED" : "BASELINE_MISSING_HP_NULL","HP V3 did not emit fake HP for missing or blocked baseline row",v2Json({ event_id:row.event_id, canonical_prop_key:row.canonical_prop_key, source_key:row.source_key },3000)));
    }
    written++;
  }
  const eventFlush = await v2Flush(env.SCORE_DB, stmts, 50);
  const issueFlush = await v2Flush(env.SCORE_DB, issueStmts, 50);
  const remaining = Math.max(0, total - (offset + rows.length));
  const complete = remaining <= 0;
  let normalizedGroups = 0, normalizationBlockedGroups = 0;
  if (complete) {
    const groups = await all(env.SCORE_DB, `SELECT prepared_row_id, source_line_id, canonical_prop_key, line_value, COUNT(*) AS rows, SUM(CASE WHEN v3_hp_final IS NOT NULL THEN 1 ELSE 0 END) AS valid_rows, SUM(CASE WHEN lower(selected_side)='more' THEN v3_hp_final ELSE 0 END) AS more_hp, SUM(CASE WHEN lower(selected_side)='less' THEN v3_hp_final ELSE 0 END) AS less_hp FROM v2_hit_probability_current WHERE batch_id=? AND hp_v3_grade='READY' AND normalization_status='raw_pending_pair_normalization' GROUP BY prepared_row_id, source_line_id, canonical_prop_key, line_value HAVING COUNT(*)=2 AND SUM(CASE WHEN lower(selected_side) IN ('more','less') THEN 1 ELSE 0 END)=2`, batchId);
    for (const g of groups) {
      if (Number(g.valid_rows || 0) !== 2) continue;
      const sum = Number(g.more_hp || 0) + Number(g.less_hp || 0);
      const drift = Math.abs(sum - 100);
      if (drift <= 5 && sum > 0) {
        const moreFinal = Math.round((Number(g.more_hp || 0) / sum) * 10000) / 100;
        const lessFinal = Math.round((Number(g.less_hp || 0) / sum) * 10000) / 100;
        await run(env.SCORE_DB, `UPDATE v2_hit_probability_current SET v3_hp_final=CASE WHEN lower(selected_side)='more' THEN ? ELSE ? END, normalization_status='normalized_pair_sum_100', hp_v3_status='ready_normalized', hp_v3_grade='READY', updated_at=CURRENT_TIMESTAMP WHERE batch_id=? AND prepared_row_id=? AND COALESCE(source_line_id,'')=COALESCE(?, '') AND canonical_prop_key=? AND abs(COALESCE(line_value,-9999)-COALESCE(?,-9998))<0.0001 AND lower(selected_side) IN ('more','less')`, moreFinal, lessFinal, batchId, g.prepared_row_id, g.source_line_id || '', g.canonical_prop_key, g.line_value);
        normalizedGroups++;
      } else {
        await run(env.SCORE_DB, `UPDATE v2_hit_probability_current SET v3_hp_final=NULL, normalization_status='blocked_pair_drift_gt_5', hp_v3_status='blocked_normalization_drift', hp_v3_grade='BLOCKED', blocker_count=blocker_count+1, updated_at=CURRENT_TIMESTAMP WHERE batch_id=? AND prepared_row_id=? AND COALESCE(source_line_id,'')=COALESCE(?, '') AND canonical_prop_key=? AND abs(COALESCE(line_value,-9999)-COALESCE(?,-9998))<0.0001 AND lower(selected_side) IN ('more','less')`, batchId, g.prepared_row_id, g.source_line_id || '', g.canonical_prop_key, g.line_value);
        await run(env.SCORE_DB, `INSERT OR REPLACE INTO v2_hit_probability_issues (issue_id,batch_id,severity,issue_code,issue_message,details_json,created_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)`, `${batchId}|${g.prepared_row_id}|NORMALIZATION_DRIFT`, batchId, "BLOCKER", "PAIR_NORMALIZATION_DRIFT_GT_5", "Two-side HP raw sum drift exceeded 5 HP; pair blocked", v2Json({ sum, drift, canonical_prop_key:g.canonical_prop_key, line_value:g.line_value },3000));
        normalizationBlockedGroups++;
      }
    }
  }
  const counts = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows, SUM(CASE WHEN substr(COALESCE(hp_v3_status,''),1,5)='ready' THEN 1 ELSE 0 END) AS ready_rows, SUM(CASE WHEN substr(COALESCE(hp_v3_status,''),1,8)='deferred' THEN 1 ELSE 0 END) AS deferred_rows, SUM(CASE WHEN substr(COALESCE(hp_v3_status,''),1,7)='blocked' THEN 1 ELSE 0 END) AS blocked_rows FROM v2_hit_probability_current WHERE batch_id=?`, batchId);
  const issueCount = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM v2_hit_probability_issues WHERE batch_id=?`, batchId);
  const cert = complete ? "HIT_PROBABILITY_V3_SHADOW_CERTIFIED_NO_FAKE_HP" : "HIT_PROBABILITY_V3_SHADOW_PARTIAL_CONTINUE";
  const grade = complete && normalizationBlockedGroups === 0 ? "PASS_WITH_REVIEW_WARNINGS_ALLOWED" : (complete ? "PASS_WITH_BLOCKED_NORMALIZATION_ROWS" : "PARTIAL");
  const output = baseIdentity({ ok:true,data_ok:true,version:SHADOW_SCORE_VERSION,worker_name:WORKER_NAME,logical_worker_name:"alphadog-v2-hit-probability-v3-shadow",deployed_worker_slot:WORKER_NAME,job_key:HIT_PROBABILITY_V3_SHADOW_JOB_KEY,request_id:requestId,run_id:runId,chain_id:chainId,mode:HIT_PROBABILITY_V3_SHADOW_MODE,status:complete?"completed_hit_probability_v3_shadow":"partial_continue_hit_probability_v3_shadow",certification:cert,certification_grade:grade,batch_id:batchId,hp_v3_batch_id:batchId,source_v2_enrichment_batch_id:sourceBatchId,source_rows_read:total,rows_written:Number(counts&&counts.rows||0),inserted_this_invocation:written,v2_d1_batch_flush:true,v2_event_flush_statements:eventFlush.statements,v2_event_flush_batches:eventFlush.batches,v2_event_flush_fallback:eventFlush.fallback,v2_issue_flush_statements:issueFlush.statements,v2_issue_flush_batches:issueFlush.batches,v2_issue_flush_fallback:issueFlush.fallback,hp_ready_rows:Number(counts&&counts.ready_rows||0),hp_deferred_rows:Number(counts&&counts.deferred_rows||0),hp_blocked_rows:Number(counts&&counts.blocked_rows||0),normalized_groups:normalizedGroups,normalization_blocked_groups:normalizationBlockedGroups,issue_rows_written:Number(issueCount&&issueCount.rows||0),offset,chunk_rows:limit,chunk_rows_target_150:true,next_offset:offset+rows.length,remaining_rows:remaining,worker_owned_shadow_logic:true,orchestrator_dispatch_only:true,no_fake_hp_when_baseline_missing:true,missing_baseline_hp_null:true,valid_pair_normalization:true,continuation_required:!complete,orchestrator_should_self_continue:!complete,resume_existing_batch:resumeExisting,resume_inferred_offset:!explicitOffsetProvided,resume_batch_row_count_before:offset,elapsed_ms:Date.now()-started });
  await run(env.SCORE_DB, `UPDATE v2_hit_probability_batches SET status=?, source_rows_read=?, rows_written=?, hp_ready_rows=?, hp_deferred_rows=?, hp_blocked_rows=?, normalized_groups=?, normalization_blocked_groups=?, issue_rows_written=?, certification_status=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, complete?"completed":"partial_continue", total, output.rows_written, output.hp_ready_rows, output.hp_deferred_rows, output.hp_blocked_rows, normalizedGroups, normalizationBlockedGroups, output.issue_rows_written, cert, grade, v2Json(output,14000), batchId);
  return output;
}
async function runFinalScoreV2Shadow(env, input = {}) {
  const started = Date.now();
  if (!env.SCORE_DB) return baseIdentity({ ok:false,data_ok:false,version:SHADOW_SCORE_VERSION,worker_name:WORKER_NAME,logical_worker_name:"alphadog-v2-final-score-v2-shadow",deployed_worker_slot:WORKER_NAME,job_key:FINAL_SCORE_V2_SHADOW_JOB_KEY,status:"blocked_missing_score_db",certification:"FINAL_SCORE_V2_SHADOW_MISSING_SCORE_DB",certification_grade:"BLOCKED" });
  await ensureV2ShadowTables(env);
  const requestId = input.request_id || v2Rid("final_score_v2");
  const runId = input.run_id || null;
  const chainId = input.chain_id || null;
  const sourceBatchId = input.hp_v3_batch_id || input.source_hp_v3_batch_id || await latestHpV3Batch(env);
  if (!sourceBatchId) return baseIdentity({ ok:false,data_ok:false,version:SHADOW_SCORE_VERSION,worker_name:WORKER_NAME,logical_worker_name:"alphadog-v2-final-score-v2-shadow",deployed_worker_slot:WORKER_NAME,job_key:FINAL_SCORE_V2_SHADOW_JOB_KEY,request_id:requestId,run_id:runId,chain_id:chainId,mode:FINAL_SCORE_V2_SHADOW_MODE,status:"blocked_missing_hp_v3_batch",certification:"FINAL_SCORE_V2_SHADOW_MISSING_HP_V3",certification_grade:"BLOCKED" });
  const nestedInput = v2NestedInput(input);
  const explicitOffsetProvided = v2HasExplicitOffsetDeep(input, nestedInput, ["final_score_v2_offset", "offset"]);
  let offset = explicitOffsetProvided ? v2ReadOffsetDeep(input, nestedInput, ["final_score_v2_offset", "offset"]) : 0;
  const limit = Math.max(100, Math.min(900, Number(v2FirstDefined(input, nestedInput, ["chunk_rows"]) || V2_FINAL_SCORE_CHUNK_ROWS) || V2_FINAL_SCORE_CHUNK_ROWS));
  let batchId = v2FirstDefined(input, nestedInput, ["final_score_v2_batch_id", "resume_batch_id"]) || v2CanonicalBatchId("v2_final_score_batch", requestId);
  const resumeExisting = await v2BatchExists(env, "v2_final_score_batches", batchId);
  const resumeState = await v2StartOrResumeBatch(env, {
    batchId,
    resumeExisting,
    currentTable:"v2_final_score_current",
    issueTable:"v2_final_score_issues",
    explicitOffset: explicitOffsetProvided ? offset : null,
    insertSql:`INSERT OR REPLACE INTO v2_final_score_batches (batch_id,request_id,run_id,worker_version,mode,status,source_hp_v3_batch_id,certification_status,certification_grade,output_json,updated_at) VALUES (?,?,?,?,?,'running',?,'FINAL_SCORE_V2_SHADOW_STARTED','RUNNING',?,CURRENT_TIMESTAMP)`,
    insertBinds:[batchId, requestId, runId, SHADOW_SCORE_VERSION, FINAL_SCORE_V2_SHADOW_MODE, sourceBatchId, v2Json({ source_hp_v3_batch_id:sourceBatchId })],
    updateSql:`UPDATE v2_final_score_batches SET run_id=?, worker_version=?, mode=?, source_hp_v3_batch_id=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
    updateBinds:[runId, SHADOW_SCORE_VERSION, FINAL_SCORE_V2_SHADOW_MODE, sourceBatchId, batchId]
  });
  offset = resumeState.offset;
  const totalRow = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM v2_hit_probability_current WHERE batch_id=?`, sourceBatchId);
  const total = Number(totalRow && totalRow.rows || 0);
  const rows = await all(env.SCORE_DB, `SELECT * FROM v2_hit_probability_current WHERE batch_id=? ORDER BY hp_v3_row_id LIMIT ? OFFSET ?`, sourceBatchId, limit, offset);
  const stmts = [], issueStmts = [];
  let written = 0;
  for (const row of rows) {
    const id = `v2_score|${batchId}|${row.hp_v3_row_id}`;
    const hp = v2Num(row.v3_hp_final, null);
    const conf = v2Num(row.v3_confidence_0_100, null);
    const payout = String(row.payout_variant || "standard").toLowerCase();
    const payoutAdj = payout === "demon" ? 2 : (payout === "goblin" ? -1.5 : 0);
    const eligible = hp !== null && hp >= 60 && row.hp_v3_status && String(row.hp_v3_status).startsWith("ready");
    const score = eligible ? Math.round(v2Clamp((hp * 0.72) + ((conf || 0) * 0.28) + payoutAdj, 0, 100) * 100) / 100 : null;
    const status = eligible ? "review_ready" : (row.hp_v3_status && String(row.hp_v3_status).startsWith("blocked") ? "blocked" : "deferred_or_low_hp");
    const grade = eligible ? "REVIEW" : (status === "blocked" ? "BLOCKED" : "DEFERRED");
    stmts.push(env.SCORE_DB.prepare(`INSERT OR REPLACE INTO v2_final_score_current (final_score_v2_row_id,batch_id,source_hp_v3_batch_id,hp_v3_row_id,prepared_row_id,matrix_id,source_line_id,game_pk,official_date,mlb_player_id,player_name,canonical_prop_key,source_key,line_value,selected_side,payout_variant,hit_probability_0_100,certainty_0_100,final_score_0_100,final_score_confidence_0_100,final_score_status,final_score_grade,final_score_lane,review_playable,live_playable,eligible_for_final_board,blocked_reason,details_json,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(id,batchId,sourceBatchId,row.hp_v3_row_id,row.prepared_row_id,row.matrix_id,row.source_line_id,row.game_pk,row.official_date,row.mlb_player_id,row.player_name,row.canonical_prop_key,row.source_key,row.line_value,row.selected_side,row.payout_variant,hp,conf,score,conf,status,grade,"shadow_review",eligible?1:0,0,eligible?1:0,eligible?null:status,v2Json({ payout_adjustment_score_only:payoutAdj, goblin_demon_does_not_modify_hp:true, live_playable_forced_zero:true },4000)));
    if (!eligible) issueStmts.push(env.SCORE_DB.prepare(`INSERT OR REPLACE INTO v2_final_score_issues (issue_id,batch_id,final_score_v2_row_id,severity,issue_code,issue_message,details_json,created_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(`${batchId}|${id}|NOT_ELIGIBLE`,batchId,id,status === "blocked" ? "BLOCKER" : "INFO","FINAL_SCORE_V2_NOT_BOARD_ELIGIBLE","V2 final score row is not eligible for review board",v2Json({ hp_v3_status:row.hp_v3_status, hp },3000)));
    written++;
  }
  const eventFlush = await v2Flush(env.SCORE_DB, stmts, 50);
  const issueFlush = await v2Flush(env.SCORE_DB, issueStmts, 50);
  const remaining = Math.max(0, total - (offset + rows.length));
  const complete = remaining <= 0;
  const counts = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows, SUM(CASE WHEN eligible_for_final_board=1 THEN 1 ELSE 0 END) AS eligible_rows, SUM(CASE WHEN review_playable=1 THEN 1 ELSE 0 END) AS review_rows, SUM(CASE WHEN final_score_status='blocked' THEN 1 ELSE 0 END) AS blocked_rows FROM v2_final_score_current WHERE batch_id=?`, batchId);
  const issueCount = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM v2_final_score_issues WHERE batch_id=?`, batchId);
  const cert = complete ? "FINAL_SCORE_V2_SHADOW_CERTIFIED_REVIEW_ONLY" : "FINAL_SCORE_V2_SHADOW_PARTIAL_CONTINUE";
  const grade = v2CertificationGrade(true, !complete);
  const output = baseIdentity({ ok:true,data_ok:true,version:SHADOW_SCORE_VERSION,worker_name:WORKER_NAME,logical_worker_name:"alphadog-v2-final-score-v2-shadow",deployed_worker_slot:WORKER_NAME,job_key:FINAL_SCORE_V2_SHADOW_JOB_KEY,request_id:requestId,run_id:runId,chain_id:chainId,mode:FINAL_SCORE_V2_SHADOW_MODE,status:complete?"completed_final_score_v2_shadow":"partial_continue_final_score_v2_shadow",certification:cert,certification_grade:grade,batch_id:batchId,final_score_v2_batch_id:batchId,source_hp_v3_batch_id:sourceBatchId,source_rows_read:total,rows_written:Number(counts&&counts.rows||0),inserted_this_invocation:written,v2_d1_batch_flush:true,v2_event_flush_statements:eventFlush.statements,v2_event_flush_batches:eventFlush.batches,v2_event_flush_fallback:eventFlush.fallback,v2_issue_flush_statements:issueFlush.statements,v2_issue_flush_batches:issueFlush.batches,v2_issue_flush_fallback:issueFlush.fallback,eligible_rows:Number(counts&&counts.eligible_rows||0),review_rows:Number(counts&&counts.review_rows||0),blocked_rows:Number(counts&&counts.blocked_rows||0),issue_rows_written:Number(issueCount&&issueCount.rows||0),offset,chunk_rows:limit,chunk_rows_target_150:true,next_offset:offset+rows.length,remaining_rows:remaining,worker_owned_shadow_logic:true,orchestrator_dispatch_only:true,review_only:true,live_playable_forced_zero:true,goblin_demon_score_only:true,continuation_required:!complete,orchestrator_should_self_continue:!complete,resume_existing_batch:resumeExisting,resume_inferred_offset:!explicitOffsetProvided,resume_batch_row_count_before:offset,elapsed_ms:Date.now()-started });
  await run(env.SCORE_DB, `UPDATE v2_final_score_batches SET status=?, source_rows_read=?, rows_written=?, eligible_rows=?, review_rows=?, blocked_rows=?, issue_rows_written=?, certification_status=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, complete?"completed":"partial_continue", total, output.rows_written, output.eligible_rows, output.review_rows, output.blocked_rows, output.issue_rows_written, cert, grade, v2Json(output,14000), batchId);
  return output;
}

function v3TodayUtc() {
  return new Date().toISOString().slice(0, 10);
}
function v3CalendarCanonicalFlags(row) {
  const detailed = String(row && row.detailed_state || "").toLowerCase();
  const abstractState = String(row && row.abstract_game_state || "").toLowerCase();
  const statusCode = String(row && row.status_code || "").toUpperCase();
  const isPostponed = /postponed/.test(detailed) || /postponed/.test(abstractState) || ["D", "DI", "DR"].includes(statusCode);
  const isSuspended = /suspended/.test(detailed) || /suspended/.test(abstractState) || statusCode === "U";
  const isCancelled = /cancelled|canceled/.test(detailed) || /cancelled|canceled/.test(abstractState) || ["C", "PW", "PR"].includes(statusCode);
  const isFinal = !isPostponed && !isSuspended && !isCancelled && (/final|game over/.test(detailed) || abstractState === "final" || ["F", "O"].includes(statusCode));
  const isLive = !isFinal && !isPostponed && !isSuspended && !isCancelled && (abstractState === "live" || statusCode === "I" || detailed.includes("in progress") || detailed.includes("manager challenge") || /\breview\b/.test(detailed));
  const isPregame = !isLive && !isFinal && !isPostponed && !isSuspended && !isCancelled && (abstractState === "preview" || ["S", "P"].includes(statusCode) || detailed.includes("scheduled") || detailed.includes("pre-game") || detailed.includes("warmup"));
  return {
    is_scheduled: isPregame ? 1 : 0,
    is_pregame: isPregame ? 1 : 0,
    is_live: isLive ? 1 : 0,
    is_final: isFinal ? 1 : 0,
    is_postponed: isPostponed ? 1 : 0,
    is_suspended: isSuspended ? 1 : 0,
    is_cancelled: isCancelled ? 1 : 0
  };
}
function v3CalendarGameOpen(row, nowMs = Date.now()) {
  if (!row) return false;
  const officialDate = String(row.official_date || "").slice(0, 10);
  if (officialDate && officialDate < v3TodayUtc()) return false;
  const flags = v3CalendarCanonicalFlags(row);
  if (flags.is_final || flags.is_postponed || flags.is_suspended || flags.is_cancelled) return false;
  const t = Date.parse(row.game_time_utc || "");
  if (!Number.isFinite(t)) return false;
  return t > nowMs;
}
async function v3CalendarContextMap(env, gamePks = []) {
  const ids = [...new Set((gamePks || []).map(v => Number(v)).filter(Number.isFinite))];
  const map = new Map();
  if (!ids.length || !env.TEAM_DB) return map;
  const chunkSize = 90;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => "?").join(",");
    const rows = await all(env.TEAM_DB, `SELECT game_pk, official_date, game_time_utc, game_time_pt, status_code, abstract_game_state, detailed_state, is_scheduled, is_pregame, is_live, is_final, is_postponed, is_suspended, is_cancelled, source_snapshot_at, updated_at, home_team_id, away_team_id, home_team_name, away_team_name, venue_id, venue_name FROM mlb_game_calendar WHERE game_pk IN (${placeholders})`, ...chunk);
    for (const r of rows || []) map.set(Number(r.game_pk), r);
  }
  return map;
}
function v3CalendarDetails(row) {
  if (!row) return null;
  const flags = v3CalendarCanonicalFlags(row);
  return {
    game_pk: row.game_pk == null ? null : Number(row.game_pk),
    official_date: row.official_date || null,
    game_time_utc: row.game_time_utc || null,
    game_time_pt: row.game_time_pt || null,
    status_code: row.status_code || null,
    abstract_game_state: row.abstract_game_state || null,
    detailed_state: row.detailed_state || null,
    is_scheduled: flags.is_scheduled,
    is_pregame: flags.is_pregame,
    is_live: flags.is_live,
    is_final: flags.is_final,
    is_postponed: flags.is_postponed,
    is_suspended: flags.is_suspended,
    is_cancelled: flags.is_cancelled,
    raw_calendar_is_live: Number(row.is_live || 0),
    source_snapshot_at: row.source_snapshot_at || null,
    updated_at: row.updated_at || null,
    calendar_status_canonicalized: true,
    home_team_id: row.home_team_id == null ? null : Number(row.home_team_id),
    away_team_id: row.away_team_id == null ? null : Number(row.away_team_id),
    home_team_name: row.home_team_name || null,
    away_team_name: row.away_team_name || null,
    venue_id: row.venue_id == null ? null : Number(row.venue_id),
    venue_name: row.venue_name || null
  };
}

async function runFinalBoardV3Shadow(env, input = {}) {
  const started = Date.now();
  if (!env.SCORE_DB) return baseIdentity({ ok:false,data_ok:false,version:SHADOW_SCORE_VERSION,worker_name:WORKER_NAME,logical_worker_name:"alphadog-v2-final-board-v3-shadow",deployed_worker_slot:WORKER_NAME,job_key:FINAL_BOARD_V3_SHADOW_JOB_KEY,status:"blocked_missing_score_db",certification:"FINAL_BOARD_V3_SHADOW_MISSING_SCORE_DB",certification_grade:"BLOCKED" });
  await ensureV2ShadowTables(env);
  const requestId = input.request_id || v2Rid("final_board_v3");
  const runId = input.run_id || null;
  const chainId = input.chain_id || null;
  const sourceBatchId = input.final_score_v2_batch_id || input.source_final_score_v2_batch_id || await latestFinalScoreV2Batch(env);
  if (!sourceBatchId) return baseIdentity({ ok:false,data_ok:false,version:SHADOW_SCORE_VERSION,worker_name:WORKER_NAME,logical_worker_name:"alphadog-v2-final-board-v3-shadow",deployed_worker_slot:WORKER_NAME,job_key:FINAL_BOARD_V3_SHADOW_JOB_KEY,request_id:requestId,run_id:runId,chain_id:chainId,mode:FINAL_BOARD_V3_SHADOW_MODE,status:"blocked_missing_final_score_v2_batch",certification:"FINAL_BOARD_V3_SHADOW_MISSING_FINAL_SCORE_V2",certification_grade:"BLOCKED" });
  const nestedInput = v2NestedInput(input);
  const explicitOffsetProvided = v2HasExplicitOffsetDeep(input, nestedInput, ["final_board_v3_offset", "offset"]);
  let offset = explicitOffsetProvided ? v2ReadOffsetDeep(input, nestedInput, ["final_board_v3_offset", "offset"]) : 0;
  const limit = Math.max(100, Math.min(500, Number(v2FirstDefined(input, nestedInput, ["chunk_rows"]) || V3_FINAL_BOARD_CHUNK_ROWS) || V3_FINAL_BOARD_CHUNK_ROWS));
  let batchId = v2FirstDefined(input, nestedInput, ["final_board_v3_batch_id", "resume_batch_id"]) || v2CanonicalBatchId("v2_final_board_batch", requestId);
  const resumeExisting = await v2BatchExists(env, "v2_final_board_batches", batchId);
  const resumeState = await v2StartOrResumeBatch(env, {
    batchId,
    resumeExisting,
    currentTable:"v2_final_board_current",
    issueTable:"v2_final_board_issues",
    explicitOffset: explicitOffsetProvided ? offset : null,
    insertSql:`INSERT OR REPLACE INTO v2_final_board_batches (batch_id,request_id,run_id,worker_version,mode,status,source_final_score_v2_batch_id,certification_status,certification_grade,output_json,updated_at) VALUES (?,?,?,?,?,'running',?,'FINAL_BOARD_V3_SHADOW_STARTED','RUNNING',?,CURRENT_TIMESTAMP)`,
    insertBinds:[batchId, requestId, runId, SHADOW_SCORE_VERSION, FINAL_BOARD_V3_SHADOW_MODE, sourceBatchId, v2Json({ source_final_score_v2_batch_id:sourceBatchId })],
    updateSql:`UPDATE v2_final_board_batches SET run_id=?, worker_version=?, mode=?, source_final_score_v2_batch_id=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
    updateBinds:[runId, SHADOW_SCORE_VERSION, FINAL_BOARD_V3_SHADOW_MODE, sourceBatchId, batchId]
  });
  offset = resumeState.offset;
  const boardOfficialDateFloor = String(v2FirstDefined(input, nestedInput, ["board_official_date_floor"]) || v3TodayUtc()).slice(0, 10);
  const totalRow = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM v2_final_score_current WHERE batch_id=? AND official_date >= ?`, sourceBatchId, boardOfficialDateFloor);
  const eligibleRow = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM v2_final_score_current WHERE batch_id=? AND eligible_for_final_board=1 AND official_date >= ?`, sourceBatchId, boardOfficialDateFloor);
  const total = Number(totalRow && totalRow.rows || 0);
  const eligibleTotal = Number(eligibleRow && eligibleRow.rows || 0);
  const rows = await all(env.SCORE_DB, `SELECT * FROM v2_final_score_current WHERE batch_id=? AND eligible_for_final_board=1 AND official_date >= ? ORDER BY final_score_0_100 DESC, hit_probability_0_100 DESC, certainty_0_100 DESC, final_score_v2_row_id LIMIT ? OFFSET ?`, sourceBatchId, boardOfficialDateFloor, limit, offset);
  const gameMap = await v3CalendarContextMap(env, rows.map(r => r.game_pk));
  const rankStart = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM v2_final_board_current WHERE batch_id=?`, batchId);
  const stmts = [];
  let rank = Number(rankStart && rankStart.rows || 0) + 1;
  let skippedClosedGames = 0;
  let skippedMissingCalendar = 0;
  for (const row of rows) {
    const gameContext = gameMap.get(Number(row.game_pk));
    if (!gameContext) { skippedMissingCalendar++; continue; }
    if (!v3CalendarGameOpen(gameContext)) { skippedClosedGames++; continue; }
    const calendarDetails = v3CalendarDetails(gameContext);
    const id = `v3_board|${batchId}|${row.final_score_v2_row_id}`;
    stmts.push(env.SCORE_DB.prepare(`INSERT OR REPLACE INTO v2_final_board_current (board_v3_row_id,batch_id,source_final_score_v2_batch_id,final_score_v2_row_id,prepared_row_id,matrix_id,source_line_id,game_pk,official_date,mlb_player_id,player_name,canonical_prop_key,source_key,line_value,selected_side,payout_variant,rank_order,hit_probability_0_100,certainty_0_100,overall_score_0_100,board_status,board_grade,board_lane,review_playable,live_playable,sort_tuple_json,details_json,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(id,batchId,sourceBatchId,row.final_score_v2_row_id,row.prepared_row_id,row.matrix_id,row.source_line_id,row.game_pk,row.official_date,row.mlb_player_id,row.player_name,row.canonical_prop_key,row.source_key,row.line_value,row.selected_side,row.payout_variant,rank,row.hit_probability_0_100,row.certainty_0_100,row.final_score_0_100,"shadow_review_board","REVIEW","shadow_v3",1,0,v2Json([row.final_score_0_100,row.hit_probability_0_100,row.certainty_0_100,rank],1000),v2Json({ review_only:true, not_production_final_board:true, not_live_plays:true, game_context:calendarDetails, game_status_guard:"official_date_today_or_future_and_game_time_utc_gt_now" },3000)));
    rank++;
  }
  const eventFlush = await v2Flush(env.SCORE_DB, stmts, 25);
  const remaining = Math.max(0, eligibleTotal - (offset + rows.length));
  const complete = remaining <= 0;
  const counts = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows, SUM(CASE WHEN live_playable<>0 THEN 1 ELSE 0 END) AS live_leak_rows FROM v2_final_board_current WHERE batch_id=?`, batchId);
  const leakRows = Number(counts && counts.live_leak_rows || 0);
  if (complete && leakRows > 0) await run(env.SCORE_DB, `INSERT OR REPLACE INTO v2_final_board_issues (issue_id,batch_id,severity,issue_code,issue_message,details_json,created_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)`, `${batchId}|LIVE_LEAK`, batchId, "BLOCKER", "V3_BOARD_LIVE_PLAYABLE_LEAK", "Shadow final board must never emit live plays", v2Json({ live_leak_rows:leakRows },2000));
  const issueCount = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM v2_final_board_issues WHERE batch_id=?`, batchId);
  const cert = complete ? (leakRows === 0 ? "FINAL_BOARD_V3_SHADOW_CERTIFIED_REVIEW_ONLY" : "FINAL_BOARD_V3_SHADOW_CERTIFICATION_FAILED") : "FINAL_BOARD_V3_SHADOW_PARTIAL_CONTINUE";
  const grade = complete ? (leakRows === 0 ? "PASS_WITH_REVIEW_WARNINGS_ALLOWED" : "FAILED") : "PARTIAL";
  const output = baseIdentity({ ok:leakRows===0,data_ok:leakRows===0,version:SHADOW_SCORE_VERSION,worker_name:WORKER_NAME,logical_worker_name:"alphadog-v2-final-board-v3-shadow",deployed_worker_slot:WORKER_NAME,job_key:FINAL_BOARD_V3_SHADOW_JOB_KEY,request_id:requestId,run_id:runId,chain_id:chainId,mode:FINAL_BOARD_V3_SHADOW_MODE,status:complete?"completed_final_board_v3_shadow":"partial_continue_final_board_v3_shadow",certification:cert,certification_grade:grade,batch_id:batchId,final_board_v3_batch_id:batchId,source_final_score_v2_batch_id:sourceBatchId,source_rows_read:total,eligible_rows_read:eligibleTotal,rows_written:Number(counts&&counts.rows||0),inserted_this_invocation:stmts.length,source_rows_scanned_this_invocation:rows.length,skipped_closed_or_started_games:skippedClosedGames,skipped_missing_calendar_games:skippedMissingCalendar,board_official_date_floor:boardOfficialDateFloor,issue_rows_written:Number(issueCount&&issueCount.rows||0),offset,chunk_rows:limit,chunk_rows_target_150:true,next_offset:offset+rows.length,remaining_rows:remaining,worker_owned_shadow_logic:true,orchestrator_dispatch_only:true,review_only:true,not_production_final_board:true,live_playable_forced_zero:true,calendar_pregame_guard:true,calendar_status_canonical_guard_v0_4_65:true,continuation_required:!complete,orchestrator_should_self_continue:!complete,resume_existing_batch:resumeExisting,resume_inferred_offset:!explicitOffsetProvided,resume_batch_row_count_before:offset,elapsed_ms:Date.now()-started });
  await run(env.SCORE_DB, `UPDATE v2_final_board_batches SET status=?, source_rows_read=?, eligible_rows_read=?, rows_written=?, issue_rows_written=?, certification_status=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, complete?"completed":"partial_continue", total, eligibleTotal, output.rows_written, output.issue_rows_written, cert, grade, v2Json(output,14000), batchId);
  return output;
}

function isV2V3ShadowInput(input) {
  const job = String((input && input.job_key) || '').toLowerCase();
  const mode = String((input && input.mode) || '').toLowerCase();
  return job === SCORE_ENRICHMENT_V2_SHADOW_JOB_KEY || job === HIT_PROBABILITY_V3_SHADOW_JOB_KEY || job === FINAL_SCORE_V2_SHADOW_JOB_KEY || job === FINAL_BOARD_V3_SHADOW_JOB_KEY || mode === SCORE_ENRICHMENT_V2_SHADOW_MODE || mode === HIT_PROBABILITY_V3_SHADOW_MODE || mode === FINAL_SCORE_V2_SHADOW_MODE || mode === FINAL_BOARD_V3_SHADOW_MODE;
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
        const isEnrichmentV1 = input && (input.mode === ENRICHMENT_V1_MODE || input.job_key === ENRICHMENT_V1_JOB_KEY);
        const isScoreEnrichmentV2Shadow = input && (input.mode === SCORE_ENRICHMENT_V2_SHADOW_MODE || input.job_key === SCORE_ENRICHMENT_V2_SHADOW_JOB_KEY);
        const isHitProbabilityV3Shadow = input && (input.mode === HIT_PROBABILITY_V3_SHADOW_MODE || input.job_key === HIT_PROBABILITY_V3_SHADOW_JOB_KEY);
        const isFinalScoreV2Shadow = input && (input.mode === FINAL_SCORE_V2_SHADOW_MODE || input.job_key === FINAL_SCORE_V2_SHADOW_JOB_KEY);
        const isFinalBoardV3Shadow = input && (input.mode === FINAL_BOARD_V3_SHADOW_MODE || input.job_key === FINAL_BOARD_V3_SHADOW_JOB_KEY);
        const isShadowV2Lane = isV2V3ShadowInput(input);
        const isSimulation = input && (input.mode === "scoring_engine_simulation_shadow_strict_b" || input.job_key === "scoring-engine-simulation");
        const isHitProbabilityEstimate = input && (input.mode === "hit_probability_current_estimate" || input.job_key === "hit-probability");
        const isHpBoard = input && (input.mode === HP_BOARD_MODE || input.job_key === HP_BOARD_JOB_KEY);
        const isHitProbability = isHitProbabilityEstimate || isHpBoard || isHitProbabilityV3Shadow;
        if (!isShadowV2Lane) {
          await controlLifecycleHeartbeat(env, input, isEnrichmentV1 ? "running_score_enrichment_v1_worker_started" : (isHitProbability ? "running_hit_probability_worker_started" : (isSimulation ? "running_scoring_engine_simulation_worker_started" : (isFinalBoard ? "running_scoring_final_board_worker_started" : "running_scoring_engine_worker_started"))), { selected_mode: input.mode || null, worker_owned_shadow_lane:false });
        }
        const isFrameworkGate = input && input.mode === "scoring_engine_framework_profile_gate" && input.framework_only === true && input.real_scoring_enabled !== true;
        let output;
        if (isScoreEnrichmentV2Shadow) {
          output = await runScoreEnrichmentV2Shadow(env, input);
        } else if (isHitProbabilityV3Shadow) {
          output = await runHitProbabilityV3Shadow(env, input);
        } else if (isFinalScoreV2Shadow) {
          output = await runFinalScoreV2Shadow(env, input);
        } else if (isFinalBoardV3Shadow) {
          output = await runFinalBoardV3Shadow(env, input);
        } else if (isEnrichmentV1) {
          output = await runScoreEnrichmentV1(env, input);
        } else if (isHpBoard) {
          output = await runHpBoardCurrent(env, input);
        } else if (isHitProbabilityEstimate) {
          output = await runHitProbabilityCurrent(env, input);
          if (false && output && output.ok !== false && input.skip_hp_board !== true && !isWorkerPartialContinueOutput(output)) {
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
        const shadowFailure = isV2V3ShadowInput(input);
        const failOutput = baseIdentity({
          ok: false,
          data_ok: false,
          version: shadowFailure ? SHADOW_SCORE_VERSION : VERSION,
          logical_worker_name: shadowFailure ? "alphadog-v2-v2-v3-shadow-scoring" : LOGICAL_WORKER_NAME,
          deployed_worker_slot: WORKER_NAME,
          request_id: input.request_id || null,
          run_id: input.run_id || null,
          job_key: input.job_key || JOB_KEY,
          status: shadowFailure ? "v2_v3_shadow_worker_exception" : "scoring_engine_exception",
          certification: shadowFailure ? "V2_V3_SHADOW_WORKER_EXCEPTION" : "SCORING_ENGINE_EXCEPTION",
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
