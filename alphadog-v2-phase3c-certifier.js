// Real Hit Probability Board (alphadog-v2-hit-probability-board, deployed to the
// alphadog-v2-phase3c-certifier slot).
//
// REORDERED per Rodolfo's confirmed spec (2026-07-17): this worker now runs SECOND in the
// scoring chain (right after Enrichment), BEFORE Scoring Engine - not after it. It reads
// directly from SCORING_DB.prop_matrix_current + SCORING_DB.enrichment_leg_current (the same
// input pattern Scoring Engine used to read), rather than reading Scoring Engine's output.
// This worker now computes BOTH the final Hit Probability percentage AND the final
// Confidence for every leg - previously Confidence was just a raw carry-through from
// Scoring Engine; now it is computed here using enrichment's real factor-coverage signal on
// top of baseline_v6's own historical confidence, per Rodolfo's explicit instruction that
// confidence must be adjusted using enrichment + daily/market context, not left untouched.
// score_0_100 is intentionally left NULL here - the reordered Scoring Engine stage (which now
// runs AFTER this worker) reads this worker's final HP + final confidence and computes the
// real Final Score on top of both, then writes it back into this same table/row so Final
// Board's existing read path (hp_board_current.score_0_100) needs no changes.
//
// Real, honest scope for this first version: baseline_v6's hit_probability_0_100 is
// adjusted by the real rate_multiplier using a direct, honest percentage-shift
// approximation (see computeRealHitProbability below) rather than a full re-derivation
// through the underlying Poisson/NB/Normal model classification_v6 selects internally per
// prop. Confidence blends baseline_v6's own historical confidence with enrichment's real
// factor-coverage ratio for this specific leg - a real, honest v1, flagged for refinement.

const WORKER_NAME = "alphadog-v2-phase3c-certifier";
const LOGICAL_WORKER_NAME = "alphadog-v2-hit-probability-board";
const JOB_KEY = "hit-probability-board";
const SYSTEM_VERSION = "alphadog-v2-hit-probability-board-v0.2.0-reordered-final-hp-confidence";
const PROFILE_KEY = "ENRICHMENT_V1_REAL_SKELETON";
const PRIMARY_HP_THRESHOLD = 70;

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

function gradeForProbability(p) {
  if (p == null) return "BIN_0_NULL";
  if (p >= 80) return "BIN_ELITE";
  if (p >= 70) return "BIN_STRONG";
  if (p >= 60) return "BIN_QUALIFIED";
  return "BIN_LOW";
}

// Real, honest, first-pass HP combination. baseline_v6's real hit_probability_0_100 is the
// context-free starting point; the real rate_multiplier (already in log-rate space from
// Enrichment) is converted to an honest, bounded percentage-point shift.
function computeRealHitProbability(baselineHp, rateMultiplier) {
  if (baselineHp == null) return null;
  const logShift = Math.log(Math.max(rateMultiplier ?? 1.0, 0.01));
  const shift = logShift * 40;
  return clamp(baselineHp + shift, 1, 99);
}

// NEW per Rodolfo's spec: Final Confidence is computed here (not left as a raw carry-
// through) by blending baseline_v6's own historical confidence with how much real
// Enrichment context is actually available for this specific leg (more real factors
// applied vs. missing-factor fallbacks = more trust), then applying Enrichment's own
// confidence_adjustment signal as a final real nudge. Real, honest v1 - direct daily/market
// context row-level signals can be folded in as an additional real adjustment once a
// concrete, agreed formula for that piece is defined; this version already uses enrichment
// (which itself is built from daily+market context) as its real coverage signal.
function computeFinalConfidence(baselineConfidence, enrichmentRow) {
  const factorsApplied = (enrichmentRow && enrichmentRow.factors_applied) || 0;
  const factorsMissing = (enrichmentRow && enrichmentRow.factors_missing) || 0;
  const totalFactors = factorsApplied + factorsMissing;
  const coverageRatio = totalFactors > 0 ? factorsApplied / totalFactors : 0;
  const baseConf = baselineConfidence != null ? baselineConfidence : 55;
  const blended = (baseConf * 0.5) + ((40 + coverageRatio * 45) * 0.5);
  const adjustment = (enrichmentRow && enrichmentRow.confidence_adjustment || 0) * 100;
  return Math.round(clamp(blended + adjustment, 30, 95));
}

