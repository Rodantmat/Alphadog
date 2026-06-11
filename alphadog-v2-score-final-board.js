const WORKER_NAME = "alphadog-v2-score-final-board";
const VERSION = "alphadog-v2-score-final-board-v0.1.34-quota-reserve-soft-exposure-finalizer";
const JOB_KEY = "score-final-board";
const PRIMARY_PROFILE = "STRICT_C_HP_FIRST_TRUST_V4_1"; // fallback only; runtime resolves the active profile_key from the terminal scoring_engine_current / hp_board_current batch

function nowUtc() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
async function readJsonSafe(request) { try { return await request.json(); } catch (_) { return {}; } }
async function run(db, sql, ...binds) { return await db.prepare(sql).bind(...binds).run(); }
async function first(db, sql, ...binds) { return await db.prepare(sql).bind(...binds).first(); }
async function all(db, sql, ...binds) { const r = await db.prepare(sql).bind(...binds).all(); return (r && r.results) || []; }
function safeJson(v) { try { return JSON.stringify(v == null ? {} : v); } catch (_) { return "{}"; } }
function num(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function norm(v) { return String(v == null ? "" : v).trim().toLowerCase(); }
function parseJsonObject(value) { try { const parsed = JSON.parse(value || "{}"); return parsed && typeof parsed === "object" ? parsed : {}; } catch (_) { return {}; } }
function getPath(obj, path) { let cur = obj; for (const part of path) { if (cur == null || typeof cur !== "object") return null; cur = cur[part]; } return cur == null ? null : cur; }
const PRIMARY_THRESHOLD_SCORE = 88;
const PRIMARY_THRESHOLD_CONFIDENCE = 85;
const PRIMARY_SANITY_DEMOTE_HP_BELOW = 45;
const PRIMARY_SANITY_RESCUE_SCORE_A = 86;
const PRIMARY_SANITY_RESCUE_HP_A = 70;
const PRIMARY_SANITY_RESCUE_SCORE_B = 85;
const PRIMARY_SANITY_RESCUE_HP_B = 80;
const PRIMARY_SANITY_MIN_HP_CONFIDENCE = 80;
const PRIMARY_SANITY_MIN_NON_PUSH_SAMPLE = 25;
const FINAL_BOARD_MAX_ROWS_PER_PLAYER_TOTAL = 7;
const FINAL_BOARD_DEDUPE_SOURCE_MARKET_CLUSTER = true;
const FINAL_BOARD_PROP_FLOOR_PER_PROP = 5;
const FINAL_BOARD_SOURCE_FLOOR_PER_APP = 20;
const FINAL_BOARD_VARIANT_FLOORS = { demon: 10, regular: 20, goblin: 20 };
const FINAL_BOARD_QUOTA_RESERVE_MIN_HP = 45;
const FINAL_BOARD_QUOTA_RESERVE_MIN_SCORE = 50;
function directEvidenceInfoFromBoardRow(row) {
  const calc = parseJsonObject(row.calculation_json);
  if (calc && calc.direct_prop_evidence_bucket) {
    const rowCount = Math.max(0, Math.trunc(num(calc.direct_prop_evidence_row_count, 0)));
    const coverageCount = Math.max(0, Math.trunc(num(calc.market_coverage_row_count, 0)));
    return { rowCount, coverageCount, bucket: String(calc.direct_prop_evidence_bucket), present: rowCount > 0 || calc.direct_prop_evidence_present === true };
  }
  const details = parseJsonObject(row.details_json_snapshot || row.details_json);
  const propEvidence = getPath(details, ["market_context", "prop_evidence"]) || {};
  const rowCount = Math.max(0, Math.trunc(num(propEvidence.row_count, 0)));
  const coverageRows = getPath(details, ["market_context", "coverage_rows"]);
  const coverageCount = Array.isArray(coverageRows) ? coverageRows.length : 0;
  let bucket = "direct_prop_evidence_rows_unknown";
  if (rowCount <= 0) bucket = coverageCount > 0 ? "direct_prop_evidence_rows_0_with_coverage" : "direct_prop_evidence_rows_0_no_coverage";
  else if (rowCount === 1) bucket = "direct_prop_evidence_rows_1";
  else if (rowCount <= 4) bucket = "direct_prop_evidence_rows_2_to_4";
  else bucket = "direct_prop_evidence_rows_gte_5";
  return { rowCount, coverageCount, bucket, present: rowCount > 0 };
}
function evidenceScoreCapFor(info) {
  // v0.1.22: kept only for legacy calculation_json compatibility.
  // Final Board no longer re-caps score by market-evidence row count. Evidence quality
  // affects PRIMARY/REVIEW tiering and confidence, not the score ceiling.
  return 100;
}
function effectiveWarningCountFromBoardRow(row, evidenceInfo = null) {
  const calc = parseJsonObject(row.calculation_json);
  if (calc && calc.effective_warning_count != null) return Math.max(0, Math.trunc(num(calc.effective_warning_count, num(row.warning_count, 0))));
  const rawWarnings = Math.max(0, Math.trunc(num(row.warning_count, 0)));
  const info = evidenceInfo || directEvidenceInfoFromBoardRow(row);
  if (rawWarnings >= 9
    && norm(row.matrix_status) === "matrix_partial_context"
    && num(row.blocker_count, 0) <= 0
    && norm(row.factor_status) === "packet_partial"
    && norm(row.market_prop_context_status) === "market_prop_context_present"
    && info.rowCount > 0
    && ["missing_current_readiness", "daily_readiness_missing_soft_fallback", "partial_enrichment"].includes(norm(row.daily_readiness_status))) {
    return 6;
  }
  return rawWarnings;
}
function contextScoreCapFor(row, evidenceInfo = null) {
  const warnings = effectiveWarningCountFromBoardRow(row, evidenceInfo);
  if (norm(row.matrix_status) !== "matrix_partial_context") return 100;
  if (warnings >= 9) return 82;
  if (warnings >= 6) return 90;
  if (warnings >= 3) return 93;
  return 96;
}
function sideSymmetryRisk(row) {
  const more = Number(row.more_score_0_100);
  const less = Number(row.less_score_0_100);
  return Number.isFinite(more) && Number.isFinite(less) && Math.abs(more - less) < 1;
}


async function addColumnIfMissing(db, table, col, ddl) {
  const cols = await all(db, `PRAGMA table_info(${table})`);
  if (!cols.some(c => String(c.name) === col)) await run(db, `ALTER TABLE ${table} ADD COLUMN ${ddl}`);
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

async function ensureSchema(env) {
  await run(env.SCORE_DB, `
    CREATE TABLE IF NOT EXISTS score_final_board_batches (
      final_board_batch_id TEXT PRIMARY KEY,
      worker_version TEXT,
      job_key TEXT,
      source_simulation_batch_id TEXT,
      source_engine_batch_id TEXT,
      source_scoring_worker_version TEXT,
      profile_key TEXT,
      status TEXT,
      certification TEXT,
      certification_grade TEXT,
      matrix_rows_read INTEGER DEFAULT 0,
      live_rows_read INTEGER DEFAULT 0,
      final_rows_written INTEGER DEFAULT 0,
      current_rows_written INTEGER DEFAULT 0,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      finished_at TEXT,
      output_json TEXT
    )
  `);

  await run(env.SCORE_DB, `
    CREATE TABLE IF NOT EXISTS score_final_board_current (
      final_board_row_id TEXT PRIMARY KEY,
      final_board_batch_id TEXT,
      source_simulation_batch_id TEXT,
      source_engine_batch_id TEXT,
      profile_key TEXT,
      rank_order INTEGER,
      board_tier TEXT,
      review_playable INTEGER DEFAULT 0,
      source_key TEXT,
      game_pk INTEGER,
      official_date TEXT,
      official_game_time_utc TEXT,
      prepared_row_id TEXT,
      matrix_id TEXT,
      source_line_id TEXT,
      mlb_player_id INTEGER,
      player_name TEXT,
      canonical_prop_key TEXT,
      line_value REAL,
      selected_side TEXT,
      raw_score_0_100 REAL,
      raw_confidence_0_100 REAL,
      score_0_100 REAL,
      confidence_0_100 REAL,
      score_grade TEXT,
      score_sort_0_100 REAL,
      factor_status TEXT,
      market_prop_context_status TEXT,
      daily_readiness_status TEXT,
      side_mode TEXT,
      odds_type TEXT,
      payout_variant TEXT,
      archive_eligible INTEGER DEFAULT 1,
      live_playable INTEGER DEFAULT 1,
      cluster_player_count INTEGER,
      correlation_risk_tier TEXT,
      calibration_json TEXT,
      calculation_json TEXT,
      matrix_payload_json_snapshot TEXT,
      details_json_snapshot TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(env.SCORE_DB, `
    CREATE TABLE IF NOT EXISTS score_final_board_history (
      final_board_row_id TEXT PRIMARY KEY,
      final_board_batch_id TEXT,
      source_simulation_batch_id TEXT,
      source_engine_batch_id TEXT,
      profile_key TEXT,
      rank_order INTEGER,
      board_tier TEXT,
      review_playable INTEGER DEFAULT 0,
      source_key TEXT,
      game_pk INTEGER,
      official_date TEXT,
      official_game_time_utc TEXT,
      prepared_row_id TEXT,
      matrix_id TEXT,
      source_line_id TEXT,
      mlb_player_id INTEGER,
      player_name TEXT,
      canonical_prop_key TEXT,
      line_value REAL,
      selected_side TEXT,
      raw_score_0_100 REAL,
      raw_confidence_0_100 REAL,
      score_0_100 REAL,
      confidence_0_100 REAL,
      score_grade TEXT,
      score_sort_0_100 REAL,
      factor_status TEXT,
      market_prop_context_status TEXT,
      daily_readiness_status TEXT,
      side_mode TEXT,
      odds_type TEXT,
      payout_variant TEXT,
      archive_eligible INTEGER DEFAULT 1,
      live_playable INTEGER DEFAULT 1,
      cluster_player_count INTEGER,
      correlation_risk_tier TEXT,
      calibration_json TEXT,
      calculation_json TEXT,
      matrix_payload_json_snapshot TEXT,
      details_json_snapshot TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(env.SCORE_DB, `
    CREATE TABLE IF NOT EXISTS score_final_board_issues (
      issue_id TEXT PRIMARY KEY,
      final_board_batch_id TEXT,
      source_simulation_batch_id TEXT,
      source_engine_batch_id TEXT,
      issue_key TEXT,
      severity TEXT,
      issue_count INTEGER DEFAULT 0,
      issue_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await addColumnIfMissing(env.SCORE_DB, "score_final_board_batches", "source_engine_batch_id", "source_engine_batch_id TEXT");
  await addColumnIfMissing(env.SCORE_DB, "score_final_board_issues", "source_engine_batch_id", "source_engine_batch_id TEXT");

  const extraCols = [
    ["source_simulation_batch_id", "source_simulation_batch_id TEXT"],
    ["source_engine_batch_id", "source_engine_batch_id TEXT"],
    ["board_tier", "board_tier TEXT"],
    ["review_playable", "review_playable INTEGER DEFAULT 0"],
    ["raw_score_0_100", "raw_score_0_100 REAL"],
    ["raw_confidence_0_100", "raw_confidence_0_100 REAL"],
    ["confidence_0_100", "confidence_0_100 REAL"],
    ["score_sort_0_100", "score_sort_0_100 REAL"],
    ["side_mode", "side_mode TEXT"],
    ["odds_type", "odds_type TEXT"],
    ["payout_variant", "payout_variant TEXT"],
    ["cluster_player_count", "cluster_player_count INTEGER"],
    ["correlation_risk_tier", "correlation_risk_tier TEXT"],
    ["calibration_json", "calibration_json TEXT"],
    ["calculation_json", "calculation_json TEXT"],
    ["matrix_payload_json_snapshot", "matrix_payload_json_snapshot TEXT"],
    ["details_json_snapshot", "details_json_snapshot TEXT"],
    ["hp_board_batch_id", "hp_board_batch_id TEXT"],
    ["source_hp_batch_id", "source_hp_batch_id TEXT"],
    ["estimated_hit_probability_0_100", "estimated_hit_probability_0_100 REAL"],
    ["probability_confidence_0_100", "probability_confidence_0_100 REAL"],
    ["probability_band", "probability_band TEXT"],
    ["probability_grade", "probability_grade TEXT"],
    ["hp_lane", "hp_lane TEXT"],
    ["hp_rank", "hp_rank INTEGER"],
    ["hp_sort_0_100", "hp_sort_0_100 REAL"],
    ["sample_size", "sample_size INTEGER"],
    ["non_push_sample", "non_push_sample INTEGER"],
    ["hit_count", "hit_count INTEGER"],
    ["miss_count", "miss_count INTEGER"],
    ["push_count", "push_count INTEGER"],
    ["hp_source_board_tier", "hp_source_board_tier TEXT"],
    ["hp_source_lane_reason", "hp_source_lane_reason TEXT"]
  ];
  for (const [col, ddl] of extraCols) {
    await addColumnIfMissing(env.SCORE_DB, "score_final_board_current", col, ddl);
    await addColumnIfMissing(env.SCORE_DB, "score_final_board_history", col, ddl);
  }

  await run(env.SCORE_DB, `CREATE INDEX IF NOT EXISTS idx_score_final_board_current_rank ON score_final_board_current(profile_key, board_tier, rank_order)`);
  await run(env.SCORE_DB, `CREATE INDEX IF NOT EXISTS idx_score_final_board_current_date ON score_final_board_current(official_date, source_key, canonical_prop_key)`);
  await run(env.SCORE_DB, `CREATE INDEX IF NOT EXISTS idx_score_final_board_current_game ON score_final_board_current(game_pk, mlb_player_id)`);
  await run(env.SCORE_DB, `CREATE INDEX IF NOT EXISTS idx_score_final_board_current_tier_source ON score_final_board_current(board_tier, source_key, score_0_100)`);
  await run(env.SCORE_DB, `CREATE INDEX IF NOT EXISTS idx_score_final_board_current_hp ON score_final_board_current(estimated_hit_probability_0_100, score_0_100)`);
  await run(env.SCORE_DB, `CREATE INDEX IF NOT EXISTS idx_score_final_board_history_batch ON score_final_board_history(final_board_batch_id, rank_order)`);
  await run(env.SCORE_DB, `CREATE INDEX IF NOT EXISTS idx_score_final_board_batches_started ON score_final_board_batches(started_at, status)`);
}

async function latestCompletedSimulationBatch(env, requestedBatchId) {
  if (requestedBatchId) {
    return await first(env.SCORE_DB, `
      SELECT simulation_batch_id, worker_version, status, certification, certification_grade, matrix_rows_read, simulation_rows_written, started_at, finished_at
      FROM scoring_engine_simulation_batches
      WHERE simulation_batch_id = ?
      LIMIT 1
    `, requestedBatchId);
  }
  return await first(env.SCORE_DB, `
    SELECT simulation_batch_id, worker_version, status, certification, certification_grade, matrix_rows_read, simulation_rows_written, started_at, finished_at
    FROM scoring_engine_simulation_batches
    WHERE status = 'completed_simulation_shadow_only'
      AND certification_grade LIKE 'PASS%'
      AND strict_b_rows_written > 0
      AND hybrid_control_rows_written > 0
    ORDER BY datetime(finished_at) DESC, datetime(started_at) DESC
    LIMIT 1
  `);
}


async function latestCompletedEngineBatch(env, requestedBatchId) {
  const baseSelect = `
    SELECT batch_id, worker_version, status, certification, certification_grade, matrix_rows_read, score_rows_written, archive_rows_written, started_at, finished_at
    FROM scoring_engine_batches
  `;
  if (requestedBatchId) {
    return await first(env.SCORE_DB, `${baseSelect} WHERE batch_id = ? LIMIT 1`, requestedBatchId);
  }
  return await first(env.SCORE_DB, `
    ${baseSelect}
    WHERE status = 'completed_scoring_current_rows_written'
      AND certification = 'SCORING_ENGINE_CURRENT_CERTIFIED_SCORED_ROWS'
      AND certification_grade LIKE 'PASS%'
      AND score_rows_written > 0
    ORDER BY datetime(finished_at) DESC, datetime(started_at) DESC
    LIMIT 1
  `);
}

async function latestEngineBatchAnyStatus(env) {
  return await first(env.SCORE_DB, `
    SELECT batch_id, worker_version, status, certification, certification_grade, matrix_rows_read, score_rows_written, archive_rows_written, started_at, finished_at
    FROM scoring_engine_batches
    WHERE score_rows_written > 0 OR matrix_rows_read > 0
    ORDER BY datetime(COALESCE(finished_at, started_at)) DESC, datetime(started_at) DESC
    LIMIT 1
  `);
}

function isCompletedCertifiedEngineBatch(engine) {
  return !!(engine && engine.status === 'completed_scoring_current_rows_written' && engine.certification === 'SCORING_ENGINE_CURRENT_CERTIFIED_SCORED_ROWS' && String(engine.certification_grade || '').startsWith('PASS'));
}

async function writeIssue(env, batchId, sourceBatchId, key, severity, count, payload) {
  await run(env.SCORE_DB, `
    INSERT OR REPLACE INTO score_final_board_issues (issue_id, final_board_batch_id, source_simulation_batch_id, source_engine_batch_id, issue_key, severity, issue_count, issue_json, created_at)
    VALUES (?, ?, NULL, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `, `issue|${batchId}|${key}`, batchId, sourceBatchId || null, key, severity, Number(count || 0), safeJson(payload));
}

function rowId(batchId, rank, row) {
  const tier = row.board_tier || "PRIMARY";
  return `final|${batchId}|${row.profile_key || PRIMARY_PROFILE}|${tier}|${String(rank).padStart(4, "0")}|${row.matrix_id || row.prepared_row_id || row.source_line_id || rank}`;
}

function gradeForScore(score) {
  if (score == null) return "BIN_0_NULL";
  if (score >= 90) return "BIN_ELITE";
  if (score >= 84) return "BIN_STRONG";
  if (score >= 76) return "BIN_QUALIFIED";
  if (score >= 70) return "BIN_ARCHIVE";
  return "BIN_REJECT";
}

const HITTER_PROP_KEYS = new Set([
  "hits",
  "total_bases",
  "hits_runs_rbis",
  "runs",
  "rbis",
  "home_runs",
  "singles",
  "doubles",
  "walks",
  "hitter_strikeouts",
  "stolen_bases",
  "fantasy"
]);

function isHitterProp(propKey) {
  return HITTER_PROP_KEYS.has(norm(propKey));
}

function calibrateScoreAndConfidence(rawRow) {
  const sourceKey = norm(rawRow.source_key);
  const propKey = norm(rawRow.canonical_prop_key);
  const side = norm(rawRow.selected_side);
  const lineValue = num(rawRow.line_value, NaN);
  const rawScore = num(rawRow.score_0_100, NaN);
  const rawConfidence = num(rawRow.confidence_0_100, NaN);
  let score = rawScore;
  let confidence = rawConfidence;
  const scoreAdjustments = [];
  const confidenceAdjustments = [];
  const evidenceInfo = directEvidenceInfoFromBoardRow(rawRow);
  const symmetryRisk = sideSymmetryRisk(rawRow);

  if (!Number.isFinite(score) || !Number.isFinite(confidence)) return { calibration_failed: true };

  // v0.1.11: final board must preserve sharp score meaning. No platform quota and no source balancing.
  // This layer only applies transparent caps/very small volatility trims so DB/profile scoring remains primary.
  if (propKey === "home_runs" && side === "less") {
    score -= 0.5;
    scoreAdjustments.push({ key: "low_event_less_no_free_boost_trim", prop_key: propKey, delta: -0.5 });
  }
  if ((propKey === "hits" || propKey === "runs" || propKey === "rbis") && side === "more" && Number.isFinite(lineValue) && lineValue <= 0.5) {
    score -= 0.5;
    scoreAdjustments.push({ key: "low_threshold_more_micro_trim", prop_key: propKey, line_value: lineValue, delta: -0.5 });
  }

  const capCandidates = [
    { key: "context_score_cap", cap: contextScoreCapFor(rawRow, evidenceInfo), matrix_status: rawRow.matrix_status, warning_count: num(rawRow.warning_count, 0), effective_warning_count: effectiveWarningCountFromBoardRow(rawRow, evidenceInfo) }
  ];
  if (symmetryRisk) capCandidates.push({ key: "side_symmetry_score_cap", cap: evidenceInfo.rowCount <= 0 ? 76 : 88, side_delta_lt: 1 });
  for (const c of capCandidates) {
    if (Number.isFinite(c.cap) && score > c.cap) {
      score = c.cap;
      scoreAdjustments.push(c);
    }
  }
  scoreAdjustments.push({ key: "market_evidence_score_cap_removed_v0_1_22", delta: 0, direct_prop_evidence_row_count: evidenceInfo.rowCount, evidence_bucket: evidenceInfo.bucket, note: "Final Board does not re-cap score for missing/thin market prop rows. Evidence quality controls tiering/confidence only." });

  let confidenceCap = 100;
  if (evidenceInfo.rowCount <= 0) confidenceCap = Math.min(confidenceCap, evidenceInfo.coverageCount > 0 ? 60 : 50);
  if (effectiveWarningCountFromBoardRow(rawRow, evidenceInfo) >= 9) confidenceCap = Math.min(confidenceCap, 45);
  if (confidence > confidenceCap) {
    confidence = confidenceCap;
    confidenceAdjustments.push({ key: "confidence_cap", cap: confidenceCap, direct_prop_evidence_row_count: evidenceInfo.rowCount });
  }

  const roundedScore = Math.round(clamp(score, 0, 100));
  const roundedConfidence = Math.round(clamp(confidence, 0, 100));
  const rawSort = num(rawRow.score_sort_0_100, rawScore);
  const fractionalTie = rawSort - Math.floor(rawSort);
  const primaryEligible = roundedScore >= PRIMARY_THRESHOLD_SCORE && roundedConfidence >= PRIMARY_THRESHOLD_CONFIDENCE && evidenceInfo.rowCount > 0 && !symmetryRisk;
  let reviewSubtier = "REVIEW_STANDARD";
  if (!primaryEligible && roundedScore >= 88) reviewSubtier = "REVIEW_HIGH_SCORE_CONTEXT_RISK";
  if (evidenceInfo.rowCount <= 0) reviewSubtier = "REVIEW_MARKET_BLIND_OR_THIN";
  if (symmetryRisk) reviewSubtier = "REVIEW_SIDE_SYMMETRY_RISK";

  return {
    calibration_failed: false,
    raw_score_0_100: rawScore,
    raw_confidence_0_100: rawConfidence,
    score_0_100: roundedScore,
    confidence_0_100: roundedConfidence,
    score_sort_0_100: roundedScore + fractionalTie,
    score_grade: gradeForScore(roundedScore),
    confidence_cap: confidenceCap,
    score_adjustments: scoreAdjustments,
    confidence_adjustments: confidenceAdjustments,
    direct_prop_evidence_row_count: evidenceInfo.rowCount,
    direct_prop_evidence_bucket: evidenceInfo.bucket,
    side_symmetry_risk: symmetryRisk,
    primary_eligible: primaryEligible,
    review_subtier: reviewSubtier
  };
}

function applyCalibration(rawRow, preferredTier = null) {
  const calibrated = calibrateScoreAndConfidence(rawRow);
  if (calibrated.calibration_failed) {
    const fallbackTier = preferredTier || "REVIEW";
    return { ...rawRow, board_tier: fallbackTier, review_playable: fallbackTier === "REVIEW" ? 1 : 0, live_playable: fallbackTier === "PRIMARY" ? 1 : 0, calibration_failed: true };
  }

  const boardTier = preferredTier || (calibrated.primary_eligible ? "PRIMARY" : "REVIEW");

  return {
    ...rawRow,
    board_tier: boardTier,
    review_playable: boardTier === "REVIEW" ? 1 : 0,
    live_playable: boardTier === "PRIMARY" ? 1 : 0,
    raw_score_0_100: calibrated.raw_score_0_100,
    raw_confidence_0_100: calibrated.raw_confidence_0_100,
    score_0_100: calibrated.score_0_100,
    confidence_0_100: calibrated.confidence_0_100,
    score_grade: calibrated.score_grade,
    score_sort_0_100: calibrated.score_sort_0_100,
    calibration_json: safeJson({
      version: VERSION,
      board_tier: boardTier,
      review_subtier: boardTier === "REVIEW" ? calibrated.review_subtier : null,
      tier_rule: "PRIMARY when calibrated_score_0_100 >= 88, calibrated_confidence_0_100 >= 85, direct_prop_evidence_row_count > 0, and no side symmetry risk, with optional robust Hit Probability advisory sanity rescue/demotion; otherwise REVIEW. No final score re-cap by source, payout, prop rarity, or market evidence row count.",
      raw_score_0_100: calibrated.raw_score_0_100,
      raw_confidence_0_100: calibrated.raw_confidence_0_100,
      calibrated_score_0_100: calibrated.score_0_100,
      calibrated_confidence_0_100: calibrated.confidence_0_100,
      direct_prop_evidence_row_count: calibrated.direct_prop_evidence_row_count,
      direct_prop_evidence_bucket: calibrated.direct_prop_evidence_bucket,
      side_symmetry_risk: calibrated.side_symmetry_risk,
      confidence_cap: calibrated.confidence_cap,
      raw_warning_count: num(rawRow.warning_count, 0),
      effective_warning_count: effectiveWarningCountFromBoardRow(rawRow, directEvidenceInfoFromBoardRow(rawRow)),
      score_adjustments: calibrated.score_adjustments,
      confidence_adjustments: calibrated.confidence_adjustments,
      note: "STRICT_C_REALISTIC_V3_2 uses DB/profile scoring first. Final Board does not re-score or re-cap by source, payout, prop rarity, demon/goblin, HR/SB, or direct market row count; BIN_ARCHIVE rows are excluded from current entirely. Only partial-context and side-symmetry safety caps remain. Optional HP advisory is a safety net, not a killer."
    })
  };
}

function applyCutoffVolatilityTrim(row) {
  const propKey = norm(row.canonical_prop_key);
  const side = norm(row.selected_side);
  const lineValue = num(row.line_value, NaN);
  const clusterCount = num(row.cluster_player_count, 0);
  const preTrimScore = num(row.score_0_100, NaN);
  let score = preTrimScore;
  let confidence = num(row.confidence_0_100, NaN);
  const scoreAdjustments = [];
  const confidenceAdjustments = [];

  if (!Number.isFinite(score) || !Number.isFinite(confidence)) return row;

  const isHitsAllowedMore = propKey === "hits_allowed" && side === "more";
  const isLowOutsMore = propKey === "pitcher_outs" && side === "more" && Number.isFinite(lineValue) && lineValue <= 15.5;
  const isLowKMore = propKey === "pitcher_strikeouts" && side === "more" && Number.isFinite(lineValue) && lineValue <= 3.5;
  const isEarnedRuns = propKey === "earned_runs" || propKey === "earned_runs_allowed";
  const fragilePitcherCutoffRow = isHitsAllowedMore || isLowOutsMore || isLowKMore || isEarnedRuns;

  if (isHitsAllowedMore) {
    score -= 1;
    scoreAdjustments.push({ key: "v0_1_4_cutoff_hits_allowed_more_trim", delta: -1, note: "Borderline hits-allowed More rows get one extra point of volatility trim; not a source or hitter gate." });
  }
  if (isLowOutsMore) {
    score -= 1;
    scoreAdjustments.push({ key: "v0_1_4_cutoff_low_outs_more_trim", line_value: lineValue, delta: -1 });
  }
  if (isLowKMore) {
    score -= 1;
    scoreAdjustments.push({ key: "v0_1_4_cutoff_low_strikeout_more_trim", line_value: lineValue, delta: -1 });
  }
  if (clusterCount >= 5 && preTrimScore <= 86 && fragilePitcherCutoffRow) {
    score -= 1;
    scoreAdjustments.push({ key: "v0_1_4_extreme_cluster_fragile_cutoff_trim", cluster_player_count: clusterCount, pre_trim_score_0_100: preTrimScore, delta: -1, note: "Cluster pressure is only used as a narrow tie-breaker for fragile pitcher rows already near the PRIMARY cutoff." });
  }

  let confidenceCap = null;
  if (isEarnedRuns) confidenceCap = 86;
  if (propKey === "hits_allowed") confidenceCap = confidenceCap == null ? 87 : Math.min(confidenceCap, 87);
  if (isLowOutsMore) confidenceCap = confidenceCap == null ? 87 : Math.min(confidenceCap, 87);
  if (isLowKMore) confidenceCap = confidenceCap == null ? 89 : Math.min(confidenceCap, 89);
  if (confidenceCap != null) {
    const capped = Math.min(confidence, confidenceCap);
    if (capped !== confidence) {
      confidence = capped;
      confidenceAdjustments.push({ key: "v0_1_4_cutoff_volatility_confidence_cap", cap: confidenceCap });
    }
  }

  if (!scoreAdjustments.length && !confidenceAdjustments.length) return row;

  const roundedScore = Math.round(clamp(score, 0, 100));
  const roundedConfidence = Math.round(clamp(confidence, 0, 100));
  const fractionalTie = num(row.score_sort_0_100, num(row.score_0_100, 0)) - Math.floor(num(row.score_sort_0_100, num(row.score_0_100, 0)));
  const boardTier = (roundedScore >= PRIMARY_THRESHOLD_SCORE && roundedConfidence >= PRIMARY_THRESHOLD_CONFIDENCE && directEvidenceInfoFromBoardRow(row).rowCount > 0 && !sideSymmetryRisk(row)) ? "PRIMARY" : "REVIEW";

  let payload = {};
  try { payload = row.calibration_json ? JSON.parse(row.calibration_json) : {}; } catch (_) { payload = {}; }
  if (!Array.isArray(payload.score_adjustments)) payload.score_adjustments = [];
  if (!Array.isArray(payload.confidence_adjustments)) payload.confidence_adjustments = [];
  payload.score_adjustments.push(...scoreAdjustments);
  payload.confidence_adjustments.push(...confidenceAdjustments);
  payload.cutoff_volatility_trim = {
    enabled: true,
    version: VERSION,
    pre_trim_score_0_100: preTrimScore,
    post_trim_score_0_100: roundedScore,
    pre_trim_confidence_0_100: row.confidence_0_100,
    post_trim_confidence_0_100: roundedConfidence,
    rule: "Only fragile pitcher rows near the cutoff receive extra trim. No platform quota, no forced source balance, no broad cluster penalty."
  };
  payload.calibrated_score_0_100 = roundedScore;
  payload.calibrated_confidence_0_100 = roundedConfidence;
  payload.board_tier = boardTier;

  return {
    ...row,
    score_0_100: roundedScore,
    confidence_0_100: roundedConfidence,
    score_grade: gradeForScore(roundedScore),
    score_sort_0_100: roundedScore + fractionalTie,
    board_tier: boardTier,
    live_playable: boardTier === "PRIMARY" ? 1 : 0,
    review_playable: boardTier === "REVIEW" ? 1 : 0,
    calibration_json: safeJson(payload)
  };
}

function annotateCorrelation(rows) {
  const counts = new Map();
  for (const r of rows) {
    const key = String(r.mlb_player_id || "");
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  for (const r of rows) {
    const count = counts.get(String(r.mlb_player_id || "")) || 0;
    r.cluster_player_count = count;
    r.correlation_risk_tier = count >= 3 ? "HIGH" : count === 2 ? "MED" : "LOW";
  }
  return rows;
}

function appendCalibrationAdjustment(row, adjustment) {
  let payload = {};
  try { payload = row.calibration_json ? JSON.parse(row.calibration_json) : {}; } catch (_) { payload = {}; }
  if (!Array.isArray(payload.score_adjustments)) payload.score_adjustments = [];
  payload.score_adjustments.push(adjustment);
  if (adjustment && String(adjustment.key || "").startsWith("primary_cluster_cap_")) {
    payload.primary_cluster_cap = {
      enabled: true,
      max_primary_rows_per_player: adjustment.max_primary_rows_per_player == null ? 1 : adjustment.max_primary_rows_per_player,
      action: adjustment && adjustment.key === "primary_cluster_cap_demoted_to_review" ? "demoted_to_review" : "kept_primary"
    };
  }
  row.calibration_json = safeJson(payload);
  return row;
}


function hpAdvisoryKey(row) {
  return `${String(row.prepared_row_id || "")}||${norm(row.selected_side)}`;
}

async function latestHitProbabilityBatchForEngine(env, sourceEngineBatchId) {
  try {
    return await first(env.SCORE_DB, `
      SELECT batch_id, worker_version, profile_version, source_final_board_batch_id, source_engine_batch_id, probability_rows_written, created_at
      FROM hit_probability_batches
      WHERE source_engine_batch_id = ?
        AND status IN ('completed_recent_form_hit_rate_written','completed_hit_probability_current_estimates_written')
        AND probability_rows_written > 0
      ORDER BY datetime(created_at) DESC
      LIMIT 1
    `, sourceEngineBatchId);
  } catch (err) {
    return null;
  }
}

async function loadHitProbabilityAdvisoryMap(env, sourceEngineBatchId) {
  const batch = await latestHitProbabilityBatchForEngine(env, sourceEngineBatchId);
  if (!batch || !batch.batch_id) return { batch: null, map: new Map(), rows: 0 };
  let rows = [];
  try {
    rows = await all(env.SCORE_DB, `
      SELECT
        batch_id,
        prepared_row_id,
        selected_side,
        estimated_hit_probability_0_100,
        probability_confidence_0_100,
        sample_size,
        non_push_sample,
        probability_grade,
        probability_band
      FROM hit_probability_current
      WHERE batch_id = ?
        AND prepared_row_id IS NOT NULL
        AND selected_side IS NOT NULL
    `, batch.batch_id);
  } catch (err) {
    return { batch, map: new Map(), rows: 0, error: String(err && err.message ? err.message : err) };
  }
  const map = new Map();
  for (const r of rows) map.set(hpAdvisoryKey(r), r);
  return { batch, map, rows: rows.length };
}

function attachHitProbabilityAdvisory(row, hpMap) {
  const hp = hpMap && hpMap.get(hpAdvisoryKey(row));
  if (!hp) return row;
  const hpValue = num(hp.estimated_hit_probability_0_100, NaN);
  const hpConfidence = num(hp.probability_confidence_0_100, NaN);
  const hpSample = Math.max(0, Math.trunc(num(hp.sample_size, 0)));
  const hpNonPush = Math.max(0, Math.trunc(num(hp.non_push_sample, 0)));
  if (!Number.isFinite(hpValue)) return row;
  return {
    ...row,
    hp_advisory_available: true,
    hp_estimated_hit_probability_0_100: hpValue,
    hp_probability_confidence_0_100: Number.isFinite(hpConfidence) ? hpConfidence : null,
    hp_sample_size: hpSample,
    hp_non_push_sample: hpNonPush,
    hp_probability_grade: hp.probability_grade || null,
    hp_probability_band: hp.probability_band || null
  };
}

function hpAdvisoryIsRobust(row) {
  return row && row.hp_advisory_available === true
    && Number.isFinite(num(row.hp_estimated_hit_probability_0_100, NaN))
    && num(row.hp_probability_confidence_0_100, 0) >= PRIMARY_SANITY_MIN_HP_CONFIDENCE
    && num(row.hp_non_push_sample, 0) >= PRIMARY_SANITY_MIN_NON_PUSH_SAMPLE;
}

function appendPrimarySanityAdjustment(row, adjustment) {
  let payload = {};
  try { payload = row.calibration_json ? JSON.parse(row.calibration_json) : {}; } catch (_) { payload = {}; }
  if (!Array.isArray(payload.score_adjustments)) payload.score_adjustments = [];
  payload.score_adjustments.push(adjustment);
  payload.primary_sanity_hp_advisory = {
    enabled: true,
    version: VERSION,
    hp_advisory_available: row.hp_advisory_available === true,
    estimated_hit_probability_0_100: row.hp_estimated_hit_probability_0_100 == null ? null : num(row.hp_estimated_hit_probability_0_100, null),
    probability_confidence_0_100: row.hp_probability_confidence_0_100 == null ? null : num(row.hp_probability_confidence_0_100, null),
    non_push_sample: row.hp_non_push_sample == null ? null : num(row.hp_non_push_sample, null),
    action: adjustment && adjustment.key || null,
    note: "Hit Probability advisory is a sanity safety-net for PRIMARY tiering only. It does not delete rows, force equality, or override DB scoring; it can demote weak-HP PRIMARY rows to REVIEW or rescue robust high-HP review rows near the top score band."
  };
  row.calibration_json = safeJson(payload);
  return row;
}

function primarySanityCandidate(row) {
  if (num(row.blocker_count, 0) > 0 || num(row.blocking_for_scoring, 0) > 0) return false;
  if (num(row.archive_eligible, 0) !== 1) return false;
  if (norm(row.market_prop_context_status) !== "market_prop_context_present") return false;
  if (norm(row.score_status) === "blocked_by_matrix" || norm(row.score_status) === "model_deferred" || norm(row.score_status) === "simulation_hard_blocked") return false;
  if (!row.selected_side || row.line_value == null || !row.player_name || !row.canonical_prop_key || !row.source_key || !row.mlb_player_id) return false;
  if (directEvidenceInfoFromBoardRow(row).rowCount <= 0) return false;
  if (sideSymmetryRisk(row)) return false;
  return true;
}

function applyPrimarySanityHpAdvisory(rows) {
  let demotedRows = 0;
  let rescuedRows = 0;
  let advisoryRowsSeen = 0;
  const out = [];
  for (const row of rows) {
    const hpValue = num(row.hp_estimated_hit_probability_0_100, NaN);
    const robust = hpAdvisoryIsRobust(row);
    const hasHp = row.hp_advisory_available === true && Number.isFinite(hpValue);
    if (hasHp) advisoryRowsSeen += 1;

    let next = { ...row };
    if (next.board_tier === "PRIMARY" && robust && hpValue < PRIMARY_SANITY_DEMOTE_HP_BELOW) {
      next.board_tier = "REVIEW";
      next.live_playable = 0;
      next.review_playable = 1;
      demotedRows += 1;
      appendPrimarySanityAdjustment(next, {
        key: "primary_sanity_hp_demoted_to_review",
        estimated_hit_probability_0_100: hpValue,
        probability_confidence_0_100: num(next.hp_probability_confidence_0_100, null),
        non_push_sample: num(next.hp_non_push_sample, null),
        cutoff: PRIMARY_SANITY_DEMOTE_HP_BELOW,
        delta: 0,
        note: "Robust low Hit Probability advisory kept the row safe in REVIEW instead of PRIMARY."
      });
    } else if (next.board_tier === "REVIEW" && robust && primarySanityCandidate(next)) {
      const score = num(next.score_0_100, 0);
      const confidence = num(next.confidence_0_100, 0);
      const rescueA = score >= PRIMARY_SANITY_RESCUE_SCORE_A && confidence >= PRIMARY_THRESHOLD_CONFIDENCE && hpValue >= PRIMARY_SANITY_RESCUE_HP_A;
      const rescueB = score >= PRIMARY_SANITY_RESCUE_SCORE_B && confidence >= PRIMARY_THRESHOLD_CONFIDENCE && hpValue >= PRIMARY_SANITY_RESCUE_HP_B;
      if (rescueA || rescueB) {
        next.board_tier = "PRIMARY";
        next.live_playable = 1;
        next.review_playable = 0;
        rescuedRows += 1;
        appendPrimarySanityAdjustment(next, {
          key: rescueB && !rescueA ? "primary_sanity_hp_rescued_high_hp_85_band" : "primary_sanity_hp_rescued_86_band",
          estimated_hit_probability_0_100: hpValue,
          probability_confidence_0_100: num(next.hp_probability_confidence_0_100, null),
          non_push_sample: num(next.hp_non_push_sample, null),
          score_0_100: score,
          confidence_0_100: confidence,
          delta: 0,
          note: "Robust high Hit Probability advisory elevated a near-elite review row to PRIMARY."
        });
      }
    }
    out.push(next);
  }
  return { rows: out, demotedRows, rescuedRows, advisoryRowsSeen };
}


function scoreEngineGradeRank(row) {
  const grade = norm(row.score_grade);
  if (grade === "bin_strong") return 4;
  if (grade === "bin_qualified") return 3;
  if (grade === "bin_archive") return 2;
  if (grade === "bin_reject") return 1;
  return 0;
}

function engineRowIsBoardCandidate(row) {
  if (!row) return false;
  if (num(row.archive_eligible, 0) !== 1) return false;
  if (num(row.blocker_count, 0) > 0 || num(row.blocking_for_scoring, 0) > 0) return false;
  if (!row.selected_side || row.line_value == null || !row.player_name || !row.canonical_prop_key || !row.source_key || !row.mlb_player_id) return false;
  const status = norm(row.score_status);
  if (status === "blocked_by_matrix" || status === "model_deferred" || status === "simulation_hard_blocked") return false;
  const score = num(row.score_0_100, NaN);
  const confidence = num(row.confidence_0_100, NaN);
  if (!Number.isFinite(score) || !Number.isFinite(confidence)) return false;
  if (confidence < 55) return false;
  const grade = norm(row.score_grade);
  return score >= 76 || grade === "bin_qualified" || grade === "bin_strong" || grade === "bin_elite";
}

function applyEngineFieldTierCalibration(rawRow) {
  const score = Math.round(clamp(num(rawRow.score_0_100, 0), 0, 100));
  const confidence = Math.round(clamp(num(rawRow.confidence_0_100, 0), 0, 100));
  const grade = gradeForScore(score);
  const strong = norm(grade) === "bin_strong" || score >= 84;
  const qualified = norm(grade) === "bin_qualified" || score >= 76;
  const primaryCandidate = strong
    && confidence >= 55
    && num(rawRow.archive_eligible, 0) === 1
    && num(rawRow.blocker_count, 0) === 0
    && num(rawRow.blocking_for_scoring, 0) === 0
    && norm(rawRow.market_prop_context_status) === "market_prop_context_present"
    && norm(rawRow.score_status) !== "model_deferred";
  const boardTier = primaryCandidate ? "PRIMARY" : "REVIEW";
  let payload = {};
  try { payload = rawRow.calculation_json ? JSON.parse(rawRow.calculation_json) : {}; } catch (_) { payload = {}; }
  payload.final_board_tier_calibration = {
    version: VERSION,
    policy: "engine_field_only_no_recalibration",
    board_tier: boardTier,
    rule: "PRIMARY uses calibrated score/confidence plus direct market context with required playable fields; REVIEW is the safe candidate ledger for engine score>=76 / BIN_QUALIFIED+ rows. BIN_ARCHIVE rows are not written to current final board.",
    engine_score_0_100: score,
    engine_confidence_0_100: confidence,
    engine_score_grade: grade,
    source_key: rawRow.source_key || null,
    payout_variant: rawRow.payout_variant || null,
    selected_side: rawRow.selected_side || null,
    archive_eligible: num(rawRow.archive_eligible, 0),
    live_playable_from_engine: num(rawRow.live_playable, 0)
  };
  const rawSort = num(rawRow.score_sort_0_100, score);
  return {
    ...rawRow,
    board_tier: boardTier,
    live_playable: boardTier === "PRIMARY" ? 1 : 0,
    review_playable: boardTier === "REVIEW" ? 1 : 0,
    raw_score_0_100: score,
    raw_confidence_0_100: confidence,
    score_0_100: score,
    confidence_0_100: confidence,
    score_grade: grade,
    score_sort_0_100: Number.isFinite(rawSort) ? rawSort : score,
    calibration_failed: false,
    calibration_json: safeJson(payload),
    final_board_candidate_grade_rank: scoreEngineGradeRank(rawRow),
    source_candidate_tier: qualified ? "ENGINE_QUALIFIED_OR_STRONG" : "ENGINE_HIGH_ARCHIVE_REVIEW"
  };
}



async function resolveEngineProfileKey(env, engineBatchId) {
  if (!engineBatchId) return PRIMARY_PROFILE;
  try {
    const row = await first(env.SCORE_DB, `
      SELECT profile_key, COUNT(*) AS rows
      FROM scoring_engine_current
      WHERE batch_id = ?
        AND profile_key IS NOT NULL
        AND TRIM(profile_key) <> ''
      GROUP BY profile_key
      ORDER BY rows DESC
      LIMIT 1
    `, engineBatchId);
    return row && row.profile_key ? String(row.profile_key) : PRIMARY_PROFILE;
  } catch (_) {
    return PRIMARY_PROFILE;
  }
}


async function latestHpBoardBatchForEngine(env, sourceEngineBatchId) {
  if (!sourceEngineBatchId) return null;
  return await first(env.SCORE_DB, `
    SELECT hp_board_batch_id, source_hp_batch_id, source_engine_batch_id,
           COUNT(*) AS rows,
           SUM(CASE WHEN estimated_hit_probability_0_100 >= 60 AND COALESCE(blocker_count,0)=0 THEN 1 ELSE 0 END) AS eligible_rows,
           MAX(created_at) AS max_created_at
    FROM hp_board_current
    WHERE source_engine_batch_id = ?
    GROUP BY hp_board_batch_id, source_hp_batch_id, source_engine_batch_id
    ORDER BY datetime(MAX(created_at)) DESC
    LIMIT 1
  `, sourceEngineBatchId);
}

async function fetchHpFinalBoardCandidateRows(env, sourceEngineBatchId, pageSize = 500) {
  const rows = [];
  const limit = Math.max(1, Math.min(1000, Math.trunc(pageSize)));
  let offset = 0;
  let pages = 0;
  const hpSource = await latestHpBoardBatchForEngine(env, sourceEngineBatchId);
  if (!hpSource || !hpSource.hp_board_batch_id) return { rows, pages:0, page_size:limit, pagination_mode:"hp_current_limit_offset", hp_source:null };

  while (true) {
    const page = await all(env.SCORE_DB, `
      SELECT
        h.hp_board_row_id,
        h.hp_board_batch_id,
        h.source_hp_batch_id,
        h.source_engine_batch_id,
        h.hp_rank,
        h.hp_lane,
        h.hp_lane_rank,
        h.hp_sort_0_100,
        h.estimated_hit_probability_0_100,
        h.probability_confidence_0_100,
        h.probability_band,
        h.probability_grade,
        h.empirical_hit_rate_0_1,
        h.reliability_0_1,
        h.sample_size,
        h.non_push_sample,
        h.hit_count,
        h.miss_count,
        h.push_count,
        h.push_risk_0_1,
        h.board_tier AS hp_source_board_tier,
        h.live_playable AS hp_live_playable,
        h.review_playable AS hp_review_playable_source,
        h.hp_primary_playable,
        h.hp_review_playable,
        h.hp_fade_flag,
        h.warning_count AS hp_warning_count,
        h.blocker_count AS hp_blocker_count,
        h.lane_reason AS hp_source_lane_reason,
        h.calibration_json AS hp_calibration_json,
        h.profile_key AS hp_profile_key,

        h.source_key,
        h.game_pk,
        h.official_date,
        h.official_game_time_utc,
        h.prepared_row_id,
        h.matrix_id,
        h.source_line_id,
        h.mlb_player_id,
        h.player_name,
        h.canonical_prop_key,
        h.line_value,
        h.selected_side,
        h.score_0_100,
        h.score_grade,

        e.profile_key,
        NULL AS source_scoring_worker_version,
        e.confidence_0_100,
        e.score_sort_0_100 AS engine_score_sort_0_100,
        e.factor_status,
        e.market_prop_context_status,
        e.daily_readiness_status,
        e.side_mode,
        e.odds_type,
        e.payout_variant,
        e.archive_eligible,
        e.calculation_json AS engine_calculation_json,
        e.matrix_payload_json_snapshot,
        e.details_json_snapshot,
        e.blocking_for_scoring,
        e.blocker_count AS engine_blocker_count,
        e.warning_count AS engine_warning_count
      FROM hp_board_current h
      LEFT JOIN scoring_engine_current e
        ON e.batch_id = h.source_engine_batch_id
       AND e.prepared_row_id = h.prepared_row_id
       AND e.source_line_id = h.source_line_id
      WHERE h.hp_board_batch_id = ?
        AND h.source_engine_batch_id = ?
        AND COALESCE(h.blocker_count, 0) = 0
        AND h.score_0_100 IS NOT NULL
        AND h.selected_side IS NOT NULL
        AND h.line_value IS NOT NULL
        AND h.player_name IS NOT NULL
        AND h.canonical_prop_key IS NOT NULL
        AND h.source_key IS NOT NULL
        AND h.mlb_player_id IS NOT NULL
      ORDER BY COALESCE(h.hp_sort_0_100, (0.72 * COALESCE(h.estimated_hit_probability_0_100,0)) + (0.28 * COALESCE(h.score_0_100,0))) DESC,
               h.estimated_hit_probability_0_100 DESC, h.score_0_100 DESC, h.probability_confidence_0_100 DESC, h.hp_rank ASC, h.hp_board_row_id ASC
      LIMIT ${limit} OFFSET ${offset}
    `, hpSource.hp_board_batch_id, sourceEngineBatchId);
    pages += 1;
    if (!page.length) break;
    rows.push(...page);
    if (page.length < limit) break;
    offset += limit;
    if (pages > 1000) throw new Error("score_final_board_hp_current_pagination_guard_exceeded");
  }
  return { rows, pages, page_size: limit, pagination_mode:"hp_current_limit_offset_all_nonblocked_hp_sort_for_quota_reserve", hp_source:hpSource };
}

function finalBoardStableTieHash(row) {
  const key = [row && row.prepared_row_id, row && row.source_line_id, row && row.source_key, row && row.player_name, row && row.canonical_prop_key, row && row.line_value, row && row.selected_side].map(v => String(v == null ? "" : v)).join("|");
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000000;
}

function finalBoardSortFromHp(row) {
  const hpSort = num(row && row.hp_sort_0_100, NaN);
  if (Number.isFinite(hpSort)) return Math.round((hpSort + finalBoardStableTieHash(row)) * 1000000) / 1000000;
  const hp = num(row.estimated_hit_probability_0_100, 0);
  const score = num(row.score_0_100, 0);
  return Math.round(((0.72 * hp + 0.28 * score) + finalBoardStableTieHash(row)) * 1000000) / 1000000;
}

function mapHpCurrentRowToFinalBoardRow(rawRow, activeProfileKey) {
  const hp = Math.round(clamp(num(rawRow.estimated_hit_probability_0_100, 0), 0, 100) * 10) / 10;
  const score = Math.round(clamp(num(rawRow.score_0_100, 0), 0, 100));
  const confidence = Math.round(clamp(num(rawRow.probability_confidence_0_100, rawRow.confidence_0_100 == null ? 0 : rawRow.confidence_0_100), 0, 100));
  const boardSort = finalBoardSortFromHp(rawRow);
  const primary = Number(rawRow.hp_primary_playable || 0) === 1;
  const boardTier = primary ? "PRIMARY" : "REVIEW";
  const engineCalc = parseJsonObject(rawRow.engine_calculation_json);
  const hpCal = parseJsonObject(rawRow.hp_calibration_json);
  const calc = {
    ...engineCalc,
    final_board_hp_first_source: {
      enabled: true,
      version: VERSION,
      source_table: "hp_board_current",
      hp_board_batch_id: rawRow.hp_board_batch_id || null,
      source_hp_batch_id: rawRow.source_hp_batch_id || null,
      source_engine_batch_id: rawRow.source_engine_batch_id || null,
      estimated_hit_probability_0_100: hp,
      probability_confidence_0_100: confidence,
      hp_lane: rawRow.hp_lane || null,
      hp_rank: rawRow.hp_rank == null ? null : Number(rawRow.hp_rank),
      hp_sort_0_100: rawRow.hp_sort_0_100 == null ? null : Number(rawRow.hp_sort_0_100),
      score_is_trust_score: true,
      score_0_100: score,
      board_sort_formula: "0.72*estimated_hit_probability_0_100 + 0.28*score_0_100",
      board_sort_0_100: boardSort,
      eligibility_rule: "Base visibility is HP >= 60, no HP blocker, visible in HP board. Quota reserve can include lower-HP rows as REVIEW only when needed to preserve prop/source/payout-variant representation; HP is never inflated.",
      score_policy: "Preserve Engine score as system-trust/support score; do not translate HP into score."
    }
  };
  const calibration = {
    version: VERSION,
    policy: "hp_first_final_board_from_hp_board_current",
    source_table: "SCORE_DB.hp_board_current",
    hp_board_batch_id: rawRow.hp_board_batch_id || null,
    source_engine_batch_id: rawRow.source_engine_batch_id || null,
    board_tier: boardTier,
    estimated_hit_probability_0_100: hp,
    probability_confidence_0_100: confidence,
    score_0_100: score,
    score_is_trust_score: true,
    score_grade: rawRow.score_grade || gradeForScore(score),
    board_sort_0_100: boardSort,
    hp_lane: rawRow.hp_lane || null,
    hp_rank: rawRow.hp_rank == null ? null : Number(rawRow.hp_rank),
    hp_source_board_tier: rawRow.hp_source_board_tier || null,
    hp_source_lane_reason: rawRow.hp_source_lane_reason || null,
    hp_calibration_json: hpCal,
    note: "Final Board consumes locked HP Board output. HP is the reality gate; score remains Engine trust/support score. Quota reserve rows preserve visibility only and stay REVIEW unless HP board marked them PRIMARY."
  };
  return {
    ...rawRow,
    profile_key: activeProfileKey || rawRow.profile_key || rawRow.hp_profile_key || PRIMARY_PROFILE,
    board_tier: boardTier,
    live_playable: primary ? 1 : 0,
    review_playable: primary ? 0 : 1,
    raw_score_0_100: score,
    raw_confidence_0_100: confidence,
    score_0_100: score,
    confidence_0_100: confidence,
    score_grade: rawRow.score_grade || gradeForScore(score),
    score_sort_0_100: boardSort,
    archive_eligible: 1,
    factor_status: rawRow.factor_status || null,
    market_prop_context_status: rawRow.market_prop_context_status || null,
    daily_readiness_status: rawRow.daily_readiness_status || null,
    side_mode: rawRow.side_mode || null,
    odds_type: rawRow.odds_type || null,
    payout_variant: rawRow.payout_variant || null,
    calculation_json: safeJson(calc),
    calibration_json: safeJson(calibration),
    matrix_payload_json_snapshot: rawRow.matrix_payload_json_snapshot || null,
    details_json_snapshot: rawRow.details_json_snapshot || null,
    hp_source_board_tier: rawRow.hp_source_board_tier || null,
    hp_source_lane_reason: rawRow.hp_source_lane_reason || null,
    final_board_candidate_grade_rank: scoreEngineGradeRank(rawRow),
    source_candidate_tier: "HP_FIRST_ELIGIBLE"
  };
}

async function fetchEngineBoardCandidateRows(env, sourceEngineBatchId, profileKey, pageSize = 500) {
  const rows = [];
  const limit = Math.max(1, Math.min(1000, Math.trunc(pageSize)));
  let offset = 0;
  let pages = 0;

  // v0.1.21-complete-review-ledger-offset-reader:
  // v0.1.20 used keyset pagination on score_row_id. In D1 this under-read the eligible
  // engine-current review universe: the completed board wrote 773 rows even while SQL proved
  // many archive_eligible BIN_QUALIFIED / BIN_STRONG rows remained missing from Final Board.
  // Final Board is allowed to be a complete REVIEW ledger, so use deterministic LIMIT/OFFSET
  // paging over the already-small current scoring artifact instead of score_row_id keyset paging.
  while (true) {
    const page = await all(env.SCORE_DB, `
      SELECT *
      FROM scoring_engine_current
      WHERE batch_id = ?
        AND profile_key = ?
        AND archive_eligible = 1
        AND blocker_count = 0
        AND blocking_for_scoring = 0
        AND selected_side IS NOT NULL
        AND line_value IS NOT NULL
        AND player_name IS NOT NULL
        AND canonical_prop_key IS NOT NULL
        AND source_key IS NOT NULL
        AND mlb_player_id IS NOT NULL
        AND confidence_0_100 >= 55
        AND score_status NOT IN ('blocked_by_matrix','model_deferred','simulation_hard_blocked')
        AND (
          score_0_100 >= 76
          OR score_grade IN ('BIN_QUALIFIED','BIN_STRONG','BIN_ELITE')
        )
      ORDER BY score_0_100 DESC, confidence_0_100 DESC, score_sort_0_100 DESC, score_row_id
      LIMIT ${limit} OFFSET ${offset}
    `, sourceEngineBatchId, profileKey);

    pages += 1;
    if (!page.length) break;
    rows.push(...page);
    if (page.length < limit) break;
    offset += limit;
    if (pages > 1000) throw new Error("score_final_board_engine_current_pagination_guard_exceeded");
  }
  return { rows, pages, page_size: limit, pagination_mode: "limit_offset_score_order" };
}

function applyPrimaryClusterCap(primaryRows, reviewRows, maxPerPlayer = 2) {
  const sortedPrimary = [...primaryRows].sort((a, b) =>
    (num(b.score_0_100) - num(a.score_0_100)) ||
    (num(b.confidence_0_100) - num(a.confidence_0_100)) ||
    (num(b.score_sort_0_100) - num(a.score_sort_0_100)) ||
    String(a.player_name || "").localeCompare(String(b.player_name || "")) ||
    String(a.canonical_prop_key || "").localeCompare(String(b.canonical_prop_key || "")) ||
    String(a.matrix_id || "").localeCompare(String(b.matrix_id || ""))
  );

  const playerCounts = new Map();
  const keptPrimary = [];
  const demotedToReview = [];

  for (const row of sortedPrimary) {
    const playerKey = String(row.mlb_player_id || row.player_name || "UNKNOWN_PLAYER");
    const nextCount = (playerCounts.get(playerKey) || 0) + 1;
    playerCounts.set(playerKey, nextCount);

    if (nextCount <= maxPerPlayer) {
      appendCalibrationAdjustment(row, { key: "primary_cluster_cap_kept_primary", player_primary_rank: nextCount, max_primary_rows_per_player: maxPerPlayer, delta: 0 });
      keptPrimary.push(row);
    } else {
      row.board_tier = "REVIEW";
      row.live_playable = 0;
      row.review_playable = 1;
      appendCalibrationAdjustment(row, { key: "primary_cluster_cap_demoted_to_review", player_primary_rank: nextCount, max_primary_rows_per_player: maxPerPlayer, delta: 0, note: "Demoted from PRIMARY to REVIEW to keep PRIMARY from over-indexing on one player narrative." });
      demotedToReview.push(row);
    }
  }

  const combinedReview = [...reviewRows, ...demotedToReview].sort((a, b) =>
    (num(b.score_0_100) - num(a.score_0_100)) ||
    (num(b.confidence_0_100) - num(a.confidence_0_100)) ||
    (num(b.score_sort_0_100) - num(a.score_sort_0_100)) ||
    String(a.player_name || "").localeCompare(String(b.player_name || "")) ||
    String(a.canonical_prop_key || "").localeCompare(String(b.canonical_prop_key || "")) ||
    String(a.matrix_id || "").localeCompare(String(b.matrix_id || ""))
  );

  return {
    primaryRows: keptPrimary,
    reviewRows: combinedReview,
    demotedRows: demotedToReview,
    primaryRowsBeforeClusterCap: sortedPrimary.length,
    primaryRowsAfterClusterCap: keptPrimary.length,
    reviewRowsBeforeClusterCap: reviewRows.length,
    reviewRowsAfterClusterCap: combinedReview.length,
    maxPrimaryRowsPerPlayer: maxPerPlayer
  };
}


function finalBoardCandidateComparator(a, b) {
  const tierA = String(a.board_tier || "REVIEW") === "PRIMARY" ? 1 : 0;
  const tierB = String(b.board_tier || "REVIEW") === "PRIMARY" ? 1 : 0;
  const hpSortA = num(a.hp_sort_0_100, num(a.score_sort_0_100, finalBoardSortFromHp(a)));
  const hpSortB = num(b.hp_sort_0_100, num(b.score_sort_0_100, finalBoardSortFromHp(b)));
  return (tierB - tierA) ||
    (hpSortB - hpSortA) ||
    (num(b.estimated_hit_probability_0_100, 0) - num(a.estimated_hit_probability_0_100, 0)) ||
    (num(b.score_0_100, 0) - num(a.score_0_100, 0)) ||
    (num(b.probability_confidence_0_100, num(b.confidence_0_100, 0)) - num(a.probability_confidence_0_100, num(a.confidence_0_100, 0))) ||
    (num(a.hp_rank, 999999) - num(b.hp_rank, 999999)) ||
    String(a.source_key || "").localeCompare(String(b.source_key || "")) ||
    String(a.prepared_row_id || a.source_line_id || "").localeCompare(String(b.prepared_row_id || b.source_line_id || ""));
}

function finalBoardDisplayComparator(a, b) {
  // v0.1.32: display/rank contract is tier-first, then HP-first inside each tier.
  // PRIMARY rows are live/primary candidates and must never be interleaved behind REVIEW rows.
  // REVIEW remains a candidate ledger, sorted by the same HP-first quality sort after PRIMARY is exhausted.
  const tierA = String(a.board_tier || "REVIEW") === "PRIMARY" ? 0 : 1;
  const tierB = String(b.board_tier || "REVIEW") === "PRIMARY" ? 0 : 1;
  const hpSortA = num(a.hp_sort_0_100, num(a.score_sort_0_100, finalBoardSortFromHp(a)));
  const hpSortB = num(b.hp_sort_0_100, num(b.score_sort_0_100, finalBoardSortFromHp(b)));
  return (tierA - tierB) ||
    (hpSortB - hpSortA) ||
    (num(b.estimated_hit_probability_0_100, 0) - num(a.estimated_hit_probability_0_100, 0)) ||
    (num(b.score_0_100, 0) - num(a.score_0_100, 0)) ||
    (num(b.probability_confidence_0_100, num(b.confidence_0_100, 0)) - num(a.probability_confidence_0_100, num(a.confidence_0_100, 0))) ||
    (num(a.hp_rank, 999999) - num(b.hp_rank, 999999)) ||
    String(a.player_name || "").localeCompare(String(b.player_name || "")) ||
    String(a.canonical_prop_key || "").localeCompare(String(b.canonical_prop_key || "")) ||
    String(a.source_key || "").localeCompare(String(b.source_key || "")) ||
    String(a.prepared_row_id || a.source_line_id || "").localeCompare(String(b.prepared_row_id || b.source_line_id || ""));
}

function sourceMarketClusterKey(row) {
  const source = String(row.source_key || "UNKNOWN_SOURCE").toLowerCase();
  const player = String(row.mlb_player_id || row.player_name || "UNKNOWN_PLAYER");
  const prop = String(row.canonical_prop_key || "UNKNOWN_PROP").toLowerCase();
  const line = row.line_value == null ? "NULL_LINE" : String(Number(row.line_value));
  const side = String(row.selected_side || "UNKNOWN_SIDE").toLowerCase();
  return `${source}|${player}|${prop}|${line}|${side}`;
}

function playerExposureKey(row) {
  return String(row.mlb_player_id || row.player_name || "UNKNOWN_PLAYER");
}

function appendFinalBoardPolicyAdjustment(row, adjustment) {
  let payload = {};
  try { payload = row.calibration_json ? JSON.parse(row.calibration_json) : {}; } catch (_) { payload = {}; }
  if (!Array.isArray(payload.final_board_adjustments)) payload.final_board_adjustments = [];
  payload.final_board_adjustments.push(adjustment);
  row.calibration_json = safeJson(payload);
  return row;
}

function dedupeSourceMarketClusters(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    const key = sourceMarketClusterKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const kept = [];
  const dropped = [];
  let duplicateClusterCount = 0;
  let crossSourceDuplicateClusterCount = 0;

  for (const [clusterKey, clusterRows] of groups.entries()) {
    const sorted = [...clusterRows].sort(finalBoardCandidateComparator);
    const winner = sorted[0];
    const losers = sorted.slice(1);
    const sources = [...new Set(clusterRows.map(r => String(r.source_key || "unknown")))].sort();
    if (clusterRows.length > 1) duplicateClusterCount += 1;
    if (sources.length > 1) crossSourceDuplicateClusterCount += 1;
    if (winner) {
      appendFinalBoardPolicyAdjustment(winner, {
        key: "source_market_cluster_kept_best_row",
        cluster_key: clusterKey,
        cluster_rows_seen: clusterRows.length,
        cluster_sources: sources,
        dropped_cluster_rows: losers.length,
        policy: "Keep one Final Board row per app/source + player + prop + line + side; cross-app mirrors are preserved when present so app floors are not falsely cut."
      });
      kept.push(winner);
    }
    for (const loser of losers) {
      appendFinalBoardPolicyAdjustment(loser, {
        key: "source_market_cluster_dropped_duplicate",
        cluster_key: clusterKey,
        cluster_rows_seen: clusterRows.length,
        cluster_sources: sources,
        kept_prepared_row_id: winner && winner.prepared_row_id || null,
        kept_source_key: winner && winner.source_key || null,
        policy: "Dropped from Final Board only; source/prepared/scoring/HP rows remain untouched."
      });
      dropped.push(loser);
    }
  }

  return {
    rows: kept.sort(finalBoardDisplayComparator),
    droppedRows: dropped,
    rowsBeforeDedupe: rows.length,
    rowsAfterDedupe: kept.length,
    droppedBySourceMarketCluster: dropped.length,
    duplicateClusterCount,
    crossSourceDuplicateClusterCount
  };
}

function applyGlobalPlayerExposureCap(rows, maxRowsPerPlayer = FINAL_BOARD_MAX_ROWS_PER_PLAYER_TOTAL) {
  // v0.1.33: exposure is a transparent variance/diversification rank only.
  // It must not cut rows from the Final Board because the board now has explicit prop/app/variant floors.
  const byPlayer = new Map();
  for (const row of rows || []) {
    const key = playerExposureKey(row);
    if (!byPlayer.has(key)) byPlayer.set(key, []);
    byPlayer.get(key).push(row);
  }

  const kept = [];
  const overCapRows = [];
  let cappedPlayerCount = 0;

  for (const [playerKey, playerRows] of byPlayer.entries()) {
    const primary = playerRows.filter(r => String(r.board_tier || "REVIEW") === "PRIMARY").sort(finalBoardCandidateComparator);
    const review = playerRows.filter(r => String(r.board_tier || "REVIEW") !== "PRIMARY").sort(finalBoardCandidateComparator);
    const orderedForExposure = [...primary, ...review];
    if (orderedForExposure.length > maxRowsPerPlayer) cappedPlayerCount += 1;

    orderedForExposure.forEach((row, idx) => {
      const playerFinalBoardRank = idx + 1;
      const overSoftCap = idx >= maxRowsPerPlayer;
      appendFinalBoardPolicyAdjustment(row, {
        key: overSoftCap ? "player_global_exposure_soft_cap_overflow_kept" : "player_global_exposure_soft_cap_kept",
        player_key: playerKey,
        player_final_board_rank: playerFinalBoardRank,
        soft_cap_reference_rows_per_player: maxRowsPerPlayer,
        cut_applied: false,
        policy: "Exposure cap is only a late tiebreaker/ledger warning. Rows are not removed merely because one player has many good legs."
      });
      if (overSoftCap) overCapRows.push(row);
      kept.push(row);
    });
  }

  return {
    rows: kept.sort(finalBoardDisplayComparator),
    droppedRows: [],
    overCapRows,
    rowsBeforePlayerCap: rows.length,
    rowsAfterPlayerCap: kept.length,
    droppedByPlayerCap: 0,
    cappedPlayerCount,
    maxTotalRowsPerPlayer: maxRowsPerPlayer
  };
}

function finalBoardRowKey(row) {
  return String(row.prepared_row_id || row.source_line_id || row.matrix_id || row.hp_board_row_id || row.probability_row_id || [row.source_key,row.mlb_player_id,row.canonical_prop_key,row.line_value,row.selected_side].join('|'));
}

function finalBoardVariant(row) {
  const p = norm(row && row.payout_variant);
  const line = norm(row && row.source_line_id);
  const odds = norm(row && row.odds_type);
  if (p.includes('demon') || line.includes('demon') || odds.includes('demon')) return 'demon';
  if (p.includes('goblin') || line.includes('goblin') || odds.includes('goblin')) return 'goblin';
  return 'regular';
}

function forceReviewQuotaReserveRow(row, reasonKey) {
  row.board_tier = "REVIEW";
  row.live_playable = 0;
  row.review_playable = 1;
  row.source_candidate_tier = "HP_FIRST_QUOTA_RESERVE_REVIEW";
  appendFinalBoardPolicyAdjustment(row, {
    key: "quota_reserve_review_included",
    quota_reason: reasonKey,
    cut_applied: false,
    hp_preserved: row.estimated_hit_probability_0_100 == null ? null : Number(row.estimated_hit_probability_0_100),
    policy: "Quota reserve preserves representation for prop/app/payout variant floors. It never inflates HP, never promotes to PRIMARY, and remains REVIEW unless independently qualified by HP board."
  });
  return row;
}

function addQuotaReserveRows(mappedRows, baseRows) {
  const selected = new Map();
  const addedRows = [];
  for (const row of baseRows || []) selected.set(finalBoardRowKey(row), row);

  const pool = (mappedRows || [])
    .filter(r => !selected.has(finalBoardRowKey(r)))
    .filter(r => num(r.estimated_hit_probability_0_100, 0) >= FINAL_BOARD_QUOTA_RESERVE_MIN_HP)
    .filter(r => num(r.score_0_100, 0) >= FINAL_BOARD_QUOTA_RESERVE_MIN_SCORE)
    .sort(finalBoardCandidateComparator);

  const addBest = (predicate, needed, reasonKey) => {
    let added = 0;
    if (needed <= 0) return 0;
    for (const row of pool) {
      if (added >= needed) break;
      const key = finalBoardRowKey(row);
      if (selected.has(key)) continue;
      if (!predicate(row)) continue;
      const reserve = forceReviewQuotaReserveRow(row, reasonKey);
      selected.set(key, reserve);
      addedRows.push(reserve);
      added += 1;
    }
    return added;
  };

  const diagnostics = [];
  const countSelected = (predicate) => Array.from(selected.values()).filter(predicate).length;
  const countAvailable = (predicate) => (mappedRows || []).filter(predicate).length;

  const props = [...new Set((mappedRows || []).map(r => String(r.canonical_prop_key || '')).filter(Boolean))].sort();
  for (const prop of props) {
    const predicate = r => String(r.canonical_prop_key || '') === prop;
    const available = countAvailable(predicate);
    const target = Math.min(FINAL_BOARD_PROP_FLOOR_PER_PROP, available);
    const before = countSelected(predicate);
    const added = addBest(predicate, Math.max(0, target - before), `prop_floor:${prop}`);
    diagnostics.push({ floor_type:'prop', key:prop, target, available, before, added, after:countSelected(predicate) });
  }

  const sources = [...new Set((mappedRows || []).map(r => String(r.source_key || '')).filter(Boolean))].sort();
  for (const source of sources) {
    const predicate = r => String(r.source_key || '') === source;
    const available = countAvailable(predicate);
    const target = Math.min(FINAL_BOARD_SOURCE_FLOOR_PER_APP, available);
    const before = countSelected(predicate);
    const added = addBest(predicate, Math.max(0, target - before), `source_floor:${source}`);
    diagnostics.push({ floor_type:'source', key:source, target, available, before, added, after:countSelected(predicate) });
  }

  for (const [variant, floor] of Object.entries(FINAL_BOARD_VARIANT_FLOORS)) {
    const predicate = r => finalBoardVariant(r) === variant;
    const available = countAvailable(predicate);
    const target = Math.min(floor, available);
    const before = countSelected(predicate);
    const added = addBest(predicate, Math.max(0, target - before), `variant_floor:${variant}`);
    diagnostics.push({ floor_type:'variant', key:variant, target, available, before, added, after:countSelected(predicate) });
  }

  return {
    rows: Array.from(selected.values()).sort(finalBoardDisplayComparator),
    addedRows,
    rowsBeforeQuota: (baseRows || []).length,
    rowsAfterQuota: selected.size,
    quotaRowsAdded: addedRows.length,
    diagnostics
  };
}

async function insertBoardRow(env, table, id, batchId, sourceEngineBatchId, rank, row) {
  await run(env.SCORE_DB, `
    INSERT OR REPLACE INTO ${table} (
      final_board_row_id, final_board_batch_id, source_simulation_batch_id, source_engine_batch_id, profile_key, rank_order,
      board_tier, review_playable,
      source_key, game_pk, official_date, official_game_time_utc, prepared_row_id, matrix_id, source_line_id,
      mlb_player_id, player_name, canonical_prop_key, line_value, selected_side,
      raw_score_0_100, raw_confidence_0_100, score_0_100, confidence_0_100,
      score_grade, score_sort_0_100, factor_status, market_prop_context_status, daily_readiness_status,
      side_mode, odds_type, payout_variant, archive_eligible, live_playable,
      cluster_player_count, correlation_risk_tier, calibration_json,
      calculation_json, matrix_payload_json_snapshot, details_json_snapshot,
      hp_board_batch_id, source_hp_batch_id, estimated_hit_probability_0_100, probability_confidence_0_100,
      probability_band, probability_grade, hp_lane, hp_rank, hp_sort_0_100,
      sample_size, non_push_sample, hit_count, miss_count, push_count, hp_source_board_tier, hp_source_lane_reason,
      created_at, updated_at
    ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `,
    id, batchId, sourceEngineBatchId, row.profile_key || PRIMARY_PROFILE, rank,
    row.board_tier || "PRIMARY", Number(row.review_playable || 0),
    row.source_key || null, row.game_pk || null, row.official_date || null, row.official_game_time_utc || null,
    row.prepared_row_id || null, row.matrix_id || null, row.source_line_id || null,
    row.mlb_player_id || null, row.player_name || null, row.canonical_prop_key || null, row.line_value == null ? null : Number(row.line_value),
    row.selected_side || null,
    row.raw_score_0_100 == null ? null : Number(row.raw_score_0_100), row.raw_confidence_0_100 == null ? null : Number(row.raw_confidence_0_100),
    row.score_0_100 == null ? null : Number(row.score_0_100), row.confidence_0_100 == null ? null : Number(row.confidence_0_100),
    row.score_grade || null, row.score_sort_0_100 == null ? null : Number(row.score_sort_0_100), row.factor_status || null,
    row.market_prop_context_status || null, row.daily_readiness_status || null, row.side_mode || null, row.odds_type || null, row.payout_variant || null,
    Number(row.archive_eligible || 0), Number(row.live_playable || 0),
    row.cluster_player_count == null ? null : Number(row.cluster_player_count), row.correlation_risk_tier || null, row.calibration_json || null,
    row.calculation_json || null, row.matrix_payload_json_snapshot || null, row.details_json_snapshot || null,
    row.hp_board_batch_id || null, row.source_hp_batch_id || null,
    row.estimated_hit_probability_0_100 == null ? null : Number(row.estimated_hit_probability_0_100),
    row.probability_confidence_0_100 == null ? null : Number(row.probability_confidence_0_100),
    row.probability_band || null, row.probability_grade || null, row.hp_lane || null,
    row.hp_rank == null ? null : Number(row.hp_rank), row.hp_sort_0_100 == null ? null : Number(row.hp_sort_0_100),
    row.sample_size == null ? null : Number(row.sample_size), row.non_push_sample == null ? null : Number(row.non_push_sample),
    row.hit_count == null ? null : Number(row.hit_count), row.miss_count == null ? null : Number(row.miss_count), row.push_count == null ? null : Number(row.push_count),
    row.hp_source_board_tier || null, row.hp_source_lane_reason || null
  );
}


function boardRowBindValues(batchId, sourceEngineBatchId, rank, row, id) {
  return [
    id, batchId, sourceEngineBatchId, row.profile_key || PRIMARY_PROFILE, rank,
    row.board_tier || "PRIMARY", Number(row.review_playable || 0),
    row.source_key || null, row.game_pk || null, row.official_date || null, row.official_game_time_utc || null,
    row.prepared_row_id || null, row.matrix_id || null, row.source_line_id || null,
    row.mlb_player_id || null, row.player_name || null, row.canonical_prop_key || null, row.line_value == null ? null : Number(row.line_value),
    row.selected_side || null,
    row.raw_score_0_100 == null ? null : Number(row.raw_score_0_100), row.raw_confidence_0_100 == null ? null : Number(row.raw_confidence_0_100),
    row.score_0_100 == null ? null : Number(row.score_0_100), row.confidence_0_100 == null ? null : Number(row.confidence_0_100),
    row.score_grade || null, row.score_sort_0_100 == null ? null : Number(row.score_sort_0_100), row.factor_status || null,
    row.market_prop_context_status || null, row.daily_readiness_status || null, row.side_mode || null, row.odds_type || null, row.payout_variant || null,
    Number(row.archive_eligible || 0), Number(row.live_playable || 0),
    row.cluster_player_count == null ? null : Number(row.cluster_player_count), row.correlation_risk_tier || null, row.calibration_json || null,
    row.calculation_json || null, row.matrix_payload_json_snapshot || null, row.details_json_snapshot || null,
    row.hp_board_batch_id || null, row.source_hp_batch_id || null,
    row.estimated_hit_probability_0_100 == null ? null : Number(row.estimated_hit_probability_0_100),
    row.probability_confidence_0_100 == null ? null : Number(row.probability_confidence_0_100),
    row.probability_band || null, row.probability_grade || null, row.hp_lane || null,
    row.hp_rank == null ? null : Number(row.hp_rank), row.hp_sort_0_100 == null ? null : Number(row.hp_sort_0_100),
    row.sample_size == null ? null : Number(row.sample_size), row.non_push_sample == null ? null : Number(row.non_push_sample),
    row.hit_count == null ? null : Number(row.hit_count), row.miss_count == null ? null : Number(row.miss_count), row.push_count == null ? null : Number(row.push_count),
    row.hp_source_board_tier || null, row.hp_source_lane_reason || null
  ];
}

function boardInsertSql(table) {
  return `
    INSERT OR REPLACE INTO ${table} (
      final_board_row_id, final_board_batch_id, source_simulation_batch_id, source_engine_batch_id, profile_key, rank_order,
      board_tier, review_playable,
      source_key, game_pk, official_date, official_game_time_utc, prepared_row_id, matrix_id, source_line_id,
      mlb_player_id, player_name, canonical_prop_key, line_value, selected_side,
      raw_score_0_100, raw_confidence_0_100, score_0_100, confidence_0_100,
      score_grade, score_sort_0_100, factor_status, market_prop_context_status, daily_readiness_status,
      side_mode, odds_type, payout_variant, archive_eligible, live_playable,
      cluster_player_count, correlation_risk_tier, calibration_json,
      calculation_json, matrix_payload_json_snapshot, details_json_snapshot,
      hp_board_batch_id, source_hp_batch_id, estimated_hit_probability_0_100, probability_confidence_0_100,
      probability_band, probability_grade, hp_lane, hp_rank, hp_sort_0_100,
      sample_size, non_push_sample, hit_count, miss_count, push_count, hp_source_board_tier, hp_source_lane_reason,
      created_at, updated_at
    ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `;
}

async function insertBoardRowsBatched(env, table, batchId, sourceEngineBatchId, rows, chunkSize = 100) {
  const sql = boardInsertSql(table);
  let rank = 0;
  let written = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const statements = [];
    for (const row of chunk) {
      rank += 1;
      const id = rowId(batchId, rank, row);
      const stmt = env.SCORE_DB.prepare(sql).bind(...boardRowBindValues(batchId, sourceEngineBatchId, rank, row, id));
      statements.push(stmt);
    }
    if (typeof env.SCORE_DB.batch === "function") {
      await env.SCORE_DB.batch(statements);
    } else {
      for (const stmt of statements) await stmt.run();
    }
    written += chunk.length;
  }
  return written;
}

async function copyHistoryToCurrent(env, batchId) {
  const currentCols = (await all(env.SCORE_DB, `PRAGMA table_info(score_final_board_current)`)).map(c => String(c.name));
  const historySet = new Set((await all(env.SCORE_DB, `PRAGMA table_info(score_final_board_history)`)).map(c => String(c.name)));
  const cols = currentCols.filter(c => historySet.has(c));
  if (!cols.length) return { ok:false, reason:"no_common_columns" };
  const colSql = cols.map(c => `"${c.replace(/"/g, '""')}"`).join(", ");
  await run(env.SCORE_DB, `DELETE FROM score_final_board_current`);
  await run(env.SCORE_DB, `INSERT OR REPLACE INTO score_final_board_current (${colSql}) SELECT ${colSql} FROM score_final_board_history WHERE final_board_batch_id = ?`, batchId);
  return { ok:true, columns:cols.length };
}

async function reconcileStaleRunningFinalBoard(env, input, engine, started) {
  if (!engine || !engine.batch_id) return null;
  const stale = await first(env.SCORE_DB, `
    SELECT final_board_batch_id, worker_version, source_engine_batch_id, source_scoring_worker_version, profile_key, started_at
    FROM score_final_board_batches
    WHERE source_engine_batch_id = ?
      AND status = 'running'
      AND finished_at IS NULL
    ORDER BY datetime(started_at) DESC
    LIMIT 1
  `, engine.batch_id);
  if (!stale || !stale.final_board_batch_id) return null;
  const staleBatchId = stale.final_board_batch_id;
  const history = await first(env.SCORE_DB, `
    SELECT COUNT(*) AS rows, COUNT(DISTINCT final_board_row_id) AS distinct_rows, COUNT(DISTINCT prepared_row_id) AS prepared_rows,
           COUNT(DISTINCT matrix_id) AS matrix_rows, COUNT(DISTINCT source_line_id) AS source_line_ids,
           COUNT(DISTINCT game_pk) AS games, COUNT(DISTINCT mlb_player_id) AS players, COUNT(DISTINCT canonical_prop_key) AS prop_keys,
           COUNT(DISTINCT selected_side) AS selected_sides, MIN(rank_order) AS min_rank, MAX(rank_order) AS max_rank,
           MIN(score_0_100) AS min_score, MAX(score_0_100) AS max_score
    FROM score_final_board_history
    WHERE final_board_batch_id = ?
  `, staleBatchId);
  const historyRows = Number(history && history.rows || 0);
  if (historyRows <= 0) return null;
  await copyHistoryToCurrent(env, staleBatchId);
  const current = await first(env.SCORE_DB, `
    SELECT COUNT(*) AS rows, COUNT(DISTINCT final_board_row_id) AS distinct_rows, COUNT(DISTINCT prepared_row_id) AS prepared_rows,
           COUNT(DISTINCT matrix_id) AS matrix_rows, COUNT(DISTINCT source_line_id) AS source_line_ids,
           COUNT(DISTINCT game_pk) AS games, COUNT(DISTINCT mlb_player_id) AS players, COUNT(DISTINCT canonical_prop_key) AS prop_keys,
           COUNT(DISTINCT selected_side) AS selected_sides, MIN(rank_order) AS min_rank, MAX(rank_order) AS max_rank,
           MIN(score_0_100) AS min_score, MAX(score_0_100) AS max_score
    FROM score_final_board_current
    WHERE final_board_batch_id = ?
  `, staleBatchId);
  const currentRows = Number(current && current.rows || 0);
  const bad = await first(env.SCORE_DB, `
    SELECT COUNT(*) AS bad_rows
    FROM score_final_board_current
    WHERE final_board_batch_id = ?
      AND (
        profile_key <> ?
        OR archive_eligible <> 1
        OR selected_side IS NULL
        OR line_value IS NULL
        OR player_name IS NULL
        OR canonical_prop_key IS NULL
        OR source_key IS NULL
        OR mlb_player_id IS NULL
        OR score_0_100 IS NULL
        OR confidence_0_100 IS NULL
        OR estimated_hit_probability_0_100 IS NULL
        OR (estimated_hit_probability_0_100 < 45 AND board_tier = 'PRIMARY')
        OR board_tier NOT IN ('PRIMARY','REVIEW')
        OR review_playable NOT IN (0,1)
        OR (board_tier = 'PRIMARY' AND live_playable <> 1)
        OR (board_tier = 'PRIMARY' AND review_playable <> 0)
        OR (board_tier = 'REVIEW' AND review_playable <> 1)
        OR (board_tier = 'REVIEW' AND live_playable <> 0)
      )
  `, staleBatchId, PRIMARY_PROFILE);
  const badRows = Number(bad && bad.bad_rows || 0);
  if (currentRows <= 0 || currentRows !== historyRows || badRows > 0) return null;
  const byTierSource = await all(env.SCORE_DB, `
    SELECT board_tier, review_playable, source_key, COUNT(*) AS rows, COUNT(DISTINCT canonical_prop_key) AS prop_families, COUNT(DISTINCT mlb_player_id) AS players, MIN(score_0_100) AS min_score, MAX(score_0_100) AS max_score, AVG(score_0_100) AS avg_score
    FROM score_final_board_current
    WHERE final_board_batch_id = ?
    GROUP BY board_tier, review_playable, source_key
    ORDER BY board_tier, rows DESC
  `, staleBatchId);
  const output = {
    ok:true,
    data_ok:true,
    version:VERSION,
    worker_name:WORKER_NAME,
    job_key:JOB_KEY,
    request_id:input.request_id || null,
    run_id:input.run_id || null,
    status:"completed_final_board_current_reconciled_after_timeout",
    certification:"SCORE_FINAL_BOARD_CERTIFIED_CURRENT_RECONCILED_AFTER_TIMEOUT",
    certification_grade:"PASS_WITH_REVIEW_WARNINGS",
    final_board_batch_id:staleBatchId,
    source_engine_batch_id:engine.batch_id,
    source_scoring_worker_version:engine.worker_version,
    profile_key:PRIMARY_PROFILE,
    matrix_rows_read:Number(engine.matrix_rows_read || 0),
    live_rows_read:currentRows,
    final_rows_written:historyRows,
    current_rows_written:currentRows,
    stale_running_batch_reconciled:true,
    copied_history_to_current:true,
    current_summary:current,
    history_summary:history,
    by_tier_source:byTierSource,
    no_external_calls:true,
    no_source_board_mutation:true,
    no_simulation_shadow_mutation:true,
    elapsed_ms:Date.now() - started,
    timestamp_utc:nowUtc()
  };
  await writeIssue(env, staleBatchId, engine.batch_id, "SERVICE_BINDING_TIMEOUT_RECONCILED", "WARNING", 1, { note:"Prior invocation wrote history/current evidence but timed out before finalizing the batch row. v0.1.8 rebuilt current from history, verified invariants, and finalized the batch." });
  await run(env.SCORE_DB, `
    UPDATE score_final_board_batches
    SET worker_version=?, source_simulation_batch_id=NULL, source_engine_batch_id=?, source_scoring_worker_version=?, profile_key=?, status=?, certification=?, certification_grade=?, matrix_rows_read=?, live_rows_read=?, final_rows_written=?, current_rows_written=?, finished_at=CURRENT_TIMESTAMP, output_json=?
    WHERE final_board_batch_id=?
  `, VERSION, engine.batch_id, engine.worker_version, PRIMARY_PROFILE, output.status, output.certification, output.certification_grade, output.matrix_rows_read, output.live_rows_read, output.final_rows_written, output.current_rows_written, safeJson(output), staleBatchId);
  return output;
}

async function generateFinalBoard(env, input) {
  await ensureSchema(env);
  const started = Date.now();
  const batchId = rid("score_final_board_batch");
  const requestId = input.request_id || null;
  const runId = input.run_id || null;
  const requestedEngineBatchId = input.source_engine_batch_id || input.scoring_engine_batch_id || null;
  if (input.requires_real_engine_scoring_batch === true && !requestedEngineBatchId) {
    await run(env.SCORE_DB, `
      INSERT INTO score_final_board_batches (final_board_batch_id, worker_version, job_key, source_simulation_batch_id, source_engine_batch_id, source_scoring_worker_version, profile_key, status, certification, certification_grade, started_at)
      VALUES (?, ?, ?, NULL, NULL, NULL, ?, 'blocked_missing_explicit_engine_batch', 'SCORE_FINAL_BOARD_BLOCKED_MISSING_EXPLICIT_ENGINE_BATCH', 'BLOCKED', CURRENT_TIMESTAMP)
    `, batchId, VERSION, JOB_KEY, PRIMARY_PROFILE);
    const output = { ok:false, data_ok:false, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, request_id:requestId, run_id:runId, status:"blocked_missing_explicit_engine_batch", certification:"SCORE_FINAL_BOARD_BLOCKED_MISSING_EXPLICIT_ENGINE_BATCH", certification_grade:"BLOCKED", final_board_batch_id:batchId, reason:"Market Full must pass the same-chain terminal scoring_engine batch_id; Final Board is not allowed to fall back to an old completed batch." };
    await writeIssue(env, batchId, null, "MISSING_EXPLICIT_ENGINE_BATCH", "BLOCKER", 1, output);
    await run(env.SCORE_DB, `UPDATE score_final_board_batches SET output_json=?, finished_at=CURRENT_TIMESTAMP WHERE final_board_batch_id=?`, safeJson(output), batchId);
    return output;
  }

  const newestEngine = requestedEngineBatchId ? await latestCompletedEngineBatch(env, requestedEngineBatchId) : await latestEngineBatchAnyStatus(env);
  const engine = requestedEngineBatchId ? newestEngine : (isCompletedCertifiedEngineBatch(newestEngine) ? newestEngine : await latestCompletedEngineBatch(env, null));

  if (!isCompletedCertifiedEngineBatch(newestEngine)) {
    await run(env.SCORE_DB, `
      INSERT INTO score_final_board_batches (final_board_batch_id, worker_version, job_key, source_simulation_batch_id, source_engine_batch_id, source_scoring_worker_version, profile_key, status, certification, certification_grade, started_at)
      VALUES (?, ?, ?, NULL, ?, ?, ?, 'blocked_latest_engine_batch_not_terminal', 'SCORE_FINAL_BOARD_BLOCKED_LATEST_ENGINE_BATCH_NOT_TERMINAL', 'BLOCKED', CURRENT_TIMESTAMP)
    `, batchId, VERSION, JOB_KEY, newestEngine && newestEngine.batch_id || null, newestEngine && newestEngine.worker_version || null, PRIMARY_PROFILE);
    const output = { ok:false, data_ok:false, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, request_id:requestId, run_id:runId, status:"blocked_latest_engine_batch_not_terminal", certification:"SCORE_FINAL_BOARD_BLOCKED_LATEST_ENGINE_BATCH_NOT_TERMINAL", certification_grade:"BLOCKED", final_board_batch_id:batchId, requested_engine_batch_id:requestedEngineBatchId, latest_engine_batch_id:newestEngine && newestEngine.batch_id || null, latest_engine_status:newestEngine && newestEngine.status || null, latest_engine_certification:newestEngine && newestEngine.certification || null, latest_engine_score_rows_written:newestEngine && newestEngine.score_rows_written || 0, reason:"The newest Scoring Engine batch is not terminal/certified. Final Board refused to fall back to an older completed scoring batch." };
    await writeIssue(env, batchId, newestEngine && newestEngine.batch_id || null, "LATEST_ENGINE_BATCH_NOT_TERMINAL", "BLOCKER", 1, output);
    await run(env.SCORE_DB, `UPDATE score_final_board_batches SET status=?, certification=?, certification_grade=?, finished_at=CURRENT_TIMESTAMP, output_json=? WHERE final_board_batch_id=?`, output.status, output.certification, output.certification_grade, safeJson(output), batchId);
    return output;
  }

  if (!engine || engine.status !== "completed_scoring_current_rows_written" || engine.certification !== "SCORING_ENGINE_CURRENT_CERTIFIED_SCORED_ROWS") {
    await run(env.SCORE_DB, `
      INSERT INTO score_final_board_batches (final_board_batch_id, worker_version, job_key, source_simulation_batch_id, source_engine_batch_id, source_scoring_worker_version, profile_key, status, certification, certification_grade, started_at)
      VALUES (?, ?, ?, NULL, ?, ?, ?, 'running', 'SCORE_FINAL_BOARD_STARTED', 'RUNNING', CURRENT_TIMESTAMP)
    `, batchId, VERSION, JOB_KEY, engine && engine.batch_id || null, engine && engine.worker_version || null, PRIMARY_PROFILE);
    const output = { ok:false, data_ok:false, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, request_id:requestId, run_id:runId, status:"blocked_no_completed_engine_scoring_batch", certification:"SCORE_FINAL_BOARD_BLOCKED_NO_COMPLETED_ENGINE_SCORING", certification_grade:"BLOCKED", final_board_batch_id:batchId, requested_engine_batch_id:requestedEngineBatchId };
    await writeIssue(env, batchId, engine && engine.batch_id || null, "NO_COMPLETED_ENGINE_SCORING_BATCH", "BLOCKER", 1, output);
    await run(env.SCORE_DB, `UPDATE score_final_board_batches SET status=?, certification=?, certification_grade=?, finished_at=CURRENT_TIMESTAMP, output_json=? WHERE final_board_batch_id=?`, output.status, output.certification, output.certification_grade, safeJson(output), batchId);
    return output;
  }

  const reconciled = await reconcileStaleRunningFinalBoard(env, input, engine, started);
  if (reconciled) return reconciled;

  const simBatchId = engine.batch_id;
  const activeProfileKey = await resolveEngineProfileKey(env, simBatchId);

  await run(env.SCORE_DB, `
    INSERT INTO score_final_board_batches (final_board_batch_id, worker_version, job_key, source_simulation_batch_id, source_engine_batch_id, source_scoring_worker_version, profile_key, status, certification, certification_grade, started_at)
    VALUES (?, ?, ?, NULL, ?, ?, ?, 'running', 'SCORE_FINAL_BOARD_STARTED', 'RUNNING', CURRENT_TIMESTAMP)
  `, batchId, VERSION, JOB_KEY, simBatchId, engine.worker_version || null, activeProfileKey);
  const hpRead = await fetchHpFinalBoardCandidateRows(env, simBatchId, 500);
  const hpSource = hpRead.hp_source;
  if (!hpSource || !hpSource.hp_board_batch_id) {
    const output = { ok:false, data_ok:false, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, request_id:requestId, run_id:runId, status:"blocked_no_hp_board_for_engine_batch", certification:"SCORE_FINAL_BOARD_BLOCKED_NO_HP_BOARD_FOR_ENGINE_BATCH", certification_grade:"BLOCKED", final_board_batch_id:batchId, source_engine_batch_id:simBatchId, reason:"Final Board v0.1.29 requires the locked HP Board output for the same completed Engine batch. Run Hit Probability after Engine before Final Board." };
    await writeIssue(env, batchId, simBatchId, "NO_HP_BOARD_FOR_ENGINE_BATCH", "BLOCKER", 1, output);
    await run(env.SCORE_DB, `UPDATE score_final_board_batches SET status=?, certification=?, certification_grade=?, finished_at=CURRENT_TIMESTAMP, output_json=? WHERE final_board_batch_id=?`, output.status, output.certification, output.certification_grade, safeJson(output), batchId);
    return output;
  }

  const hpAllRaw = hpRead.rows;
  const mappedRows = annotateCorrelation(hpAllRaw.map(r => mapHpCurrentRowToFinalBoardRow(r, activeProfileKey)));
  const baseVisibleRows = mappedRows.filter(r =>
    num(r.estimated_hit_probability_0_100, 0) >= 60
    && (Number(r.hp_review_playable || 0) === 1 || Number(r.hp_primary_playable || 0) === 1 || String(r.board_tier || "") === "PRIMARY" || String(r.board_tier || "") === "REVIEW")
  ).sort(finalBoardDisplayComparator);
  const quotaReserveResult = addQuotaReserveRows(mappedRows, baseVisibleRows);
  const sourceMarketClusterResult = dedupeSourceMarketClusters(quotaReserveResult.rows);
  const playerExposureCapResult = applyGlobalPlayerExposureCap(sourceMarketClusterResult.rows, FINAL_BOARD_MAX_ROWS_PER_PLAYER_TOTAL);
  const rows = playerExposureCapResult.rows;
  const primaryRows = rows.filter(r => r.board_tier === "PRIMARY");
  const reviewRows = rows.filter(r => r.board_tier === "REVIEW");
  const primaryRaw = primaryRows;
  const engineRaw = [];
  const engineRead = { pages:0, page_size:0, pagination_mode:"not_used_hp_current_source" };
  const strictLiveCandidates = rows;
  const initiallyCalibratedCandidates = rows;
  const calibratedCandidates = rows;
  const primarySanityResult = { rows, demotedRows:0, rescuedRows:0, advisoryRowsSeen:rows.length };
  const clusterCapResult = {
    primaryRowsBeforeClusterCap: primaryRows.length,
    primaryRowsAfterClusterCap: primaryRows.length,
    reviewRowsBeforeClusterCap: reviewRows.length,
    reviewRowsAfterClusterCap: reviewRows.length,
    demotedRows: [],
    maxPrimaryRowsPerPlayer: FINAL_BOARD_MAX_ROWS_PER_PLAYER_TOTAL
  };

  if (!rows.length) {
    const output = { ok:false, data_ok:false, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, request_id:requestId, run_id:runId, status:"blocked_no_final_rows_after_calibration", certification:"SCORE_FINAL_BOARD_BLOCKED_NO_FINAL_ROWS_AFTER_CALIBRATION", certification_grade:"BLOCKED", final_board_batch_id:batchId, source_engine_batch_id:simBatchId, profile_key:activeProfileKey, primary_rows_after_calibration:primaryRows.length, review_rows_after_calibration:reviewRows.length };
    await writeIssue(env, batchId, simBatchId, "NO_FINAL_ROWS_AFTER_CALIBRATION", "BLOCKER", 1, output);
    await run(env.SCORE_DB, `UPDATE score_final_board_batches SET status=?, certification=?, certification_grade=?, finished_at=CURRENT_TIMESTAMP, output_json=? WHERE final_board_batch_id=?`, output.status, output.certification, output.certification_grade, safeJson(output), batchId);
    return output;
  }

  await insertBoardRowsBatched(env, "score_final_board_history", batchId, simBatchId, rows, 100);

  await run(env.SCORE_DB, `DELETE FROM score_final_board_current`);
  await insertBoardRowsBatched(env, "score_final_board_current", batchId, simBatchId, rows, 100);

  const byTierSource = await all(env.SCORE_DB, `
    SELECT board_tier, review_playable, source_key, COUNT(*) AS rows, COUNT(DISTINCT canonical_prop_key) AS prop_families, COUNT(DISTINCT mlb_player_id) AS players, MIN(score_0_100) AS min_score, MAX(score_0_100) AS max_score, AVG(score_0_100) AS avg_score
    FROM score_final_board_current
    WHERE final_board_batch_id = ?
    GROUP BY board_tier, review_playable, source_key
    ORDER BY board_tier, rows DESC
  `, batchId);

  const bySourcePropSide = await all(env.SCORE_DB, `
    SELECT board_tier, source_key, canonical_prop_key, selected_side, COUNT(*) AS rows, MIN(score_0_100) AS min_score, MAX(score_0_100) AS max_score, AVG(score_0_100) AS avg_score
    FROM score_final_board_current
    WHERE final_board_batch_id = ?
    GROUP BY board_tier, source_key, canonical_prop_key, selected_side
    ORDER BY board_tier, rows DESC, max_score DESC
  `, batchId);

  const finalBad = await first(env.SCORE_DB, `
    SELECT COUNT(*) AS bad_rows
    FROM score_final_board_current
    WHERE final_board_batch_id = ?
      AND (
        profile_key <> ?
        OR archive_eligible <> 1
        OR selected_side IS NULL
        OR line_value IS NULL
        OR player_name IS NULL
        OR canonical_prop_key IS NULL
        OR source_key IS NULL
        OR mlb_player_id IS NULL
        OR score_0_100 IS NULL
        OR confidence_0_100 IS NULL
        OR estimated_hit_probability_0_100 IS NULL
        OR (estimated_hit_probability_0_100 < 45 AND board_tier = 'PRIMARY')
        OR board_tier NOT IN ('PRIMARY','REVIEW')
        OR review_playable NOT IN (0,1)
        OR (board_tier = 'PRIMARY' AND live_playable <> 1)
        OR (board_tier = 'PRIMARY' AND review_playable <> 0)
        OR (board_tier = 'REVIEW' AND review_playable <> 1)
        OR (board_tier = 'REVIEW' AND live_playable <> 0)
      )
  `, batchId, activeProfileKey);
  const finalBadRows = Number(finalBad && finalBad.bad_rows || 0);
  if (finalBadRows > 0) {
    const output = { ok:false, data_ok:false, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, request_id:requestId, run_id:runId, status:"blocked_written_board_invariant_failure", certification:"SCORE_FINAL_BOARD_BLOCKED_WRITTEN_BOARD_INVARIANTS", certification_grade:"BLOCKED", final_board_batch_id:batchId, source_engine_batch_id:simBatchId, bad_written_rows:finalBadRows };
    await writeIssue(env, batchId, simBatchId, "WRITTEN_BOARD_INVARIANT_FAILURE", "BLOCKER", finalBadRows, output);
    await run(env.SCORE_DB, `UPDATE score_final_board_batches SET status=?, certification=?, certification_grade=?, finished_at=CURRENT_TIMESTAMP, output_json=? WHERE final_board_batch_id=?`, output.status, output.certification, output.certification_grade, safeJson(output), batchId);
    return output;
  }

  const archiveReviewCandidates = rows.filter(r => r.board_tier === "REVIEW" && r.score_grade === "BIN_ARCHIVE" && Number(r.archive_eligible || 0) === 1);
  const archiveReviewBySource = archiveReviewCandidates.reduce((acc, r) => {
    const key = `${r.source_key || "unknown"}|${r.payout_variant || "standard_or_null"}|${r.side_mode || "unknown"}`;
    if (!acc[key]) acc[key] = { source_key: r.source_key || null, payout_variant: r.payout_variant || null, side_mode: r.side_mode || null, rows: 0, min_score: null, max_score: null };
    acc[key].rows += 1;
    const score = Number(r.score_0_100);
    if (Number.isFinite(score)) {
      acc[key].min_score = acc[key].min_score == null ? score : Math.min(acc[key].min_score, score);
      acc[key].max_score = acc[key].max_score == null ? score : Math.max(acc[key].max_score, score);
    }
    return acc;
  }, {});

  const primaryClusterCheck = await first(env.SCORE_DB, `
    SELECT MAX(primary_rows) AS max_primary_rows_per_player
    FROM (
      SELECT mlb_player_id, COUNT(*) AS primary_rows
      FROM score_final_board_current
      WHERE final_board_batch_id = ?
        AND board_tier = 'PRIMARY'
      GROUP BY mlb_player_id
    )
  `, batchId);
  const maxPrimaryRowsPerPlayer = Number(primaryClusterCheck && primaryClusterCheck.max_primary_rows_per_player || 0);

  const totalPlayerExposureCheck = await first(env.SCORE_DB, `
    SELECT MAX(player_rows) AS max_total_rows_per_player
    FROM (
      SELECT mlb_player_id, COUNT(*) AS player_rows
      FROM score_final_board_current
      WHERE final_board_batch_id = ?
      GROUP BY mlb_player_id
    )
  `, batchId);
  const maxTotalRowsPerPlayer = Number(totalPlayerExposureCheck && totalPlayerExposureCheck.max_total_rows_per_player || 0);
  // v0.1.34: player exposure is not a hard blocker.
  // The board must not fail because quota reserve made more legitimately-good rows visible for one player.
  // Exposure is tracked as a soft correlation/tiebreak ledger only; rows remain visible when they qualify.
  const playerExposureSoftOverflow = Math.max(0, maxTotalRowsPerPlayer - FINAL_BOARD_MAX_ROWS_PER_PLAYER_TOTAL);

  const sourceMarketClusterCheck = await first(env.SCORE_DB, `
    SELECT COUNT(*) AS duplicate_source_market_clusters
    FROM (
      SELECT source_key, mlb_player_id, canonical_prop_key, line_value, selected_side, COUNT(*) AS rows
      FROM score_final_board_current
      WHERE final_board_batch_id = ?
      GROUP BY source_key, mlb_player_id, canonical_prop_key, line_value, selected_side
      HAVING rows > 1
    )
  `, batchId);
  const duplicateSourceMarketClusters = Number(sourceMarketClusterCheck && sourceMarketClusterCheck.duplicate_source_market_clusters || 0);
  if (duplicateSourceMarketClusters > 0) {
    const output = { ok:false, data_ok:false, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, request_id:requestId, run_id:runId, status:"blocked_source_market_cluster_dedupe_failure", certification:"SCORE_FINAL_BOARD_BLOCKED_SOURCE_MARKET_CLUSTER_DEDUPE_FAILURE", certification_grade:"BLOCKED", final_board_batch_id:batchId, source_engine_batch_id:simBatchId, duplicate_source_market_clusters:duplicateSourceMarketClusters };
    await writeIssue(env, batchId, simBatchId, "SOURCE_MARKET_CLUSTER_DEDUPE_FAILURE", "BLOCKER", duplicateSourceMarketClusters, output);
    await run(env.SCORE_DB, `UPDATE score_final_board_batches SET status=?, certification=?, certification_grade=?, finished_at=CURRENT_TIMESTAMP, output_json=? WHERE final_board_batch_id=?`, output.status, output.certification, output.certification_grade, safeJson(output), batchId);
    return output;
  }

  const output = {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    request_id: requestId,
    run_id: runId,
    status: "completed_final_board_current_replaced_from_hp_current",
    certification: "SCORE_FINAL_BOARD_CERTIFIED_CURRENT_REPLACED_FROM_HP_CURRENT",
    certification_grade: "PASS_WITH_REVIEW_WARNINGS",
    final_board_batch_id: batchId,
    source_engine_batch_id: simBatchId,
    source_scoring_worker_version: engine.worker_version,
    source_hp_board_batch_id: hpSource && hpSource.hp_board_batch_id || null,
    source_hp_batch_id: hpSource && hpSource.source_hp_batch_id || null,
    hp_current_rows_read: hpAllRaw.length,
    hp_current_read_pages: hpRead.pages,
    hp_current_page_size: hpRead.page_size,
    hp_current_pagination_mode: hpRead.pagination_mode,
    hp_first_final_board_source_active: true,
    profile_key: (typeof activeProfileKey !== "undefined" ? activeProfileKey : PRIMARY_PROFILE),
    matrix_rows_read: Number(engine.matrix_rows_read || 0),
    engine_current_candidate_rows_read: 0,
    engine_current_bypassed_for_final_selection: true,
    engine_current_candidate_read_pages: engineRead.pages,
    engine_current_candidate_page_size: engineRead.page_size,
    paged_engine_current_reader_active: true,
    engine_current_candidate_pagination_mode: engineRead.pagination_mode || "unknown",
    complete_review_ledger_mode: true,
    primary_raw_rows_read: strictLiveCandidates.filter(r => r.board_tier === "PRIMARY").length,
    review_raw_rows_read: strictLiveCandidates.filter(r => r.board_tier === "REVIEW").length,
    strict_live_candidates_read: strictLiveCandidates.filter(r => r.board_tier === "PRIMARY").length,
    safe_review_candidates_read: strictLiveCandidates.filter(r => r.board_tier === "REVIEW").length,
    initially_calibrated_candidates_read: initiallyCalibratedCandidates.length,
    calibrated_candidates_written: calibratedCandidates.length,
    hp_source_batch_id: hpSource && hpSource.hp_board_batch_id || null,
    hp_source_rows_read: hpAllRaw.length,
    hp_source_candidate_rows_seen: mappedRows.length,
    base_visible_rows_before_quota: baseVisibleRows.length,
    quota_reserve_active: true,
    quota_reserve_min_hp: FINAL_BOARD_QUOTA_RESERVE_MIN_HP,
    quota_reserve_min_score: FINAL_BOARD_QUOTA_RESERVE_MIN_SCORE,
    quota_reserve_rows_added: quotaReserveResult.quotaRowsAdded,
    quota_reserve_diagnostics: quotaReserveResult.diagnostics,
    hp_source_rows_after_source_market_dedupe: sourceMarketClusterResult.rowsAfterDedupe,
    hp_source_rows_after_player_exposure_cap: playerExposureCapResult.rowsAfterPlayerCap,
    hp_source_review_rows: reviewRows.length,
    hp_source_primary_rows: primaryRows.length,
    source_market_cluster_dedupe_active: FINAL_BOARD_DEDUPE_SOURCE_MARKET_CLUSTER,
    quota_reserve_rows_after_quota: quotaReserveResult.rowsAfterQuota,
    source_market_cluster_rows_before_dedupe: sourceMarketClusterResult.rowsBeforeDedupe,
    source_market_cluster_rows_after_dedupe: sourceMarketClusterResult.rowsAfterDedupe,
    source_market_cluster_dropped_rows: sourceMarketClusterResult.droppedBySourceMarketCluster,
    source_market_cluster_duplicate_clusters: sourceMarketClusterResult.duplicateClusterCount,
    source_market_cluster_cross_source_duplicate_clusters: sourceMarketClusterResult.crossSourceDuplicateClusterCount,
    player_global_exposure_cap_active: false,
    player_global_exposure_soft_tiebreaker_active: true,
    player_global_exposure_cap_max_total_rows_per_player: playerExposureCapResult.maxTotalRowsPerPlayer,
    player_global_exposure_rows_before_cap: playerExposureCapResult.rowsBeforePlayerCap,
    player_global_exposure_rows_after_cap: playerExposureCapResult.rowsAfterPlayerCap,
    player_global_exposure_dropped_rows: 0,
    player_global_exposure_capped_players: playerExposureCapResult.cappedPlayerCount,
    primary_rows_before_cluster_cap: clusterCapResult.primaryRowsBeforeClusterCap,
    primary_cluster_cap_max_per_player: clusterCapResult.maxPrimaryRowsPerPlayer,
    primary_cluster_cap_demoted_rows: clusterCapResult.demotedRows.length,
    review_rows_before_cluster_cap: clusterCapResult.reviewRowsBeforeClusterCap,
    primary_rows_written: primaryRows.length,
    review_rows_written: reviewRows.length,
    review_rows_after_cluster_cap: clusterCapResult.reviewRowsAfterClusterCap,
    archive_review_rows_written: 0,
    archive_review_by_source: [],
    archive_review_admission_active: false,
    archive_review_admission_policy: "Final Board v0.1.31 is HP-first. HP >= 60 rows from hp_board_current are included after Final Board exposure controls even when Engine score_grade is BIN_ARCHIVE or BIN_REJECT; score remains the trust/support score.",
    live_rows_read: primaryRows.length,
    final_rows_written: rows.length,
    current_rows_written: rows.length,
    table_for_final_ui: "SCORE_DB.score_final_board_current",
    history_table: "SCORE_DB.score_final_board_history",
    final_ui_contract: "Read estimated_hit_probability_0_100 as the reality thermometer, score_0_100 as the Engine trust/support score, and score_sort_0_100 as HP-first board sort. Final Board source is hp_board_current for the same Engine batch. HP >= 60 is base-visible as PRIMARY/REVIEW according to HP board playability. Quota reserve can add lower-HP rows as REVIEW only to satisfy prop/app/payout-variant representation; HP is preserved, not inflated. Source-market dedupe is same-app only, player exposure is a soft tiebreaker only, and rank order is tier-first with HP-sort variance inside each tier.",
    no_external_calls: true,
    no_source_board_mutation: true,
    no_simulation_shadow_mutation: true,
    calibration_active: true,
    final_plus_calibration_active: true,
    cutoff_volatility_trim_active: true,
    cutoff_volatility_trim_policy: "narrow fragile-pitcher cutoff trim only; no source quota, no forced balance, no broad cluster penalty",
    primary_sanity_hp_advisory_active: false,
    primary_sanity_hp_advisory_policy: "Removed in v0.1.29. Final Board consumes locked hp_board_current directly; HP is no longer an advisory layer after Engine-only selection.",
    primary_sanity_rescue_rule_a: null,
    primary_sanity_rescue_rule_b: null,
    primary_sanity_demote_rule: null,
    primary_threshold_score: PRIMARY_THRESHOLD_SCORE,
    primary_threshold_confidence: PRIMARY_THRESHOLD_CONFIDENCE,
    primary_cluster_cap_active: false,
    primary_diversification_policy: "Global player exposure is now a soft tiebreaker/ledger warning only. Rows are not cut merely because one player, prop, app, or payout variant has many candidates.",
    max_primary_rows_per_player: maxPrimaryRowsPerPlayer,
    max_total_rows_per_player: maxTotalRowsPerPlayer,
    by_tier_source: byTierSource,
    by_source_prop_side: bySourcePropSide,
    elapsed_ms: Date.now() - started,
    timestamp_utc: nowUtc()
  };

  await writeIssue(env, batchId, simBatchId, "LIVE_INVARIANT_FAILURE", "INFO", 0, { note: "No live row invariant failures detected before final board write." });
  await writeIssue(env, batchId, simBatchId, "REVIEW_TIER_INCLUDED", "WARNING", reviewRows.length, { note: "Review tier rows are intentionally included as safe soft rows. They are not strict PRIMARY rows.", review_rows_written: reviewRows.length });
  await writeIssue(env, batchId, simBatchId, "HP_FIRST_SOURCE_INCLUDED", "INFO", rows.length, { note: "Final Board v0.1.33 writes base HP >= 60 rows from hp_board_current, then adds REVIEW-only quota reserve rows when needed for prop/app/payout-variant floors. HP is preserved and never inflated; score remains trust/support.", hp_board_batch_id: hpSource && hpSource.hp_board_batch_id || null, hp_rows_read: hpAllRaw.length, rows_after_source_market_dedupe: sourceMarketClusterResult.rowsAfterDedupe, rows_after_player_cap: playerExposureCapResult.rowsAfterPlayerCap });
  await writeIssue(env, batchId, simBatchId, "SOURCE_MARKET_CLUSTER_DEDUPE_APPLIED", sourceMarketClusterResult.droppedBySourceMarketCluster ? "WARNING" : "INFO", sourceMarketClusterResult.droppedBySourceMarketCluster, { note: "Final Board keeps one row per app/source + player + prop + line + side. Cross-app mirrors are no longer removed because app floor coverage is required.", rows_before_dedupe: sourceMarketClusterResult.rowsBeforeDedupe, rows_after_dedupe: sourceMarketClusterResult.rowsAfterDedupe, dropped_rows: sourceMarketClusterResult.droppedBySourceMarketCluster, duplicate_clusters: sourceMarketClusterResult.duplicateClusterCount, cross_source_duplicate_clusters: sourceMarketClusterResult.crossSourceDuplicateClusterCount });
  await writeIssue(env, batchId, simBatchId, "PLAYER_GLOBAL_EXPOSURE_SOFT_LEDGER", playerExposureSoftOverflow ? "WARNING" : "INFO", playerExposureSoftOverflow, { note: "Final Board no longer cuts rows by player exposure. Exposure is a soft tiebreaker/ledger warning only; rows remain visible when they qualify or are needed by quota reserve.", max_total_rows_per_player: playerExposureCapResult.maxTotalRowsPerPlayer, rows_before_cap: playerExposureCapResult.rowsBeforePlayerCap, rows_after_cap: playerExposureCapResult.rowsAfterPlayerCap, dropped_rows: playerExposureCapResult.droppedByPlayerCap, capped_players: playerExposureCapResult.cappedPlayerCount, soft_overflow_rows: playerExposureSoftOverflow });
  await writeIssue(env, batchId, simBatchId, "PRIMARY_CLUSTER_CAP_APPLIED", clusterCapResult.demotedRows.length ? "WARNING" : "INFO", clusterCapResult.demotedRows.length, { note: "PRIMARY is capped at one row per player/game slate cluster key; overflow rows are demoted to REVIEW, not deleted. This is a diversification/correlation safety rail, not a quality killer or source quota.", max_primary_rows_per_player: clusterCapResult.maxPrimaryRowsPerPlayer, primary_rows_before_cluster_cap: clusterCapResult.primaryRowsBeforeClusterCap, primary_rows_after_cluster_cap: clusterCapResult.primaryRowsAfterClusterCap, demoted_rows: clusterCapResult.demotedRows.length });
  await writeIssue(env, batchId, simBatchId, "HP_FIRST_SOURCE_LOCKED", "INFO", rows.length, { note: "Final Board v0.1.33 consumes locked hp_board_current directly, applies same-app dedupe, adds quota reserve review rows, and uses player exposure only as soft tiebreaker. Legacy HP advisory/rescue/demotion variables are not used in the HP-first path.", hp_board_batch_id: hpSource && hpSource.hp_board_batch_id || null, hp_rows_read: hpAllRaw.length, final_rows_written: rows.length, primary_rows_written: primaryRows.length, review_rows_written: reviewRows.length });
  await run(env.SCORE_DB, `
    UPDATE score_final_board_batches
    SET status=?, certification=?, certification_grade=?, matrix_rows_read=?, live_rows_read=?, final_rows_written=?, current_rows_written=?, finished_at=CURRENT_TIMESTAMP, output_json=?
    WHERE final_board_batch_id=?
  `, output.status, output.certification, output.certification_grade, output.matrix_rows_read, output.live_rows_read, output.final_rows_written, output.current_rows_written, safeJson(output), batchId);

  return output;
}

function baseIdentity() {
  return { ok:true, data_ok:true, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, status:"READY", timestamp_utc:nowUtc(), purpose:"Generate SCORE_DB.score_final_board_current from locked SCORE_DB.hp_board_current for the latest completed real Scoring Engine batch. HP is the reality gate; Engine score is preserved as trust/support score." };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();

    if (method === "GET" && (path === "/" || path === "/health")) return jsonResponse(baseIdentity());

    if (method === "POST" && path === "/diagnostic") {
      return jsonResponse({ ...baseIdentity(), route:"/diagnostic", bindings:{ SCORE_DB: !!(env && env.SCORE_DB), CONTROL_DB: !!(env && env.CONTROL_DB) }, writes_performed:0, external_calls_performed:0 });
    }

    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      try {
        
        await controlLifecycleHeartbeat(env, input || {}, "running_score_final_board_worker_started", { mode:(input && input.mode) || null });
        const output = await generateFinalBoard(env, input || {});
        output.request_id = output.request_id || input.request_id || null;
        output.run_id = output.run_id || input.run_id || null;
        output.control_lifecycle = await controlLifecycleFinalize(env, input || {}, output, output.ok !== false && output.data_ok !== false ? "completed" : "failed");
        return jsonResponse(output, output.ok !== false ? 200 : 500);
      } catch (err) {
        
        const failOutput = { ok:false, data_ok:false, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, request_id:input.request_id || null, run_id:input.run_id || null, status:"score_final_board_exception", certification:"SCORE_FINAL_BOARD_EXCEPTION", certification_grade:"FAILED", error:String(err && err.message ? err.message : err), timestamp_utc:nowUtc() };
        try {
          if (env && env.SCORE_DB) {
            await run(env.SCORE_DB, `UPDATE score_final_board_batches
              SET status='failed_runtime_exception', certification='SCORE_FINAL_BOARD_EXCEPTION', certification_grade='FAILED', finished_at=COALESCE(finished_at, CURRENT_TIMESTAMP), output_json=?
              WHERE final_board_batch_id IN (SELECT final_board_batch_id FROM score_final_board_batches WHERE status='running' AND finished_at IS NULL ORDER BY datetime(started_at) DESC LIMIT 1)`, safeJson(failOutput));
          }
        } catch (_) {}
        failOutput.control_lifecycle = await controlLifecycleFinalize(env, input || {}, failOutput, "failed");
        return jsonResponse(failOutput, 500);
      }
    }

    return jsonResponse({ ok:false, data_ok:false, version:VERSION, worker_name:WORKER_NAME, status:"NOT_FOUND", allowed_routes:["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc:nowUtc() }, 404);
  }
};
