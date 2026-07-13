const WORKER_NAME = "alphadog-v2-phase2b-recent-form";
const LOGICAL_WORKER_NAME = "alphadog-v2-prop-factor-miner";
const JOB_KEY = "prop-factor-miner";
const SYSTEM_VERSION = "alphadog-v2-prop-factor-miner-v0.1.19-expansion-baseline-consumption";
const DEPLOYED_SLOT_VERSION = "alphadog-v2-phase2b-recent-form-v0.2.19-expansion-baseline-consumption";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_HITTER_DB", "STATS_PITCHER_DB", "TEAM_DB", "DAILY_DB", "MARKET_DB", "SCORE_DB", "SCORING_DB"];

const HITTER_PACKET_FLUSH_SIZE = 100;
const PITCHER_PACKET_FLUSH_SIZE = 250;
const HITTER_MAX_FACTOR_ROWS_PER_INVOCATION = 180;
const PITCHER_MAX_FACTOR_ROWS_PER_INVOCATION = 900;
const HITTER_SOFT_TIMEBOX_MS = 12000;
const PITCHER_SOFT_TIMEBOX_MS = 12000;

const HITTER_PROPS = new Set([
  "hits", "total_bases", "runs", "rbis", "singles", "doubles", "home_runs", "walks",
  "hitter_strikeouts", "hits_runs_rbis", "stolen_bases", "fantasy", "fantasy_score",
  "plate_appearances", "triples"
]);
const PITCHER_PROPS = new Set([
  "pitcher_strikeouts", "pitcher_outs", "pitching_outs", "earned_runs", "earned_runs_allowed",
  "hits_allowed", "walks_allowed", "pitches_thrown", "rfi_nrfi", "pitcher_fantasy_score", "runs_allowed"
]);
const DEFERRED_PROPS = new Set(["pitcher_strikeouts_combo"]);

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
function nowIso() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function safeJsonParse(s, fallback = null) { try { return s ? JSON.parse(s) : fallback; } catch (_) { return fallback; } }
function dateOnly(d) { return d.toISOString().slice(0, 10); }
function ptTodayTomorrow() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const m = {}; for (const p of parts) m[p.type] = p.value;
  const today = `${m.year}-${m.month}-${m.day}`;
  const t = new Date(`${today}T12:00:00-07:00`);
  t.setDate(t.getDate() + 1);
  return [today, dateOnly(t)];
}
function modeFamily(mode) {
  const m = String(mode || "").toLowerCase();
  if (m === "pitcher_prop_factor_mining" || m === "pitcher" || m === "pitchers") return "pitcher";
  return "hitter";
}
// Real fix, found via live-data audit while adjusting this worker for the expanded board/prop
// lines: this used to be two independently hardcoded HITTER_PROPS/PITCHER_PROPS Sets, duplicated
// (and already silently drifted) between this worker and Matrix Builder. Confirmed against the
// real, authoritative CONFIG_DB.config_prop_taxonomy table (21 real canonical prop keys) that
// Matrix Builder was missing "runs_allowed" - a real, currently-supported prop - entirely, which
// would have blocked every runs_allowed leg there even though this worker handled it fine. Both
// workers now read the same real taxonomy table as the single source of truth instead of two
// hand-maintained lists that can silently diverge again.
let TAXONOMY_CACHE = null;
async function loadTaxonomyClassifier(env) {
  if (TAXONOMY_CACHE) return TAXONOMY_CACHE;
  const rows = await all(env.CONFIG_DB, "SELECT prop_key, player_side FROM config_prop_taxonomy");
  const map = new Map();
  for (const r of rows) {
    const side = String(r.player_side || "").toLowerCase();
    let family;
    if (side === "hitter") family = "hitter";
    else if (side === "pitcher" || side === "game_pitcher") family = "pitcher";
    else if (side === "pitcher_combo") family = "deferred";
    else family = "ambiguous_disambiguate_by_source_name";
    map.set(String(r.prop_key || "").toLowerCase(), family);
  }
  TAXONOMY_CACHE = map;
  return map;
}
function classifyProp(propKey, sourcePropName) {
  const keyLc = String(propKey || "").toLowerCase();
  const sourceName = String(sourcePropName || "").toLowerCase();
  const taxonomyMap = TAXONOMY_CACHE;
  if (!taxonomyMap || !taxonomyMap.has(keyLc)) return { family: "unknown", normalized_lane: keyLc || null, supported: false, reason: "UNSUPPORTED_PROP_KEY_NOT_IN_TAXONOMY" };
  const family = taxonomyMap.get(keyLc);
  if (family === "deferred") return { family: "deferred", normalized_lane: keyLc, supported: false, reason: "PROP_DEFERRED_PENDING_SEPARATE_DESIGN" };
  if (family === "ambiguous_disambiguate_by_source_name") {
    // Real, pre-existing heuristic kept: fantasy_score's taxonomy player_side is "combo" (it
    // legitimately applies to both hitter and pitcher fantasy scoring), disambiguated by whether
    // the vendor's own source prop name mentions the pitcher side.
    const isPitcherFantasy = sourceName.includes("pitch");
    return { family: isPitcherFantasy ? "pitcher" : "hitter", normalized_lane: isPitcherFantasy ? "pitcher_fantasy" : "hitter_fantasy", supported: true };
  }
  const lane = keyLc === "pitching_outs" ? "pitcher_outs" : (keyLc === "earned_runs_allowed" ? "earned_runs" : keyLc);
  return { family, normalized_lane: lane, supported: true };
}
function reqDb(env) {
  const out = {};
  for (const k of REQUIRED_DB_BINDINGS) out[k] = !!env[k];
  return out;
}
function allTrue(obj) { return Object.values(obj).every(Boolean); }

