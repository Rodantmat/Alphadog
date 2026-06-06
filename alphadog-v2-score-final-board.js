const WORKER_NAME = "alphadog-v2-score-final-board";
const VERSION = "alphadog-v2-score-final-board-v0.1.8-engine-current-timebox-finalizer";
const JOB_KEY = "score-final-board";
const PRIMARY_PROFILE = "STRICT_B";

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
    ["details_json_snapshot", "details_json_snapshot TEXT"]
  ];
  for (const [col, ddl] of extraCols) {
    await addColumnIfMissing(env.SCORE_DB, "score_final_board_current", col, ddl);
    await addColumnIfMissing(env.SCORE_DB, "score_final_board_history", col, ddl);
  }

  await run(env.SCORE_DB, `CREATE INDEX IF NOT EXISTS idx_score_final_board_current_rank ON score_final_board_current(profile_key, board_tier, rank_order)`);
  await run(env.SCORE_DB, `CREATE INDEX IF NOT EXISTS idx_score_final_board_current_date ON score_final_board_current(official_date, source_key, canonical_prop_key)`);
  await run(env.SCORE_DB, `CREATE INDEX IF NOT EXISTS idx_score_final_board_current_game ON score_final_board_current(game_pk, mlb_player_id)`);
  await run(env.SCORE_DB, `CREATE INDEX IF NOT EXISTS idx_score_final_board_current_tier_source ON score_final_board_current(board_tier, source_key, score_0_100)`);
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

async function writeIssue(env, batchId, sourceBatchId, key, severity, count, payload) {
  await run(env.SCORE_DB, `
    INSERT OR REPLACE INTO score_final_board_issues (issue_id, final_board_batch_id, source_simulation_batch_id, source_engine_batch_id, issue_key, severity, issue_count, issue_json, created_at)
    VALUES (?, ?, NULL, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `, `issue|${batchId}|${key}`, batchId, sourceBatchId || null, key, severity, Number(count || 0), safeJson(payload));
}

function rowId(batchId, rank, row) {
  const tier = row.board_tier || "PRIMARY";
  return `final|${batchId}|${PRIMARY_PROFILE}|${tier}|${String(rank).padStart(4, "0")}|${row.matrix_id || row.prepared_row_id || row.source_line_id || rank}`;
}

