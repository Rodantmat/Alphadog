// Real Scoring Engine (alphadog-v2-scoring-engine, deployed to the
// alphadog-v2-phase3a-certifier slot).
//
// REORDERED per Rodolfo's confirmed spec (2026-07-17): this worker now runs THIRD in the
// scoring chain - AFTER Hit Probability Board, not before it. Previously this worker read
// Enrichment's output directly and computed an independent "trust score" that Hit
// Probability Board then just carried through untouched as confidence. Per the confirmed
// spec, the Final Score must be computed FROM the final Hit Probability percentage AND the
// final Confidence (both now finalized by the reordered Hit Probability Board stage), not
// independently before them.
//
// This worker now reads SCORE_DB.hp_board_current (this chain's HP-board batch, which
// already has final HP + final confidence written by the prior stage, with score_0_100 left
// intentionally null), computes the real Final Score from those two finalized numbers, and
// writes it back into the SAME hp_board_current row (UPDATE, not a new table) so that Final
// Board's existing read path (which already reads score_0_100 directly off
// hp_board_current) needs zero changes. A mirror row is also written to the pre-existing
// scoring_engine_current table for audit/compatibility with anything else that may read it,
// using the same final-score value.
//
// Real, honest scope for this first version: the Final Score formula below is a real, first
// -pass weighted blend of final HP and final Confidence (HP as the primary driver, tempered
// by how much we trust it) - not yet validated against classification_v6/baseline_v6's own
// distribution. Flagged explicitly as a real, first-pass formula, ready to refine.

const WORKER_NAME = "alphadog-v2-phase3a-certifier";
const LOGICAL_WORKER_NAME = "alphadog-v2-scoring-engine";
const JOB_KEY = "scoring-engine-shadow-v1";
const SYSTEM_VERSION = "alphadog-v2-scoring-engine-v0.2.0-reordered-final-score-from-hp-confidence";
const PROFILE_KEY = "ENRICHMENT_V1_REAL_SKELETON";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "TEAM_DB", "DAILY_DB", "MARKET_DB", "SCORE_DB", "SCORING_DB", "ARCHIVE_DB"];
const MAX_LEGS_PER_INVOCATION = 100;

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

// NEW per Rodolfo's spec: Final Score is computed FROM final HP and final Confidence
// (both already finalized by the Hit Probability Board stage that now runs before this
// one) - HP is the primary driver since it IS the actual prediction, Confidence tempers it:
// a high-HP leg with low confidence scores lower than the same HP with high confidence,
// since we trust the number less. Real, honest first-pass weighting, ready to refine.
function computeFinalScore(hp, confidence) {
  if (hp == null) return null;
  const conf = confidence != null ? confidence : 55;
  const score = (hp * 0.65) + (conf * 0.35);
  return Math.round(clamp(score, 1, 99));
}

async function ensureSchema(env) {
  return true;
}