async function all(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  const res = binds.length ? await stmt.bind(...binds).all() : await stmt.all();
  return res && res.results ? res.results : [];
}
async function first(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  return binds.length ? await stmt.bind(...binds).first() : await stmt.first();
}
async function run(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  return binds.length ? await stmt.bind(...binds).run() : await stmt.run();
}
async function batch(db, statements, size = 50) {
  for (let i = 0; i < statements.length; i += size) {
    await db.batch(statements.slice(i, i + size));
  }
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
function isPropFactorPartialOutput(output = {}) {
  const status = String(output.status || "").toLowerCase();
  const cert = String(output.certification || output.certification_status || "").toLowerCase();
  const grade = String(output.certification_grade || "").toLowerCase();
  return !!(output && output.ok === true && (
    output.continuation_required === true ||
    output.orchestrator_should_self_continue === true ||
    output.factor_resume === true ||
    status === "partial_continue" ||
    status.startsWith("partial_continue_") ||
    cert.includes("partial_continue") ||
    grade === "partial_continue"
  ));
}
async function controlLifecyclePartialContinue(env, input = {}, output = {}) {
  const requestId = output.request_id || input.request_id || null;
  if (!env || !env.CONTROL_DB || !requestId) return { ok:false, skipped:"missing_control_db_or_request_id" };
  const runId = output.run_id || input.run_id || null;
  const jobKey = output.job_key || controlJobKey(input);
  const resumeBatchId = output.resume_batch_id || output.factor_batch_id || output.batch_id || input.resume_batch_id || input.factor_batch_id || null;
  const nextInput = {
    ...input,
    factor_batch_id: resumeBatchId,
    resume_batch_id: resumeBatchId,
    factor_resume: true,
    continuation_from_request_id: requestId
  };
  const cert = output.certification || output.certification_status || `${String(jobKey).toUpperCase().replace(/[^A-Z0-9]+/g,"_")}_PARTIAL_CONTINUE`;
  const rowsRead = Number(output.rows_read ?? output.prepared_rows_read ?? 0) || 0;
  const rowsWritten = Number(output.rows_written ?? output.packets_written ?? 0) || 0;
  const externalCalls = Number(output.external_calls_performed ?? output.external_calls ?? 0) || 0;
  const elapsed = Number(output.elapsed_ms || 0) || null;
  const partialJson = controlSafeJson({ ...output, request_id:requestId, run_id:runId, control_lifecycle_partial_continue:true, control_lifecycle_partial_at:(typeof nowUtc === "function" ? nowUtc() : (typeof nowIso === "function" ? nowIso() : new Date().toISOString())) }, 9000);
  try {
    await run(env.CONTROL_DB, `UPDATE control_job_queue
      SET status='pending', finished_at=NULL, run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL
      WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')`, JSON.stringify(nextInput), partialJson, requestId);
    const runSql = `UPDATE control_job_runs
      SET status='partial_continue', data_ok=1, certification_status=?, rows_read=?, rows_written=?, external_calls=?, finished_at=COALESCE(finished_at,CURRENT_TIMESTAMP), elapsed_ms=COALESCE(elapsed_ms, ?), output_json=?, error_code=NULL, error_message=NULL
      WHERE ${runId ? 'run_id=?' : 'request_id=?'} AND finished_at IS NULL`;
    await run(env.CONTROL_DB, runSql, cert, rowsRead, rowsWritten, externalCalls, elapsed, partialJson, runId || requestId);
    return { ok:true, queue_status:"pending", run_status:"partial_continue", certification:cert, resume_batch_id:resumeBatchId };
  } catch (err) {
    return { ok:false, error:controlSafeText(err && err.message ? err.message : err, 900) };
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
  const ddl = [
    `CREATE TABLE IF NOT EXISTS prop_factor_batches (
      batch_id TEXT PRIMARY KEY,
      request_id TEXT,
      run_id TEXT,
      worker_name TEXT,
      worker_version TEXT,
      deployed_worker_slot TEXT,
      deployed_slot_version TEXT,
      mode TEXT,
      factor_family TEXT,
      status TEXT,
      window_start TEXT,
      window_end TEXT,
      prepared_rows_read INTEGER DEFAULT 0,
      eligible_rows INTEGER DEFAULT 0,
      packets_written INTEGER DEFAULT 0,
      blocked_rows INTEGER DEFAULT 0,
      warning_rows INTEGER DEFAULT 0,
      issue_rows INTEGER DEFAULT 0,
      missing_factor_rows INTEGER DEFAULT 0,
      source_tables_checked_json TEXT,
      certification_status TEXT,
      certification_grade TEXT,
      output_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS prop_factor_hitter_packets (
      packet_id TEXT PRIMARY KEY,
      batch_id TEXT,
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
      is_home INTEGER,
      canonical_prop_key TEXT,
      normalized_factor_lane TEXT,
      board_line_value REAL,
      factor_status TEXT,
      factor_grade TEXT,
      readiness_status TEXT,
      market_context_status TEXT,
      daily_context_status TEXT,
      base_metric_status TEXT,
      missing_factor_count INTEGER DEFAULT 0,
      warning_count INTEGER DEFAULT 0,
      blocker_count INTEGER DEFAULT 0,
      factor_payload_json TEXT,
      details_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS prop_factor_pitcher_packets (
      packet_id TEXT PRIMARY KEY,
      batch_id TEXT,
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
      is_home INTEGER,
      canonical_prop_key TEXT,
      normalized_factor_lane TEXT,
      board_line_value REAL,
      factor_status TEXT,
      factor_grade TEXT,
      readiness_status TEXT,
      market_context_status TEXT,
      daily_context_status TEXT,
      base_metric_status TEXT,
      missing_factor_count INTEGER DEFAULT 0,
      warning_count INTEGER DEFAULT 0,
      blocker_count INTEGER DEFAULT 0,
      factor_payload_json TEXT,
      details_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS prop_factor_issues (
      issue_id TEXT PRIMARY KEY,
      batch_id TEXT,
      factor_family TEXT,
      packet_id TEXT,
      prepared_row_id TEXT,
      game_pk INTEGER,
      mlb_player_id INTEGER,
      canonical_prop_key TEXT,
      severity TEXT,
      issue_type TEXT,
      reason TEXT,
      details_json TEXT,
      official_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS prop_factor_coverage_current (
      coverage_key TEXT PRIMARY KEY,
      factor_family TEXT,
      prepared_row_id TEXT,
      game_pk INTEGER,
      mlb_player_id INTEGER,
      canonical_prop_key TEXT,
      normalized_factor_lane TEXT,
      factor_status TEXT,
      factor_grade TEXT,
      packet_id TEXT,
      latest_batch_id TEXT,
      latest_checked_at TEXT,
      blocking_for_matrix INTEGER DEFAULT 0,
      missing_reason TEXT,
      details_json TEXT,
      official_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_prop_factor_batches_mode_date ON prop_factor_batches(mode, window_start, window_end, updated_at)`,
    `CREATE INDEX IF NOT EXISTS idx_prop_factor_hitter_prepared ON prop_factor_hitter_packets(prepared_row_id, official_date)`,
    `CREATE INDEX IF NOT EXISTS idx_prop_factor_hitter_game_player ON prop_factor_hitter_packets(game_pk, mlb_player_id, canonical_prop_key)`,
    `CREATE INDEX IF NOT EXISTS idx_prop_factor_pitcher_prepared ON prop_factor_pitcher_packets(prepared_row_id, official_date)`,
    `CREATE INDEX IF NOT EXISTS idx_prop_factor_pitcher_game_player ON prop_factor_pitcher_packets(game_pk, mlb_player_id, canonical_prop_key)`,
    `CREATE INDEX IF NOT EXISTS idx_prop_factor_hitter_batch ON prop_factor_hitter_packets(batch_id)`,
    `CREATE INDEX IF NOT EXISTS idx_prop_factor_pitcher_batch ON prop_factor_pitcher_packets(batch_id)`,
    `CREATE INDEX IF NOT EXISTS idx_prop_factor_issues_batch ON prop_factor_issues(batch_id, severity, issue_type)`,
    `CREATE INDEX IF NOT EXISTS idx_prop_factor_coverage_date ON prop_factor_coverage_current(official_date, factor_family, factor_status)`,
    `CREATE INDEX IF NOT EXISTS idx_prop_factor_coverage_batch_family ON prop_factor_coverage_current(latest_batch_id, factor_family)`,
    `CREATE INDEX IF NOT EXISTS idx_prop_factor_coverage_batch_prepared ON prop_factor_coverage_current(latest_batch_id, prepared_row_id)`
  ];
  await batch(env.SCORING_DB, ddl.map(sql => env.SCORING_DB.prepare(sql)), 10);
}

async function retentionCleanup(env, dates, family) {
  const [today, tomorrow] = dates;
  await run(env.SCORING_DB, "DELETE FROM prop_factor_hitter_packets WHERE official_date NOT IN (?, ?)", today, tomorrow);
  await run(env.SCORING_DB, "DELETE FROM prop_factor_pitcher_packets WHERE official_date NOT IN (?, ?)", today, tomorrow);
  await run(env.SCORING_DB, "DELETE FROM prop_factor_issues WHERE official_date IS NOT NULL AND official_date NOT IN (?, ?)", today, tomorrow);
  await run(env.SCORING_DB, "DELETE FROM prop_factor_coverage_current WHERE official_date NOT IN (?, ?)", today, tomorrow);
  await run(env.SCORING_DB, "DELETE FROM prop_factor_batches WHERE window_start NOT IN (?, ?) AND window_end NOT IN (?, ?)", today, tomorrow, today, tomorrow);
  const packetTable = family === "pitcher" ? "prop_factor_pitcher_packets" : "prop_factor_hitter_packets";
  await run(env.SCORING_DB, `DELETE FROM ${packetTable} WHERE official_date IN (?, ?)`, today, tomorrow);
  await run(env.SCORING_DB, "DELETE FROM prop_factor_issues WHERE factor_family=? AND official_date IN (?, ?)", family, today, tomorrow);
  await run(env.SCORING_DB, "DELETE FROM prop_factor_coverage_current WHERE factor_family=? AND official_date IN (?, ?)", family, today, tomorrow);
}

async function markStaleRunningBatches(env, dates, family, reason = "STALE_RUNNING_BATCH_MARKED_FAILED_BEFORE_NEW_RUN") {
  const [today, tomorrow] = dates;
  await run(env.SCORING_DB, `UPDATE prop_factor_batches
    SET status='failed_stale_interrupted',
        certification_status=?,
        certification_grade='FAIL_STALE_INTERRUPTED',
        output_json=json_object('ok',0,'data_ok',0,'version',?,'status','failed_stale_interrupted','reason',?,'factor_family',factor_family,'batch_id',batch_id),
        updated_at=CURRENT_TIMESTAMP
    WHERE factor_family=?
      AND status='running'
      AND window_start IN (?, ?)
      AND window_end IN (?, ?)`,
    reason, SYSTEM_VERSION, reason, family, today, tomorrow, today, tomorrow);
}


async function getPreparedSourceDiagnostics(env, dates) {
  const [today, tomorrow] = dates;
  const currentByDateSource = await all(env.SCORE_DB, `SELECT
      official_date,
      source_key,
      COUNT(*) AS rows,
      SUM(CASE WHEN pickable_safe=1 THEN 1 ELSE 0 END) AS pickable_safe_rows
    FROM score_board_prepared_current
    GROUP BY official_date, source_key
    ORDER BY official_date, source_key`);
  const eligibleByDateSource = await all(env.SCORE_DB, `SELECT
      official_date,
      source_key,
      COUNT(*) AS eligible_rows,
      COUNT(DISTINCT official_game_pk) AS games,
      COUNT(DISTINCT resolved_mlb_player_id) AS players
    FROM score_board_prepared_current
    WHERE official_date IN (?, ?)
      AND pickable_safe=1
      AND matchup_status='calendar_matched'
      AND player_match_status='matched'
      AND official_game_pk IS NOT NULL
      AND official_game_time_utc IS NOT NULL
    GROUP BY official_date, source_key
    ORDER BY official_date, source_key`, today, tomorrow);
  return {
    current_table_by_date_source: currentByDateSource,
    eligible_window_by_date_source: eligibleByDateSource,
    source_keys_eligible_in_window: [...new Set(eligibleByDateSource.map(r => r.source_key).filter(Boolean))],
    window_dates: dates
  };
}

async function getPreparedRows(env, dates) {
  return all(env.SCORE_DB, `SELECT prepared_row_id, prep_batch_id, source_key, source_row_id, source_event_id, projection_id,
      player_name, resolved_player_id, resolved_mlb_player_id, player_match_status, team, opponent,
      team_full_name, opponent_full_name, canonical_prop_key, source_prop_name, line_value, official_game_pk,
      official_game_time_utc, official_date, matchup_status, pickable_safe, prep_status, block_reason, row_payload_json
    FROM score_board_prepared_current
    WHERE official_date IN (?, ?)
      AND pickable_safe=1
      AND matchup_status='calendar_matched'
      AND player_match_status='matched'
      AND official_game_pk IS NOT NULL
      AND official_game_time_utc IS NOT NULL
    ORDER BY official_date, official_game_pk, resolved_mlb_player_id, canonical_prop_key, source_key`, dates[0], dates[1]);
}

function shouldConsiderPreparedRowForFamily(row, family) {
  const classification = classifyProp(row && row.canonical_prop_key, row && row.source_prop_name);
  return classification.family === family || (family === "pitcher" && classification.family === "deferred");
}
function expectedFactorPreparedRows(prepared, family) {
  let n = 0;
  for (const row of prepared || []) if (shouldConsiderPreparedRowForFamily(row, family)) n++;
  return n;
}
async function findRunningPropFactorBatch(env, requestId, family) {
  if (!requestId) return null;
  return first(env.SCORING_DB, `SELECT batch_id, request_id, run_id, worker_version, mode, factor_family, status, window_start, window_end, prepared_rows_read, eligible_rows, packets_written
    FROM prop_factor_batches
    WHERE request_id=? AND factor_family=? AND status IN ('running','partial_continue','partial_continue_factor_packets_chunk_written')
    ORDER BY datetime(updated_at) DESC
    LIMIT 1`, requestId, family);
}
async function getCoveredPreparedIds(env, batchId, family) {
  const rows = await all(env.SCORING_DB, `SELECT prepared_row_id FROM prop_factor_coverage_current WHERE latest_batch_id=? AND factor_family=?`, batchId, family);
  return new Set(rows.map(r => String(r.prepared_row_id || "")).filter(Boolean));
}
async function summarizeFactorBatch(env, batchId, family) {
  const packetTable = family === "pitcher" ? "prop_factor_pitcher_packets" : "prop_factor_hitter_packets";
  const packetSummary = await first(env.SCORING_DB, `SELECT
      COUNT(*) AS packets,
      COUNT(DISTINCT prepared_row_id) AS packet_prepared_rows,
      COUNT(DISTINCT game_pk) AS games,
      COUNT(DISTINCT mlb_player_id) AS players,
      COUNT(DISTINCT canonical_prop_key) AS prop_keys,
      SUM(CASE WHEN warning_count > 0 THEN 1 ELSE 0 END) AS warning_rows,
      SUM(CASE WHEN blocker_count > 0 OR factor_status='blocked' THEN 1 ELSE 0 END) AS blocked_rows,
      SUM(CASE WHEN missing_factor_count > 0 THEN 1 ELSE 0 END) AS missing_factor_rows
    FROM ${packetTable}
    WHERE batch_id=?`, batchId);
  const coverageSummary = await first(env.SCORING_DB, `SELECT
      COUNT(*) AS coverage_rows,
      COUNT(DISTINCT prepared_row_id) AS coverage_prepared_rows,
      SUM(CASE WHEN blocking_for_matrix=1 THEN 1 ELSE 0 END) AS coverage_blocked_rows
    FROM prop_factor_coverage_current
    WHERE latest_batch_id=? AND factor_family=?`, batchId, family);
  const issueSummary = await first(env.SCORING_DB, `SELECT COUNT(*) AS issue_rows FROM prop_factor_issues WHERE batch_id=?`, batchId);
  return {
    packets:Number(packetSummary && packetSummary.packets || 0),
    packet_prepared_rows:Number(packetSummary && packetSummary.packet_prepared_rows || 0),
    coverage_rows:Number(coverageSummary && coverageSummary.coverage_rows || 0),
    coverage_prepared_rows:Number(coverageSummary && coverageSummary.coverage_prepared_rows || 0),
    games:Number(packetSummary && packetSummary.games || 0),
    players:Number(packetSummary && packetSummary.players || 0),
    prop_keys:Number(packetSummary && packetSummary.prop_keys || 0),
    warning_rows:Number(packetSummary && packetSummary.warning_rows || 0),
    blocked_rows:Number(packetSummary && packetSummary.blocked_rows || coverageSummary && coverageSummary.coverage_blocked_rows || 0),
    missing_factor_rows:Number(packetSummary && packetSummary.missing_factor_rows || 0),
    issue_rows:Number(issueSummary && issueSummary.issue_rows || 0)
  };
}
function buildPropFactorOutput({ input, family, mode, batchId, runId, dates, status, certification, grade, prepared, expectedRows, summary, processedThisInvocation, remainingRows, preparedDiagnostics, ctx, partial, timeboxBreak = false, invocationElapsedMs = null, resumeFastPath = false }) {
  return {
    ok:true,
    data_ok:true,
    version:SYSTEM_VERSION,
    deployed_slot_version:DEPLOYED_SLOT_VERSION,
    worker_name:LOGICAL_WORKER_NAME,
    deployed_worker_slot:WORKER_NAME,
    job_key:JOB_KEY,
    request_id:input.request_id || null,
    chain_id:input.chain_id || null,
    mode,
    factor_family:family,
    status,
    certification,
    certification_grade:grade,
    batch_id:batchId,
    run_id:runId,
    window_dates:dates,
    prepared_rows_read:prepared.length,
    expected_factor_rows:expectedRows,
    eligible_rows:summary.packet_prepared_rows,
    packets_written:summary.packets,
    blocked_rows:summary.blocked_rows,
    warning_rows:summary.warning_rows,
    issue_rows:summary.issue_rows,
    missing_factor_rows:summary.missing_factor_rows,
    coverage_rows_written:summary.coverage_rows,
    coverage_prepared_rows:summary.coverage_prepared_rows,
    coverage_missing_rows:Math.max(0, expectedRows - summary.coverage_prepared_rows),
    rows_processed_this_invocation:processedThisInvocation,
    remaining_factor_rows:remainingRows,
    games_processed:summary.games,
    players:summary.players,
    prop_keys:summary.prop_keys,
    prepared_source_diagnostics:preparedDiagnostics,
    chunked_memory_mode: family === "hitter",
    packet_flush_size: family === "hitter" ? HITTER_PACKET_FLUSH_SIZE : PITCHER_PACKET_FLUSH_SIZE,
    max_factor_rows_per_invocation: family === "hitter" ? HITTER_MAX_FACTOR_ROWS_PER_INVOCATION : PITCHER_MAX_FACTOR_ROWS_PER_INVOCATION,
    soft_timebox_ms: family === "hitter" ? HITTER_SOFT_TIMEBOX_MS : PITCHER_SOFT_TIMEBOX_MS,
    timebox_break: !!timeboxBreak,
    invocation_elapsed_ms: invocationElapsedMs,
    continuation_required: !!partial,
    orchestrator_should_self_continue: !!partial,
    factor_resume: !!partial,
    resume_batch_id: partial ? batchId : null,
    coverage_reconciliation_guard_enabled:true,
    stale_running_batches_marked_before_run: !input.factor_resume,
    resume_fast_path: !!resumeFastPath,
    coverage_current_written_incrementally:true,
    retention_policy:"today_tomorrow_only_packets_issues_coverage_and_batches",
    daily_readiness_dates_available:ctx && ctx.readinessDatesAvailable || [],
    daily_readiness_missing_for_current_window:ctx ? ctx.readinessDatesAvailable.length === 0 : false,
    base_metrics_primary_source: family === "pitcher" ? "pitcher_metric_snapshots" : "hitter_metric_snapshots",
    legacy_metric_tables_optional: true,
    legacy_empty_tables_are_not_blocking: true,
    external_calls:0,
    no_scoring:true,
    no_ranking:true,
    no_final_board:true,
    no_matrix_builder:true
  };
}

function key(...parts) { return parts.map(v => v === null || v === undefined ? "" : String(v)).join("|"); }
function pushMapArray(map, k, row) { if (!map.has(k)) map.set(k, []); map.get(k).push(row); }
function latestRowsBy(rows, keyFn, dateField = "updated_at") {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    const prev = m.get(k);
    if (!prev || String(r[dateField] || r.created_at || "") >= String(prev[dateField] || prev.created_at || "")) m.set(k, r);
  }
  return m;
}

async function loadContext(env, dates) {
  const [today, tomorrow] = dates;
  const ctx = {};
  const gameRows = await all(env.TEAM_DB, "SELECT game_pk, official_date, game_time_utc, home_team_id, away_team_id, home_team_name, away_team_name, venue_id, venue_name, status_code, abstract_game_state, detailed_state, is_pregame, is_live, is_final FROM mlb_game_calendar WHERE official_date IN (?, ?)", today, tomorrow);
  ctx.games = latestRowsBy(gameRows, r => key(r.game_pk));
  const coverageRows = await all(env.TEAM_DB, "SELECT game_pk, official_date, layer_key, layer_family, coverage_status, coverage_grade, blocking_for_full_run, live_rows, missing_reason, details_json, updated_at FROM mlb_game_data_coverage WHERE official_date IN (?, ?)", today, tomorrow);
  ctx.gameCoverage = new Map(); for (const r of coverageRows) pushMapArray(ctx.gameCoverage, key(r.game_pk), r);

  const marketCoverageRows = await all(env.MARKET_DB, "SELECT coverage_row_id, batch_id, official_date, prepared_row_id, source_key, game_pk, resolved_mlb_player_id, canonical_prop_key, board_line_value, game_market_status, player_prop_market_status, market_context_status, coverage_grade, details_json, created_at FROM market_context_probe_coverage WHERE official_date IN (?, ?)", today, tomorrow);
  ctx.marketCoverage = new Map(); for (const r of marketCoverageRows) pushMapArray(ctx.marketCoverage, key(r.prepared_row_id), r);
  const playerPropRows = await all(env.MARKET_DB, "SELECT probe_row_id, batch_id, official_date, prepared_row_id, source_key, source_line_id, game_pk, resolved_mlb_player_id, canonical_prop_key, source_market_key, line_value, price_american, price_decimal, outcome_side, mapping_status, coverage_status, created_at FROM market_context_probe_player_props WHERE official_date IN (?, ?)", today, tomorrow);
  ctx.playerProps = new Map(); for (const r of playerPropRows) pushMapArray(ctx.playerProps, key(r.prepared_row_id), r);
  const gameMarketRows = await all(env.MARKET_DB, "SELECT summary_row_id, batch_id, official_date, game_pk, source_key, book_coverage_grade, freshness_status, h2h_book_count, home_ml_consensus, away_ml_consensus, total_book_count, total_consensus_line, over_consensus_price, under_consensus_price, derived_home_implied_runs, derived_away_implied_runs, implied_runs_confidence, parse_status, warning_flags, created_at FROM market_context_probe_game_market_summary WHERE official_date IN (?, ?)", today, tomorrow);
  ctx.gameMarket = new Map(); for (const r of gameMarketRows) pushMapArray(ctx.gameMarket, key(r.game_pk), r);

  const readinessRows = await all(env.DAILY_DB, "SELECT readiness_key, batch_id, official_date, game_pk, prepared_row_id, player_id, canonical_prop_key, context_status, context_grade, hard_blocker_count, warning_count, enrichment_gap_count, starter_context_status, lineup_context_status, player_availability_status, weather_context_status, bullpen_context_status, schedule_spot_context_status, umpire_context_status, hard_block_reasons_json, warning_reasons_json, enrichment_gaps_json, details_json, updated_at FROM daily_context_readiness_current WHERE official_date IN (?, ?)", today, tomorrow);
  ctx.readiness = latestRowsBy(readinessRows, r => key(r.prepared_row_id));
  ctx.readinessDatesAvailable = [...new Set(readinessRows.map(r => r.official_date))];

  ctx.lineups = latestRowsBy(await all(env.DAILY_DB, "SELECT lineup_row_id, batch_id, game_pk, official_date, team_side, team_id, player_id, lineup_slot, batting_order_code, bat_side, active_position, lineup_status, confidence_label, updated_at FROM daily_lineups_current WHERE official_date IN (?, ?)", today, tomorrow), r => key(r.game_pk, r.player_id));
  ctx.availability = latestRowsBy(await all(env.DAILY_DB, "SELECT availability_key, batch_id, official_date, game_pk, player_id, mlb_player_id, team_mlb_id, opponent_mlb_id, availability_status, roster_status, availability_confidence, active_roster_flag, injured_list_flag, transaction_warning_flag, transaction_block_flag, team_mismatch_flag, source_missing_flag, reason, evaluation_json, updated_at FROM daily_player_availability_current_v1 WHERE official_date IN (?, ?)", today, tomorrow), r => key(r.game_pk, r.mlb_player_id || r.player_id));
  ctx.weather = latestRowsBy(await all(env.DAILY_DB, "SELECT weather_key, batch_id, game_pk, official_date, weather_status, weather_confidence, temperature_f, humidity_pct, wind_speed_mph, wind_gust_mph, wind_direction_cardinal, wind_context, rain_risk_flag, delay_risk_flag, roof_type, roof_status, indoor_flag, weather_applicable_flag, park_weather_notes, updated_at FROM daily_game_weather_current WHERE official_date IN (?, ?)", today, tomorrow), r => key(r.game_pk));
  ctx.starters = latestRowsBy(await all(env.DAILY_DB, "SELECT current_key, batch_id, game_pk, official_date, team_id, opponent_team_id, is_home, starter_player_id, starter_name, starter_hand, starter_status, starter_confidence, source_status, game_status, scratch_flag, opener_flag, bulk_pitcher_flag, tbd_flag, unavailable_flag, updated_at FROM daily_starters_current WHERE official_date IN (?, ?)", today, tomorrow), r => key(r.game_pk, r.team_id));
  ctx.bullpen = latestRowsBy(await all(env.DAILY_DB, "SELECT bullpen_availability_key, batch_id, official_date, game_pk, team_id, opponent_team_id, is_home, bullpen_status, bullpen_confidence, availability_grade, games_played_last_1_day, games_played_last_2_days, games_played_last_3_days, bullpen_pitches_last_1_day, bullpen_pitches_last_2_days, bullpen_pitches_last_3_days, high_usage_reliever_count, back_to_back_reliever_count, likely_unavailable_reliever_count, rested_reliever_count, bullpen_fatigue_score, bullpen_risk_level, details_json, updated_at FROM daily_bullpen_availability_current WHERE official_date IN (?, ?)", today, tomorrow), r => key(r.game_pk, r.team_id));
  ctx.pitcherBullpen = latestRowsBy(await all(env.DAILY_DB, "SELECT pitcher_availability_key, batch_id, official_date, team_id, pitcher_id, pitcher_hand, role_hint, active_roster_flag, availability_status, availability_confidence, pitches_last_1_day, pitches_last_2_days, pitches_last_3_days, outs_last_1_day, outs_last_2_days, outs_last_3_days, back_to_back_flag, high_pitch_recent_flag, likely_unavailable_flag, notes, details_json, updated_at FROM daily_bullpen_pitcher_availability_current WHERE official_date IN (?, ?)", today, tomorrow), r => key(r.official_date, r.team_id, r.pitcher_id));
  ctx.schedule = latestRowsBy(await all(env.DAILY_DB, "SELECT schedule_spot_key, batch_id, official_date, game_pk, team_id, opponent_team_id, is_home, schedule_spot_status, schedule_spot_confidence, days_rest, games_last_1_day, games_last_2_days, games_last_3_days, games_last_5_days, played_yesterday_flag, back_to_back_flag, three_in_four_flag, four_in_six_flag, doubleheader_today_flag, travel_required_flag, travel_distance_bucket, timezone_transition_flag, schedule_fatigue_score, schedule_risk_level, details_json, updated_at FROM daily_team_schedule_spot_current WHERE official_date IN (?, ?)", today, tomorrow), r => key(r.game_pk, r.team_id));
  ctx.umpire = latestRowsBy(await all(env.DAILY_DB, "SELECT umpire_context_key, batch_id, official_date, game_pk, umpire_context_status, umpire_context_confidence, source_status, home_plate_umpire_id, home_plate_umpire_name, umpire_assignment_status, assignment_confirmed_flag, assignment_pending_flag, assignment_missing_flag, umpire_tendency_status, strike_zone_context_status, run_environment_context_status, walk_context_status, strikeout_context_status, details_json, updated_at FROM daily_umpire_context_current WHERE official_date IN (?, ?)", today, tomorrow), r => key(r.game_pk));

  ctx.hitterMetrics = latestRowsBy(await all(env.STATS_HITTER_DB, "SELECT player_id, player_name, team_id, season, games_logged, first_game_date, last_game_date, total_pa, total_ab, total_hits, total_singles, total_doubles, total_home_runs, total_runs, total_rbi, total_walks, total_strikeouts, total_stolen_bases, total_bases, last3_json, last5_json, last10_json, last20_json, source_confidence, updated_at FROM hitter_metrics WHERE season=2026"), r => key(r.player_id));
  ctx.pitcherMetrics = latestRowsBy(await all(env.STATS_PITCHER_DB, "SELECT player_id, player_name, team_id, season, games_logged, starts_logged, first_game_date, last_game_date, total_outs_recorded, total_batters_faced, total_hits_allowed, total_runs_allowed, total_earned_runs, total_walks_allowed, total_strikeouts, last3_json, last5_json, last10_json, last20_json, source_confidence, updated_at FROM pitcher_metrics WHERE season=2026"), r => key(r.player_id));
  ctx.hitterSnapshots = new Map(); for (const r of await all(env.STATS_HITTER_DB, "SELECT player_id, season, metric_window, config_profile_id, formula_version, games_count, pa_sum, hits_sum, singles_sum, doubles_sum, home_runs_sum, walks_sum, strikeouts_sum, runs_sum, rbi_sum, stolen_bases_sum, total_bases_derived_sum, batting_average, slugging_percentage, strikeout_rate, walk_rate, hr_rate, tb_per_pa, h_per_ab, sample_size_label, metrics_json, review_flags_json, certification_grade, updated_at FROM hitter_metric_snapshots WHERE season=2026")) pushMapArray(ctx.hitterSnapshots, key(r.player_id), r);
  ctx.pitcherSnapshots = new Map(); for (const r of await all(env.STATS_PITCHER_DB, "SELECT player_id, season, metric_window, config_profile_id, formula_version, games_count, appearances_count, starts_count, innings_pitched_sum, outs_recorded_sum, batters_faced_sum, pitches_sum, strikes_sum, hits_allowed_sum, runs_allowed_sum, earned_runs_sum, walks_allowed_sum, strikeouts_sum, home_runs_allowed_sum, era_calculated, whip_calculated, k_rate_calculated, bb_rate_calculated, hr_rate_calculated, k_minus_bb_rate_calculated, pitches_per_out_calculated, strikes_per_pitch_calculated, innings_per_appearance_calculated, sample_size_label, certification_grade, updated_at FROM pitcher_metric_snapshots WHERE season=2026")) pushMapArray(ctx.pitcherSnapshots, key(r.player_id), r);
  ctx.hitterSplits = new Map(); for (const r of await all(env.STATS_HITTER_DB, "SELECT player_id, season, split_key, split_code, split_description, pa, ab, hits, singles, doubles, home_runs, runs, rbi, walks, strikeouts, avg, obp, slg, ops, babip, certification_grade, source_snapshot_date, updated_at FROM hitter_splits WHERE season=2026")) pushMapArray(ctx.hitterSplits, key(r.player_id), r);
  ctx.pitcherSplits = new Map(); for (const r of await all(env.STATS_PITCHER_DB, "SELECT player_id, season, split_key, split_code, split_description, innings_pitched, innings_pitched_decimal, outs_recorded, batters_faced, hits_allowed, earned_runs, walks_allowed, strikeouts, era, whip, avg_against, obp_against, slg_against, ops_against, certification_grade, source_snapshot_date, updated_at FROM pitcher_splits WHERE season=2026")) pushMapArray(ctx.pitcherSplits, key(r.player_id), r);
  ctx.expansionBaselineHp = new Map();
  for (const r of await all(env.SCORE_DB, "SELECT batch_id, profile_namespace, source_data_family, source_table, source_formula_key, player_id, player_name, canonical_prop_key, line_value, selected_side, baseline_hp_0_100, raw_rate_0_100, baseline_confidence_0_100, sample_profile, non_push_sample, hit_count, miss_count, formula_version, confidence_formula_version, updated_at FROM expansion_player_baseline_hp_current")) {
    pushMapArray(ctx.expansionBaselineHp, key(r.player_id, r.canonical_prop_key, r.line_value), r);
  }
  ctx.refTeams = new Map();
  for (const r of await all(env.REF_DB, "SELECT team_id, mlb_team_id, abbreviation, full_name, nickname, short_name, team_code, file_code FROM ref_teams WHERE active=1")) {
    for (const v of [r.team_id, r.mlb_team_id, r.abbreviation, r.full_name, r.nickname, r.short_name, r.team_code, r.file_code]) {
      if (v !== null && v !== undefined && String(v).trim()) ctx.refTeams.set(String(v).toLowerCase(), r);
    }
  }
  return ctx;
}


function parseJsonMaybe(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}
function latestSnapshotByWindow(snapshots) {
  const out = {};
  for (const r of snapshots || []) {
    const w = String(r.metric_window || "unknown");
    const prev = out[w];
    if (!prev || String(r.updated_at || "") >= String(prev.updated_at || "")) out[w] = r;
  }
  return out;
}
function pickSeasonSnapshot(snapshots) {
  const byWindow = latestSnapshotByWindow(snapshots || []);
  return byWindow.season_to_date || Object.values(byWindow).sort((a,b)=>String(b.updated_at||"").localeCompare(String(a.updated_at||"")))[0] || null;
}
function buildMetricSummaryFromSnapshots(family, snapshots) {
  const base = pickSeasonSnapshot(snapshots || []);
  if (!base) return null;
  const windows = latestSnapshotByWindow(snapshots || []);
  if (family === "pitcher") {
    return {
      derived_from: "pitcher_metric_snapshots",
      player_id: base.player_id,
      season: base.season,
      metric_window: base.metric_window,
      sample_size_label: base.sample_size_label,
      games_count: base.games_count,
      appearances_count: base.appearances_count,
      starts_count: base.starts_count,
      innings_pitched_sum: base.innings_pitched_sum,
      outs_recorded_sum: base.outs_recorded_sum,
      batters_faced_sum: base.batters_faced_sum,
      pitches_sum: base.pitches_sum,
      strikes_sum: base.strikes_sum,
      hits_allowed_sum: base.hits_allowed_sum,
      runs_allowed_sum: base.runs_allowed_sum,
      earned_runs_sum: base.earned_runs_sum,
      walks_allowed_sum: base.walks_allowed_sum,
      strikeouts_sum: base.strikeouts_sum,
      home_runs_allowed_sum: base.home_runs_allowed_sum,
      era_calculated: base.era_calculated,
      whip_calculated: base.whip_calculated,
      k_rate_calculated: base.k_rate_calculated,
      bb_rate_calculated: base.bb_rate_calculated,
      hr_rate_calculated: base.hr_rate_calculated,
      k_minus_bb_rate_calculated: base.k_minus_bb_rate_calculated,
      pitches_per_out_calculated: base.pitches_per_out_calculated,
      strikes_per_pitch_calculated: base.strikes_per_pitch_calculated,
      innings_per_appearance_calculated: base.innings_per_appearance_calculated,
      windows_available: Object.keys(windows),
      latest_updated_at: base.updated_at,
      certification_grade: base.certification_grade
    };
  }
  return {
    derived_from: "hitter_metric_snapshots",
    player_id: base.player_id,
    season: base.season,
    metric_window: base.metric_window,
    sample_size_label: base.sample_size_label,
    games_count: base.games_count,
    pa_sum: base.pa_sum,
    ab_sum: base.ab_sum,
    hits_sum: base.hits_sum,
    singles_sum: base.singles_sum,
    doubles_sum: base.doubles_sum,
    home_runs_sum: base.home_runs_sum,
    walks_sum: base.walks_sum,
    strikeouts_sum: base.strikeouts_sum,
    runs_sum: base.runs_sum,
    rbi_sum: base.rbi_sum,
    stolen_bases_sum: base.stolen_bases_sum,
    total_bases_derived_sum: base.total_bases_derived_sum,
    batting_average: base.batting_average,
    slugging_percentage: base.slugging_percentage,
    strikeout_rate: base.strikeout_rate,
    walk_rate: base.walk_rate,
    hr_rate: base.hr_rate,
    tb_per_pa: base.tb_per_pa,
    h_per_ab: base.h_per_ab,
    metrics_json: parseJsonMaybe(base.metrics_json, null),
    review_flags_json: parseJsonMaybe(base.review_flags_json, null),
    windows_available: Object.keys(windows),
    latest_updated_at: base.updated_at,
    certification_grade: base.certification_grade
  };
}

function buildMarketSummary(ctx, row) {
  const cov = ctx.marketCoverage.get(key(row.prepared_row_id)) || [];
  const propEvidence = ctx.playerProps.get(key(row.prepared_row_id)) || [];
  const gameMarket = ctx.gameMarket.get(key(row.official_game_pk)) || [];
  const statuses = [...new Set(cov.map(r => r.market_context_status).filter(Boolean))];
  const covered = cov.filter(r => String(r.market_context_status).toLowerCase() === "covered").length;
  const missing = cov.filter(r => String(r.market_context_status).toLowerCase() === "missing").length;
  return {
    status: cov.length || propEvidence.length || gameMarket.length ? (covered > 0 ? "market_context_present" : "market_context_partial_or_game_only") : "market_context_missing",
    coverage_rows: cov.length,
    player_prop_evidence_rows: propEvidence.length,
    game_market_rows: gameMarket.length,
    covered_rows: covered,
    missing_rows: missing,
    statuses,
    coverage_grades: [...new Set(cov.map(r => r.coverage_grade).filter(Boolean))],
    source_keys: [...new Set([...cov.map(r => r.source_key), ...propEvidence.map(r => r.source_key), ...gameMarket.map(r => r.source_key)].filter(Boolean))],
    player_prop_evidence: propEvidence.slice(0, 8),
    game_market_summary: gameMarket.slice(0, 3)
  };
}
function gradeFromCounts(blockers, warnings, missing) {
  if (blockers > 0) return "BLOCKED";
  if (missing > 3 || warnings > 5) return "PARTIAL_WITH_WARNINGS";
  if (missing > 0 || warnings > 0) return "READY_WITH_WARNINGS";
  return "READY";
}
function packetStatusFromGrade(grade) { return grade === "BLOCKED" ? "blocked" : (grade === "READY" ? "packet_ready" : "packet_partial"); }
function isPositiveDailyStatus(value) {
  const v = String(value || "").toLowerCase();
  return v === "available" || v === "active_available" || v === "confirmed" || v === "probable" || v === "normal" || v === "ready" || v === "ready_with_warnings" || v === "ready_partial_enrichment";
}
function buildPitcherAvailabilityFromReadiness(readiness) {
  if (!readiness) return null;
  const playerOk = isPositiveDailyStatus(readiness.player_availability_status);
  const starterOk = isPositiveDailyStatus(readiness.starter_context_status);
  if (!playerOk && !starterOk) return null;
  return {
    pitcher_availability_key: readiness.readiness_key,
    source_table: "daily_context_readiness_current",
    source_mode: "starter_pitcher_readiness_fallback",
    availability_status: readiness.player_availability_status || (starterOk ? "active_available" : null),
    availability_confidence: readiness.context_grade || readiness.context_status || null,
    starter_context_status: readiness.starter_context_status || null,
    bullpen_context_status: readiness.bullpen_context_status || null,
    hard_blocker_count: readiness.hard_blocker_count || 0,
    warning_count: readiness.warning_count || 0,
    enrichment_gap_count: readiness.enrichment_gap_count || 0,
    note: "Resolved from daily readiness because bullpen pitcher availability table is reliever-oriented and does not include most starters."
  };
}

function buildPacket(family, row, classification, ctx) {
  const game = ctx.games.get(key(row.official_game_pk)) || null;
  const playerId = row.resolved_mlb_player_id || row.resolved_player_id;
  const refTeam = ctx.refTeams && (ctx.refTeams.get(String(row.team || "").toLowerCase()) || ctx.refTeams.get(String(row.team_full_name || "").toLowerCase()));
  const refOpp = ctx.refTeams && (ctx.refTeams.get(String(row.opponent || "").toLowerCase()) || ctx.refTeams.get(String(row.opponent_full_name || "").toLowerCase()));
  let teamId = refTeam && refTeam.mlb_team_id ? refTeam.mlb_team_id : row.team;
  let opponentTeamId = refOpp && refOpp.mlb_team_id ? refOpp.mlb_team_id : row.opponent;
  if (game) {
    if (String(row.team_full_name || "") === String(game.home_team_name || "") || String(teamId) === String(game.home_team_id)) { teamId = game.home_team_id; opponentTeamId = game.away_team_id; }
    else if (String(row.team_full_name || "") === String(game.away_team_name || "") || String(teamId) === String(game.away_team_id)) { teamId = game.away_team_id; opponentTeamId = game.home_team_id; }
  }
  const isHome = game && String(teamId) === String(game.home_team_id) ? 1 : (game && String(teamId) === String(game.away_team_id) ? 0 : null);
  const lineup = ctx.lineups.get(key(row.official_game_pk, playerId)) || null;
  const availability = ctx.availability.get(key(row.official_game_pk, playerId)) || null;
  if (lineup && lineup.team_id) teamId = lineup.team_id;
  if (availability && availability.team_mlb_id) teamId = availability.team_mlb_id;
  if (availability && availability.opponent_mlb_id) opponentTeamId = availability.opponent_mlb_id;
  const readiness = ctx.readiness.get(key(row.prepared_row_id)) || null;
  const weather = ctx.weather.get(key(row.official_game_pk)) || null;
  const teamSchedule = ctx.schedule.get(key(row.official_game_pk, teamId)) || null;
  const opponentSchedule = ctx.schedule.get(key(row.official_game_pk, opponentTeamId)) || null;
  const umpire = ctx.umpire.get(key(row.official_game_pk)) || null;
  const teamBullpen = ctx.bullpen.get(key(row.official_game_pk, teamId)) || null;
  const opponentBullpen = ctx.bullpen.get(key(row.official_game_pk, opponentTeamId)) || null;
  const ownStarter = ctx.starters.get(key(row.official_game_pk, teamId)) || null;
  const oppStarter = ctx.starters.get(key(row.official_game_pk, opponentTeamId)) || null;
  const bullpenPitcherAvailability = family === "pitcher" ? (ctx.pitcherBullpen.get(key(row.official_date, teamId, playerId)) || null) : null;
  const readinessPitcherAvailability = family === "pitcher" ? buildPitcherAvailabilityFromReadiness(readiness) : null;
  const pitcherAvailability = family === "pitcher" ? (bullpenPitcherAvailability || readinessPitcherAvailability) : null;
  const market = buildMarketSummary(ctx, row);
  const snapshots = family === "pitcher" ? (ctx.pitcherSnapshots.get(key(playerId)) || []) : (ctx.hitterSnapshots.get(key(playerId)) || []);
  const splits = family === "pitcher" ? (ctx.pitcherSplits.get(key(playerId)) || []) : (ctx.hitterSplits.get(key(playerId)) || []);
  const legacyMetric = family === "pitcher" ? (ctx.pitcherMetrics.get(key(playerId)) || null) : (ctx.hitterMetrics.get(key(playerId)) || null);
  const snapshotMetric = buildMetricSummaryFromSnapshots(family, snapshots);
  const baseMetric = legacyMetric || snapshotMetric;
  const baseMetricSource = legacyMetric ? (family === "pitcher" ? "pitcher_metrics" : "hitter_metrics") : (snapshotMetric ? (family === "pitcher" ? "pitcher_metric_snapshots" : "hitter_metric_snapshots") : "missing");

  const warnings = [];
  const missing = [];
  if (!readiness) missing.push("daily_context_readiness_missing_for_current_prepared_row");
  else if (Number(readiness.hard_blocker_count || 0) > 0) warnings.push("daily_readiness_contains_hard_blocker_flag");
  if (!baseMetric) missing.push(family === "pitcher" ? "pitcher_base_metric_summary_missing" : "hitter_base_metric_summary_missing");
  if (!snapshots.length) missing.push(family === "pitcher" ? "pitcher_metric_snapshots_missing" : "hitter_metric_snapshots_missing");
  if (!splits.length) missing.push(family === "pitcher" ? "pitcher_splits_missing" : "hitter_splits_missing");
  if (market.status === "market_context_missing") warnings.push("market_context_missing");
  if (!weather) warnings.push("weather_context_missing");
  if (!teamSchedule) warnings.push("team_schedule_context_missing");
  if (!umpire) warnings.push("umpire_context_missing");
  if (family === "hitter" && !lineup) warnings.push("lineup_context_missing_or_not_posted");
  if (family === "hitter" && !oppStarter) warnings.push("opposing_starter_context_missing_or_tbd");
  if (family === "pitcher" && !ownStarter) warnings.push("starter_context_missing_or_tbd");
  if (family === "pitcher" && !pitcherAvailability) warnings.push("pitcher_availability_context_missing");

  const readinessStatus = readiness ? readiness.context_status : "missing";
  const marketStatus = market.status;
  const dailyStatus = readiness ? readiness.context_grade : "missing_current_readiness";
  const expansionBaselineRows = ctx.expansionBaselineHp ? (ctx.expansionBaselineHp.get(key(playerId, row.canonical_prop_key, row.line_value)) || []) : [];
  if ((row.canonical_prop_key === "pitcher_fantasy_score" || row.canonical_prop_key === "runs_allowed" || row.canonical_prop_key === "rfi_nrfi") && expansionBaselineRows.length === 0) warnings.push("expansion_baseline_hp_missing_for_prop_line");
  const baseMetricStatus = baseMetric ? `present_from_${baseMetricSource}` : "missing";
  const grade = gradeFromCounts(0, warnings.length, missing.length);
  const payload = {
    logical_worker_name: LOGICAL_WORKER_NAME,
    deployed_worker_slot: WORKER_NAME,
    factor_family: family,
    factor_mode: family === "pitcher" ? "pitcher_prop_factor_mining" : "hitter_prop_factor_mining",
    canonical_prop_key: row.canonical_prop_key,
    normalized_factor_lane: classification.normalized_lane,
    board_context: {
      prepared_row_id: row.prepared_row_id,
      source_key: row.source_key,
      source_row_id: row.source_row_id,
      projection_id: row.projection_id,
      source_prop_name: row.source_prop_name,
      line_value: row.line_value,
      prep_batch_id: row.prep_batch_id,
      prep_status: row.prep_status
    },
    game_context: { game, game_coverage: ctx.gameCoverage.get(key(row.official_game_pk)) || [] },
    player_context: {
      mlb_player_id: playerId,
      player_name: row.player_name,
      team_id: teamId,
      opponent_team_id: opponentTeamId,
      is_home: isHome
    },
    base_metrics: { season_summary: baseMetric, season_summary_source: baseMetricSource, legacy_summary_table_row: legacyMetric, snapshots, splits },
    expansion_baseline_hp: { source_table: "SCORE_DB.expansion_player_baseline_hp_current", rows: expansionBaselineRows, row_count: expansionBaselineRows.length, consumed_by_factor_packet: expansionBaselineRows.length > 0 },
    daily_context: {
      readiness,
      lineup,
      availability,
      weather,
      own_starter: ownStarter,
      opposing_starter: oppStarter,
      team_bullpen: teamBullpen,
      opponent_bullpen: opponentBullpen,
      pitcher_availability: pitcherAvailability,
      bullpen_pitcher_availability: bullpenPitcherAvailability,
      readiness_pitcher_availability: readinessPitcherAvailability,
      team_schedule: teamSchedule,
      opponent_schedule: opponentSchedule,
      umpire
    },
    market_context: market,
    warning_flags: warnings,
    missing_factors: missing,
    blocker_flags: [],
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    no_matrix_builder: true,
    no_external_calls: true
  };
  return {
    packet_id: rid(`pf_${family}`),
    source_line_id: (market.player_prop_evidence && market.player_prop_evidence[0] && market.player_prop_evidence[0].source_line_id) || row.source_row_id || row.projection_id || null,
    team_id: teamId,
    opponent_team_id: opponentTeamId,
    is_home: isHome,
    factor_status: packetStatusFromGrade(grade),
    factor_grade: grade,
    readiness_status: readinessStatus,
    market_context_status: marketStatus,
    daily_context_status: dailyStatus,
    base_metric_status: baseMetricStatus,
    missing_factor_count: missing.length,
    warning_count: warnings.length,
    blocker_count: 0,
    payload,
    warnings,
    missing
  };
}

async function insertPacketAndIssueRows(env, family, batchId, packets, issues) {
  const packetTable = family === "pitcher" ? "prop_factor_pitcher_packets" : "prop_factor_hitter_packets";
  const packetStmts = packets.map(p => env.SCORING_DB.prepare(`INSERT OR REPLACE INTO ${packetTable} (
    packet_id,batch_id,prepared_row_id,source_line_id,source_key,game_pk,official_date,official_game_time_utc,mlb_player_id,player_name,team_id,opponent_team_id,is_home,canonical_prop_key,normalized_factor_lane,board_line_value,factor_status,factor_grade,readiness_status,market_context_status,daily_context_status,base_metric_status,missing_factor_count,warning_count,blocker_count,factor_payload_json,details_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(
    p.packet_id, batchId, p.row.prepared_row_id, p.source_line_id, p.row.source_key, p.row.official_game_pk, p.row.official_date, p.row.official_game_time_utc, p.row.resolved_mlb_player_id || p.row.resolved_player_id, p.row.player_name, String(p.team_id || ""), String(p.opponent_team_id || ""), p.is_home, p.row.canonical_prop_key, p.classification.normalized_lane, p.row.line_value, p.factor_status, p.factor_grade, p.readiness_status, p.market_context_status, p.daily_context_status, p.base_metric_status, p.missing_factor_count, p.warning_count, p.blocker_count, JSON.stringify(p.payload), JSON.stringify({ source_prop_name: p.row.source_prop_name, warnings: p.warnings, missing: p.missing })
  ));
  await batch(env.SCORING_DB, packetStmts, 25);
  const issueStmts = issues.map(i => env.SCORING_DB.prepare(`INSERT OR REPLACE INTO prop_factor_issues (issue_id,batch_id,factor_family,packet_id,prepared_row_id,game_pk,mlb_player_id,canonical_prop_key,severity,issue_type,reason,details_json,official_date,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(
    i.issue_id, batchId, i.factor_family, i.packet_id || null, i.prepared_row_id || null, i.game_pk || null, i.mlb_player_id || null, i.canonical_prop_key || null, i.severity, i.issue_type, i.reason, JSON.stringify(i.details || {}), i.official_date || null
  ));
  await batch(env.SCORING_DB, issueStmts, 25);
}

async function insertCoverageRows(env, batchId, coverageRows) {
  const covStmts = coverageRows.map(c => env.SCORING_DB.prepare(`INSERT OR REPLACE INTO prop_factor_coverage_current (coverage_key,factor_family,prepared_row_id,game_pk,mlb_player_id,canonical_prop_key,normalized_factor_lane,factor_status,factor_grade,packet_id,latest_batch_id,latest_checked_at,blocking_for_matrix,missing_reason,details_json,official_date,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(
    c.coverage_key, c.factor_family, c.prepared_row_id, c.game_pk, c.mlb_player_id, c.canonical_prop_key, c.normalized_factor_lane, c.factor_status, c.factor_grade, c.packet_id || null, batchId, nowIso(), c.blocking_for_matrix ? 1 : 0, c.missing_reason || null, JSON.stringify(c.details || {}), c.official_date
  ));
  await batch(env.SCORING_DB, covStmts, 25);
}

async function insertRows(env, family, batchId, packets, issues, coverageRows) {
  await insertPacketAndIssueRows(env, family, batchId, packets, issues);
  await insertCoverageRows(env, batchId, coverageRows);
}

async function flushFactorChunks(env, family, batchId, packetChunk, issueChunk, coverageChunk = null) {
  const hasPacketsOrIssues = !!(packetChunk.length || issueChunk.length);
  const hasCoverage = !!(coverageChunk && coverageChunk.length);
  if (!hasPacketsOrIssues && !hasCoverage) return;
  if (hasPacketsOrIssues) await insertPacketAndIssueRows(env, family, batchId, packetChunk, issueChunk);
  if (hasCoverage) await insertCoverageRows(env, batchId, coverageChunk);
  packetChunk.length = 0;
  issueChunk.length = 0;
  if (coverageChunk) coverageChunk.length = 0;
}


async function finalizeExistingPropFactorEvidenceForRequest(env, input, family, mode, dates) {
  const requestId = input && input.request_id;
  if (!requestId || !env || !env.SCORING_DB) return null;
  const packetTable = family === "pitcher" ? "prop_factor_pitcher_packets" : "prop_factor_hitter_packets";
  const batchRow = await first(env.SCORING_DB, `SELECT batch_id, request_id, run_id, worker_version, mode, factor_family, status, window_start, window_end, prepared_rows_read
    FROM prop_factor_batches
    WHERE request_id=? AND factor_family=? AND status='running'
    ORDER BY datetime(updated_at) DESC
    LIMIT 1`, requestId, family);
  if (!batchRow || !batchRow.batch_id) return null;
  const packetSummary = await first(env.SCORING_DB, `SELECT
      COUNT(*) AS packets,
      COUNT(DISTINCT prepared_row_id) AS prepared_rows,
      COUNT(DISTINCT game_pk) AS games,
      COUNT(DISTINCT mlb_player_id) AS players,
      COUNT(DISTINCT canonical_prop_key) AS prop_keys,
      SUM(CASE WHEN warning_count > 0 THEN 1 ELSE 0 END) AS warning_rows,
      SUM(CASE WHEN blocker_count > 0 OR factor_status='blocked' THEN 1 ELSE 0 END) AS blocked_rows,
      SUM(CASE WHEN missing_factor_count > 0 THEN 1 ELSE 0 END) AS missing_factor_rows,
      MIN(created_at) AS first_packet_at,
      MAX(created_at) AS last_packet_at
    FROM ${packetTable}
    WHERE batch_id=?`, batchRow.batch_id);
  const packets = Number(packetSummary && packetSummary.packets || 0);
  if (!packets) return null;
  const issueSummary = await first(env.SCORING_DB, `SELECT COUNT(*) AS issue_rows FROM prop_factor_issues WHERE batch_id=?`, batchRow.batch_id);
  const issueRows = Number(issueSummary && issueSummary.issue_rows || 0);
  await run(env.SCORING_DB, `INSERT OR REPLACE INTO prop_factor_coverage_current (
      coverage_key,factor_family,prepared_row_id,game_pk,mlb_player_id,canonical_prop_key,normalized_factor_lane,
      factor_status,factor_grade,packet_id,latest_batch_id,latest_checked_at,blocking_for_matrix,missing_reason,details_json,official_date,created_at,updated_at
    )
    SELECT
      ? || ':' || prepared_row_id,
      ?, prepared_row_id, game_pk, mlb_player_id, canonical_prop_key, normalized_factor_lane,
      factor_status, factor_grade, packet_id, batch_id, CURRENT_TIMESTAMP,
      CASE WHEN blocker_count > 0 OR factor_status='blocked' THEN 1 ELSE 0 END,
      CASE WHEN missing_factor_count > 0 THEN 'missing_factor_context_present_in_packet' ELSE NULL END,
      json_object('terminal_finalizer',1,'source','worker_hot_finalizer','warning_count',warning_count,'missing_factor_count',missing_factor_count,'blocker_count',blocker_count),
      official_date, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM ${packetTable}
    WHERE batch_id=?`, family, family, batchRow.batch_id);
  const status = Number(packetSummary.blocked_rows || 0) > 0 || Number(packetSummary.warning_rows || 0) > 0 || Number(packetSummary.missing_factor_rows || 0) > 0 ? "completed_with_warnings" : "completed";
  const certification = status === "completed" ? "PROP_FACTOR_PACKETS_CERTIFIED" : "PROP_FACTOR_PACKETS_CERTIFIED_WITH_WARNINGS";
  const grade = Number(packetSummary.blocked_rows || 0) > 0 ? "PASS_WITH_BLOCKED_ROWS" : (status === "completed" ? "PASS" : "PASS_WITH_WARNINGS");
  const output = {
    ok:true,
    data_ok:true,
    version:SYSTEM_VERSION,
    deployed_slot_version:DEPLOYED_SLOT_VERSION,
    worker_name:LOGICAL_WORKER_NAME,
    deployed_worker_slot:WORKER_NAME,
    job_key:JOB_KEY,
    request_id:requestId,
    run_id:input.run_id || batchRow.run_id || null,
    mode,
    factor_family:family,
    status:"completed_prop_factor_packets_reconciled_from_existing_evidence",
    certification,
    certification_grade:grade,
    batch_id:batchRow.batch_id,
    window_dates:dates,
    prepared_rows_read:Number(batchRow.prepared_rows_read || packetSummary.prepared_rows || 0),
    eligible_rows:Number(packetSummary.prepared_rows || 0),
    packets_written:packets,
    rows_read:Number(batchRow.prepared_rows_read || packetSummary.prepared_rows || 0),
    rows_written:packets,
    blocked_rows:Number(packetSummary.blocked_rows || 0),
    warning_rows:Number(packetSummary.warning_rows || 0),
    issue_rows:issueRows,
    missing_factor_rows:Number(packetSummary.missing_factor_rows || 0),
    games:Number(packetSummary.games || 0),
    players:Number(packetSummary.players || 0),
    prop_keys:Number(packetSummary.prop_keys || 0),
    first_packet_at:packetSummary.first_packet_at || null,
    last_packet_at:packetSummary.last_packet_at || null,
    terminal_evidence_hot_finalizer:true,
    coverage_current_rebuilt_from_packets:true,
    external_calls:0,
    no_scoring:true,
    no_ranking:true,
    no_final_board:true,
    no_matrix_builder:true
  };
  await run(env.SCORING_DB, `UPDATE prop_factor_batches
    SET status=?, prepared_rows_read=CASE WHEN COALESCE(prepared_rows_read,0)=0 THEN ? ELSE prepared_rows_read END,
        eligible_rows=?, packets_written=?, blocked_rows=?, warning_rows=?, issue_rows=?, missing_factor_rows=?,
        certification_status=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP
    WHERE batch_id=?`, status, output.prepared_rows_read, output.eligible_rows, output.packets_written, output.blocked_rows, output.warning_rows, output.issue_rows, output.missing_factor_rows, certification, grade, JSON.stringify(output), batchRow.batch_id);
  return jsonResponse(output);
}

async function runFactorMining(request, env) {
  const input = await request.json().catch(() => ({}));
  const family = modeFamily(input.mode || input.factor_mode);
  const mode = family === "pitcher" ? "pitcher_prop_factor_mining" : "hitter_prop_factor_mining";
  const dates = Array.isArray(input.window_dates) && input.window_dates.length >= 2 ? input.window_dates.slice(0, 2) : ptTodayTomorrow();
  const dbPresence = reqDb(env);
  if (!allTrue(dbPresence)) return jsonResponse({ ok:false, data_ok:false, version:SYSTEM_VERSION, worker_name:LOGICAL_WORKER_NAME, deployed_worker_slot:WORKER_NAME, status:"blocked_missing_db_binding", missing_bindings:Object.entries(dbPresence).filter(([,v])=>!v).map(([k])=>k) }, 500);
  await loadTaxonomyClassifier(env);

  const requestedResumeBatchId = input.resume_batch_id || input.factor_batch_id || null;
  const resumeFastPath = input.factor_resume === true || !!requestedResumeBatchId;
  if (!resumeFastPath) await ensureSchema(env);

  try {
    const preparedDiagnostics = resumeFastPath
      ? { skipped_on_resume_fast_path:true, reason:"static source diagnostics skipped during Prop Factor resume chunk to avoid repeated full diagnostic scans", window_dates:dates }
      : await getPreparedSourceDiagnostics(env, dates);
    const prepared = await getPreparedRows(env, dates);
    const expectedRows = expectedFactorPreparedRows(prepared, family);
    let existingRunning = await findRunningPropFactorBatch(env, input.request_id || null, family);
    if (requestedResumeBatchId && (!existingRunning || existingRunning.batch_id !== requestedResumeBatchId)) {
      const requested = await first(env.SCORING_DB, `SELECT batch_id, request_id, run_id, worker_version, mode, factor_family, status, window_start, window_end, prepared_rows_read, eligible_rows, packets_written
        FROM prop_factor_batches
        WHERE batch_id=? AND factor_family=? AND status IN ('running','partial_continue','partial_continue_factor_packets_chunk_written')`, requestedResumeBatchId, family);
      if (requested && requested.batch_id) existingRunning = requested;
    }
    const resuming = !!(existingRunning && existingRunning.batch_id);
    if (!resuming) {
      await markStaleRunningBatches(env, dates, family);
      await retentionCleanup(env, dates, family);
    }
    const batchId = resuming ? existingRunning.batch_id : rid(`prop_factor_${family}_batch`);
    const runId = input.run_id || (existingRunning && existingRunning.run_id) || rid("run");
    if (!resuming) {
      await run(env.SCORING_DB, `INSERT OR REPLACE INTO prop_factor_batches (batch_id,request_id,run_id,worker_name,worker_version,deployed_worker_slot,deployed_slot_version,mode,factor_family,status,window_start,window_end,prepared_rows_read,source_tables_checked_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
        batchId, input.request_id || null, runId, LOGICAL_WORKER_NAME, SYSTEM_VERSION, WORKER_NAME, DEPLOYED_SLOT_VERSION, mode, family, "running", dates[0], dates[1], prepared.length, JSON.stringify({ score_db:["score_board_prepared_current","expansion_player_baseline_hp_current"], market_db:["market_context_probe_coverage","market_context_probe_player_props","market_context_probe_game_market_summary"], daily_db:["daily_context_readiness_current","daily_lineups_current","daily_starters_current","daily_player_availability_current_v1","daily_game_weather_current","daily_bullpen_availability_current","daily_bullpen_pitcher_availability_current","daily_team_schedule_spot_current","daily_umpire_context_current"], stats_hitter_db:["hitter_metric_snapshots(primary)","hitter_metrics(legacy_optional_empty_ok)","hitter_splits"], stats_pitcher_db:["pitcher_metric_snapshots(primary)","pitcher_metrics(legacy_optional_empty_ok)","pitcher_splits"], team_db:["mlb_game_calendar","mlb_game_data_coverage"], scoring_db:["prop_factor_batches","prop_factor_hitter_packets","prop_factor_pitcher_packets","prop_factor_issues","prop_factor_coverage_current"] })
      );
    } else {
      await run(env.SCORING_DB, `UPDATE prop_factor_batches SET status='running', prepared_rows_read=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, prepared.length, batchId);
    }
    const ctx = await loadContext(env, dates);
    const alreadyCovered = resuming ? await getCoveredPreparedIds(env, batchId, family) : new Set();
    const coverageRows = [];
    const packetChunk = [];
    const issueChunk = [];
    const flushSize = family === "hitter" ? HITTER_PACKET_FLUSH_SIZE : PITCHER_PACKET_FLUSH_SIZE;
    let eligibleRows = 0;
    let blockedRows = 0;
    let packetsWritten = 0;
    let issueRows = 0;
    let warningRows = 0;
    let missingRows = 0;
    let lastGamePk = null;
    let gamesProcessed = 0;
    let coverageRowsWritten = 0;
    let processedThisInvocation = 0;
    const maxRowsThisInvocation = family === "hitter" ? HITTER_MAX_FACTOR_ROWS_PER_INVOCATION : PITCHER_MAX_FACTOR_ROWS_PER_INVOCATION;
    const softTimeboxMs = family === "hitter" ? HITTER_SOFT_TIMEBOX_MS : PITCHER_SOFT_TIMEBOX_MS;
    const invocationStartedMs = Date.now();
    let timeboxBreak = false;

    for (const row of prepared) {
      const classification = classifyProp(row.canonical_prop_key, row.source_prop_name);
      const playerId = row.resolved_mlb_player_id || row.resolved_player_id;
      const rowFamily = classification.family;
      const shouldConsider = rowFamily === family || (family === "pitcher" && rowFamily === "deferred");
      if (!shouldConsider) continue;
      if (alreadyCovered.has(String(row.prepared_row_id || ""))) continue;
      if (processedThisInvocation >= maxRowsThisInvocation) break;
      if (processedThisInvocation > 0 && Date.now() - invocationStartedMs >= softTimeboxMs) { timeboxBreak = true; break; }
      processedThisInvocation++;

      if (lastGamePk !== row.official_game_pk) {
        if (lastGamePk !== null) gamesProcessed++;
        lastGamePk = row.official_game_pk;
        if (family === "hitter") await flushFactorChunks(env, family, batchId, packetChunk, issueChunk, coverageRows);
      }

      if (!classification.supported) {
        blockedRows++;
        const issue = { issue_id: rid("pfi"), factor_family: family, prepared_row_id: row.prepared_row_id, game_pk: row.official_game_pk, mlb_player_id: playerId, canonical_prop_key: row.canonical_prop_key, severity: "blocker", issue_type: "unsupported_or_deferred_prop", reason: classification.reason || "UNSUPPORTED_PROP_KEY", official_date: row.official_date, details: { source_prop_name: row.source_prop_name, source_key: row.source_key, mode, classification } };
        issueChunk.push(issue);
        issueRows++;
        coverageRows.push({ coverage_key: key(family, row.prepared_row_id), factor_family: family, prepared_row_id: row.prepared_row_id, game_pk: row.official_game_pk, mlb_player_id: playerId, canonical_prop_key: row.canonical_prop_key, normalized_factor_lane: classification.normalized_lane, factor_status: "blocked", factor_grade: "BLOCKED", packet_id: null, blocking_for_matrix: 1, missing_reason: issue.reason, details: issue.details, official_date: row.official_date });
        coverageRowsWritten++;
        if (issueChunk.length >= flushSize || coverageRows.length >= flushSize) await flushFactorChunks(env, family, batchId, packetChunk, issueChunk, coverageRows);
        continue;
      }

      eligibleRows++;
      const packet = buildPacket(family, row, classification, ctx);
      packet.row = row;
      packet.classification = classification;
      packetChunk.push(packet);
      packetsWritten++;
      if (packet.warning_count > 0 || packet.missing_factor_count > 0) warningRows++;
      if (packet.missing_factor_count > 0) missingRows++;
      const issueDetailsBase = { prepared_row_id: row.prepared_row_id, source_key: row.source_key, source_prop_name: row.source_prop_name, mode, packet_id: packet.packet_id };
      for (const w of packet.warnings) { issueChunk.push({ issue_id: rid("pfi"), factor_family: family, packet_id: packet.packet_id, prepared_row_id: row.prepared_row_id, game_pk: row.official_game_pk, mlb_player_id: playerId, canonical_prop_key: row.canonical_prop_key, severity: "warning", issue_type: "factor_warning", reason: w, official_date: row.official_date, details: issueDetailsBase }); issueRows++; }
      for (const m of packet.missing) { issueChunk.push({ issue_id: rid("pfi"), factor_family: family, packet_id: packet.packet_id, prepared_row_id: row.prepared_row_id, game_pk: row.official_game_pk, mlb_player_id: playerId, canonical_prop_key: row.canonical_prop_key, severity: "warning", issue_type: "missing_factor", reason: m, official_date: row.official_date, details: issueDetailsBase }); issueRows++; }
      coverageRows.push({ coverage_key: key(family, row.prepared_row_id), factor_family: family, prepared_row_id: row.prepared_row_id, game_pk: row.official_game_pk, mlb_player_id: playerId, canonical_prop_key: row.canonical_prop_key, normalized_factor_lane: classification.normalized_lane, factor_status: packet.factor_status, factor_grade: packet.factor_grade, packet_id: packet.packet_id, blocking_for_matrix: 0, missing_reason: packet.missing.length ? packet.missing.join(",") : null, details: { warnings: packet.warnings, missing: packet.missing, readiness_status: packet.readiness_status, market_context_status: packet.market_context_status, daily_context_status: packet.daily_context_status }, official_date: row.official_date });
      coverageRowsWritten++;

      if (packetChunk.length >= flushSize || issueChunk.length >= flushSize) {
        await flushFactorChunks(env, family, batchId, packetChunk, issueChunk, coverageRows);
      }
      if (processedThisInvocation > 0 && Date.now() - invocationStartedMs >= softTimeboxMs) { timeboxBreak = true; break; }
    }
    if (lastGamePk !== null) gamesProcessed++;
    await flushFactorChunks(env, family, batchId, packetChunk, issueChunk, coverageRows);

    const summary = await summarizeFactorBatch(env, batchId, family);
    const remainingRows = Math.max(0, expectedRows - summary.coverage_prepared_rows);
    const noEligible = expectedRows === 0;
    const partial = remainingRows > 0;
    const status = partial ? "partial_continue_factor_packets_chunk_written" : (noEligible ? "completed_no_eligible_factor_rows" : (summary.blocked_rows > 0 || summary.warning_rows > 0 ? "completed_with_warnings" : "completed"));
    const certification = partial ? "PROP_FACTOR_PACKETS_PARTIAL_CONTINUE_COVERAGE_INCOMPLETE" : (noEligible ? "PROP_FACTOR_PACKETS_NO_ELIGIBLE_ROWS" : (summary.blocked_rows > 0 || summary.warning_rows > 0 ? "PROP_FACTOR_PACKETS_CERTIFIED_WITH_WARNINGS" : "PROP_FACTOR_PACKETS_CERTIFIED"));
    const grade = partial ? "PARTIAL_CONTINUE" : (noEligible ? "NO_DATA_PASS" : (summary.blocked_rows > 0 ? "PASS_WITH_BLOCKED_ROWS" : (summary.warning_rows > 0 ? "PASS_WITH_WARNINGS" : "PASS")));
    const invocationElapsedMs = Date.now() - invocationStartedMs;
    const output = buildPropFactorOutput({ input, family, mode, batchId, runId, dates, status, certification, grade, prepared, expectedRows, summary, processedThisInvocation, remainingRows, preparedDiagnostics, ctx, partial, timeboxBreak, invocationElapsedMs, resumeFastPath });
    await run(env.SCORING_DB, `UPDATE prop_factor_batches SET status=?, prepared_rows_read=?, eligible_rows=?, packets_written=?, blocked_rows=?, warning_rows=?, issue_rows=?, missing_factor_rows=?, certification_status=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
      status, prepared.length, summary.packet_prepared_rows, summary.packets, summary.blocked_rows, summary.warning_rows, summary.issue_rows, summary.missing_factor_rows, certification, grade, JSON.stringify(output), batchId);
    return jsonResponse(output);
  } catch (err) {
    const error = String(err && err.stack ? err.stack : err);
    const output = { ok:false, data_ok:false, version:SYSTEM_VERSION, deployed_slot_version:DEPLOYED_SLOT_VERSION, worker_name:LOGICAL_WORKER_NAME, deployed_worker_slot:WORKER_NAME, job_key:JOB_KEY, mode, factor_family:family, status:"prop_factor_miner_failed", certification:"PROP_FACTOR_PACKETS_FAILED", certification_grade:"FAIL", batch_id:batchId, run_id:runId, error, partial_batch_cleaned:true, no_scoring:true, no_ranking:true, no_final_board:true, no_matrix_builder:true };
    const packetTable = family === "pitcher" ? "prop_factor_pitcher_packets" : "prop_factor_hitter_packets";
    await run(env.SCORING_DB, `DELETE FROM ${packetTable} WHERE batch_id=?`, batchId);
    await run(env.SCORING_DB, `DELETE FROM prop_factor_issues WHERE batch_id=?`, batchId);
    await run(env.SCORING_DB, `DELETE FROM prop_factor_coverage_current WHERE latest_batch_id=?`, batchId);
    await run(env.SCORING_DB, `UPDATE prop_factor_batches SET status='failed', certification_status='PROP_FACTOR_PACKETS_FAILED', certification_grade='FAIL', output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, JSON.stringify(output), batchId);
    return jsonResponse(output, 500);
  }
}

function identity(env) {
  const db = reqDb(env);
  return { ok:true, data_ok:true, version:SYSTEM_VERSION, deployed_slot_version:DEPLOYED_SLOT_VERSION, worker_name:LOGICAL_WORKER_NAME, deployed_worker_slot:WORKER_NAME, job_key:JOB_KEY, status:"ready", internal_only:true, no_external_calls:true, no_scoring:true, no_ranking:true, no_final_board:true, schema_owner:"SCORING_DB.prop_factor_*", upstream_reads:"SCORE_DB.score_board_prepared_current, SCORE_DB.expansion_player_baseline_hp_current", retention_policy:"today_tomorrow_only", required_db_bindings_present:allTrue(db), db_bindings:db };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    if (request.method === "GET" && (path === "/" || path === "/health")) return jsonResponse(identity(env));
    if (request.method === "POST" && (path === "/run" || path === "/mine")) {
      const inputForLifecycle = await request.clone().json().catch(() => ({}));
      await controlLifecycleHeartbeat(env, inputForLifecycle, "running_prop_factor_miner_worker_started", { mode: inputForLifecycle.mode || inputForLifecycle.factor_mode || null });
      try {
        const response = await runFactorMining(request, env);
        const output = await responseToOutputObject(response);
        if (isPropFactorPartialOutput(output)) {
          output.control_lifecycle = await controlLifecyclePartialContinue(env, inputForLifecycle, output);
        } else {
          output.control_lifecycle = await controlLifecycleFinalize(env, inputForLifecycle, output, output.ok !== false && output.data_ok !== false ? "completed" : "failed");
        }
        return jsonResponse(output, response.status || (output.ok !== false ? 200 : 500));
      }
      catch (err) {
        const failOutput = { ok:false, data_ok:false, version:SYSTEM_VERSION, worker_name:LOGICAL_WORKER_NAME, deployed_worker_slot:WORKER_NAME, job_key:JOB_KEY, request_id:inputForLifecycle.request_id || null, run_id:inputForLifecycle.run_id || null, status:"prop_factor_miner_exception", certification:"PROP_FACTOR_MINER_EXCEPTION", certification_grade:"FAILED", error:String(err && err.stack ? err.stack : err), external_calls:0, no_scoring:true, no_ranking:true, no_final_board:true, no_matrix_builder:true };
        failOutput.control_lifecycle = await controlLifecycleFinalize(env, inputForLifecycle, failOutput, "failed");
        return jsonResponse(failOutput, 500);
      }
    }
    return jsonResponse({ ok:false, error:"not_found", version:SYSTEM_VERSION, path }, 404);
  }
};