function gradeForScore(score) {
  if (score == null) return "BIN_0_NULL";
  if (score >= 88) return "BIN_ELITE";
  if (score >= 82) return "BIN_STRONG";
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
  const factorStatus = norm(rawRow.factor_status);
  const readinessStatus = norm(rawRow.daily_readiness_status);
  const lineValue = num(rawRow.line_value, NaN);
  const rawScore = num(rawRow.score_0_100, NaN);
  const rawConfidence = num(rawRow.confidence_0_100, NaN);
  let score = rawScore;
  let confidence = rawConfidence;
  let confidenceCap = 94;
  const scoreAdjustments = [];
  const confidenceAdjustments = [];

  if (!Number.isFinite(score) || !Number.isFinite(confidence)) {
    return { calibration_failed: true };
  }

  // v0.1.3-final-plus: score leg strength, not data perfection. Keep these penalties light.
  if (sourceKey === "prizepicks") {
    score -= 2;
    scoreAdjustments.push({ key: "prizepicks_platform_friction", delta: -2, note: "Light platform friction; PrizePicks remains PRIMARY-eligible when calibrated strength clears threshold." });
  }
  if (factorStatus === "packet_partial") {
    score -= 1;
    scoreAdjustments.push({ key: "packet_partial_light_friction", delta: -1 });
  }
  if (readinessStatus === "missing_current_readiness") {
    score -= 1;
    scoreAdjustments.push({ key: "missing_current_readiness_light_friction", delta: -1 });
  }
  if (readinessStatus === "partial_enrichment") {
    score -= 1;
    scoreAdjustments.push({ key: "partial_enrichment_light_friction", delta: -1 });
  }

  // Hitter normalization: lets elite hitter legs compete with pitcher legs without flooding low-threshold props.
  if (propKey === "hits") {
    score += 1.5;
    scoreAdjustments.push({ key: "hitter_hits_normalization", delta: 1.5 });
  } else if (propKey === "total_bases") {
    score += 1.25;
    scoreAdjustments.push({ key: "hitter_total_bases_normalization", delta: 1.25 });
  } else if (propKey === "hits_runs_rbis") {
    score += 1;
    scoreAdjustments.push({ key: "hitter_hrr_normalization", delta: 1 });
  } else if (propKey === "runs" || propKey === "rbis" || propKey === "home_runs") {
    score += 0.5;
    scoreAdjustments.push({ key: "hitter_discrete_prop_normalization", prop_key: propKey, delta: 0.5 });
  }

  // Avoid over-correcting into a board full of 0.5 More hitter thresholds.
  if ((propKey === "hits" || propKey === "runs" || propKey === "rbis") && side === "more" && Number.isFinite(lineValue) && lineValue <= 0.5) {
    score -= 1;
    scoreAdjustments.push({ key: "hitter_low_threshold_more_control", prop_key: propKey, line_value: lineValue, delta: -1 });
  }

  // Pitcher tracking and low-line dampening. These are targeted, not blanket source gates.
  if (propKey === "hits_allowed") {
    score -= 3;
    confidenceCap = Math.min(confidenceCap, 88);
    scoreAdjustments.push({ key: "hits_allowed_tracking_volatility_dampener", delta: -3 });
    if (Number.isFinite(lineValue) && lineValue <= 2.5) {
      score -= 1.5;
      scoreAdjustments.push({ key: "hits_allowed_low_line_extra_dampener", line_value: lineValue, delta: -1.5 });
    }
  }
  if (propKey === "earned_runs" || propKey === "earned_runs_allowed") {
    score -= 4;
    confidenceCap = Math.min(confidenceCap, 86);
    scoreAdjustments.push({ key: "earned_runs_tracking_volatility_dampener", delta: -4 });
    if (Number.isFinite(lineValue) && lineValue <= 2.5) {
      score -= 1;
      scoreAdjustments.push({ key: "earned_runs_low_line_extra_dampener", line_value: lineValue, delta: -1 });
    }
  }
  if (propKey === "walks_allowed") {
    score -= 2;
    confidenceCap = Math.min(confidenceCap, 86);
    scoreAdjustments.push({ key: "walks_allowed_volatility_dampener", delta: -2 });
  }
  if (propKey === "pitcher_strikeouts") {
    confidenceCap = Math.min(confidenceCap, Number.isFinite(lineValue) && lineValue <= 3.5 ? 90 : 94);
    if (side === "more" && Number.isFinite(lineValue) && lineValue <= 3.5) {
      score -= 2.5;
      scoreAdjustments.push({ key: "low_strikeout_more_line_control", line_value: lineValue, delta: -2.5 });
    }
  }
  if (propKey === "pitcher_outs") {
    if (side === "less" && Number.isFinite(lineValue) && lineValue >= 18.5) {
      confidenceCap = Math.min(confidenceCap, 92);
    } else if (side === "more") {
      confidenceCap = Math.min(confidenceCap, 88);
      if (Number.isFinite(lineValue) && lineValue <= 15.5) {
        score -= 2;
        scoreAdjustments.push({ key: "low_pitcher_outs_more_line_control", line_value: lineValue, delta: -2 });
      } else if (Number.isFinite(lineValue) && lineValue <= 17.5) {
        score -= 1;
        scoreAdjustments.push({ key: "medium_low_pitcher_outs_more_line_control", line_value: lineValue, delta: -1 });
      }
    }
  }

  if (isHitterProp(propKey)) confidenceCap = Math.min(confidenceCap, 90);

  const cappedConfidence = Math.min(confidence, confidenceCap);
  if (cappedConfidence !== confidence) confidenceAdjustments.push({ key: "confidence_cap", cap: confidenceCap });

  const roundedScore = Math.round(clamp(score, 0, 100));
  const roundedConfidence = Math.round(clamp(cappedConfidence, 0, 100));
  const rawSort = num(rawRow.score_sort_0_100, rawScore);
  const fractionalTie = rawSort - Math.floor(rawSort);

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
    confidence_adjustments: confidenceAdjustments
  };
}

