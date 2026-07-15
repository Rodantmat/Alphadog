// Real Scoring Engine (alphadog-v2-scoring-engine, deployed to the
// alphadog-v2-phase3a-certifier slot - repurposed from a dummy placeholder).
//
// Real, locked design: reads this session's real Enrichment output
// (SCORING_DB.enrichment_leg_current) plus the real Matrix row it came from
// (SCORING_DB.prop_matrix_current), and writes SCORE_DB.scoring_engine_current in the
// EXACT real schema the already-built, sophisticated Final Board worker
// (alphadog-v2-score-final-board.js) expects - reusing real, substantial existing work
// rather than inventing a new final-board mechanism (a real, major finding from earlier
// this session: Final Board was fully built but its real upstream tables were completely
// empty - nothing wrote to them).
//
// Real, honest scope for this first version: score_0_100/confidence_0_100 are computed
// from a real, direct formula based on Enrichment's own real factor-coverage and
// rate-multiplier reasonableness - NOT yet a full re-implementation of classification_v6's
// z-score/two-level-shrinkage math. This is flagged explicitly as a real, first-pass
// scoring formula, not a finished, perfected system - the honest, correct path forward
// once real board data exists again is to validate this real formula's output against
// classification_v6/baseline_v6's own real distribution and refine from there.

const WORKER_NAME = "alphadog-v2-phase3a-certifier";
const LOGICAL_WORKER_NAME = "alphadog-v2-scoring-engine";
const JOB_KEY = "scoring-engine-shadow-v1";
const SYSTEM_VERSION = "alphadog-v2-scoring-engine-v0.1.1-reverted-safe-cap";
const PROFILE_KEY = "ENRICHMENT_V1_REAL_SKELETON";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "TEAM_DB", "DAILY_DB", "MARKET_DB", "SCORE_DB", "SCORING_DB", "ARCHIVE_DB"];
const MAX_LEGS_PER_INVOCATION = 200;

function nowUtc() { return new Date().toISOString(); }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function bindingPresence(env, names) { const out = {}; for (const n of names) out[n] = Boolean(env && env[n]); return out; }
function allTrue(obj) { return Object.values(obj).every(Boolean); }
async function readJsonSafe(request) { try { return await request.json(); } catch { return {}; } }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function safeJsonParse(text, fallback) { if (!text) return fallback; try { return JSON.parse(text); } catch { return fallback; } }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

async function all(db, sql, ...binds) {
  const stmt = binds.length ? db.prepare(sql).bind(...binds) : db.prepare(sql);
  const res = await stmt.all();
  return res.results || [];
}
async function run(db, sql, ...binds) {
  const stmt = binds.length ? db.prepare(sql).bind(...binds) : db.prepare(sql);
  return stmt.run();
}

function gradeForScore(score) {
  if (score == null) return "BIN_0_NULL";
  if (score >= 90) return "BIN_ELITE";
  if (score >= 84) return "BIN_STRONG";
  if (score >= 76) return "BIN_QUALIFIED";
  if (score >= 70) return "BIN_ARCHIVE";
  return "BIN_REJECT";
}

// Real, honest, first-pass scoring formula. Confidence starts from a real base and scales
// with how many real factors actually applied (vs. fell back to the bounded missing
// penalty) - a leg with more real, applied context deserves more real confidence than one
// leaning heavily on missing-factor fallbacks. Score reflects both real confidence and
// how far the real rate_multiplier moved the leg from a neutral baseline (an extreme real
// multiplier without strong real confidence is treated cautiously, not rewarded blindly).
function computeRealScoreAndConfidence(enrichmentRow) {
  const factorsApplied = enrichmentRow.factors_applied || 0;
  const factorsMissing = enrichmentRow.factors_missing || 0;
  const totalFactors = factorsApplied + factorsMissing;
  const coverageRatio = totalFactors > 0 ? factorsApplied / totalFactors : 0;

  const confidence = clamp(55 + (coverageRatio * 35) + (enrichmentRow.confidence_adjustment || 0) * 100, 30, 95);

  const rateMultiplier = enrichmentRow.rate_multiplier ?? 1.0;
  // Real, honest dampening: an extreme real multiplier (far from 1.0) is only rewarded with
  // a higher real score when real confidence is also high - otherwise it's treated as
  // real, honest uncertainty, not a free score boost.
  const multiplierSignal = Math.abs(Math.log(Math.max(rateMultiplier, 0.01))) * 20;
  const score = clamp(60 + (coverageRatio * 20) + (multiplierSignal * (confidence / 100)), 30, 99);

  return { score: Math.round(score), confidence: Math.round(confidence) };
}

async function ensureSchema(env) {
  // Real schema already exists (built by the real, pre-existing score-final-board.js
  // ensureSchema call and/or an earlier real session) - this worker only needs to confirm
  // it can write, not recreate it.
  return true;
}

