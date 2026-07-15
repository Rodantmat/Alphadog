const WORKER_NAME = "alphadog-v2-phase2b-certifier";
const LOGICAL_WORKER_NAME = "alphadog-v2-prop-matrix-builder";
const JOB_KEY = "prop-matrix-builder";
const SYSTEM_VERSION = "alphadog-v2-prop-matrix-builder-v0.1.14-compact-storage-safe";
const DEPLOYED_SLOT_VERSION = "alphadog-v2-phase2b-certifier-v0.2.12-matrix-compact-storage-safe";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "TEAM_DB", "DAILY_DB", "MARKET_DB", "SCORE_DB", "SCORING_DB"];

const HITTER_PROPS = new Set([
  "hits", "total_bases", "runs", "rbis", "singles", "doubles", "home_runs", "walks",
  "hitter_strikeouts", "hits_runs_rbis", "stolen_bases", "fantasy", "fantasy_score",
  "plate_appearances", "triples"
]);
const PITCHER_PROPS = new Set([
  "pitcher_strikeouts", "pitcher_outs", "pitching_outs", "earned_runs", "earned_runs_allowed",
  "hits_allowed", "walks_allowed", "pitches_thrown", "rfi_nrfi"
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
function reqDb(env) {
  const out = {};
  for (const k of REQUIRED_DB_BINDINGS) out[k] = !!env[k];
  return out;
}
function allTrue(obj) { return Object.values(obj).every(Boolean); }
function key(...parts) { return parts.map(v => v === null || v === undefined ? "" : String(v)).join("|"); }
function pushMapArray(map, k, row) { if (!map.has(k)) map.set(k, []); map.get(k).push(row); }
function latestBy(rows, keyFn, dateField = "updated_at") {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    const prev = m.get(k);
    if (!prev || String(r[dateField] || r.created_at || "") >= String(prev[dateField] || prev.created_at || "")) m.set(k, r);
  }
  return m;
}
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
async function batch(db, statements, size = 40) {
  for (let i = 0; i < statements.length; i += size) await db.batch(statements.slice(i, i + size));
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
  const rowsRead = Number(output.rows_read ?? output.prepared_rows_read ?? output.matrix_rows_read ?? 0) || 0;
  const rowsWritten = Number(output.rows_written ?? output.matrix_rows_written ?? 0) || 0;
  const externalCalls = Number(output.external_calls_performed ?? output.external_calls ?? 0) || 0;
  const finalJson = controlSafeJson({
    ...output,
    request_id: requestId,
    run_id: runId,
    control_lifecycle_partial_continue: true,
    control_lifecycle_partial_at: (typeof nowUtc === "function" ? nowUtc() : (typeof nowIso === "function" ? nowIso() : new Date().toISOString()))
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
function classifyProp(propKey, sourcePropName) {
  const keyLc = String(propKey || "").toLowerCase();
  const sourceName = String(sourcePropName || "").toLowerCase();
  const taxonomyMap = TAXONOMY_CACHE;
  if (!taxonomyMap || !taxonomyMap.has(keyLc)) return { family: "unknown", normalized_lane: keyLc || null, supported: false, reason: "UNSUPPORTED_PROP_KEY_NOT_IN_TAXONOMY" };
  const family = taxonomyMap.get(keyLc);
  if (family === "deferred") return { family: "deferred", normalized_lane: keyLc, supported: false, reason: "PROP_DEFERRED_PENDING_SEPARATE_DESIGN" };
  if (family === "ambiguous_disambiguate_by_source_name") {
    const isPitcherFantasy = sourceName.includes("pitch");
    return { family: isPitcherFantasy ? "pitcher" : "hitter", normalized_lane: isPitcherFantasy ? "pitcher_fantasy" : "hitter_fantasy", supported: true };
  }
  const lane = keyLc === "pitching_outs" ? "pitcher_outs" : (keyLc === "earned_runs_allowed" ? "earned_runs" : keyLc);
  return { family, normalized_lane: lane, supported: true };
}
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
function isStale(batch, preparedMaxUpdatedAt) {
  if (!batch || !preparedMaxUpdatedAt) return true;
  return String(batch.updated_at || batch.created_at || "") < String(preparedMaxUpdatedAt || "");
}
function splitCsv(s) { return String(s || "").split(",").map(v => v.trim()).filter(Boolean); }
function compactMarketPropRows(rowsOrSummary) {
  if (!rowsOrSummary) return { row_count: 0, present: false };
  if (!Array.isArray(rowsOrSummary) && rowsOrSummary.row_count !== undefined) {
    return {
      row_count: Number(rowsOrSummary.row_count || 0),
      present: Number(rowsOrSummary.row_count || 0) > 0,
      source_keys: splitCsv(rowsOrSummary.source_keys).slice(0, 12),
      source_markets: splitCsv(rowsOrSummary.source_markets).slice(0, 12),
      outcome_sides: splitCsv(rowsOrSummary.outcome_sides).slice(0, 8),
      min_line_value: rowsOrSummary.min_line_value === null || rowsOrSummary.min_line_value === undefined ? null : Number(rowsOrSummary.min_line_value),
      max_line_value: rowsOrSummary.max_line_value === null || rowsOrSummary.max_line_value === undefined ? null : Number(rowsOrSummary.max_line_value),
      min_price_american: rowsOrSummary.min_price_american === null || rowsOrSummary.min_price_american === undefined ? null : Number(rowsOrSummary.min_price_american),
      max_price_american: rowsOrSummary.max_price_american === null || rowsOrSummary.max_price_american === undefined ? null : Number(rowsOrSummary.max_price_american)
    };
  }
  const rows = Array.isArray(rowsOrSummary) ? rowsOrSummary : [];
  if (!rows.length) return { row_count: 0, present: false };
  const nums = rows.map(r => Number(r.price_american)).filter(n => Number.isFinite(n));
  const lines = rows.map(r => Number(r.line_value)).filter(n => Number.isFinite(n));
  return {
    row_count: rows.length,
    present: true,
    source_keys: [...new Set(rows.map(r => r.source_key).filter(Boolean))].slice(0, 12),
    source_markets: [...new Set(rows.map(r => r.source_market_key).filter(Boolean))].slice(0, 12),
    outcome_sides: [...new Set(rows.map(r => r.outcome_side).filter(Boolean))].slice(0, 8),
    min_line_value: lines.length ? Math.min(...lines) : null,
    max_line_value: lines.length ? Math.max(...lines) : null,
    min_price_american: nums.length ? Math.min(...nums) : null,
    max_price_american: nums.length ? Math.max(...nums) : null
  };
}
function cleanGameMarket(row) {
  if (!row) return null;
  return {
    game_pk: row.game_pk,
    batch_id: row.batch_id,
    book_coverage_grade: row.book_coverage_grade,
    freshness_status: row.freshness_status,
    h2h_book_count: row.h2h_book_count,
    runline_book_count: row.runline_book_count,
    total_book_count: row.total_book_count,
    home_ml_consensus: row.home_ml_consensus,
    away_ml_consensus: row.away_ml_consensus,
    home_runline_point: row.home_runline_point,
    away_runline_point: row.away_runline_point,
    total_consensus_line: row.total_consensus_line,
    derived_home_implied_runs: row.derived_home_implied_runs,
    derived_away_implied_runs: row.derived_away_implied_runs,
    implied_runs_method: row.implied_runs_method,
    parse_status: row.parse_status,
    warning_flags: row.warning_flags
  };
}

function normalizeSourceKeyForSideRules(sourceKey, payload) {
  const payloadSource = String(payload && payload.source_key ? payload.source_key : "").toLowerCase();
  const rowSource = String(sourceKey || "").toLowerCase();
  if (rowSource === "sleeper" || payloadSource.includes("sleeper")) return "sleeper";
  if (rowSource === "prizepicks" || payloadSource.includes("prizepicks")) return "prizepicks";
  // Real source_key confirmed via live data audit: Underdog board rows are keyed
  // "parlay_underdog", not "underdog" - this exact mismatch was the reason every
  // Underdog leg fell through to side_availability_unclear (blocked) below.
  if (rowSource === "parlay_underdog" || rowSource === "underdog" || payloadSource.includes("underdog")) return "underdog";
  return rowSource || payloadSource || "unknown";
}
function numOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function buildSourceLineId(row) {
  const payload = safeJsonParse(row && row.row_payload_json, {}) || {};
  const sourceKey = row && row.source_key ? row.source_key : (payload.source_key || "unknown_source");
  const sourceNativeId =
    (row && (row.source_line_id || row.source_row_id || row.projection_id || row.source_event_id)) ||
    payload.source_line_id ||
    payload.line_id ||
    payload.source_row_id ||
    payload.projection_id ||
    payload.id ||
    payload.event_id ||
    "";
  const lineValue = numOrNull(row && row.line_value);
  const oddsType = payload.odds_type || payload.payout_variant || payload.source_line_type || payload.projection_type || "standard_or_source";
  return key(
    "matrix_source_line",
    sourceKey,
    sourceNativeId,
    row && (row.official_game_pk || row.game_pk) || "",
    row && (row.resolved_mlb_player_id || row.resolved_player_id || row.mlb_player_id) || "",
    row && (row.canonical_prop_key || row.prop_key) || "",
    lineValue === null ? "" : lineValue,
    oddsType,
    row && row.prepared_row_id || ""
  );
}

function buildSideVariationContext(row) {
  const payload = safeJsonParse(row.row_payload_json, {}) || {};
  const sourceKey = normalizeSourceKeyForSideRules(row.source_key, payload);
  const oddsType = payload.odds_type || null;
  const sourceLineType = payload.source_line_type || payload.projection_type || null;
  const payoutVariant = payload.payout_variant || oddsType || null;
  const isGoblin = Number(payload.is_goblin || 0) === 1 || String(oddsType || "").toLowerCase() === "goblin" || String(payoutVariant || "").toLowerCase() === "goblin";
  const isDemon = Number(payload.is_demon || 0) === 1 || String(oddsType || "").toLowerCase() === "demon" || String(payoutVariant || "").toLowerCase() === "demon";
  const isStandard = Number(payload.is_standard || 0) === 1 || String(oddsType || "").toLowerCase() === "standard" || String(payoutVariant || "").toLowerCase() === "standard";
  const overPrice = numOrNull(payload.over_price !== undefined ? payload.over_price : payload.source_prices && payload.source_prices.over_price);
  const underPrice = numOrNull(payload.under_price !== undefined ? payload.under_price : payload.source_prices && payload.source_prices.under_price);
  const projectionId = payload.projection_id || row.projection_id || null;
  const sourceLineId = row.source_row_id || projectionId || row.source_event_id || null;
  const lineValue = numOrNull(row.line_value);
  const variationKey = key("variation", row.source_key, sourceLineId, row.official_game_pk, row.resolved_mlb_player_id || row.resolved_player_id, row.canonical_prop_key, lineValue === null ? "" : lineValue, oddsType || payoutVariant || sourceLineType || "standard_or_source", row.prepared_row_id);

  let sideMode = "source_side_availability_unclear";
  let sideAvailabilityStatus = "side_availability_unclear";
  let sideEligibilityReason = "SIDE_AVAILABILITY_NOT_ENOUGH_METADATA";
  let availableSides = [];

  if (sourceKey === "prizepicks") {
    if (isGoblin || isDemon) {
      sideMode = "more_only";
      availableSides = ["more"];
      sideAvailabilityStatus = "side_ready_more_only";
      sideEligibilityReason = "PRIZEPICKS_GOBLIN_DEMON_MORE_ONLY";
    } else if (isStandard || String(oddsType || "").toLowerCase() === "standard") {
      sideMode = "two_sided";
      availableSides = ["more", "less"];
      sideAvailabilityStatus = "side_ready_two_sided";
      sideEligibilityReason = "PRIZEPICKS_STANDARD_TWO_SIDED";
    }
  } else {
    // Real fix, found via live-data audit while adjusting this worker for the expanded board:
    // this used to be a hardcoded per-source name chain (prizepicks / sleeper / [nothing else]),
    // so Underdog - which uses the real source_key "parlay_underdog", not "underdog" - fell
    // through to side_availability_unclear (blocked) for every single leg, regardless of the
    // fix above to normalizeSourceKeyForSideRules. Generalized to a real, price-based rule that
    // works for Sleeper, Underdog, and any future two-sided-priced source without needing its
    // name hardcoded here: if a source carries real over AND under prices, it's two-sided; one
    // side present means that side only. PrizePicks stays special-cased above because its
    // goblin/demon/standard rows are boosted one-directional projections, not real two-sided
    // priced markets, so price presence alone would misclassify them.
    if (overPrice !== null && underPrice !== null) {
      sideMode = "two_sided";
      availableSides = ["more", "less"];
      sideAvailabilityStatus = "side_ready_two_sided";
      sideEligibilityReason = sourceKey === "sleeper" ? "SLEEPER_OVER_UNDER_PRICES_PRESENT" : (sourceKey === "underdog" ? "UNDERDOG_OVER_UNDER_PRICES_PRESENT" : "SOURCE_OVER_UNDER_PRICES_PRESENT");
    } else if (overPrice !== null) {
      sideMode = "more_only";
      availableSides = ["more"];
      sideAvailabilityStatus = "side_ready_more_only";
      sideEligibilityReason = sourceKey === "sleeper" ? "SLEEPER_OVER_PRICE_ONLY" : (sourceKey === "underdog" ? "UNDERDOG_OVER_PRICE_ONLY" : "SOURCE_OVER_PRICE_ONLY");
    } else if (underPrice !== null) {
      sideMode = "less_only";
      availableSides = ["less"];
      sideAvailabilityStatus = "side_ready_less_only";
      sideEligibilityReason = sourceKey === "sleeper" ? "SLEEPER_UNDER_PRICE_ONLY" : (sourceKey === "underdog" ? "UNDERDOG_UNDER_PRICE_ONLY" : "SOURCE_UNDER_PRICE_ONLY");
    }
  }

  return {
    variation_key: variationKey,
    source_line_id: sourceLineId,
    source_key_normalized: sourceKey,
    source_line_type: sourceLineType,
    projection_type: payload.projection_type || null,
    odds_type: oddsType,
    payout_variant: payoutVariant,
    is_goblin: isGoblin ? 1 : 0,
    is_demon: isDemon ? 1 : 0,
    is_standard: isStandard ? 1 : 0,
    line_value: lineValue,
    board_line_value: lineValue,
    over_price: overPrice,
    under_price: underPrice,
    source_prices: payload.source_prices || { over_price: overPrice, under_price: underPrice },
    side_mode: sideMode,
    available_sides: availableSides,
    side_availability_status: sideAvailabilityStatus,
    side_eligibility_status: sideAvailabilityStatus,
    side_eligibility_reason: sideEligibilityReason,
    scoring_side_rule: isGoblin || isDemon ? "goblin_demon_more_only_no_less_under" : (sideMode === "two_sided" ? "evaluate_more_and_less_select_stronger_later" : "block_or_defer_in_scoring_if_unclear"),
    selected_side: null,
    more_score_0_100: null,
    less_score_0_100: null
  };
}

async function ensureSchema(env) {
  const ddl = [
    `CREATE TABLE IF NOT EXISTS prop_matrix_batches (
      batch_id TEXT PRIMARY KEY,
      request_id TEXT,
      run_id TEXT,
      worker_name TEXT,
      worker_version TEXT,
      deployed_worker_slot TEXT,
      deployed_slot_version TEXT,
      mode TEXT,
      status TEXT,
      window_start TEXT,
      window_end TEXT,
      prepared_rows_read INTEGER DEFAULT 0,
      eligible_rows INTEGER DEFAULT 0,
      matrix_rows_written INTEGER DEFAULT 0,
      matrix_ready_rows INTEGER DEFAULT 0,
      matrix_ready_with_warnings_rows INTEGER DEFAULT 0,
      matrix_partial_context_rows INTEGER DEFAULT 0,
      matrix_blocked_rows INTEGER DEFAULT 0,
      matrix_deferred_rows INTEGER DEFAULT 0,
      issue_rows INTEGER DEFAULT 0,
      warning_rows INTEGER DEFAULT 0,
      blocker_rows INTEGER DEFAULT 0,
      missing_component_rows INTEGER DEFAULT 0,
      source_tables_checked_json TEXT,
      prerequisite_freshness_json TEXT,
      certification_status TEXT,
      certification_grade TEXT,
      output_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS prop_matrix_current (
      matrix_id TEXT PRIMARY KEY,
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
      board_line_value REAL,
      prop_side TEXT,
      factor_family TEXT,
      factor_packet_id TEXT,
      factor_status TEXT,
      market_game_context_status TEXT,
      market_prop_context_status TEXT,
      daily_readiness_status TEXT,
      matrix_status TEXT,
      matrix_grade TEXT,
      blocking_for_scoring INTEGER DEFAULT 0,
      warning_count INTEGER DEFAULT 0,
      blocker_count INTEGER DEFAULT 0,
      missing_component_count INTEGER DEFAULT 0,
      matrix_payload_json TEXT,
      details_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS prop_matrix_issues (
      issue_id TEXT PRIMARY KEY,
      batch_id TEXT,
      matrix_id TEXT,
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
    `CREATE TABLE IF NOT EXISTS prop_matrix_coverage_current (
      coverage_key TEXT PRIMARY KEY,
      prepared_row_id TEXT,
      matrix_id TEXT,
      matrix_status TEXT,
      matrix_grade TEXT,
      blocking_for_scoring INTEGER DEFAULT 0,
      latest_batch_id TEXT,
      latest_checked_at TEXT,
      missing_reason TEXT,
      details_json TEXT,
      official_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_prop_matrix_batches_mode_date ON prop_matrix_batches(mode, window_start, window_end, updated_at)`,
    `CREATE INDEX IF NOT EXISTS idx_prop_matrix_current_prepared ON prop_matrix_current(prepared_row_id, official_date)`,
    `CREATE INDEX IF NOT EXISTS idx_prop_matrix_current_status ON prop_matrix_current(official_date, matrix_status, matrix_grade)`,
    `CREATE INDEX IF NOT EXISTS idx_prop_matrix_current_game_player ON prop_matrix_current(game_pk, mlb_player_id, canonical_prop_key)`,
    `CREATE INDEX IF NOT EXISTS idx_prop_matrix_issues_batch ON prop_matrix_issues(batch_id, severity, issue_type)`,
    `CREATE INDEX IF NOT EXISTS idx_prop_matrix_coverage_date ON prop_matrix_coverage_current(official_date, matrix_status, matrix_grade)`
  ];
  await batch(env.SCORING_DB, ddl.map(sql => env.SCORING_DB.prepare(sql)), 10);
}
async function retentionCleanup(env, dates) {
  const inClause = dates.map(() => "?").join(",");
  await run(env.SCORING_DB, `DELETE FROM prop_matrix_current WHERE official_date NOT IN (${inClause})`, ...dates);
  await run(env.SCORING_DB, `DELETE FROM prop_matrix_issues WHERE official_date IS NOT NULL AND official_date NOT IN (${inClause})`, ...dates);
  await run(env.SCORING_DB, `DELETE FROM prop_matrix_coverage_current WHERE official_date NOT IN (${inClause})`, ...dates);
  await run(env.SCORING_DB, `DELETE FROM prop_matrix_batches WHERE window_start NOT IN (${inClause}) AND window_end NOT IN (${inClause})`, ...dates, ...dates);
  await run(env.SCORING_DB, `DELETE FROM prop_matrix_batches WHERE window_start IN (${inClause}) OR window_end IN (${inClause})`, ...dates, ...dates);
  await run(env.SCORING_DB, `DELETE FROM prop_matrix_current WHERE official_date IN (${inClause})`, ...dates);
  await run(env.SCORING_DB, `DELETE FROM prop_matrix_issues WHERE official_date IN (${inClause})`, ...dates);
  await run(env.SCORING_DB, `DELETE FROM prop_matrix_coverage_current WHERE official_date IN (${inClause})`, ...dates);
}
async function getPreparedRows(env, dates) {
  const inClause = dates.map(() => "?").join(",");
  return all(env.SCORE_DB, `SELECT prepared_row_id, prep_batch_id, source_key, source_row_id, source_event_id, projection_id,
      player_name, resolved_player_id, resolved_mlb_player_id, player_match_status, team, opponent,
      team_full_name, opponent_full_name, canonical_prop_key, source_prop_name, line_value, official_game_pk,
      official_game_time_utc, official_date, source_time_status, matchup_status, pickable_safe, prep_status, block_reason, row_payload_json,
      created_at, updated_at
    FROM score_board_prepared_current
    WHERE official_date IN (${inClause})
      AND pickable_safe=1
      AND matchup_status='calendar_matched'
      AND player_match_status='matched'
      AND official_game_pk IS NOT NULL
      AND official_game_time_utc IS NOT NULL
      AND official_game_time_utc > ?
    ORDER BY official_date, official_game_pk, resolved_mlb_player_id, canonical_prop_key, source_key`, ...dates, new Date().toISOString());
}
function arrChunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
function placeholders(values) { return values.map(() => "?").join(","); }
function uniqueNonEmpty(values) { return [...new Set(values.filter(v => v !== null && v !== undefined && String(v) !== ""))]; }
async function allByIn(db, prefix, values, suffix = "", extraBinds = []) {
  const clean = uniqueNonEmpty(values);
  if (!clean.length) return [];

  // Cloudflare D1 has a practical bound on SQL bind variables. The Matrix Builder
  // can process thousands of prepared rows, so every IN-list lookup must be
  // internally micro-chunked even when the outer matrix loop is already chunked.
  // Keep this deliberately low to leave room for suffix binds such as date windows.
  const maxVarsPerQuery = 80;
  const maxValuesPerQuery = Math.max(1, maxVarsPerQuery - extraBinds.length);
  const out = [];
  for (let i = 0; i < clean.length; i += maxValuesPerQuery) {
    const part = clean.slice(i, i + maxValuesPerQuery);
    const rows = await all(db, `${prefix} (${placeholders(part)}) ${suffix}`, ...part, ...extraBinds);
    out.push(...rows);
  }
  return out;
}
async function loadGlobalPrerequisites(env, dates, preparedRows) {
  const dateInClause = dates.map(() => "?").join(",");
  const preparedMaxUpdatedAt = preparedRows.reduce((m, r) => String(r.updated_at || "") > m ? String(r.updated_at || "") : m, "");
  const prepCount = preparedRows.length;
  const prepGames = new Set(preparedRows.map(r => r.official_game_pk)).size;
  const prepPlayers = new Set(preparedRows.map(r => r.resolved_mlb_player_id || r.resolved_player_id)).size;
  const prepPropKeys = new Set(preparedRows.map(r => r.canonical_prop_key)).size;

  const dailyBatches = await all(env.DAILY_DB, `SELECT batch_id,status,window_start,window_end,certification_status,certification_grade,prepared_rows_read,current_rows_written,blocked_count,ready_with_warnings_count,ready_partial_enrichment_count,created_at,updated_at FROM daily_context_readiness_batches WHERE window_start IN (${dateInClause}) OR window_end IN (${dateInClause}) ORDER BY datetime(updated_at) DESC LIMIT 5`, ...dates, ...dates);
  const latestDailyBatch = dailyBatches[0] || null;

  const marketBatches = await all(env.MARKET_DB, `SELECT batch_id,mode,slate_window_key,window_start_date,window_end_date,status,certification_status,certification_grade,prepared_rows_read,prepared_games_checked,prepared_players_checked,prepared_prop_keys_checked,created_at,updated_at FROM market_context_probe_batches WHERE window_start_date IN (${dateInClause}) OR window_end_date IN (${dateInClause}) ORDER BY datetime(updated_at) DESC`, ...dates, ...dates);
  const latestMarketByMode = latestBy(marketBatches, r => key(r.mode));
  const marketBatchIds = uniqueNonEmpty([...latestMarketByMode.values()].map(r => r.batch_id));

  const latestHitterBatch = await first(env.SCORING_DB, `SELECT * FROM prop_factor_batches WHERE factor_family='hitter' AND (window_start IN (${dateInClause}) OR window_end IN (${dateInClause})) ORDER BY datetime(updated_at) DESC LIMIT 1`, ...dates, ...dates);
  const latestPitcherBatch = await first(env.SCORING_DB, `SELECT * FROM prop_factor_batches WHERE factor_family='pitcher' AND (window_start IN (${dateInClause}) OR window_end IN (${dateInClause})) ORDER BY datetime(updated_at) DESC LIMIT 1`, ...dates, ...dates);

  const freshness = {
    prepared: { rows: prepCount, games: prepGames, players: prepPlayers, prop_keys: prepPropKeys, max_updated_at: preparedMaxUpdatedAt },
    daily_readiness: latestDailyBatch ? { batch_id: latestDailyBatch.batch_id, prepared_rows_read: latestDailyBatch.prepared_rows_read, current_rows_written: latestDailyBatch.current_rows_written, updated_at: latestDailyBatch.updated_at, stale: isStale(latestDailyBatch, preparedMaxUpdatedAt) || Number(latestDailyBatch.current_rows_written || 0) !== prepCount } : { missing: true, stale: true },
    factor_hitter: latestHitterBatch ? { batch_id: latestHitterBatch.batch_id, prepared_rows_read: latestHitterBatch.prepared_rows_read, eligible_rows: latestHitterBatch.eligible_rows, packets_written: latestHitterBatch.packets_written, updated_at: latestHitterBatch.updated_at, stale: isStale(latestHitterBatch, preparedMaxUpdatedAt) } : { missing: true, stale: true },
    factor_pitcher: latestPitcherBatch ? { batch_id: latestPitcherBatch.batch_id, prepared_rows_read: latestPitcherBatch.prepared_rows_read, eligible_rows: latestPitcherBatch.eligible_rows, packets_written: latestPitcherBatch.packets_written, blocked_rows: latestPitcherBatch.blocked_rows, updated_at: latestPitcherBatch.updated_at, stale: isStale(latestPitcherBatch, preparedMaxUpdatedAt) } : { missing: true, stale: true },
    market_batches: {}
  };
  for (const [mode, b] of latestMarketByMode.entries()) freshness.market_batches[mode] = { batch_id: b.batch_id, prepared_rows_read: b.prepared_rows_read, prepared_games_checked: b.prepared_games_checked, updated_at: b.updated_at, stale: isStale(b, preparedMaxUpdatedAt) };
  return { freshness, marketBatchIds };
}
async function loadChunkPrerequisites(env, dates, chunkRows, globalCtx) {
  const dateInClause = dates.map(() => "?").join(",");
  const preparedIds = uniqueNonEmpty(chunkRows.map(r => r.prepared_row_id));
  const gamePks = uniqueNonEmpty(chunkRows.map(r => r.official_game_pk));
  const marketBatchIds = uniqueNonEmpty(globalCtx.marketBatchIds || []);

  const factorCoverageRows = await allByIn(env.SCORING_DB,
    `SELECT coverage_key,factor_family,prepared_row_id,game_pk,mlb_player_id,canonical_prop_key,normalized_factor_lane,factor_status,factor_grade,packet_id,latest_batch_id,latest_checked_at,blocking_for_matrix,missing_reason,details_json,official_date,updated_at FROM prop_factor_coverage_current WHERE prepared_row_id IN`,
    preparedIds,
    `AND official_date IN (${dateInClause})`, dates);
  const factorCoverage = latestBy(factorCoverageRows, r => key(r.prepared_row_id));

  const hitterPacketIds = uniqueNonEmpty(factorCoverageRows.filter(r => r.factor_family === "hitter").map(r => r.packet_id));
  const pitcherPacketIds = uniqueNonEmpty(factorCoverageRows.filter(r => r.factor_family === "pitcher").map(r => r.packet_id));
  const packetColumns = `packet_id,batch_id,prepared_row_id,source_line_id,source_key,game_pk,official_date,official_game_time_utc,mlb_player_id,player_name,team_id,opponent_team_id,is_home,canonical_prop_key,normalized_factor_lane,board_line_value,factor_status,factor_grade,readiness_status,market_context_status,daily_context_status,base_metric_status,missing_factor_count,warning_count,blocker_count,details_json,created_at,updated_at`;
  const hitterPackets = latestBy(await allByIn(env.SCORING_DB, `SELECT ${packetColumns} FROM prop_factor_hitter_packets WHERE packet_id IN`, hitterPacketIds), r => key(r.packet_id));
  const pitcherPackets = latestBy(await allByIn(env.SCORING_DB, `SELECT ${packetColumns} FROM prop_factor_pitcher_packets WHERE packet_id IN`, pitcherPacketIds), r => key(r.packet_id));

  const factorIssuesRows = await allByIn(env.SCORING_DB,
    `SELECT * FROM prop_factor_issues WHERE prepared_row_id IN`,
    preparedIds,
    `AND official_date IN (${dateInClause})`, dates);
  const factorIssues = new Map(); for (const r of factorIssuesRows) pushMapArray(factorIssues, key(r.prepared_row_id), r);

  const readiness = latestBy(await allByIn(env.DAILY_DB,
    `SELECT readiness_key,batch_id,official_date,game_pk,game_time_utc,prepared_row_id,source_key,source_row_id,projection_id,player_id,player_name,team_id,opponent_team_id,canonical_prop_key,prepared_board_relevant,pickable_safe,context_status,context_grade,hard_blocker_count,warning_count,enrichment_gap_count,available_context_count,expected_context_count,starter_context_status,lineup_context_status,player_availability_status,weather_context_status,bullpen_context_status,schedule_spot_context_status,umpire_context_status,hard_block_reasons_json,warning_reasons_json,enrichment_gaps_json,details_json,updated_at FROM daily_context_readiness_current WHERE prepared_row_id IN`,
    preparedIds,
    `AND official_date IN (${dateInClause})`, dates), r => key(r.prepared_row_id));

  let marketCoverageRows = [];
  let playerPropSummaries = [];
  let gameMarketRows = [];
  if (marketBatchIds.length) {
    marketCoverageRows = await all(env.MARKET_DB,
      `SELECT coverage_row_id,batch_id,slate_window_key,official_date,prepared_row_id,source_key,game_pk,resolved_mlb_player_id,canonical_prop_key,board_line_value,game_market_status,player_prop_market_status,market_context_status,coverage_grade,details_json,created_at FROM market_context_probe_coverage WHERE prepared_row_id IN (${placeholders(preparedIds)}) AND batch_id IN (${placeholders(marketBatchIds)})`,
      ...preparedIds, ...marketBatchIds);
    playerPropSummaries = await all(env.MARKET_DB,
      `SELECT prepared_row_id, COUNT(*) AS row_count, GROUP_CONCAT(DISTINCT source_key) AS source_keys, GROUP_CONCAT(DISTINCT source_market_key) AS source_markets, GROUP_CONCAT(DISTINCT outcome_side) AS outcome_sides, MIN(line_value) AS min_line_value, MAX(line_value) AS max_line_value, MIN(price_american) AS min_price_american, MAX(price_american) AS max_price_american FROM market_context_probe_player_props WHERE prepared_row_id IN (${placeholders(preparedIds)}) AND batch_id IN (${placeholders(marketBatchIds)}) GROUP BY prepared_row_id`,
      ...preparedIds, ...marketBatchIds);
    if (gamePks.length) {
      gameMarketRows = await all(env.MARKET_DB,
        `SELECT summary_row_id,batch_id,slate_window_key,official_date,game_pk,source_key,source_event_id,source_commence_time_utc,home_team,away_team,book_target_count,book_available_count,book_coverage_grade,freshness_status,oldest_market_update,newest_market_update,h2h_book_count,home_ml_consensus,away_ml_consensus,home_ml_best,away_ml_best,moneyline_favorite_team,moneyline_favorite_price,moneyline_underdog_team,moneyline_underdog_price,runline_book_count,home_runline_point,home_runline_consensus_price,home_runline_best_price,away_runline_point,away_runline_consensus_price,away_runline_best_price,total_book_count,total_consensus_line,over_consensus_price,under_consensus_price,over_best_price,under_best_price,total_line_min,total_line_max,total_line_range,derived_home_implied_runs,derived_away_implied_runs,implied_runs_method,parse_status,warning_flags,summary_json,created_at FROM market_context_probe_game_market_summary WHERE game_pk IN (${placeholders(gamePks)}) AND batch_id IN (${placeholders(marketBatchIds)})`,
        ...gamePks, ...marketBatchIds);
    }
  }
  const marketCoverage = new Map(); for (const r of marketCoverageRows) pushMapArray(marketCoverage, key(r.prepared_row_id), r);
  const playerProps = latestBy(playerPropSummaries, r => key(r.prepared_row_id));
  const gameMarket = latestBy(gameMarketRows, r => key(r.game_pk), "created_at");
  const calendar = latestBy(await allByIn(env.TEAM_DB,
    `SELECT game_pk,official_date,game_time_utc,status_code,abstract_game_state,detailed_state,is_pregame,is_live,is_final,home_team_id,away_team_id,home_team_name,away_team_name,venue_id,venue_name,updated_at FROM mlb_game_calendar WHERE game_pk IN`,
    gamePks), r => key(r.game_pk));

  return { factorCoverage, hitterPackets, pitcherPackets, factorIssues, readiness, marketCoverage, playerProps, gameMarket, calendar };
}
function aggregateMarketCoverage(rows) {
  const out = {
    rows: rows || [],
    game_status: "market_game_context_missing",
    prop_status: "market_prop_context_missing",
    context_status: "market_context_missing",
    coverage_grade: "MARKET_CONTEXT_MISSING",
    has_game_context: false,
    has_prop_context: false,
    prop_missing: false,
    partial: false
  };
  if (!rows || !rows.length) return out;
  const statuses = rows.map(r => String(r.market_context_status || ""));
  const grades = rows.map(r => String(r.coverage_grade || ""));
  const gameStatuses = rows.map(r => String(r.game_market_status || ""));
  const propStatuses = rows.map(r => String(r.player_prop_market_status || ""));
  out.has_game_context = gameStatuses.some(s => s.includes("SPORTSBOOK_GAME_MARKET_CONTEXT_PRESENT") || s.includes("GAME_MARKET_CONTEXT_PRESENT"));
  out.has_prop_context = propStatuses.some(s => s.includes("PROP_LINE_CONTEXT_PRESENT") || s.includes("REFERENCE_MATCHED"));
  out.prop_missing = propStatuses.some(s => s.includes("NOT_FOUND") || s.includes("MISSING") || s.includes("NOT_MATCHED"));
  out.partial = statuses.some(s => s.includes("PARTIAL")) || !out.has_game_context || out.prop_missing;
  out.game_status = out.has_game_context ? "market_game_context_present" : "market_game_context_missing";
  out.prop_status = out.has_prop_context ? "market_prop_context_present" : (out.prop_missing ? "market_prop_context_not_found" : "market_prop_context_missing");
  out.context_status = out.partial ? "market_context_partial" : "market_context_ready";
  out.coverage_grade = [...new Set(grades.filter(Boolean))].join(",") || out.coverage_grade;
  return out;
}

function boundedJson(value, max = 2400) {
  let text = "{}";
  try { text = JSON.stringify(value == null ? {} : value); } catch (_) { text = JSON.stringify({ serialization_error:true }); }
  if (text.length <= max) return text;
  try { return JSON.stringify({ compacted:true, truncated:true, original_chars:text.length, preview:text.slice(0, Math.max(200, max - 120)) }); }
  catch (_) { return "{}"; }
}
function compactArrayCount(v) { return Array.isArray(v) ? v.length : 0; }
function compactGameContext(g) {
  if (!g) return null;
  return {
    game_pk:g.game_pk,
    official_date:g.official_date,
    game_time_utc:g.game_time_utc,
    status_code:g.status_code,
    abstract_game_state:g.abstract_game_state,
    detailed_state:g.detailed_state,
    is_pregame:g.is_pregame,
    is_live:g.is_live,
    is_final:g.is_final,
    home_team_id:g.home_team_id,
    away_team_id:g.away_team_id,
    venue_id:g.venue_id,
    updated_at:g.updated_at
  };
}
function compactGameMarket(g) {
  if (!g) return null;
  return {
    batch_id:g.batch_id,
    book_coverage_grade:g.book_coverage_grade,
    freshness_status:g.freshness_status,
    h2h_book_count:g.h2h_book_count,
    runline_book_count:g.runline_book_count,
    total_book_count:g.total_book_count,
    home_ml_consensus:g.home_ml_consensus,
    away_ml_consensus:g.away_ml_consensus,
    home_runline_point:g.home_runline_point,
    away_runline_point:g.away_runline_point,
    total_consensus_line:g.total_consensus_line,
    derived_home_implied_runs:g.derived_home_implied_runs,
    derived_away_implied_runs:g.derived_away_implied_runs,
    parse_status:g.parse_status,
    created_at:g.created_at
  };
}
function compactMarketCoverageRows(rows) {
  const r = Array.isArray(rows) ? rows : [];
  return {
    rows:r.length,
    statuses:[...new Set(r.map(x => String(x.market_context_status || '')).filter(Boolean))],
    coverage_grades:[...new Set(r.map(x => String(x.coverage_grade || '')).filter(Boolean))],
    game_statuses:[...new Set(r.map(x => String(x.game_market_status || '')).filter(Boolean))],
    prop_statuses:[...new Set(r.map(x => String(x.player_prop_market_status || '')).filter(Boolean))]
  };
}
function compactReadiness(r, fallbackStatus) {
  if (!r) return { status:fallbackStatus || "daily_readiness_missing_soft_fallback", fallback_from_factor_packet:true };
  return {
    batch_id:r.batch_id,
    context_status:r.context_status,
    context_grade:r.context_grade,
    hard_blocker_count:Number(r.hard_blocker_count || 0),
    warning_count:Number(r.warning_count || 0),
    enrichment_gap_count:Number(r.enrichment_gap_count || 0),
    starter_context_status:r.starter_context_status,
    lineup_context_status:r.lineup_context_status,
    player_availability_status:r.player_availability_status,
    weather_context_status:r.weather_context_status,
    bullpen_context_status:r.bullpen_context_status,
    schedule_spot_context_status:r.schedule_spot_context_status,
    umpire_context_status:r.umpire_context_status,
    updated_at:r.updated_at
  };
}
function compactFactorCoverage(f) {
  if (!f) return null;
  return {
    factor_family:f.factor_family,
    packet_id:f.packet_id,
    latest_batch_id:f.latest_batch_id,
    factor_status:f.factor_status,
    factor_grade:f.factor_grade,
    blocking_for_matrix:Number(f.blocking_for_matrix || 0),
    missing_reason:f.missing_reason || null,
    updated_at:f.updated_at
  };
}
function compactPacketRef(packet) {
  if (!packet) return null;
  return {
    packet_id:packet.packet_id,
    batch_id:packet.batch_id,
    factor_status:packet.factor_status,
    factor_grade:packet.factor_grade,
    readiness_status:packet.readiness_status,
    market_context_status:packet.market_context_status,
    daily_context_status:packet.daily_context_status,
    base_metric_status:packet.base_metric_status,
    warning_count:Number(packet.warning_count || 0),
    blocker_count:Number(packet.blocker_count || 0),
    missing_factor_count:Number(packet.missing_factor_count || 0),
    updated_at:packet.updated_at
  };
}
function compactIssueDetails(issueType, reason, details) {
  const d = details || {};
  if (issueType === "daily_readiness_warning") {
    return { context_status:d.context_status, context_grade:d.context_grade, warning_count:Number(d.warning_count || 0), enrichment_gap_count:Number(d.enrichment_gap_count || 0), warning_reason_count:compactArrayCount(d.warnings), gap_count:compactArrayCount(d.gaps) };
  }
  if (issueType === "market_context_partial") {
    const statuses = Array.isArray(d.statuses) ? d.statuses : [];
    return { status_rows:statuses.length, statuses:[...new Set(statuses.map(x => String(x.market_context_status || '')).filter(Boolean))], coverage_grades:[...new Set(statuses.map(x => String(x.coverage_grade || '')).filter(Boolean))] };
  }
  if (issueType === "carried_factor_issue") {
    return { source_issue_id:d.source_issue_id || null, source_issue_type:d.source_issue_type || null, source_reason:reason || null };
  }
  if (issueType === "daily_readiness_hard_blocker") {
    return { context_status:d.context_status, context_grade:d.context_grade, hard_block_reason_count:compactArrayCount(d.hard_block_reasons), hard_block_reasons:Array.isArray(d.hard_block_reasons) ? d.hard_block_reasons.slice(0, 5) : [] };
  }
  if (issueType === "factor_blocking_for_matrix") {
    return { factor_status:d.factor_status, factor_grade:d.factor_grade };
  }
  if (issueType === "side_availability_unclear") {
    return { side_availability_status:d.side_variation && d.side_variation.side_availability_status, side_eligibility_reason:d.side_variation && d.side_variation.side_eligibility_reason };
  }
  if (issueType === "missing_factor_coverage") return { expected_family:d.expected_family || null };
  if (issueType === "factor_packet_missing") return { factor_packet_id:d.factor_packet_id || null, factor_family:d.factor_family || null };
  if (issueType === "market_game_context_missing") return { game_pk:d.game_pk || null };
  return d;
}

function addIssue(issues, batchId, matrixId, row, severity, issueType, reason, details) {
  issues.push({ issue_id: rid("pmi"), batch_id: batchId, matrix_id: matrixId, prepared_row_id: row.prepared_row_id, game_pk: row.official_game_pk, mlb_player_id: row.resolved_mlb_player_id || row.resolved_player_id, canonical_prop_key: row.canonical_prop_key, severity, issue_type: issueType, reason, details: compactIssueDetails(issueType, reason, details || {}), official_date: row.official_date });
}
async function insertMatrixRows(env, matrixRows, issueRows, coverageRows) {
  await batch(env.SCORING_DB, matrixRows.map(r => env.SCORING_DB.prepare(`INSERT OR REPLACE INTO prop_matrix_current (matrix_id,batch_id,prepared_row_id,source_line_id,source_key,game_pk,official_date,official_game_time_utc,mlb_player_id,player_name,team_id,opponent_team_id,is_home,canonical_prop_key,board_line_value,prop_side,factor_family,factor_packet_id,factor_status,market_game_context_status,market_prop_context_status,daily_readiness_status,matrix_status,matrix_grade,blocking_for_scoring,warning_count,blocker_count,missing_component_count,matrix_payload_json,details_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(
    r.matrix_id, r.batch_id, r.prepared_row_id, r.source_line_id || null, r.source_key, r.game_pk, r.official_date, r.official_game_time_utc, r.mlb_player_id, r.player_name, r.team_id || null, r.opponent_team_id || null, r.is_home === undefined ? null : r.is_home, r.canonical_prop_key, r.board_line_value, r.prop_side || null, r.factor_family, r.factor_packet_id || null, r.factor_status, r.market_game_context_status, r.market_prop_context_status, r.daily_readiness_status, r.matrix_status, r.matrix_grade, r.blocking_for_scoring ? 1 : 0, r.warning_count || 0, r.blocker_count || 0, r.missing_component_count || 0, boundedJson(r.matrix_payload || {}, 4200), boundedJson(r.details || {}, 2600)
  )), 35);
  await batch(env.SCORING_DB, issueRows.map(i => env.SCORING_DB.prepare(`INSERT OR REPLACE INTO prop_matrix_issues (issue_id,batch_id,matrix_id,prepared_row_id,game_pk,mlb_player_id,canonical_prop_key,severity,issue_type,reason,details_json,official_date,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(
    i.issue_id, i.batch_id, i.matrix_id, i.prepared_row_id, i.game_pk, i.mlb_player_id, i.canonical_prop_key, i.severity, i.issue_type, i.reason, boundedJson(i.details || {}, 900), i.official_date
  )), 40);
  await batch(env.SCORING_DB, coverageRows.map(c => env.SCORING_DB.prepare(`INSERT OR REPLACE INTO prop_matrix_coverage_current (coverage_key,prepared_row_id,matrix_id,matrix_status,matrix_grade,blocking_for_scoring,latest_batch_id,latest_checked_at,missing_reason,details_json,official_date,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(
    c.coverage_key, c.prepared_row_id, c.matrix_id, c.matrix_status, c.matrix_grade, c.blocking_for_scoring ? 1 : 0, c.latest_batch_id, c.latest_checked_at, c.missing_reason || null, boundedJson(c.details || {}, 700), c.official_date
  )), 40);
}
async function summarizeMatrixBatch(env, batchId) {
  const row = await first(env.SCORING_DB, `SELECT
      COUNT(*) AS matrix_rows_written,
      SUM(CASE WHEN matrix_status='matrix_ready' THEN 1 ELSE 0 END) AS matrix_ready_rows,
      SUM(CASE WHEN matrix_status='matrix_ready_with_warnings' THEN 1 ELSE 0 END) AS matrix_ready_with_warnings_rows,
      SUM(CASE WHEN matrix_status='matrix_partial_context' THEN 1 ELSE 0 END) AS matrix_partial_context_rows,
      SUM(CASE WHEN matrix_status='matrix_blocked' THEN 1 ELSE 0 END) AS matrix_blocked_rows,
      SUM(CASE WHEN matrix_status='matrix_deferred' THEN 1 ELSE 0 END) AS matrix_deferred_rows,
      SUM(CASE WHEN matrix_status='matrix_source_missing' THEN 1 ELSE 0 END) AS matrix_source_missing_rows,
      SUM(CASE WHEN warning_count > 0 THEN 1 ELSE 0 END) AS warning_rows,
      SUM(CASE WHEN blocker_count > 0 OR blocking_for_scoring=1 THEN 1 ELSE 0 END) AS blocker_rows,
      SUM(CASE WHEN missing_component_count > 0 THEN 1 ELSE 0 END) AS missing_component_rows
    FROM prop_matrix_current WHERE batch_id=?`, batchId);
  const issues = await first(env.SCORING_DB, `SELECT COUNT(*) AS issue_rows FROM prop_matrix_issues WHERE batch_id=?`, batchId);
  const clean = row || {};
  return {
    matrix_rows_written: Number(clean.matrix_rows_written || 0),
    matrix_ready_rows: Number(clean.matrix_ready_rows || 0),
    matrix_ready_with_warnings_rows: Number(clean.matrix_ready_with_warnings_rows || 0),
    matrix_partial_context_rows: Number(clean.matrix_partial_context_rows || 0),
    matrix_blocked_rows: Number(clean.matrix_blocked_rows || 0),
    matrix_deferred_rows: Number(clean.matrix_deferred_rows || 0),
    matrix_source_missing_rows: Number(clean.matrix_source_missing_rows || 0),
    issue_rows: Number((issues && issues.issue_rows) || 0),
    warning_rows: Number(clean.warning_rows || 0),
    blocker_rows: Number(clean.blocker_rows || 0),
    missing_component_rows: Number(clean.missing_component_rows || 0)
  };
}
async function findResumeMatrixBatch(env, input, dates) {
  const windowEnd = dates[dates.length - 1];
  const requested = input.matrix_batch_id || input.resume_batch_id || null;
  if (requested) {
    const row = await first(env.SCORING_DB, `SELECT * FROM prop_matrix_batches WHERE batch_id=? AND window_start=? AND window_end=? AND status LIKE 'running%' ORDER BY datetime(updated_at) DESC LIMIT 1`, requested, dates[0], windowEnd);
    if (row) return row;
  }
  if (input.request_id) {
    return await first(env.SCORING_DB, `SELECT * FROM prop_matrix_batches WHERE request_id=? AND window_start=? AND window_end=? AND status LIKE 'running%' ORDER BY datetime(updated_at) DESC LIMIT 1`, input.request_id, dates[0], windowEnd);
  }
  return null;
}
async function runMatrixBuilder(request, env) {
  const input = await request.json().catch(() => ({}));
  let dates;
  if (Array.isArray(input.window_dates) && input.window_dates.length) {
    dates = [...new Set(input.window_dates)].sort();
  } else {
    const nowIsoForWindow = new Date().toISOString();
    const realBoardDateRows = await all(env.SCORE_DB, `SELECT DISTINCT official_date FROM score_board_prepared_current WHERE pickable_safe = 1 AND official_game_time_utc IS NOT NULL AND official_game_time_utc > ?`, nowIsoForWindow);
    const realBoardDates = realBoardDateRows.map(r => r.official_date).filter(Boolean);
    const floor = ptTodayTomorrow();
    dates = [...new Set([...realBoardDates, ...floor])].sort();
  }
  const dbPresence = reqDb(env);
  if (!allTrue(dbPresence)) return jsonResponse({ ok:false, data_ok:false, version:SYSTEM_VERSION, worker_name:LOGICAL_WORKER_NAME, deployed_worker_slot:WORKER_NAME, status:"blocked_missing_db_binding", missing_bindings:Object.entries(dbPresence).filter(([,v])=>!v).map(([k])=>k) }, 500);
  await loadTaxonomyClassifier(env);

  await ensureSchema(env);
  const runId = input.run_id || rid("run");
  const sourceTables = { scoring_db:["prop_matrix_batches","prop_matrix_current","prop_matrix_issues","prop_matrix_coverage_current","prop_factor_coverage_current","prop_factor_hitter_packets","prop_factor_pitcher_packets","prop_factor_issues","prop_factor_batches"], score_db:["score_board_prepared_current"], market_db:["market_context_probe_batches","market_context_probe_coverage","market_context_probe_player_props","market_context_probe_game_market_summary"], daily_db:["daily_context_readiness_current","daily_context_readiness_batches"], team_db:["mlb_game_calendar"] };

  const resumeBatch = await findResumeMatrixBatch(env, input, dates);
  let batchId;
  let resumedExistingBatch = false;
  if (resumeBatch && resumeBatch.batch_id) {
    batchId = resumeBatch.batch_id;
    resumedExistingBatch = true;
    await run(env.SCORING_DB, `UPDATE prop_matrix_batches SET run_id=?, worker_version=?, deployed_slot_version=?, status='running_chunked', updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, runId, SYSTEM_VERSION, DEPLOYED_SLOT_VERSION, batchId);
  } else {
    await retentionCleanup(env, dates);
    batchId = rid("prop_matrix_batch");
    await run(env.SCORING_DB, `INSERT OR REPLACE INTO prop_matrix_batches (batch_id,request_id,run_id,worker_name,worker_version,deployed_worker_slot,deployed_slot_version,mode,status,window_start,window_end,source_tables_checked_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      batchId, input.request_id || null, runId, LOGICAL_WORKER_NAME, SYSTEM_VERSION, WORKER_NAME, DEPLOYED_SLOT_VERSION, "prop_matrix_build", "running", dates[0], dates[dates.length - 1], JSON.stringify(sourceTables));
  }

  const prepared = await getPreparedRows(env, dates);
  const globalCtx = await loadGlobalPrerequisites(env, dates, prepared);
  const existingRows = await all(env.SCORING_DB, `SELECT prepared_row_id FROM prop_matrix_current WHERE batch_id=?`, batchId);
  const existingPrepared = new Set(existingRows.map(r => String(r.prepared_row_id || "")).filter(Boolean));
  const remainingPrepared = prepared.filter(r => !existingPrepared.has(String(r.prepared_row_id || "")));

  const requestedChunkSize = Number(input.chunk_size || 75);
  const chunkSize = Math.max(25, Math.min(75, Number.isFinite(requestedChunkSize) ? requestedChunkSize : 75));
  const maxChunksPerInvocationRaw = Number(input.max_chunks_per_invocation || input.matrix_max_chunks_per_invocation || 20);
  const maxChunksPerInvocation = Math.max(1, Math.min(20, Number.isFinite(maxChunksPerInvocationRaw) ? maxChunksPerInvocationRaw : 20));
  const maxRuntimeMsRaw = Number(input.max_runtime_ms || input.matrix_max_runtime_ms || 27000);
  const deadlineMs = Date.now() + Math.max(12000, Math.min(27000, Number.isFinite(maxRuntimeMsRaw) ? maxRuntimeMsRaw : 27000));
  let processedChunks = 0;

  for (const chunkRows of arrChunks(remainingPrepared, chunkSize)) {
    if (processedChunks >= maxChunksPerInvocation) break;
    if (processedChunks > 0 && Date.now() >= deadlineMs) break;
    processedChunks++;
    const ctx = await loadChunkPrerequisites(env, dates, chunkRows, globalCtx);
    const issues = [];
    const matrixRows = [];
    const coverageRows = [];

    for (const row of chunkRows) {
    const playerId = row.resolved_mlb_player_id || row.resolved_player_id;
    const matrixId = key("matrix", row.prepared_row_id);
    const classification = classifyProp(row.canonical_prop_key, row.source_prop_name);
    const factorCov = ctx.factorCoverage.get(key(row.prepared_row_id));
    const packetMap = factorCov && factorCov.factor_family === "pitcher" ? ctx.pitcherPackets : ctx.hitterPackets;
    const packet = factorCov && factorCov.packet_id ? packetMap.get(key(factorCov.packet_id)) : null;
    const readiness = ctx.readiness.get(key(row.prepared_row_id));
    const marketRows = ctx.marketCoverage.get(key(row.prepared_row_id)) || [];
    const market = aggregateMarketCoverage(marketRows);
    const propEvidence = compactMarketPropRows(ctx.playerProps.get(key(row.prepared_row_id)) || []);
    const gameMarket = cleanGameMarket(ctx.gameMarket.get(key(row.official_game_pk)));
    const game = ctx.calendar.get(key(row.official_game_pk));
    const sideVariation = buildSideVariationContext(row);
    const rowIssuesBefore = issues.length;

    let matrixStatus = "matrix_ready";
    let matrixGrade = "PASS";
    let blocking = 0;
    let warningCount = 0;
    let blockerCount = 0;
    let missingComponentCount = 0;

    if (classification.family === "deferred") {
      matrixStatus = "matrix_deferred";
      matrixGrade = "DEFERRED_UNSUPPORTED_PROP";
      blocking = 1;
      blockerCount++;
      addIssue(issues, batchId, matrixId, row, "blocker", "deferred_prop", "PROP_DEFERRED_PENDING_SEPARATE_DESIGN", { classification });
    } else if (!classification.supported) {
      matrixStatus = "matrix_deferred";
      matrixGrade = "DEFERRED_UNSUPPORTED_PROP";
      blocking = 1;
      blockerCount++;
      addIssue(issues, batchId, matrixId, row, "blocker", "unsupported_prop", classification.reason || "UNSUPPORTED_PROP_KEY_PENDING_FACTOR_DESIGN", { classification });
    }

    if (sideVariation.side_availability_status === "side_availability_unclear" && matrixStatus !== "matrix_deferred") {
      blocking = 1;
      blockerCount++;
      matrixStatus = "matrix_blocked";
      matrixGrade = "BLOCKED_UNSAFE";
      addIssue(issues, batchId, matrixId, row, "blocker", "side_availability_unclear", sideVariation.side_eligibility_reason || "SIDE_AVAILABILITY_NOT_ENOUGH_METADATA", { side_variation: sideVariation });
    }

    if (!factorCov) {
      blocking = 1;
      blockerCount++;
      missingComponentCount++;
      if (matrixStatus !== "matrix_deferred") { matrixStatus = "matrix_source_missing"; matrixGrade = "BLOCKED_UNSAFE"; }
      addIssue(issues, batchId, matrixId, row, "blocker", "missing_factor_coverage", "FACTOR_COVERAGE_MISSING_FOR_SAFE_PREPARED_ROW", { expected_family: classification.family });
    } else if (Number(factorCov.blocking_for_matrix || 0) === 1 && matrixStatus !== "matrix_deferred") {
      blocking = 1;
      blockerCount++;
      matrixStatus = "matrix_blocked";
      matrixGrade = "BLOCKED_UNSAFE";
      addIssue(issues, batchId, matrixId, row, "blocker", "factor_blocking_for_matrix", factorCov.missing_reason || "FACTOR_PACKET_BLOCKED", { factor_status: factorCov.factor_status, factor_grade: factorCov.factor_grade, details: safeJsonParse(factorCov.details_json, {}) });
    }

    if (factorCov && factorCov.packet_id && !packet && matrixStatus !== "matrix_deferred") {
      blocking = 1;
      blockerCount++;
      missingComponentCount++;
      matrixStatus = "matrix_source_missing";
      matrixGrade = "BLOCKED_UNSAFE";
      addIssue(issues, batchId, matrixId, row, "blocker", "factor_packet_missing", "FACTOR_PACKET_ID_NOT_FOUND_IN_PACKET_TABLE", { factor_packet_id: factorCov.packet_id, factor_family: factorCov.factor_family });
    }

    const packetDailyStatus = packet && (packet.daily_context_status || packet.readiness_status) ? String(packet.daily_context_status || packet.readiness_status) : null;
    const effectiveDailyStatus = readiness ? String(readiness.context_status || "") : (packetDailyStatus || "daily_readiness_missing_soft_fallback");
    if (!readiness) {
      warningCount++;
      missingComponentCount++;
      addIssue(issues, batchId, matrixId, row, "warning", "daily_readiness_missing_soft_fallback", "DAILY_CONTEXT_READINESS_ROW_MISSING_USING_FACTOR_PACKET_DAILY_STATUS", { packet_daily_context_status: packetDailyStatus, fallback_status: effectiveDailyStatus });
    } else {
      const hard = Number(readiness.hard_blocker_count || 0);
      const warn = Number(readiness.warning_count || 0) + Number(readiness.enrichment_gap_count || 0);
      if (hard > 0 && matrixStatus !== "matrix_deferred") {
        blocking = 1;
        blockerCount += hard;
        matrixStatus = "matrix_blocked";
        matrixGrade = "BLOCKED_UNSAFE";
        addIssue(issues, batchId, matrixId, row, "blocker", "daily_readiness_hard_blocker", "DAILY_CONTEXT_READINESS_HARD_BLOCKER", { context_status: readiness.context_status, context_grade: readiness.context_grade, hard_block_reasons: safeJsonParse(readiness.hard_block_reasons_json, []) });
      }
      if (warn > 0) {
        warningCount += warn;
        addIssue(issues, batchId, matrixId, row, "warning", "daily_readiness_warning", "DAILY_CONTEXT_READINESS_WARNINGS_OR_GAPS_PRESENT", { context_status: readiness.context_status, context_grade: readiness.context_grade, warning_count: readiness.warning_count, enrichment_gap_count: readiness.enrichment_gap_count, warnings: safeJsonParse(readiness.warning_reasons_json, []), gaps: safeJsonParse(readiness.enrichment_gaps_json, []) });
      }
    }

    if (!gameMarket) {
      warningCount++;
      missingComponentCount++;
      addIssue(issues, batchId, matrixId, row, "warning", "market_game_context_missing", "MARKET_GAME_CONTEXT_MISSING_OR_NOT_REFRESHED", { game_pk: row.official_game_pk });
    }
    if (!marketRows.length) {
      warningCount++;
      missingComponentCount++;
      addIssue(issues, batchId, matrixId, row, "warning", "market_coverage_missing", "MARKET_CONTEXT_COVERAGE_MISSING_FOR_PREPARED_ROW", {});
    } else if (market.partial) {
      warningCount++;
      addIssue(issues, batchId, matrixId, row, "warning", "market_context_partial", "MARKET_CONTEXT_PARTIAL_OR_PROP_LINE_MISSING", { statuses: marketRows.map(r => ({ batch_id:r.batch_id, market_context_status:r.market_context_status, coverage_grade:r.coverage_grade, game_market_status:r.game_market_status, player_prop_market_status:r.player_prop_market_status })) });
    }

    const carried = ctx.factorIssues.get(key(row.prepared_row_id)) || [];
    for (const fi of carried) {
      const sev = String(fi.severity || "warning").toLowerCase() === "blocker" ? "blocker" : "warning";
      if (sev === "blocker" && matrixStatus !== "matrix_deferred") { blocking = 1; blockerCount++; if (matrixStatus !== "matrix_blocked") { matrixStatus = "matrix_blocked"; matrixGrade = "BLOCKED_UNSAFE"; } }
      else if (sev === "warning") warningCount++;
      addIssue(issues, batchId, matrixId, row, sev, "carried_factor_issue", fi.reason || fi.issue_type || "FACTOR_PACKET_ISSUE", { source_issue_id: fi.issue_id, source_issue_type: fi.issue_type, source_details: safeJsonParse(fi.details_json, {}) });
    }

    if (warningCount > 0 && !blocking && matrixStatus === "matrix_ready") {
      matrixStatus = "matrix_partial_context";
      matrixGrade = "PARTIAL_CONTEXT_PASS";
    }

    const sourceLineId = buildSourceLineId(row);
    const packetRef = compactPacketRef(packet);
    const details = {
      compact_storage_v0_1_14: true,
      classification,
      game_context: compactGameContext(game),
      market_context: { game_summary: compactGameMarket(gameMarket), prop_evidence: propEvidence, coverage_summary: compactMarketCoverageRows(marketRows) },
      daily_readiness: compactReadiness(readiness, effectiveDailyStatus),
      factor_coverage: compactFactorCoverage(factorCov),
      issue_counts: { warning_count: warningCount, blocker_count: blockerCount, missing_component_count: missingComponentCount }
    };
    matrixRows.push({ matrix_id: matrixId, batch_id: batchId, prepared_row_id: row.prepared_row_id, source_line_id: sourceLineId, source_key: row.source_key, game_pk: row.official_game_pk, official_date: row.official_date, official_game_time_utc: row.official_game_time_utc, mlb_player_id: playerId, player_name: row.player_name, team_id: row.team, opponent_team_id: row.opponent, is_home: row.team && game && String(game.home_team_id || game.home_team || "") === String(row.team) ? 1 : null, canonical_prop_key: row.canonical_prop_key, board_line_value: row.line_value, prop_side: null, factor_family: factorCov ? factorCov.factor_family : classification.family, factor_packet_id: factorCov && factorCov.packet_id ? factorCov.packet_id : null, factor_status: factorCov ? factorCov.factor_status : "factor_coverage_missing", market_game_context_status: market.game_status, market_prop_context_status: market.prop_status, daily_readiness_status: effectiveDailyStatus, matrix_status: matrixStatus, matrix_grade: matrixGrade, blocking_for_scoring: blocking, warning_count: warningCount + (packet ? Number(packet.warning_count || 0) : 0), blocker_count: blockerCount, missing_component_count: missingComponentCount, matrix_payload: {
        prepared: {
          prepared_row_id: row.prepared_row_id,
          prep_batch_id: row.prep_batch_id,
          source_key: row.source_key,
          player_name: row.player_name,
          mlb_player_id: playerId,
          canonical_prop_key: row.canonical_prop_key,
          board_line_value: row.line_value,
          line_value: row.line_value,
          official_game_pk: row.official_game_pk,
          official_date: row.official_date,
          official_game_time_utc: row.official_game_time_utc,
          source_line_id: sourceLineId,
          variation_key: sideVariation.variation_key,
          odds_type: sideVariation.odds_type,
          source_line_type: sideVariation.source_line_type,
          projection_type: sideVariation.projection_type,
          payout_variant: sideVariation.payout_variant,
          is_goblin: sideVariation.is_goblin,
          is_demon: sideVariation.is_demon,
          is_standard: sideVariation.is_standard,
          over_price: sideVariation.over_price,
          under_price: sideVariation.under_price,
          source_prices: sideVariation.source_prices
        },
        side_context: {
          side_mode: sideVariation.side_mode,
          available_sides: sideVariation.available_sides,
          side_availability_status: sideVariation.side_availability_status,
          side_eligibility_status: sideVariation.side_eligibility_status,
          side_eligibility_reason: sideVariation.side_eligibility_reason,
          scoring_side_rule: sideVariation.scoring_side_rule,
          goblin_demon_under_blocker: (sideVariation.is_goblin || sideVariation.is_demon) ? "GOBLIN_DEMON_UNDER_NOT_SELECTABLE" : null,
          selected_side: null,
          more_score_0_100: null,
          less_score_0_100: null
        },
        variation_context: {
          variation_key: sideVariation.variation_key,
          source_line_id: sourceLineId,
          prepared_row_id: row.prepared_row_id,
          source_key: row.source_key,
          game_pk: row.official_game_pk,
          mlb_player_id: playerId,
          canonical_prop_key: row.canonical_prop_key,
          line_value: row.line_value,
          board_line_value: row.line_value,
          odds_type: sideVariation.odds_type,
          source_line_type: sideVariation.source_line_type,
          projection_type: sideVariation.projection_type,
          payout_variant: sideVariation.payout_variant,
          source_key_normalized: sideVariation.source_key_normalized,
          no_collapse_identity_rule: "score_every_valid_matrix_eligible_line_variation_independently"
        },
        scoring_placeholders: {
          selected_side: null,
          more_score_0_100: null,
          less_score_0_100: null,
          score_0_100: null,
          scoring_status: "not_scored_matrix_handoff_only",
          side_eligibility_status: sideVariation.side_eligibility_status,
          side_eligibility_reason: sideVariation.side_eligibility_reason,
          variation_key: sideVariation.variation_key
        },
        factor_packet_ref: packetRef,
        context_refs: {
          daily_readiness_status: effectiveDailyStatus,
          market_game_context_status: market.game_status,
          market_prop_context_status: market.prop_status,
          factor_status: factorCov ? factorCov.factor_status : "factor_coverage_missing"
        },
        compact_storage_v0_1_14: true
      }, details });
    coverageRows.push({ coverage_key: key("matrix", row.prepared_row_id), prepared_row_id: row.prepared_row_id, matrix_id: matrixId, matrix_status: matrixStatus, matrix_grade: matrixGrade, blocking_for_scoring: blocking, latest_batch_id: batchId, latest_checked_at: nowIso(), missing_reason: blockerCount ? issues.slice(rowIssuesBefore).filter(i => i.severity === "blocker").map(i => i.reason).join(",") : null, details: { warning_count: warningCount, blocker_count: blockerCount, missing_component_count: missingComponentCount }, official_date: row.official_date });
    }

    await insertMatrixRows(env, matrixRows, issues, coverageRows);
    const checkpoint = await summarizeMatrixBatch(env, batchId);
    await run(env.SCORING_DB, `UPDATE prop_matrix_batches SET status=?, prepared_rows_read=?, eligible_rows=?, matrix_rows_written=?, issue_rows=?, warning_rows=?, blocker_rows=?, missing_component_rows=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
      "running_chunked", prepared.length, prepared.length, checkpoint.matrix_rows_written, checkpoint.issue_rows, checkpoint.warning_rows, checkpoint.blocker_rows, checkpoint.missing_component_rows, batchId);
  }

  const summary = await summarizeMatrixBatch(env, batchId);
  const complete = summary.matrix_rows_written === prepared.length;
  if (!complete) {
    const remainingRows = Math.max(0, prepared.length - summary.matrix_rows_written);
    const output = { ok:true, data_ok:true, version:SYSTEM_VERSION, deployed_slot_version:DEPLOYED_SLOT_VERSION, worker_name:LOGICAL_WORKER_NAME, deployed_worker_slot:WORKER_NAME, job_key:JOB_KEY, mode:"prop_matrix_build", status:"partial_continue_prop_matrix_builder_chunk_written", certification:"PROP_MATRIX_BUILDER_PARTIAL_CONTINUE_CHUNK_WRITTEN", certification_grade:"PARTIAL", batch_id:batchId, matrix_batch_id:batchId, run_id:runId, window_dates:dates, prepared_rows_read:prepared.length, eligible_rows:prepared.length, matrix_rows_written:summary.matrix_rows_written, remaining_rows:remainingRows, processed_chunks:processedChunks, chunk_size:chunkSize, max_chunks_per_invocation:maxChunksPerInvocation, matrix_soft_timebox_ms:Math.max(12000, Math.min(27000, Number.isFinite(maxRuntimeMsRaw) ? maxRuntimeMsRaw : 27000)), limit_policy:"heavy_market_stage_90pct_cloudflare_d1_service_binding_budget", resumed_existing_batch:resumedExistingBatch, continuation_required:true, orchestrator_should_self_continue:true, no_silent_drops:false, one_matrix_row_per_safe_prepared_row:false, ...summary, prerequisite_freshness:globalCtx.freshness, internal_only:true, external_calls:0, no_external_api_calls:true, no_mlb_api_calls:true, no_odds_api_calls:true, no_parlay_api_calls:true, no_gemini_calls:true, no_probability:true, no_edge:true, no_value_rating:true, no_qualified_flag:true, no_rank:true, no_pick_recommendation:true, no_scoring:true, no_ranking:true, no_final_board:true, side_variation_preservation:true, matrix_payload_preserves_line_type_and_side_context:true, matrix_payload_compact_storage:true, matrix_payload_excludes_full_factor_packet:true };
    await run(env.SCORING_DB, `UPDATE prop_matrix_batches SET status='running_chunked', prepared_rows_read=?, eligible_rows=?, matrix_rows_written=?, matrix_ready_rows=?, matrix_ready_with_warnings_rows=?, matrix_partial_context_rows=?, matrix_blocked_rows=?, matrix_deferred_rows=?, issue_rows=?, warning_rows=?, blocker_rows=?, missing_component_rows=?, prerequisite_freshness_json=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
      prepared.length, prepared.length, summary.matrix_rows_written, summary.matrix_ready_rows, summary.matrix_ready_with_warnings_rows, summary.matrix_partial_context_rows, summary.matrix_blocked_rows, summary.matrix_deferred_rows, summary.issue_rows, summary.warning_rows, summary.blocker_rows, summary.missing_component_rows, JSON.stringify(globalCtx.freshness), JSON.stringify(output), batchId);
    return jsonResponse(output);
  }

  const status = "completed_with_certified_matrix_rows";
  const certification = "PROP_MATRIX_CERTIFIED_ONE_ROW_PER_SAFE_PREPARED_ROW";
  const grade = summary.blocker_rows > 0 ? "PASS_WITH_BLOCKED_OR_DEFERRED_ROWS" : (summary.warning_rows > 0 ? "PASS_WITH_WARNINGS" : "PASS");
  const output = { ok:true, data_ok:true, version:SYSTEM_VERSION, deployed_slot_version:DEPLOYED_SLOT_VERSION, worker_name:LOGICAL_WORKER_NAME, deployed_worker_slot:WORKER_NAME, job_key:JOB_KEY, mode:"prop_matrix_build", status, certification, certification_grade:grade, batch_id:batchId, matrix_batch_id:batchId, run_id:runId, window_dates:dates, prepared_rows_read:prepared.length, eligible_rows:prepared.length, ...summary, no_silent_drops:true, one_matrix_row_per_safe_prepared_row:true, prerequisite_freshness:globalCtx.freshness, chunked_memory_mode:true, chunk_size:chunkSize, processed_chunks:processedChunks, max_chunks_per_invocation:maxChunksPerInvocation, matrix_soft_timebox_ms:Math.max(12000, Math.min(27000, Number.isFinite(maxRuntimeMsRaw) ? maxRuntimeMsRaw : 27000)), limit_policy:"heavy_market_stage_90pct_cloudflare_d1_service_binding_budget", resumed_existing_batch:resumedExistingBatch, retention_policy:"today_tomorrow_only_latest_matrix_current_issues_coverage_and_batch", daily_readiness_missing_soft_fallback:true, no_daily_readiness_missing_hard_block:true, internal_only:true, external_calls:0, no_external_api_calls:true, no_mlb_api_calls:true, no_odds_api_calls:true, no_parlay_api_calls:true, no_gemini_calls:true, no_probability:true, no_edge:true, no_value_rating:true, no_qualified_flag:true, no_rank:true, no_pick_recommendation:true, no_scoring:true, no_ranking:true, no_final_board:true, side_variation_preservation:true, matrix_payload_preserves_line_type_and_side_context:true, matrix_payload_compact_storage:true, matrix_payload_excludes_full_factor_packet:true, side_context_payload_path:"matrix_payload_json.side_context", variation_context_payload_path:"matrix_payload_json.variation_context", scoring_placeholders_payload_path:"matrix_payload_json.scoring_placeholders" };
  await run(env.SCORING_DB, `UPDATE prop_matrix_batches SET status=?, prepared_rows_read=?, eligible_rows=?, matrix_rows_written=?, matrix_ready_rows=?, matrix_ready_with_warnings_rows=?, matrix_partial_context_rows=?, matrix_blocked_rows=?, matrix_deferred_rows=?, issue_rows=?, warning_rows=?, blocker_rows=?, missing_component_rows=?, prerequisite_freshness_json=?, certification_status=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
    status, prepared.length, prepared.length, summary.matrix_rows_written, summary.matrix_ready_rows, summary.matrix_ready_with_warnings_rows, summary.matrix_partial_context_rows, summary.matrix_blocked_rows, summary.matrix_deferred_rows, summary.issue_rows, summary.warning_rows, summary.blocker_rows, summary.missing_component_rows, JSON.stringify(globalCtx.freshness), certification, grade, JSON.stringify(output), batchId);
  return jsonResponse(output);
}

function identity(env) {
  const db = reqDb(env);
  return { ok:true, data_ok:true, version:SYSTEM_VERSION, deployed_slot_version:DEPLOYED_SLOT_VERSION, worker_name:LOGICAL_WORKER_NAME, deployed_worker_slot:WORKER_NAME, job_key:JOB_KEY, status:"ready", internal_only:true, no_external_calls:true, no_scoring:true, no_ranking:true, no_final_board:true, side_variation_preservation:true, schema_owner:"SCORING_DB.prop_matrix_*", upstream_reads:"SCORE_DB.score_board_prepared_current, SCORING_DB.prop_factor_*", retention_policy:"today_tomorrow_only", required_db_bindings_present:allTrue(db), db_bindings:db };
}
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    if (request.method === "GET" && (path === "/" || path === "/health")) return jsonResponse(identity(env));
    if (request.method === "POST" && (path === "/run" || path === "/build" || path === "/matrix")) {
      
      const inputForLifecycle = await request.clone().json().catch(() => ({}));
      await controlLifecycleHeartbeat(env, inputForLifecycle, "running_prop_matrix_builder_worker_started", { mode:"prop_matrix_build" });
      try {
        const response = await runMatrixBuilder(request, env);
        const output = await responseToOutputObject(response);
        if (isWorkerPartialContinueOutput(output)) {
          output.control_lifecycle = await controlLifecyclePartial(env, inputForLifecycle, output);
          return jsonResponse(output, 200);
        }
        output.control_lifecycle = await controlLifecycleFinalize(env, inputForLifecycle, output, output.ok !== false && output.data_ok !== false ? "completed" : "failed");
        return jsonResponse(output, response.status || (output.ok !== false ? 200 : 500));
      }
      catch (err) {
        const failOutput = { ok:false, data_ok:false, version:SYSTEM_VERSION, worker_name:LOGICAL_WORKER_NAME, deployed_worker_slot:WORKER_NAME, job_key:JOB_KEY, request_id:inputForLifecycle.request_id || null, run_id:inputForLifecycle.run_id || null, status:"prop_matrix_builder_exception", certification:"PROP_MATRIX_BUILDER_EXCEPTION", certification_grade:"FAILED", error:String(err && err.stack ? err.stack : err), external_calls:0, no_scoring:true, no_ranking:true, no_final_board:true };
        try {
          if (env && env.SCORING_DB && (inputForLifecycle.request_id || inputForLifecycle.run_id)) {
            await run(env.SCORING_DB, `UPDATE prop_matrix_batches
              SET status='failed_runtime_exception', certification_status='PROP_MATRIX_BUILDER_EXCEPTION', certification_grade='FAILED', output_json=?, updated_at=CURRENT_TIMESTAMP
              WHERE status LIKE 'running%' AND (request_id=? OR run_id=?)`, JSON.stringify(failOutput), inputForLifecycle.request_id || null, inputForLifecycle.run_id || null);
          }
        } catch (_) {}
        failOutput.control_lifecycle = await controlLifecycleFinalize(env, inputForLifecycle, failOutput, "failed");
        return jsonResponse(failOutput, 500);
      }
    }
    return jsonResponse({ ok:false, error:"not_found", version:SYSTEM_VERSION, path }, 404);
  }
};