function applyCalibration(rawRow, preferredTier = null) {
  const calibrated = calibrateScoreAndConfidence(rawRow);
  if (calibrated.calibration_failed) {
    const fallbackTier = preferredTier || "REVIEW";
    return { ...rawRow, board_tier: fallbackTier, review_playable: fallbackTier === "REVIEW" ? 1 : 0, live_playable: fallbackTier === "PRIMARY" ? 1 : 0, calibration_failed: true };
  }

  const boardTier = preferredTier || ((calibrated.score_0_100 >= 84 && calibrated.confidence_0_100 >= 80) ? "PRIMARY" : "REVIEW");

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
      tier_rule: "PRIMARY when calibrated_score_0_100 >= 84 and calibrated_confidence_0_100 >= 80; otherwise REVIEW.",
      raw_score_0_100: calibrated.raw_score_0_100,
      raw_confidence_0_100: calibrated.raw_confidence_0_100,
      calibrated_score_0_100: calibrated.score_0_100,
      calibrated_confidence_0_100: calibrated.confidence_0_100,
      confidence_cap: calibrated.confidence_cap,
      score_adjustments: calibrated.score_adjustments,
      confidence_adjustments: calibrated.confidence_adjustments,
      note: "v0.1.4 keeps v0.1.3 final-plus cross-source calibration, then applies a narrow cutoff volatility trim only to fragile pitcher rows near the PRIMARY boundary. PrizePicks/hitter rows remain organically PRIMARY-eligible; no source quota or forced balance is used."
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
  const boardTier = (roundedScore >= 84 && roundedConfidence >= 80) ? "PRIMARY" : "REVIEW";

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
  payload.primary_cluster_cap = {
    enabled: true,
    max_primary_rows_per_player: 2,
    action: adjustment && adjustment.key === "primary_cluster_cap_demoted_to_review" ? "demoted_to_review" : "kept_primary"
  };
  row.calibration_json = safeJson(payload);
  return row;
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
      calculation_json, matrix_payload_json_snapshot, details_json_snapshot, created_at, updated_at
    ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `,
    id, batchId, sourceEngineBatchId, PRIMARY_PROFILE, rank,
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
    row.calculation_json || null, row.matrix_payload_json_snapshot || null, row.details_json_snapshot || null
  );
}


function boardRowBindValues(batchId, sourceEngineBatchId, rank, row, id) {
  return [
    id, batchId, sourceEngineBatchId, PRIMARY_PROFILE, rank,
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
    row.calculation_json || null, row.matrix_payload_json_snapshot || null, row.details_json_snapshot || null
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
      calculation_json, matrix_payload_json_snapshot, details_json_snapshot, created_at, updated_at
    ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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
        profile_key <> 'STRICT_B'
        OR archive_eligible <> 1
        OR selected_side IS NULL
        OR line_value IS NULL
        OR player_name IS NULL
        OR canonical_prop_key IS NULL
        OR source_key IS NULL
        OR mlb_player_id IS NULL
        OR market_prop_context_status <> 'market_prop_context_present'
        OR score_0_100 < 74
        OR confidence_0_100 < 55
        OR board_tier NOT IN ('PRIMARY','REVIEW')
        OR review_playable NOT IN (0,1)
        OR (board_tier = 'PRIMARY' AND live_playable <> 1)
        OR (board_tier = 'PRIMARY' AND review_playable <> 0)
        OR (board_tier = 'REVIEW' AND review_playable <> 1)
        OR (board_tier = 'REVIEW' AND live_playable <> 0)
      )
  `, staleBatchId);
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
  const engine = await latestCompletedEngineBatch(env, input.source_engine_batch_id || input.scoring_engine_batch_id || null);

  if (!engine || engine.status !== "completed_scoring_current_rows_written" || engine.certification !== "SCORING_ENGINE_CURRENT_CERTIFIED_SCORED_ROWS") {
    await run(env.SCORE_DB, `
      INSERT INTO score_final_board_batches (final_board_batch_id, worker_version, job_key, source_simulation_batch_id, source_engine_batch_id, source_scoring_worker_version, profile_key, status, certification, certification_grade, started_at)
      VALUES (?, ?, ?, NULL, ?, ?, ?, 'running', 'SCORE_FINAL_BOARD_STARTED', 'RUNNING', CURRENT_TIMESTAMP)
    `, batchId, VERSION, JOB_KEY, engine && engine.batch_id || null, engine && engine.worker_version || null, PRIMARY_PROFILE);
    const output = { ok:false, data_ok:false, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, request_id:requestId, run_id:runId, status:"blocked_no_completed_engine_scoring_batch", certification:"SCORE_FINAL_BOARD_BLOCKED_NO_COMPLETED_ENGINE_SCORING", certification_grade:"BLOCKED", final_board_batch_id:batchId, requested_engine_batch_id:input.source_engine_batch_id || input.scoring_engine_batch_id || null };
    await writeIssue(env, batchId, engine && engine.batch_id || null, "NO_COMPLETED_ENGINE_SCORING_BATCH", "BLOCKER", 1, output);
    await run(env.SCORE_DB, `UPDATE score_final_board_batches SET status=?, certification=?, certification_grade=?, finished_at=CURRENT_TIMESTAMP, output_json=? WHERE final_board_batch_id=?`, output.status, output.certification, output.certification_grade, safeJson(output), batchId);
    return output;
  }

  const reconciled = await reconcileStaleRunningFinalBoard(env, input, engine, started);
  if (reconciled) return reconciled;

  await run(env.SCORE_DB, `
    INSERT INTO score_final_board_batches (final_board_batch_id, worker_version, job_key, source_simulation_batch_id, source_engine_batch_id, source_scoring_worker_version, profile_key, status, certification, certification_grade, started_at)
    VALUES (?, ?, ?, NULL, ?, ?, ?, 'running', 'SCORE_FINAL_BOARD_STARTED', 'RUNNING', CURRENT_TIMESTAMP)
  `, batchId, VERSION, JOB_KEY, engine.batch_id, engine.worker_version || null, PRIMARY_PROFILE);

  const simBatchId = engine.batch_id;
  const bad = await first(env.SCORE_DB, `
    SELECT COUNT(*) AS bad_rows
    FROM scoring_engine_current
    WHERE batch_id = ?
      AND profile_key = ?
      AND live_playable = 1
      AND (
        archive_eligible <> 1
        OR selected_side IS NULL
        OR line_value IS NULL
        OR player_name IS NULL
        OR canonical_prop_key IS NULL
        OR source_key IS NULL
        OR mlb_player_id IS NULL
        OR factor_status <> 'packet_ready'
        OR market_prop_context_status <> 'market_prop_context_present'
        OR daily_readiness_status NOT IN ('ready','ready_with_warnings')
        OR score_status IN ('blocked_by_matrix','model_deferred','simulation_hard_blocked')
      )
  `, simBatchId, PRIMARY_PROFILE);
  const badRows = Number(bad && bad.bad_rows || 0);
  if (badRows > 0) {
    const output = { ok:false, data_ok:false, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, request_id:requestId, run_id:runId, status:"blocked_live_invariant_failure", certification:"SCORE_FINAL_BOARD_BLOCKED_LIVE_INVARIANTS", certification_grade:"BLOCKED", final_board_batch_id:batchId, source_engine_batch_id:simBatchId, bad_live_rows:badRows };
    await writeIssue(env, batchId, simBatchId, "LIVE_INVARIANT_FAILURE", "BLOCKER", badRows, output);
    await run(env.SCORE_DB, `UPDATE score_final_board_batches SET status=?, certification=?, certification_grade=?, finished_at=CURRENT_TIMESTAMP, output_json=? WHERE final_board_batch_id=?`, output.status, output.certification, output.certification_grade, safeJson(output), batchId);
    return output;
  }

  const primaryRaw = await all(env.SCORE_DB, `
    SELECT *
    FROM scoring_engine_current
    WHERE batch_id = ?
      AND profile_key = ?
      AND live_playable = 1
      AND archive_eligible = 1
      AND factor_status = 'packet_ready'
      AND market_prop_context_status = 'market_prop_context_present'
      AND daily_readiness_status IN ('ready','ready_with_warnings')
      AND selected_side IS NOT NULL
      AND line_value IS NOT NULL
      AND player_name IS NOT NULL
      AND canonical_prop_key IS NOT NULL
      AND source_key IS NOT NULL
      AND mlb_player_id IS NOT NULL
      AND score_0_100 >= 76
      AND confidence_0_100 >= 55
      AND score_status NOT IN ('blocked_by_matrix','model_deferred','simulation_hard_blocked')
  `, simBatchId, PRIMARY_PROFILE);

  const primaryMatrixIds = new Set(primaryRaw.map(r => String(r.matrix_id || "")).filter(Boolean));
  const reviewRaw = await all(env.SCORE_DB, `
    SELECT *
    FROM scoring_engine_current
    WHERE batch_id = ?
      AND profile_key = ?
      AND archive_eligible = 1
      AND live_playable = 0
      AND market_prop_context_status = 'market_prop_context_present'
      AND selected_side IS NOT NULL
      AND line_value IS NOT NULL
      AND player_name IS NOT NULL
      AND canonical_prop_key IS NOT NULL
      AND source_key IS NOT NULL
      AND mlb_player_id IS NOT NULL
      AND score_0_100 >= 76
      AND score_status NOT IN ('blocked_by_matrix','model_deferred','simulation_hard_blocked')
  `, simBatchId, PRIMARY_PROFILE);

  // v0.1.4-cutoff-volatility-trim: build one calibrated merit pool. Strict live rows and safe review candidates
  // both receive the same calibrated score. Then apply only narrow volatility trims to fragile pitcher rows at the cutoff.
  const strictLiveCandidates = primaryRaw.map(r => ({ ...r, source_candidate_tier: "STRICT_LIVE" }));
  const safeReviewCandidates = reviewRaw
    .filter(r => !primaryMatrixIds.has(String(r.matrix_id || "")))
    .map(r => ({ ...r, source_candidate_tier: "SAFE_REVIEW" }));

  const initiallyCalibratedCandidates = [...strictLiveCandidates, ...safeReviewCandidates]
    .map(r => applyCalibration(r, null))
    .filter(r => !r.calibration_failed && Number(r.score_0_100) >= 76 && Number(r.confidence_0_100) >= 55);

  // Cluster counts are computed across the calibrated candidate ecosystem before the final trim.
  // The count is metadata first; v0.1.4 only uses it as a one-point tie-breaker on fragile pitcher rows already near the cutoff.
  const calibratedCandidates = annotateCorrelation(initiallyCalibratedCandidates)
    .map(r => applyCutoffVolatilityTrim(r))
    .filter(r => !r.calibration_failed && Number(r.score_0_100) >= 74 && Number(r.confidence_0_100) >= 55);

  let primaryRows = calibratedCandidates.filter(r => r.board_tier === "PRIMARY");
  let reviewRows = calibratedCandidates.filter(r => r.board_tier === "REVIEW");

  const clusterCapResult = applyPrimaryClusterCap(primaryRows, reviewRows, 2);
  primaryRows = clusterCapResult.primaryRows;
  reviewRows = clusterCapResult.reviewRows;

  const rows = annotateCorrelation([...primaryRows, ...reviewRows]);

  if (!rows.length || !primaryRows.length) {
    const output = { ok:false, data_ok:false, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, request_id:requestId, run_id:runId, status:"blocked_no_final_rows_after_cutoff_volatility_trim", certification:"SCORE_FINAL_BOARD_BLOCKED_NO_FINAL_ROWS_AFTER_CUTOFF_VOLATILITY_TRIM", certification_grade:"BLOCKED", final_board_batch_id:batchId, source_engine_batch_id:simBatchId, primary_rows_after_calibration:primaryRows.length, review_rows_after_calibration:reviewRows.length };
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
        profile_key <> 'STRICT_B'
        OR archive_eligible <> 1
        OR selected_side IS NULL
        OR line_value IS NULL
        OR player_name IS NULL
        OR canonical_prop_key IS NULL
        OR source_key IS NULL
        OR mlb_player_id IS NULL
        OR market_prop_context_status <> 'market_prop_context_present'
        OR score_0_100 < 74
        OR confidence_0_100 < 55
        OR board_tier NOT IN ('PRIMARY','REVIEW')
        OR review_playable NOT IN (0,1)
        OR (board_tier = 'PRIMARY' AND live_playable <> 1)
        OR (board_tier = 'PRIMARY' AND review_playable <> 0)
        OR (board_tier = 'REVIEW' AND review_playable <> 1)
        OR (board_tier = 'REVIEW' AND live_playable <> 0)
      )
  `, batchId);
  const finalBadRows = Number(finalBad && finalBad.bad_rows || 0);
  if (finalBadRows > 0) {
    const output = { ok:false, data_ok:false, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, request_id:requestId, run_id:runId, status:"blocked_written_board_invariant_failure", certification:"SCORE_FINAL_BOARD_BLOCKED_WRITTEN_BOARD_INVARIANTS", certification_grade:"BLOCKED", final_board_batch_id:batchId, source_engine_batch_id:simBatchId, bad_written_rows:finalBadRows };
    await writeIssue(env, batchId, simBatchId, "WRITTEN_BOARD_INVARIANT_FAILURE", "BLOCKER", finalBadRows, output);
    await run(env.SCORE_DB, `UPDATE score_final_board_batches SET status=?, certification=?, certification_grade=?, finished_at=CURRENT_TIMESTAMP, output_json=? WHERE final_board_batch_id=?`, output.status, output.certification, output.certification_grade, safeJson(output), batchId);
    return output;
  }

  const primaryClusterCheck = await first(env.SCORE_DB, `
    SELECT MAX(player_rows) AS max_primary_rows_per_player
    FROM (
      SELECT mlb_player_id, COUNT(*) AS player_rows
      FROM score_final_board_current
      WHERE final_board_batch_id = ?
        AND board_tier = 'PRIMARY'
      GROUP BY mlb_player_id
    )
  `, batchId);
  const maxPrimaryRowsPerPlayer = Number(primaryClusterCheck && primaryClusterCheck.max_primary_rows_per_player || 0);
  if (maxPrimaryRowsPerPlayer > 2) {
    const output = { ok:false, data_ok:false, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, request_id:requestId, run_id:runId, status:"blocked_primary_cluster_cap_failure", certification:"SCORE_FINAL_BOARD_BLOCKED_PRIMARY_CLUSTER_CAP_FAILURE", certification_grade:"BLOCKED", final_board_batch_id:batchId, source_engine_batch_id:simBatchId, max_primary_rows_per_player:maxPrimaryRowsPerPlayer };
    await writeIssue(env, batchId, simBatchId, "PRIMARY_CLUSTER_CAP_FAILURE", "BLOCKER", maxPrimaryRowsPerPlayer, output);
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
    status: "completed_final_board_current_replaced_from_engine_current",
    certification: "SCORE_FINAL_BOARD_CERTIFIED_CURRENT_REPLACED_FROM_ENGINE_CURRENT",
    certification_grade: "PASS_WITH_REVIEW_WARNINGS",
    final_board_batch_id: batchId,
    source_engine_batch_id: simBatchId,
    source_scoring_worker_version: engine.worker_version,
    profile_key: PRIMARY_PROFILE,
    matrix_rows_read: Number(engine.matrix_rows_read || 0),
    primary_raw_rows_read: primaryRaw.length,
    review_raw_rows_read: reviewRaw.length,
    strict_live_candidates_read: strictLiveCandidates.length,
    safe_review_candidates_read: safeReviewCandidates.length,
    initially_calibrated_candidates_read: initiallyCalibratedCandidates.length,
    calibrated_candidates_written: calibratedCandidates.length,
    primary_rows_before_cluster_cap: clusterCapResult.primaryRowsBeforeClusterCap,
    primary_cluster_cap_max_per_player: clusterCapResult.maxPrimaryRowsPerPlayer,
    primary_cluster_cap_demoted_rows: clusterCapResult.demotedRows.length,
    review_rows_before_cluster_cap: clusterCapResult.reviewRowsBeforeClusterCap,
    primary_rows_written: primaryRows.length,
    review_rows_written: reviewRows.length,
    review_rows_after_cluster_cap: clusterCapResult.reviewRowsAfterClusterCap,
    live_rows_read: primaryRaw.length,
    final_rows_written: rows.length,
    current_rows_written: rows.length,
    table_for_final_ui: "SCORE_DB.score_final_board_current",
    history_table: "SCORE_DB.score_final_board_history",
    final_ui_contract: "Read board_tier. PRIMARY rows are strict live rows; REVIEW rows are safe calibrated soft rows with review_playable=1.",
    no_external_calls: true,
    no_source_board_mutation: true,
    no_simulation_shadow_mutation: true,
    calibration_active: true,
    final_plus_calibration_active: true,
    cutoff_volatility_trim_active: true,
    cutoff_volatility_trim_policy: "narrow fragile-pitcher cutoff trim only; no source quota, no forced balance, no broad cluster penalty",
    primary_threshold_score: 84,
    primary_threshold_confidence: 80,
    primary_cluster_cap_active: true,
    max_primary_rows_per_player: maxPrimaryRowsPerPlayer,
    by_tier_source: byTierSource,
    by_source_prop_side: bySourcePropSide,
    elapsed_ms: Date.now() - started,
    timestamp_utc: nowUtc()
  };

  await writeIssue(env, batchId, simBatchId, "LIVE_INVARIANT_FAILURE", "INFO", 0, { note: "No live row invariant failures detected before final board write." });
  await writeIssue(env, batchId, simBatchId, "REVIEW_TIER_INCLUDED", "WARNING", reviewRows.length, { note: "Review tier rows are intentionally included as safe soft rows. They are not strict PRIMARY rows.", review_rows_written: reviewRows.length });
  await writeIssue(env, batchId, simBatchId, "PRIMARY_CLUSTER_CAP_APPLIED", clusterCapResult.demotedRows.length ? "WARNING" : "INFO", clusterCapResult.demotedRows.length, { note: "PRIMARY is capped at two rows per player; overflow rows are demoted to REVIEW, not deleted.", max_primary_rows_per_player: clusterCapResult.maxPrimaryRowsPerPlayer, primary_rows_before_cluster_cap: clusterCapResult.primaryRowsBeforeClusterCap, primary_rows_after_cluster_cap: clusterCapResult.primaryRowsAfterClusterCap, demoted_rows: clusterCapResult.demotedRows.length });
  await run(env.SCORE_DB, `
    UPDATE score_final_board_batches
    SET status=?, certification=?, certification_grade=?, matrix_rows_read=?, live_rows_read=?, final_rows_written=?, current_rows_written=?, finished_at=CURRENT_TIMESTAMP, output_json=?
    WHERE final_board_batch_id=?
  `, output.status, output.certification, output.certification_grade, output.matrix_rows_read, output.live_rows_read, output.final_rows_written, output.current_rows_written, safeJson(output), batchId);

  return output;
}

function baseIdentity() {
  return { ok:true, data_ok:true, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, status:"READY", timestamp_utc:nowUtc(), purpose:"Generate SCORE_DB.score_final_board_current from latest completed real Scoring Engine current batch. Simulation is not a production source for this path." };
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