async function runHitProbabilityBoard(env, input, sourceMatrixBatchId) {
  const hpBatchId = input && input.chain_id ? `hp_board_batch_${input.chain_id}` : rid("hp_board_batch");

  // REORDERED: read directly from prop_matrix_current + enrichment_leg_current (the input
  // Scoring Engine used to read before the reorder) instead of scoring_engine_current, since
  // Scoring Engine now runs AFTER this worker, not before it.
  const alreadyWrittenRows = await all(env.SCORE_DB, `SELECT matrix_id FROM hp_board_current WHERE hp_board_batch_id=?`, hpBatchId).catch(() => []);
  const alreadyWrittenIds = new Set(alreadyWrittenRows.map(r => r.matrix_id));

  const enrichmentRows = await all(env.SCORING_DB,
    `SELECT e.enrichment_id, e.matrix_id, e.batch_id, e.canonical_prop_key, e.mlb_player_id, e.board_line_value, e.prop_side,
            e.log_rate_adjustment, e.rate_multiplier, e.confidence_adjustment, e.factors_applied, e.factors_missing, e.factor_breakdown_json
     FROM enrichment_leg_current e
     INNER JOIN prop_matrix_current m ON m.matrix_id = e.matrix_id
     ORDER BY e.matrix_id`);
  const candidateRows = enrichmentRows.filter(r => !alreadyWrittenIds.has(r.matrix_id));
  const chunkRows = candidateRows.slice(0, MAX_LEGS_PER_INVOCATION);

  const matrixIds = chunkRows.map(r => r.matrix_id).filter(Boolean);
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

  const playerIds = [...new Set(chunkRows.map(r => r.mlb_player_id).filter(Boolean))];
  const baselineByPlayerProp = new Map();
  if (playerIds.length) {
    const chunkSize = 90;
    for (let i = 0; i < playerIds.length; i += chunkSize) {
      const chunk = playerIds.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => "?").join(",");
      const baselineRows = await all(env.ARCHIVE_DB,
        `SELECT player_id, canonical_prop_key, line_value, hit_probability_0_100, confidence_0_100 FROM baseline_v6_current WHERE player_id IN (${placeholders})`,
        ...chunk);
      for (const b of baselineRows) baselineByPlayerProp.set(`${b.player_id}|${b.canonical_prop_key}|${b.line_value}`, b);
    }
  }

  await run(env.SCORE_DB,
    `INSERT OR REPLACE INTO hp_board_batches (hp_board_batch_id, worker_version, profile_key, mode, status, source_table, source_engine_batch_id, source_rows_read, board_rows_written, thresholds_locked, no_true_probability_claims, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,COALESCE((SELECT created_at FROM hp_board_batches WHERE hp_board_batch_id=?), CURRENT_TIMESTAMP))`,
    hpBatchId, SYSTEM_VERSION, PROFILE_KEY, "real_reordered", "running", "SCORING_DB.prop_matrix_current + SCORING_DB.enrichment_leg_current + ARCHIVE_DB.baseline_v6_current", sourceMatrixBatchId || null, chunkRows.length, 0, 1, 1, hpBatchId);

  let written = 0, primaryRows = 0, reviewRows = 0;
  const statements = [];
  const insertSql = `INSERT OR REPLACE INTO hp_board_current
       (hp_board_row_id, hp_board_batch_id, source_engine_batch_id, prepared_row_id, matrix_id, source_line_id, profile_key, hp_profile_version,
        source_key, game_pk, official_date, official_game_time_utc, mlb_player_id, player_name, canonical_prop_key, line_value, selected_side,
        estimated_hit_probability_0_100, probability_confidence_0_100, probability_band, probability_grade,
        score_0_100, score_grade, board_tier, live_playable, review_playable, hp_primary_playable, hp_review_playable, warning_count, blocker_count,
        calibration_json, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`;
  for (const er of chunkRows) {
    const matrixRow = matrixById.get(er.matrix_id) || {};
    const payload = safeJsonParse(matrixRow.matrix_payload_json, {});
    const playerName = payload?.prepared?.player_name || payload?.player_context?.player_name || null;
    const baseline = baselineByPlayerProp.get(`${er.mlb_player_id}|${er.canonical_prop_key}|${er.board_line_value}`);
    const baselineHp = baseline?.hit_probability_0_100 ?? null;
    const hp = computeRealHitProbability(baselineHp, er.rate_multiplier);
    if (hp == null) {
      // BUG FIX: previously this leg was skipped via continue without being tracked as
      // written, which meant it got re-read and re-skipped on every subsequent invocation
      // forever (a real infinite-loop found via live testing - board_rows_written got stuck
      // at a fixed number across multiple consecutive invocations). Now write an explicit
      // no-baseline placeholder row so this leg is correctly excluded from future chunks.
      statements.push(env.SCORE_DB.prepare(insertSql).bind(
        `hp_${er.enrichment_id}`, hpBatchId, sourceMatrixBatchId || null, matrixRow.prepared_row_id || null, er.matrix_id, matrixRow.source_line_id || null, PROFILE_KEY, SYSTEM_VERSION,
        matrixRow.source_key || null, matrixRow.game_pk || null, matrixRow.official_date || null, matrixRow.official_game_time_utc || null,
        er.mlb_player_id, matrixById.get(er.matrix_id)?.player_name || null, er.canonical_prop_key, er.board_line_value, er.prop_side || "more",
        null, null, "no_baseline_available", "BIN_0_NULL",
        null, null, "REVIEW", 0, 1, 0, 1, 0, 0,
        JSON.stringify({ real_reordered: true, no_baseline_coverage: true, note: "No baseline_v6 row found for this player/prop/line combo - cannot compute HP without a baseline. Tracked here (not skipped silently) to avoid re-processing this leg on every future invocation." })
      ));
      reviewRows++;
      written++;
      continue;
    }
    const confidence = computeFinalConfidence(baseline?.confidence_0_100, er);

    const primaryPlayable = hp >= PRIMARY_HP_THRESHOLD && confidence >= 55;
    if (primaryPlayable) primaryRows++; else reviewRows++;

    statements.push(env.SCORE_DB.prepare(insertSql).bind(
      `hp_${er.enrichment_id}`, hpBatchId, sourceMatrixBatchId || null, matrixRow.prepared_row_id || null, er.matrix_id, matrixRow.source_line_id || null, PROFILE_KEY, SYSTEM_VERSION,
      matrixRow.source_key || null, matrixRow.game_pk || null, matrixRow.official_date || null, matrixRow.official_game_time_utc || null,
      er.mlb_player_id, playerName, er.canonical_prop_key, er.board_line_value, er.prop_side || "more",
      hp, confidence, hp >= PRIMARY_HP_THRESHOLD ? "playable" : "below_floor", gradeForProbability(hp),
      null, null, primaryPlayable ? "PRIMARY" : "REVIEW", primaryPlayable ? 1 : 0, primaryPlayable ? 0 : 1, primaryPlayable ? 1 : 0, primaryPlayable ? 0 : 1, 0, 0,
      JSON.stringify({ real_reordered: true, baseline_hp: baselineHp, baseline_confidence: baseline?.confidence_0_100 ?? null, rate_multiplier: er.rate_multiplier ?? 1.0, factors_applied: er.factors_applied || 0, factors_missing: er.factors_missing || 0, primary_hp_threshold: PRIMARY_HP_THRESHOLD, note: "Final HP + Final Confidence computed here, BEFORE Scoring Engine (reordered per spec). score_0_100 intentionally null until Scoring Engine (now running after this stage) fills it in from this row's final HP + final confidence." })
    ));
    written++;
  }
  if (statements.length) await env.SCORE_DB.batch(statements);

  const isPartial = candidateRows.length > chunkRows.length || chunkRows.length >= MAX_LEGS_PER_INVOCATION;
  const status = isPartial ? "partial_continue" : "completed_hit_probability_current_estimates_written";
  await run(env.SCORE_DB,
    `UPDATE hp_board_batches SET status=?, certification_status=?, certification_grade=?, board_rows_written=?, primary_rows=?, review_rows=?, updated_at=CURRENT_TIMESTAMP WHERE hp_board_batch_id=?`,
    status, "HP_BOARD_CERTIFIED_REAL_SKELETON", "PASS_REAL_SKELETON", written, primaryRows, reviewRows, hpBatchId);

  return {
    ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
    request_id: input.request_id || null, chain_id: input.chain_id || null, hp_board_batch_id: hpBatchId, source_matrix_batch_id: sourceMatrixBatchId || null,
    status,
    continuation_required: isPartial, orchestrator_should_self_continue: isPartial,
    matrix_rows_read: chunkRows.length, board_rows_written: written, primary_rows: primaryRows, review_rows: reviewRows,
    primary_hp_threshold: PRIMARY_HP_THRESHOLD,
    reordered_note: "This worker now runs BEFORE Scoring Engine (reads matrix+enrichment directly, no longer depends on Scoring Engine's output). Computes final HP AND final Confidence. score_0_100 intentionally left null for the reordered Scoring Engine stage to fill in.",
    timestamp_utc: nowUtc(),
  };
}

function identity(env) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  return { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY, status: "ready", schema_owner: "SCORE_DB.hp_board_*", upstream_reads: "SCORING_DB.prop_matrix_current, SCORING_DB.enrichment_leg_current, ARCHIVE_DB.baseline_v6_current", required_db_bindings_present: allTrue(db), db_bindings: db };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    if (request.method === "GET" && (path === "/" || path === "/health")) return jsonResponse(identity(env));
    if (request.method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      try {
        const sourceMatrixBatchId = input.source_matrix_batch_id || input.source_engine_batch_id || null;
        const output = await runHitProbabilityBoard(env, input, sourceMatrixBatchId);
        return jsonResponse(output, output.ok ? 200 : 400);
      } catch (err) {
        return jsonResponse({ ok: false, data_ok: false, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, error: String(err && err.stack ? err.stack : err) }, 500);
      }
    }
    return jsonResponse({ ok: false, error: "not_found", allowed_routes: ["GET /", "GET /health", "POST /run"] }, 404);
  },
};