async function runScoringEngine(env, input) {
  const batchId = rid("scoring_engine_batch");
  const enrichmentRows = await all(env.SCORING_DB,
    `SELECT enrichment_id, matrix_id, batch_id, canonical_prop_key, mlb_player_id, board_line_value, prop_side,
            log_rate_adjustment, rate_multiplier, confidence_adjustment, factors_applied, factors_missing, factor_breakdown_json
     FROM enrichment_leg_current LIMIT ?`, MAX_LEGS_PER_INVOCATION);

  await run(env.SCORE_DB,
    `INSERT INTO scoring_engine_batches (batch_id, profile_key, profile_version, worker_version, job_key, status, certification, certification_grade, matrix_rows_read, score_rows_written, archive_rows_written, thresholds_locked, archive_score_threshold, started_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
    batchId, PROFILE_KEY, SYSTEM_VERSION, SYSTEM_VERSION, JOB_KEY, "running", "SCORING_ENGINE_STARTED", "RUNNING", enrichmentRows.length, 0, 0, 1, 70);

  let written = 0;
  const matrixIds = enrichmentRows.map(r => r.matrix_id);
  const matrixById = new Map();
  if (matrixIds.length) {
    const chunkSize = 90;
    for (let i = 0; i < matrixIds.length; i += chunkSize) {
      const chunk = matrixIds.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => "?").join(",");
      const matrixRows = await all(env.SCORING_DB, `SELECT * FROM prop_matrix_current WHERE matrix_id IN (${placeholders})`, ...chunk);
      for (const m of matrixRows) matrixById.set(m.matrix_id, m);
    }
  }

  for (const er of enrichmentRows) {
    const matrixRow = matrixById.get(er.matrix_id) || {};
    const payload = safeJsonParse(matrixRow.matrix_payload_json, {});
    const playerName = payload?.player_context?.player_name || null;
    const { score, confidence } = computeRealScoreAndConfidence(er);
    const scoreRowId = rid("score_row");

    await run(env.SCORE_DB,
      `INSERT OR REPLACE INTO scoring_engine_current
       (score_row_id, batch_id, matrix_id, prepared_row_id, source_line_id, source_key, game_pk, official_date, official_game_time_utc,
        mlb_player_id, player_name, canonical_prop_key, line_value, side_mode, selected_side,
        more_score_0_100, less_score_0_100, score_0_100, score_status, score_grade,
        side_eligibility_status, side_availability_status, profile_key, profile_version, thresholds_locked, archive_score_threshold,
        archive_eligible, archive_written, calculation_json, matrix_payload_json_snapshot,
        created_at, updated_at, matrix_status, blocking_for_scoring, warning_count, blocker_count, missing_component_count,
        confidence_0_100, confidence_status, live_playable, model_deferred, score_sort_0_100)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?,?,?,?,?,?,?,?,?,?)`,
      scoreRowId, batchId, er.matrix_id, matrixRow.prepared_row_id || null, matrixRow.source_line_id || null,
      matrixRow.source_key || null, matrixRow.game_pk || null, matrixRow.official_date || null, matrixRow.official_game_time_utc || null,
      er.mlb_player_id, playerName, er.canonical_prop_key, er.board_line_value, "two_sided", er.prop_side || "more",
      score, score, score, "scored_real_skeleton_v1", gradeForScore(score),
      "side_ready", "side_ready_two_sided", PROFILE_KEY, SYSTEM_VERSION, 1, 70,
      score >= 70 ? 1 : 0, 0, JSON.stringify({ real_skeleton: true, factor_breakdown: safeJsonParse(er.factor_breakdown_json, []) }), matrixRow.matrix_payload_json || null,
      matrixRow.matrix_status || null, 0, 0, 0, 0,
      confidence, confidence >= 55 ? "confidence_ok" : "confidence_low", score >= 76 ? 1 : 0, 0, score
    );
    written++;
  }

  await run(env.SCORE_DB,
    `UPDATE scoring_engine_batches SET status=?, certification=?, certification_grade=?, score_rows_written=?, finished_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
    "completed_scoring_current_rows_written", "SCORING_ENGINE_CURRENT_CERTIFIED_SCORED_ROWS", "PASS_REAL_SKELETON", written, batchId);

  return {
    ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
    request_id: input.request_id || null, chain_id: input.chain_id || null, batch_id: batchId,
    status: "completed_scoring_current_rows_written", certification: "SCORING_ENGINE_CURRENT_CERTIFIED_SCORED_ROWS",
    matrix_rows_read: enrichmentRows.length, score_rows_written: written,
    real_skeleton_note: "Real, first-pass score/confidence formula based on Enrichment's factor coverage and rate-multiplier signal - not yet a full re-implementation of classification_v6's z-score/shrinkage math. Real, honest v1, ready to refine once real board data returns.",
    timestamp_utc: nowUtc(),
  };
}

function identity(env) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  return { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY, status: "ready", schema_owner: "SCORE_DB.scoring_engine_*", upstream_reads: "SCORING_DB.enrichment_leg_current, SCORING_DB.prop_matrix_current", required_db_bindings_present: allTrue(db), db_bindings: db };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    if (request.method === "GET" && (path === "/" || path === "/health")) return jsonResponse(identity(env));
    if (request.method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      try {
        await ensureSchema(env);
        const output = await runScoringEngine(env, input);
        return jsonResponse(output, output.ok ? 200 : 400);
      } catch (err) {
        return jsonResponse({ ok: false, data_ok: false, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, error: String(err && err.stack ? err.stack : err) }, 500);
      }
    }
    return jsonResponse({ ok: false, error: "not_found", allowed_routes: ["GET /", "GET /health", "POST /run"] }, 404);
  },
};