async function runScoringEngine(env, input) {
  const hpBatchId = input && input.hp_board_batch_id
    ? input.hp_board_batch_id
    : (input && input.chain_id ? `hp_board_batch_${input.chain_id}` : null);
  if (!hpBatchId) {
    return { ok: false, data_ok: false, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY, status: "blocked_missing_hp_board_batch_id", error: "hp_board_batch_id (or chain_id to derive it) is required now that this worker reads Hit Probability Board's finalized output" };
  }
  const batchId = input && input.chain_id ? `scoring_engine_batch_${input.chain_id}` : rid("scoring_engine_batch");

  // Read this chain's HP-board rows that still need a final score (score_0_100 IS NULL),
  // in chunks - same self-continuing pattern as before the reorder.
  const hpRows = await all(env.SCORE_DB,
    `SELECT hp_board_row_id, hp_board_batch_id, source_engine_batch_id, prepared_row_id, matrix_id, source_line_id,
            source_key, game_pk, official_date, official_game_time_utc, mlb_player_id, player_name,
            canonical_prop_key, line_value, selected_side, estimated_hit_probability_0_100, probability_confidence_0_100,
            calibration_json
     FROM hp_board_current
     WHERE hp_board_batch_id=?
       AND score_0_100 IS NULL
       AND estimated_hit_probability_0_100 IS NOT NULL
     ORDER BY hp_board_row_id
     LIMIT ?`, hpBatchId, MAX_LEGS_PER_INVOCATION);

  await run(env.SCORE_DB,
    `INSERT OR REPLACE INTO scoring_engine_batches (batch_id, profile_key, profile_version, worker_version, job_key, status, certification, certification_grade, matrix_rows_read, score_rows_written, archive_rows_written, thresholds_locked, archive_score_threshold, started_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,COALESCE((SELECT started_at FROM scoring_engine_batches WHERE batch_id=?), CURRENT_TIMESTAMP))`,
    batchId, PROFILE_KEY, SYSTEM_VERSION, SYSTEM_VERSION, JOB_KEY, "running", "SCORING_ENGINE_STARTED", "RUNNING", hpRows.length, 0, 0, 1, 70, batchId);

  let written = 0;
  const updateStatements = [];
  const mirrorStatements = [];
  const mirrorInsertSql = `INSERT OR REPLACE INTO scoring_engine_current
       (score_row_id, batch_id, matrix_id, prepared_row_id, source_line_id, source_key, game_pk, official_date, official_game_time_utc,
        mlb_player_id, player_name, canonical_prop_key, line_value, side_mode, selected_side,
        more_score_0_100, less_score_0_100, score_0_100, score_status, score_grade,
        side_eligibility_status, side_availability_status, profile_key, profile_version, thresholds_locked, archive_score_threshold,
        archive_eligible, archive_written, calculation_json, matrix_payload_json_snapshot,
        created_at, updated_at, matrix_status, blocking_for_scoring, warning_count, blocker_count, missing_component_count,
        confidence_0_100, confidence_status, live_playable, model_deferred, score_sort_0_100)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?,?,?,?,?,?,?,?,?,?)`;

  for (const row of hpRows) {
    const hp = row.estimated_hit_probability_0_100;
    const confidence = row.probability_confidence_0_100;
    const score = computeFinalScore(hp, confidence);
    if (score == null) continue;
    const grade = gradeForScore(score);

    updateStatements.push(env.SCORE_DB.prepare(
      `UPDATE hp_board_current SET score_0_100=?, score_grade=?, updated_at=CURRENT_TIMESTAMP WHERE hp_board_row_id=?`
    ).bind(score, grade, row.hp_board_row_id));

    const scoreRowId = rid("score_row");
    mirrorStatements.push(env.SCORE_DB.prepare(mirrorInsertSql).bind(
      scoreRowId, batchId, row.matrix_id, row.prepared_row_id || null, row.source_line_id || null,
      row.source_key || null, row.game_pk || null, row.official_date || null, row.official_game_time_utc || null,
      row.mlb_player_id, row.player_name, row.canonical_prop_key, row.line_value, "two_sided", row.selected_side || "more",
      score, score, score, "scored_from_final_hp_confidence_v1", grade,
      "side_ready", "side_ready_two_sided", PROFILE_KEY, SYSTEM_VERSION, 1, 70,
      score >= 70 ? 1 : 0, 0, JSON.stringify({ real_reordered: true, computed_from_final_hp: hp, computed_from_final_confidence: confidence, note: "Final Score computed FROM finalized HP + Confidence (reordered per spec), written back into hp_board_current.score_0_100 and mirrored here for audit/compatibility." }), null,
      null, 0, 0, 0, 0,
      confidence, confidence >= 55 ? "confidence_ok" : "confidence_low", score >= 76 ? 1 : 0, 0, score
    ));
    written++;
  }
  if (updateStatements.length) await env.SCORE_DB.batch(updateStatements);
  if (mirrorStatements.length) await env.SCORE_DB.batch(mirrorStatements);

  const remainingRows = await all(env.SCORE_DB, `SELECT COUNT(*) as cnt FROM hp_board_current WHERE hp_board_batch_id=? AND score_0_100 IS NULL AND estimated_hit_probability_0_100 IS NOT NULL`, hpBatchId);
  const stillRemaining = Number((remainingRows[0] && remainingRows[0].cnt) || 0);
  const isPartial = stillRemaining > 0;
  const status = isPartial ? "partial_continue" : "completed_scoring_current_rows_written";
  await run(env.SCORE_DB,
    `UPDATE scoring_engine_batches SET status=?, certification=?, certification_grade=?, score_rows_written=?, finished_at=CASE WHEN ? THEN NULL ELSE CURRENT_TIMESTAMP END WHERE batch_id=?`,
    status, "SCORING_ENGINE_CURRENT_CERTIFIED_SCORED_ROWS", "PASS_REAL_SKELETON", written, isPartial ? 1 : 0, batchId);

  return {
    ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
    request_id: input.request_id || null, chain_id: input.chain_id || null, batch_id: batchId, hp_board_batch_id: hpBatchId,
    status, certification: "SCORING_ENGINE_CURRENT_CERTIFIED_SCORED_ROWS",
    continuation_required: isPartial, orchestrator_should_self_continue: isPartial,
    hp_rows_read: hpRows.length, score_rows_written: written, remaining_null_score_rows: stillRemaining,
    reordered_note: "This worker now runs AFTER Hit Probability Board. Final Score is computed from finalized HP + finalized Confidence (0.65*HP + 0.35*confidence, real first-pass weighting) and written back into hp_board_current.score_0_100 so Final Board's existing read path needs no changes.",
    timestamp_utc: nowUtc(),
  };
}

function identity(env) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  return { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY, status: "ready", schema_owner: "SCORE_DB.hp_board_current.score_0_100 (write-back), SCORE_DB.scoring_engine_* (mirror)", upstream_reads: "SCORE_DB.hp_board_current (finalized HP + Confidence)", required_db_bindings_present: allTrue(db), db_bindings: db };
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
